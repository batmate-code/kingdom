import type { Action, GameEvent, Observation } from '@vampire/core';

/**
 * Протокол онлайн-партии (docs/online-plan.md). Хост держит партию; гость шлёт только ходы и
 * получает полные снимки своего наблюдения. Каждое сообщение — простой JSON.
 */

/** Версия протокола: при расхождении гость видит «обновите страницу». */
export const PROTOCOL_VERSION = 1;

/** Проверка связи: обе стороны шлют сообщение не реже, чем раз в HEARTBEAT_MS. */
export const HEARTBEAT_MS = 2000;
/** Тишина дольше LINK_TIMEOUT_MS — связь считается оборванной и закрывается. */
export const LINK_TIMEOUT_MS = 7000;
/** Гость повторяет hello, пока не получит первый снимок (хост мог ещё не открыть комнату). */
export const HELLO_RETRY_MS = 1000;

/** Длина ключа кресла (newKey: 16 байт в hex); длиннее — заведомо не наш. */
const MAX_KEY_LENGTH = 64;

/** Гость → хост. */
export type GuestMessage =
  /** Представиться: ключ кресла из ссылки-приглашения и версия протокола. */
  | { type: 'hello'; seatKey: string; protocol: number }
  /** Сделать ход; seq — номер снимка, на котором гость выбирал ход. */
  | { type: 'act'; seq: number; action: Action }
  /** Проверка связи. */
  | { type: 'ping' };

/** Хост → гость. */
export type HostMessage =
  /**
   * Снимок: наблюдение гостя, его допустимые ходы (пусто, если ходит не он) и события с
   * прошлого снимка, уже отфильтрованные eventsFor для этого кресла.
   */
  | {
      type: 'snapshot';
      seq: number;
      seat: number;
      observation: Observation;
      legal: Action[];
      events: GameEvent[];
    }
  /** Отказ: неверный ключ, чужая версия, устаревший или недопустимый ход. */
  | { type: 'reject'; reason: RejectReason; message: string }
  /** Ответ на проверку связи. */
  | { type: 'pong' };

export type RejectReason =
  | 'badKey'
  | 'protocol'
  | 'stale'
  | 'notYourTurn'
  | 'illegal'
  | 'notJoined'
  | 'alreadyJoined'
  | 'failed';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Разбор сообщения гостя (данные из сети не доверенные — проверяем форму). */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!isObject(raw)) return null;
  if (
    raw.type === 'hello' &&
    typeof raw.seatKey === 'string' &&
    raw.seatKey.length <= MAX_KEY_LENGTH &&
    Number.isInteger(raw.protocol)
  ) {
    return { type: 'hello', seatKey: raw.seatKey, protocol: Number(raw.protocol) };
  }
  if (raw.type === 'act' && Number.isInteger(raw.seq) && isObject(raw.action)) {
    // Форму самого хода проверяет хост: применяется только совпавший ход из допустимых.
    return { type: 'act', seq: Number(raw.seq), action: raw.action as Action };
  }
  if (raw.type === 'ping') return { type: 'ping' };
  return null;
}

/** Разбор сообщения хоста. Хост доверенный, но битый снимок не должен ронять экран гостя. */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'pong') return { type: 'pong' };
  if (raw.type === 'reject' && typeof raw.reason === 'string' && typeof raw.message === 'string') {
    return raw as HostMessage;
  }
  if (
    raw.type === 'snapshot' &&
    Number.isInteger(raw.seq) &&
    Number.isInteger(raw.seat) &&
    isObject(raw.observation) &&
    Array.isArray(raw.legal) &&
    Array.isArray(raw.events)
  ) {
    return raw as HostMessage;
  }
  return null;
}

/** JSON с ключами по алфавиту: одинаковые ходы дают одну строку при любом порядке полей. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Сравнение ходов: ход гостя допустим, только если совпадает с одним из допустимых. */
export const sameAction = (a: Action, b: Action): boolean => canonical(a) === canonical(b);
