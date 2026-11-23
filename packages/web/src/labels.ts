/** Подписи по-русски живут в ядре (общие для веба и консольной игры агента). */
export {
  actionLabel,
  buildLabel,
  decisionTitle,
  eventText,
  locName,
  playerName,
  regionName,
  resText,
  workerLabel,
} from '@vampire/core';

/** Подпись кресла соперника: бот или гость по ссылке (онлайн); у людей за этим экраном — пусто. */
export function seatLabel(seat: string | undefined): string {
  if (seat === undefined || seat === 'human' || seat === 'remote') return '';
  return seat === 'guest' ? ' · гость' : ' · бот';
}
