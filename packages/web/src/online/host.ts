import {
  eventsFor,
  getLegalActions,
  getObservation,
  type Action,
  type GameEvent,
  type GameState,
} from '@vampire/core';
import {
  HEARTBEAT_MS,
  LINK_TIMEOUT_MS,
  parseGuestMessage,
  PROTOCOL_VERSION,
  sameAction,
  type HostMessage,
  type RejectReason,
} from './protocol';
import type { Link, Listener } from './transport';

/**
 * Сессия хоста: принимает гостей по ключам кресел, проверяет их ходы и рассылает снимки.
 * Состоянием партии владеет не сессия, а вызывающий код (store): сессия получает функции
 * «текущее состояние» и «применить ход» и узнаёт об изменениях через publish().
 */
export interface HostOptions {
  listener: Listener;
  /** Ключи кресел гостей: номер кресла → ключ из ссылки-приглашения. */
  guestSeats: ReadonlyMap<number, string>;
  getState(): GameState;
  /**
   * Применить ход гостя; true — ход принят (вызывающий код затем сам вызовет publish()),
   * false — ход не применился (гость получит отказ).
   */
  apply(action: Action): boolean;
  /**
   * Номер первого снимка. Хост после перезагрузки страницы продолжает нумерацию с версии
   * партии, а не с нуля — иначе гость принял бы новые снимки за старые.
   */
  initialSeq?: number;
  /** Проверка связи (тесты укорачивают). */
  heartbeatMs?: number;
  timeoutMs?: number;
}

export interface HostSession {
  /** Состояние партии изменилось (ход кого угодно): разослать снимки с событиями этого хода. */
  publish(events: readonly GameEvent[]): void;
  /** Какие кресла гостей сейчас подключены. */
  connectedSeats(): number[];
  /** Подписка на подключения и отключения гостей. */
  onPresence(handler: () => void): () => void;
  close(): void;
}

interface Peer {
  link: Link;
  seat: number | null;
  lastHeard: number;
}

export function createHostSession(opts: HostOptions): HostSession {
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS;
  /** Номер снимка: растёт с каждым изменением партии. */
  let seq = opts.initialSeq ?? 0;
  /** Все открытые соединения (и ещё не представившиеся). */
  const peers = new Set<Peer>();
  /** Кресло → соединение гостя (одно на кресло: новое вытесняет старое). */
  const seats = new Map<number, Peer>();
  const presence = new Set<() => void>();
  const notify = () => presence.forEach((h) => h());

  const snapshot = (seat: number, events: readonly GameEvent[]): HostMessage => {
    const state = opts.getState();
    return {
      type: 'snapshot',
      seq,
      seat,
      observation: getObservation(state, seat),
      legal: state.pending?.player === seat ? getLegalActions(state) : [],
      events: eventsFor(events, seat),
    };
  };

  const send = (peer: Peer, msg: HostMessage) => peer.link.send(msg);
  const reject = (peer: Peer, reason: RejectReason, message: string) =>
    send(peer, { type: 'reject', reason, message });

  // Проверка связи: тишина дольше timeoutMs — закрыть (гость ушёл, не попрощавшись).
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const peer of [...peers]) {
      if (now - peer.lastHeard > timeoutMs) peer.link.close();
      else send(peer, { type: 'pong' });
    }
  }, heartbeatMs);

  const stopListening = opts.listener.onConnect((link) => {
    const peer: Peer = { link, seat: null, lastHeard: Date.now() };
    peers.add(peer);
    link.onClose(() => {
      peers.delete(peer);
      if (peer.seat !== null && seats.get(peer.seat) === peer) {
        seats.delete(peer.seat);
        notify();
      }
    });
    link.onMessage((raw) => {
      peer.lastHeard = Date.now();
      const msg = parseGuestMessage(raw);
      if (!msg) return;
      if (msg.type === 'ping') {
        send(peer, { type: 'pong' });
        return;
      }
      if (msg.type === 'hello') {
        if (msg.protocol !== PROTOCOL_VERSION) {
          reject(
            peer,
            'protocol',
            `Версия протокола хоста ${PROTOCOL_VERSION}, у вас ${msg.protocol}: обновите страницу`,
          );
          return;
        }
        const found = [...opts.guestSeats].find(([, key]) => key === msg.seatKey);
        if (!found) {
          reject(peer, 'badKey', 'Неверная ссылка-приглашение');
          return;
        }
        const seat = found[0];
        // Повтор hello того же кресла (гость не дождался ответа) — просто ещё один снимок.
        if (peer.seat !== null && peer.seat !== seat) {
          reject(peer, 'alreadyJoined', 'Это соединение уже занимает другое кресло');
          return;
        }
        peer.seat = seat;
        const previous = seats.get(seat);
        seats.set(seat, peer);
        if (previous && previous !== peer) previous.link.close();
        send(peer, snapshot(seat, []));
        notify();
        return;
      }
      // msg.type === 'act'
      if (peer.seat === null) {
        reject(peer, 'notJoined', 'Сначала представьтесь');
        return;
      }
      const state = opts.getState();
      if (msg.seq !== seq) {
        reject(peer, 'stale', 'Партия ушла вперёд — ход не принят');
        send(peer, snapshot(peer.seat, []));
        return;
      }
      if (state.pending?.player !== peer.seat) {
        reject(peer, 'notYourTurn', 'Сейчас не ваш ход');
        return;
      }
      // Применяется ход из списка допустимых, а не объект из сети.
      const legal = getLegalActions(state).find((a) => sameAction(a, msg.action));
      if (!legal) {
        reject(peer, 'illegal', 'Недопустимый ход');
        return;
      }
      if (!opts.apply(legal)) reject(peer, 'failed', 'Ход не применился на стороне хоста');
    });
  });

  return {
    publish(events) {
      seq += 1;
      for (const [seat, peer] of seats) send(peer, snapshot(seat, events));
    },
    connectedSeats: () => [...seats.keys()].sort((a, b) => a - b),
    onPresence(handler) {
      presence.add(handler);
      return () => presence.delete(handler);
    },
    close() {
      clearInterval(heartbeat);
      stopListening();
      for (const peer of [...peers]) peer.link.close();
      peers.clear();
      seats.clear();
      presence.clear();
    },
  };
}
