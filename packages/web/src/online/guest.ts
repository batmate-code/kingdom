import type { Action, GameEvent, Observation } from '@vampire/core';
import {
  BUILD_ID,
  HEARTBEAT_MS,
  HELLO_RETRY_MS,
  LINK_TIMEOUT_MS,
  parseHostMessage,
  PROTOCOL_VERSION,
  type GuestMessage,
  type RejectReason,
  type UndoVote,
} from './protocol';
import type { Link } from './transport';

/** Что гость знает о партии: последний снимок от хоста. */
export interface GuestView {
  seq: number;
  seat: number;
  observation: Observation;
  legal: Action[];
  canUndo: boolean;
  undoVote: UndoVote | null;
}

export interface GuestOptions {
  link: Link;
  seatKey: string;
  /** Новый снимок; events — события с прошлого снимка (для журнала и окон). */
  onSnapshot(view: GuestView, events: GameEvent[]): void;
  onReject?(reason: RejectReason, message: string): void;
  /** Соединение закрыто: хост закрыл комнату, ушёл или связь оборвалась (тишина). */
  onClose?(): void;
  heartbeatMs?: number;
  timeoutMs?: number;
  helloRetryMs?: number;
}

export interface GuestSession {
  /** Последний снимок (null — ещё не получен). */
  view(): GuestView | null;
  /** Отправить ход, выбранный на последнем снимке. */
  act(action: Action): void;
  /** Попросить отменить свой последний ход. */
  undo(): void;
  /** Ответить на просьбу об отмене. */
  voteUndo(id: number, accept: boolean): void;
  close(): void;
}

/**
 * Сессия гостя: представляется хосту (повторяя hello, пока хост не ответит), шлёт ходы и
 * проверяет связь. Переподключение после обрыва — дело вызывающего кода (новая сессия).
 */
export function createGuestSession(opts: GuestOptions): GuestSession {
  const timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS;
  let current: GuestView | null = null;
  let lastHeard = Date.now();
  let closed = false;
  /** Представились заново после отказа notJoined: ждём снимок с новой нумерацией. */
  let rejoining = false;
  const send = (msg: GuestMessage) => opts.link.send(msg);
  const hello = () =>
    send({ type: 'hello', seatKey: opts.seatKey, protocol: PROTOCOL_VERSION, build: BUILD_ID });

  const helloTimer = setInterval(() => {
    if (!current) hello();
  }, opts.helloRetryMs ?? HELLO_RETRY_MS);
  const heartbeat = setInterval(() => {
    // Тишину считаем только после первого снимка: до него ждём хоста сколько угодно.
    if (current && Date.now() - lastHeard > timeoutMs) {
      opts.link.close();
      return;
    }
    send({ type: 'ping' });
  }, opts.heartbeatMs ?? HEARTBEAT_MS);
  const stop = () => {
    clearInterval(helloTimer);
    clearInterval(heartbeat);
  };

  opts.link.onMessage((raw) => {
    lastHeard = Date.now();
    const msg = parseHostMessage(raw);
    if (!msg || msg.type === 'pong') return;
    if (msg.type === 'reject') {
      // Хост нас не знает (он переподключился или перезагрузил страницу) — представиться заново;
      // его нумерация снимков могла начаться сначала, поэтому следующий снимок принимаем любой.
      if (msg.reason === 'notJoined') {
        rejoining = true;
        hello();
      }
      opts.onReject?.(msg.reason, msg.message);
      return;
    }
    // Снимки одного соединения идут по порядку; повторный (после повтора hello) не откатывает.
    if (current && !rejoining && msg.seq < current.seq) return;
    rejoining = false;
    current = {
      seq: msg.seq,
      seat: msg.seat,
      observation: msg.observation,
      legal: msg.legal,
      canUndo: msg.canUndo === true,
      undoVote: msg.undoVote ?? null,
    };
    opts.onSnapshot(current, msg.events);
  });
  opts.link.onClose(() => {
    if (closed) return;
    closed = true;
    stop();
    opts.onClose?.();
  });
  hello();

  return {
    view: () => current,
    act(action) {
      if (!current) return;
      send({ type: 'act', seq: current.seq, action });
    },
    undo() {
      if (current?.canUndo) send({ type: 'undo', seq: current.seq });
    },
    voteUndo(id, accept) {
      send({ type: 'undoVote', id, accept });
    },
    close() {
      stop();
      opts.link.close();
    },
  };
}
