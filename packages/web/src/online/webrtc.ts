import { joinRoom } from 'trystero';
import { handlers, type Link, type Listener } from './transport';

/**
 * Транспорт WebRTC (этап 3, docs/online-plan.md): браузеры соединяются напрямую, поиск пира —
 * через публичные реле Nostr (библиотека Trystero), своего сервера нет. Пароль комнаты
 * шифрует данные соединения на реле: зная только название приложения, в комнату не войти.
 *
 * Логика написана поверх RoomLike — минимальной части комнаты Trystero, — чтобы её можно было
 * проверить тестом с поддельной комнатой (в Node нет WebRTC).
 */

/** Нужная нам часть комнаты Trystero. */
export interface RoomLike {
  makeAction(namespace: string): {
    send(data: string, options?: { target?: string }): Promise<void>;
    onMessage: ((data: string, context: { peerId: string }) => void) | null;
  };
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave(): Promise<void>;
}

export type OpenRoom = (room: string) => RoomLike;

const APP_ID = 'vampire-game';
/** Предел входящего сообщения: снимок партии — около 5 КБ; без предела Trystero принимает до 256 МБ. */
const MAX_RECEIVE_BYTES = 1 << 20;

/** Отправка без ожидания: пир мог уйти — ошибку глушим, обрыв заметит проверка связи. */
const quietly = (p: Promise<void>): void => {
  p.catch(() => undefined);
};

/** Открыть комнату Trystero (Nostr); ключ комнаты — и её имя, и пароль. */
export const openTrysteroRoom: OpenRoom = (room) => {
  const r = joinRoom({ appId: APP_ID, password: room, maxReceiveBytes: MAX_RECEIVE_BYTES }, room);
  return {
    makeAction: (namespace) => r.makeAction<string>(namespace),
    get onPeerJoin() {
      return r.onPeerJoin;
    },
    set onPeerJoin(h) {
      r.onPeerJoin = h;
    },
    get onPeerLeave() {
      return r.onPeerLeave;
    },
    set onPeerLeave(h) {
      r.onPeerLeave = h;
    },
    leave: () => r.leave(),
  };
};

/** Кадры канала: роль хоста (чтобы гость знал, кому писать) и сообщения протокола. */
const ROLE = 'role';
const MESSAGE = 'msg';

/** Хост: каждый пир комнаты — соединение гостя. */
export function webrtcListener(room: string, open: OpenRoom = openTrysteroRoom): Listener {
  const r = open(room);
  const role = r.makeAction(ROLE);
  const msg = r.makeAction(MESSAGE);
  const connects = handlers<[Link]>();
  const peers = new Map<
    string,
    { message: ReturnType<typeof handlers<[unknown]>>; close: () => void }
  >();

  r.onPeerJoin = (peerId) => {
    // Сообщить новичку, что хост — мы.
    quietly(role.send('host', { target: peerId }));
    if (peers.has(peerId)) return;
    const message = handlers<[unknown]>();
    const closed = handlers<[]>();
    let open = true;
    const close = () => {
      if (!open) return;
      open = false;
      peers.delete(peerId);
      closed.emit();
    };
    peers.set(peerId, { message, close });
    connects.emit({
      send: (m) => {
        if (open) quietly(msg.send(JSON.stringify(m), { target: peerId }));
      },
      onMessage: (h) => message.add(h),
      onClose: (h) => closed.add(h),
      // Закрыть одного гостя нельзя без выхода из комнаты: забываем его, а гость сам заметит
      // тишину по проверке связи (pong больше не придёт).
      close,
    });
  };
  r.onPeerLeave = (peerId) => peers.get(peerId)?.close();
  msg.onMessage = (data, { peerId }) => {
    const p = peers.get(peerId);
    if (!p) return;
    try {
      p.message.emit(JSON.parse(data));
    } catch {
      // Не JSON — не наше сообщение.
    }
  };

  return {
    onConnect: (h) => connects.add(h),
    close() {
      for (const p of [...peers.values()]) p.close();
      void r.leave();
    },
  };
}

/** Гость: соединение с хостом комнаты (хост объявляет себя кадром role). */
export function webrtcConnect(room: string, open: OpenRoom = openTrysteroRoom): Link {
  const r = open(room);
  const role = r.makeAction(ROLE);
  const msg = r.makeAction(MESSAGE);
  const message = handlers<[unknown]>();
  const closed = handlers<[]>();
  let hostId: string | null = null;
  let isOpen = true;
  /** Сообщения до того, как хост объявился (hello): отправим, когда узнаем хоста. */
  const queue: string[] = [];

  const shut = () => {
    if (!isOpen) return;
    isOpen = false;
    closed.emit();
    void r.leave();
  };

  role.onMessage = (data, { peerId }) => {
    if (data !== 'host' || hostId !== null) return;
    hostId = peerId;
    for (const m of queue.splice(0)) quietly(msg.send(m, { target: peerId }));
  };
  r.onPeerLeave = (peerId) => {
    if (peerId === hostId) shut();
  };
  msg.onMessage = (data, { peerId }) => {
    if (peerId !== hostId) return;
    try {
      message.emit(JSON.parse(data));
    } catch {
      // Не JSON — не наше сообщение.
    }
  };

  return {
    send(m) {
      if (!isOpen) return;
      const data = JSON.stringify(m);
      if (hostId === null) {
        // hello повторяется раз в секунду: держим в очереди только последнее сообщение.
        queue.splice(0, queue.length, data);
        return;
      }
      quietly(msg.send(data, { target: hostId }));
    },
    onMessage: (h) => message.add(h),
    onClose: (h) => closed.add(h),
    close: shut,
  };
}
