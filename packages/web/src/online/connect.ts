import { determinize } from '@vampire/core';
import { create } from 'zustand';
import { useGame } from '../store';
import { broadcastConnect, broadcastListener } from './broadcast';
import { createGuestSession, type GuestSession } from './guest';
import { createHostSession, type HostSession } from './host';
import { inviteLink, netFrom, seatRoom } from './invite';
import { relayConnect, relayListener } from './relay';
import { lazyLink, lazyListener, mergeListeners, type Link, type Listener } from './transport';

/**
 * Связь store с онлайн-сессиями. store о сети не знает: хост подписывается на его версию и
 * рассылает снимки, гость кладёт снимки в store и ставит sendAction для своих ходов.
 * Транспорт по умолчанию — WebRTC (Trystero); `?net=tabs` — вкладки одного браузера (отладка).
 */

export interface Transport {
  listen(room: string): Listener;
  connect(room: string): Link;
}

export const broadcastTransport: Transport = {
  listen: broadcastListener,
  connect: broadcastConnect,
};

/** WebRTC (Trystero) грузится только в онлайн-партии — локальной игре библиотека не нужна. */
const loadWebrtc = () => import('./webrtc');

export const webrtcTransport: Transport = {
  listen: (room) => lazyListener(loadWebrtc().then((m) => m.webrtcListener(room))),
  connect: (room) => lazyLink(loadWebrtc().then((m) => m.webrtcConnect(room))),
};

/** Ретранслятор сервера `npm run online` (relayHub.ts) — WebSocket на адрес страницы. */
export const relayTransport: Transport = {
  listen: (room) => relayListener(room),
  connect: (room) => relayConnect(room),
};

/** Транспорт страницы (invite.ts: netFrom). */
export function pageTransport(): Transport {
  const net = netFrom(window.location);
  return net === 'tabs' ? broadcastTransport : net === 'relay' ? relayTransport : webrtcTransport;
}

/** Пауза перед повторным подключением гостя после обрыва. */
const RECONNECT_MS = 1500;
/**
 * Гость так и не дождался хоста: показать подсказку. Без своего TURN-сервера прямое соединение
 * не строится примерно у каждой 10-й пары сетей (мобильный интернет, корпоративные сети).
 */
const CONNECT_SLOW_MS = 15_000;

/** Состояние связи для интерфейса. */
interface OnlineStatus {
  /** Хост: какие кресла гостей сейчас подключены. */
  connected: number[];
  /** Хост: комнату держит другая вкладка этого браузера — эта вкладка партию не раздаёт. */
  hostBusy: boolean;
  /**
   * Гость: состояние связи с хостом (slow — давно нет ответа: хост не открыл партию или сеть не
   * пропускает прямое соединение), текст последнего отказа.
   */
  guestLink: 'connecting' | 'slow' | 'online' | 'reconnecting';
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
  // У каждого гостя своя комната: в ней только хост и он — другой гость не может выдать себя
  // за хоста и не видит чужих соединений.
  const listener = mergeListeners(
    hostRoom.invites.map((i) => transport.listen(seatRoom(room, i.key))),
  );
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
    canUndo: (seat) => useGame.getState().canRequestUndo(seat),
    undo: (seat) => useGame.getState().requestUndo(seat),
    voteUndo: (seat, id, accept) => useGame.getState().voteUndo([seat], id, accept),
    undoVote: () => {
      const v = useGame.getState().undoVote;
      return (
        v && {
          id: v.id,
          requester: v.requester,
          lines: v.lines,
          need: v.need,
          approved: v.approved,
        }
      );
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
export function syncHosting(transport: Transport = pageTransport()): void {
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
export function watchHosting(transport: Transport = pageTransport()): () => void {
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
  transport: Transport = pageTransport(),
): () => void {
  guest?.leave();
  let left = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  useOnline.setState({ guestLink: 'connecting', rejectMessage: null });
  const slow = setTimeout(() => {
    if (useOnline.getState().guestLink !== 'online') useOnline.setState({ guestLink: 'slow' });
  }, CONNECT_SLOW_MS);

  const open = () => {
    const session = createGuestSession({
      link: transport.connect(seatRoom(room, seatKey)),
      seatKey,
      onSnapshot(view, events) {
        useOnline.setState({ guestLink: 'online', rejectMessage: null });
        // Скрытое у гостя — догадка; seq как зерно: один снимок даёт одно и то же состояние.
        useGame.getState().loadSnapshot(determinize(view.observation, view.seq), events, {
          seat: view.seat,
          seq: view.seq,
          legal: view.legal,
          canUndo: view.canUndo,
        });
        // Просьба об отмене — копия хостовой (индекс снимка гостю не нужен).
        useGame.setState({ undoVote: view.undoVote && { ...view.undoVote, index: -1 } });
      },
      onReject: (_reason, message) => useOnline.setState({ rejectMessage: message }),
      onClose() {
        if (left) return;
        useOnline.setState({ guestLink: 'reconnecting' });
        timer = setTimeout(open, RECONNECT_MS);
      },
    });
    guest = { session, leave };
    useGame.setState({
      sendAction: (action) => session.act(action),
      sendUndo: () => session.undo(),
      sendUndoVote: (id, accept) => session.voteUndo(id, accept),
    });
  };

  function leave() {
    left = true;
    clearTimeout(slow);
    if (timer) clearTimeout(timer);
    guest?.session.close();
    guest = null;
    useGame.setState({ sendAction: null, sendUndo: null, sendUndoVote: null, undoVote: null });
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

/** Ссылка-приглашение кресла: адрес этой страницы, параметры во фрагменте (#). */
export function inviteUrl(room: string, key: string): string {
  return inviteLink(window.location.href, room, key, netFrom(window.location));
}
