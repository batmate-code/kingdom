import { handlers, type Link, type Listener } from './transport';

/**
 * Транспорт через BroadcastChannel: хост и гости — вкладки одного браузера (отладка онлайна
 * без сети). Один канал на комнату; кадры несут номер соединения и направление.
 */

type Frame =
  | { conn: string; dir: 'toHost'; kind: 'open' | 'data' | 'close'; payload?: unknown }
  | { conn: string; dir: 'toGuest'; kind: 'data' | 'close'; payload?: unknown };

const channelName = (room: string) => `vampire-room:${room}`;

function isFrame(v: unknown): v is Frame {
  if (typeof v !== 'object' || v === null) return false;
  const f = v as Record<string, unknown>;
  return typeof f.conn === 'string' && (f.dir === 'toHost' || f.dir === 'toGuest');
}

/** Хост: слушает комнату и заводит Link на каждое новое соединение гостя. */
export function broadcastListener(room: string): Listener {
  const channel = new BroadcastChannel(channelName(room));
  const connects = handlers<[Link]>();
  const conns = new Map<
    string,
    { message: ReturnType<typeof handlers<[unknown]>>; close: () => void }
  >();

  channel.onmessage = (e: MessageEvent<unknown>) => {
    const f = e.data;
    if (!isFrame(f) || f.dir !== 'toHost') return;
    // Кадр open мог потеряться (гость открыл ссылку раньше хоста): соединение заводится и по
    // первому сообщению — гость повторяет hello, пока хост не ответит.
    if ((f.kind === 'open' || f.kind === 'data') && !conns.has(f.conn)) {
      const message = handlers<[unknown]>();
      const closed = handlers<[]>();
      let open = true;
      const close = (notifyPeer: boolean) => {
        if (!open) return;
        open = false;
        conns.delete(f.conn);
        if (notifyPeer)
          channel.postMessage({ conn: f.conn, dir: 'toGuest', kind: 'close' } satisfies Frame);
        closed.emit();
      };
      conns.set(f.conn, { message, close: () => close(false) });
      const deliverFirst = f.kind === 'data';
      connects.emit({
        send: (payload) =>
          open &&
          channel.postMessage({
            conn: f.conn,
            dir: 'toGuest',
            kind: 'data',
            payload,
          } satisfies Frame),
        onMessage: (h) => message.add(h),
        onClose: (h) => closed.add(h),
        close: () => close(true),
      });
      if (deliverFirst) message.emit(f.payload);
      return;
    }
    const c = conns.get(f.conn);
    if (!c) return;
    if (f.kind === 'data') c.message.emit(f.payload);
    if (f.kind === 'close') c.close();
  };

  return {
    onConnect: (h) => connects.add(h),
    close() {
      for (const [conn, c] of conns) {
        channel.postMessage({ conn, dir: 'toGuest', kind: 'close' } satisfies Frame);
        c.close();
      }
      channel.close();
    },
  };
}

/** Гость: открывает соединение с хостом комнаты. Сообщения до появления хоста теряются (hello повторяется). */
export function broadcastConnect(room: string): Link {
  const channel = new BroadcastChannel(channelName(room));
  const conn = crypto.randomUUID();
  const message = handlers<[unknown]>();
  const closed = handlers<[]>();
  let open = true;
  const shut = () => {
    if (!open) return;
    open = false;
    closed.emit();
    channel.close();
  };
  channel.onmessage = (e: MessageEvent<unknown>) => {
    const f = e.data;
    if (!isFrame(f) || f.dir !== 'toGuest' || f.conn !== conn) return;
    if (f.kind === 'data') message.emit(f.payload);
    if (f.kind === 'close') shut();
  };
  channel.postMessage({ conn, dir: 'toHost', kind: 'open' } satisfies Frame);
  return {
    send: (payload) =>
      open && channel.postMessage({ conn, dir: 'toHost', kind: 'data', payload } satisfies Frame),
    onMessage: (h) => message.add(h),
    onClose: (h) => closed.add(h),
    close() {
      if (open) channel.postMessage({ conn, dir: 'toHost', kind: 'close' } satisfies Frame);
      shut();
    },
  };
}
