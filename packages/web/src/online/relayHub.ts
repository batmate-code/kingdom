/**
 * Ретранслятор онлайн-партии на сервере `npm run online` (scripts/online.mjs): хост и гости
 * подключаются к нему WebSocket'ом через тот же https-адрес, что и страница игры, а он пересылает
 * сообщения. Ни реле Nostr, ни прямого соединения браузеров, ни TURN не нужно.
 *
 * Чистая логика без Node и библиотеки ws — сокет описан минимальным интерфейсом (для тестов).
 * Комнаты — те же, что у WebRTC: `ключ партии-ключ кресла` (секрет, знают только хост и гость).
 *
 * Кадры хост ↔ ретранслятор (JSON): { conn, kind: 'open' | 'data' | 'close', payload? };
 * гость ↔ ретранслятор — сами сообщения протокола (строки JSON), без обёртки.
 */

export interface HubSocket {
  send(data: string): void;
  close(): void;
}

/** Что делать с сообщениями и закрытием подключённого сокета. */
export interface HubPeer {
  message(data: string): void;
  closed(): void;
}

export type HubRole = 'host' | 'guest';

/** Кадр хоста: от ретранслятора — open/data/close гостя, к ретранслятору — data/close. */
export interface HostFrame {
  conn: string;
  kind: 'open' | 'data' | 'close';
  payload?: string;
}

/** Имя комнаты: ключи из шестнадцатеричных символов и дефис (newKey + seatRoom). */
const ROOM_RE = /^[0-9a-f-]{1,200}$/;

export const isRoomName = (room: string): boolean => ROOM_RE.test(room);

interface Room {
  host: HubSocket | null;
  guests: Map<string, HubSocket>;
}

function parseHostFrame(raw: string): HostFrame | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const f = v as Record<string, unknown>;
    if (typeof f.conn !== 'string') return null;
    if (f.kind === 'close') return { conn: f.conn, kind: 'close' };
    if (f.kind === 'data' && typeof f.payload === 'string') {
      return { conn: f.conn, kind: 'data', payload: f.payload };
    }
    return null;
  } catch {
    return null;
  }
}

export function createRelayHub(newConnId: () => string) {
  const rooms = new Map<string, Room>();
  const room = (name: string): Room => {
    let r = rooms.get(name);
    if (!r) {
      r = { host: null, guests: new Map() };
      rooms.set(name, r);
    }
    return r;
  };
  const tidy = (name: string) => {
    const r = rooms.get(name);
    if (r && !r.host && r.guests.size === 0) rooms.delete(name);
  };
  const toHost = (r: Room, frame: HostFrame) => r.host?.send(JSON.stringify(frame));

  /** Новый сокет: роль и комната из адреса подключения. Неверная комната — закрыть. */
  function connect(socket: HubSocket, role: HubRole, name: string): HubPeer {
    if (!isRoomName(name)) {
      socket.close();
      return { message: () => undefined, closed: () => undefined };
    }
    const r = room(name);

    if (role === 'host') {
      // Хост переподключился (перезагрузка страницы или обрыв, который ретранслятор ещё не
      // заметил): новое соединение вытесняет старое. Гостей старого хоста закрываем — новый хост
      // их не знает, они переподключатся и представятся заново (иначе их ходы отклонялись бы
      // как «не представился», и партия вставала).
      const previous = r.host;
      r.host = socket;
      if (previous) {
        for (const guest of r.guests.values()) guest.close();
        r.guests.clear();
        previous.close();
      }
      // Гости, ждавшие хоста, — сразу «открыть».
      for (const conn of r.guests.keys()) toHost(r, { conn, kind: 'open' });
      return {
        message(data) {
          if (r.host !== socket) return;
          const f = parseHostFrame(data);
          if (!f) return;
          const guest = r.guests.get(f.conn);
          if (!guest) return;
          if (f.kind === 'data' && f.payload !== undefined) guest.send(f.payload);
          if (f.kind === 'close') {
            r.guests.delete(f.conn);
            guest.close();
          }
        },
        closed() {
          if (r.host !== socket) return;
          r.host = null;
          // Хост ушёл — гости переподключатся сами и подождут его (повтор hello).
          for (const guest of r.guests.values()) guest.close();
          r.guests.clear();
          tidy(name);
        },
      };
    }

    const conn = newConnId();
    r.guests.set(conn, socket);
    toHost(r, { conn, kind: 'open' });
    return {
      message(data) {
        if (r.guests.get(conn) !== socket) return;
        toHost(r, { conn, kind: 'data', payload: data });
      },
      closed() {
        if (r.guests.get(conn) !== socket) return;
        r.guests.delete(conn);
        toHost(r, { conn, kind: 'close' });
        tidy(name);
      },
    };
  }

  return {
    connect,
    /** Сколько комнат открыто (для тестов и журнала сервера). */
    size: () => rooms.size,
  };
}
