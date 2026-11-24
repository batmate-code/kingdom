import type { HostFrame } from './relayHub';
import { handlers, type Link, type Listener } from './transport';

/**
 * Транспорт через ретранслятор сервера `npm run online` (relayHub.ts): WebSocket на тот же адрес,
 * откуда загружена страница. Работает в любой сети, где открываются сайты.
 */

/** Нужная часть браузерного WebSocket (тесты подставляют поддельный). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export type MakeSocket = (url: string) => SocketLike;

const OPEN = 1;
/** Пауза перед повторным подключением хоста к ретранслятору. */
const HOST_RECONNECT_MS = 1000;

/** Браузерный WebSocket в виде SocketLike (обработчики без аргументов события). */
const browserSocket: MakeSocket = (url) => {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (e: MessageEvent<unknown>) => socket.onmessage?.({ data: e.data });
  ws.onclose = () => socket.onclose?.();
  return socket;
};

/** Адрес ретранслятора: тот же хост, что у страницы, путь /relay. */
export function relayUrl(
  role: 'host' | 'guest',
  room: string,
  loc: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/relay?${new URLSearchParams({ role, room }).toString()}`;
}

/** Хост: соединения гостей приходят кадрами open/data/close; связь с ретранслятором восстанавливается. */
export function relayListener(
  room: string,
  make: MakeSocket = browserSocket,
  url = relayUrl('host', room),
): Listener {
  const connects = handlers<[Link]>();
  const conns = new Map<
    string,
    { message: ReturnType<typeof handlers<[unknown]>>; close: () => void }
  >();
  let socket: SocketLike | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const dropAll = () => {
    for (const c of [...conns.values()]) c.close();
  };

  const open = () => {
    const s = make(url);
    socket = s;
    s.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let f: HostFrame;
      try {
        f = JSON.parse(e.data) as HostFrame;
      } catch {
        return;
      }
      if (f.kind === 'open' && !conns.has(f.conn)) {
        const conn = f.conn;
        const message = handlers<[unknown]>();
        const closed = handlers<[]>();
        let isOpen = true;
        const close = (notify: boolean) => {
          if (!isOpen) return;
          isOpen = false;
          conns.delete(conn);
          if (notify && socket?.readyState === OPEN) {
            socket.send(JSON.stringify({ conn, kind: 'close' } satisfies HostFrame));
          }
          closed.emit();
        };
        conns.set(conn, { message, close: () => close(false) });
        connects.emit({
          send(m) {
            if (isOpen && socket?.readyState === OPEN) {
              socket.send(
                JSON.stringify({
                  conn,
                  kind: 'data',
                  payload: JSON.stringify(m),
                } satisfies HostFrame),
              );
            }
          },
          onMessage: (h) => message.add(h),
          onClose: (h) => closed.add(h),
          close: () => close(true),
        });
        return;
      }
      const c = conns.get(f.conn);
      if (!c) return;
      if (f.kind === 'data' && typeof f.payload === 'string') {
        try {
          c.message.emit(JSON.parse(f.payload));
        } catch {
          // Не JSON — не наше сообщение.
        }
      }
      if (f.kind === 'close') c.close();
    };
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      // Ретранслятор закрыл гостей вместе с нами — они переподключатся сами.
      dropAll();
      if (!stopped) timer = setTimeout(open, HOST_RECONNECT_MS);
    };
  };
  open();

  return {
    onConnect: (h) => connects.add(h),
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      dropAll();
      socket?.close();
      socket = null;
    },
  };
}

/** Гость: соединение с хостом комнаты через ретранслятор. Закрытие сокета — закрытие связи. */
export function relayConnect(
  room: string,
  make: MakeSocket = browserSocket,
  url = relayUrl('guest', room),
): Link {
  const s = make(url);
  const message = handlers<[unknown]>();
  const closed = handlers<[]>();
  let isOpen = true;
  /** До открытия сокета держим последнее сообщение (это hello, он повторяется). */
  let pending: string | null = null;
  const shut = () => {
    if (!isOpen) return;
    isOpen = false;
    closed.emit();
    s.close();
  };
  s.onopen = () => {
    if (pending !== null) s.send(pending);
    pending = null;
  };
  s.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    try {
      message.emit(JSON.parse(e.data));
    } catch {
      // Не JSON — не наше сообщение.
    }
  };
  s.onclose = shut;
  return {
    send(m) {
      if (!isOpen) return;
      const data = JSON.stringify(m);
      if (s.readyState === OPEN) s.send(data);
      else pending = data;
    },
    onMessage: (h) => message.add(h),
    onClose: (h) => closed.add(h),
    close: shut,
  };
}
