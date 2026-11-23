import { determinize } from '@vampire/core';
import { create } from 'zustand';
import { useGame } from '../store';
import { broadcastConnect, broadcastListener } from './broadcast';
import { createGuestSession, type GuestSession } from './guest';
import { createHostSession, type HostSession } from './host';
import type { Link, Listener } from './transport';

/**
 * Связь store с онлайн-сессиями. store о сети не знает: хост подписывается на его версию и
 * рассылает снимки, гость кладёт снимки в store и ставит sendAction для своих ходов.
 * Транспорт пока BroadcastChannel (вкладки одного браузера); WebRTC — этап 3.
 */

export interface Transport {
  listen(room: string): Listener;
  connect(room: string): Link;
}

export const broadcastTransport: Transport = {
  listen: broadcastListener,
  connect: broadcastConnect,
};

/** Пауза перед повторным подключением гостя после обрыва. */
const RECONNECT_MS = 1500;

/** Состояние связи для интерфейса. */
interface OnlineStatus {
  /** Хост: какие кресла гостей сейчас подключены. */
  connected: number[];
  /** Хост: комнату держит другая вкладка этого браузера — эта вкладка партию не раздаёт. */
  hostBusy: boolean;
  /** Гость: состояние связи с хостом, текст последнего отказа. */
  guestLink: 'connecting' | 'online' | 'reconnecting';
  rejectMessage: string | null;
}

export const useOnline = create<OnlineStatus>(() => ({
  connected: [],
  hostBusy: false,
  guestLink: 'connecting',
  rejectMessage: null,
}));

let host: { room: string; stop: () => void } | null = null;

/** Поднять сессию хоста на комнате (вызывается, когда комната за этой вкладкой). */
function serve(room: string, transport: Transport): { stop: () => void } {
  const { hostRoom } = useGame.getState();
  if (!hostRoom) return { stop: () => undefined };
  const listener = transport.listen(room);
  const session: HostSession = createHostSession({
    listener,
    guestSeats: new Map(hostRoom.invites.map((i) => [i.seat, i.key])),
    // После перезагрузки страницы нумерация снимков продолжается с версии партии.
    initialSeq: useGame.getState().version,
    getState: () => {
      const s = useGame.getState().state;
      if (!s) throw new Error('Нет партии');
      return s;
    },
    apply(action) {
      const before = useGame.getState().version;
      useGame.getState().act(action, false);
      return useGame.getState().version !== before;
    },
  });
  const offPresence = session.onPresence(() =>
    useOnline.setState({ connected: session.connectedSeats() }),
  );
  let version = useGame.getState().version;
  const offStore = useGame.subscribe((s) => {
    if (s.version === version) return;
    version = s.version;
    session.publish(s.lastEvents);
  });
  return {
    stop() {
      offStore();
      offPresence();
      session.close();
      listener.close();
      useOnline.setState({ connected: [] });
    },
  };
}

/**
 * Хост: поднять комнату, если в партии есть гости. Комнату держит одна вкладка браузера
 * (Web Locks): вторая вкладка с тем же сохранением партию не раздаёт, иначе гость получал
 * бы снимки двух расходящихся партий.
 */
export function syncHosting(transport: Transport = broadcastTransport): void {
  const room = useGame.getState().hostRoom?.room ?? null;
  if (host && host.room === room) return;
  host?.stop();
  host = null;
  useOnline.setState({ connected: [], hostBusy: false });
  if (!room) return;

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    const served = serve(room, transport);
    host = { room, stop: served.stop };
    return;
  }
  let release: (() => void) | null = null;
  let stopped = false;
  host = {
    room,
    stop() {
      stopped = true;
      release?.();
    },
  };
  void locks.request(`vampire-host:${room}`, { ifAvailable: true }, (lock) => {
    if (!lock) {
      useOnline.setState({ hostBusy: true });
      return undefined;
    }
    if (stopped) return undefined;
    const served = serve(room, transport);
    // Держим замок, пока комната за этой вкладкой.
    return new Promise<void>((resolve) => {
      release = () => {
        served.stop();
        resolve();
      };
    });
  });
}

/** Следить за store: комната появилась (новая партия с гостями) или пропала (сброс). */
export function watchHosting(transport: Transport = broadcastTransport): () => void {
  syncHosting(transport);
  const off = useGame.subscribe((s, prev) => {
    if (s.hostRoom?.room !== prev.hostRoom?.room) syncHosting(transport);
  });
  return () => {
    off();
    host?.stop();
    host = null;
  };
}

let guest: { session: GuestSession; leave: () => void } | null = null;

/**
 * Гость: подключиться к комнате по ключу кресла из ссылки-приглашения. При обрыве связи
 * переподключается сам (хост перезагрузил страницу или ненадолго пропала сеть).
 */
export function joinAsGuest(
  room: string,
  seatKey: string,
  transport: Transport = broadcastTransport,
): () => void {
  guest?.leave();
  let left = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  useOnline.setState({ guestLink: 'connecting', rejectMessage: null });

  const open = () => {
    const session = createGuestSession({
      link: transport.connect(room),
      seatKey,
      onSnapshot(view, events) {
        useOnline.setState({ guestLink: 'online', rejectMessage: null });
        // Скрытое у гостя — догадка; seq как зерно: один снимок даёт одно и то же состояние.
        useGame.getState().loadSnapshot(determinize(view.observation, view.seq), events, {
          seat: view.seat,
          seq: view.seq,
          legal: view.legal,
        });
      },
      onReject: (_reason, message) => useOnline.setState({ rejectMessage: message }),
      onClose() {
        if (left) return;
        useOnline.setState({ guestLink: 'reconnecting' });
        timer = setTimeout(open, RECONNECT_MS);
      },
    });
    guest = { session, leave };
    useGame.setState({ sendAction: (action) => session.act(action) });
  };

  function leave() {
    left = true;
    if (timer) clearTimeout(timer);
    guest?.session.close();
    guest = null;
    useGame.setState({ sendAction: null });
  }

  open();
  return leave;
}

/** Уход со страницы: закрыть соединения сразу, не дожидаясь таймаута у другой стороны. */
export function closeOnPageHide(): void {
  window.addEventListener('pagehide', () => {
    guest?.leave();
    host?.stop();
  });
}

/** Параметры ссылки-приглашения: ?join=<комната>&key=<ключ кресла>. */
export function inviteFromUrl(search: string): { room: string; key: string } | null {
  const p = new URLSearchParams(search);
  const room = p.get('join');
  const key = p.get('key');
  return room && key ? { room, key } : null;
}

export function inviteUrl(room: string, key: string): string {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ join: room, key }).toString();
  return url.toString();
}
