import { BOTS_CORE_DATA_VERSION } from '@vampire/bots';
import { CORE_DATA_VERSION } from '@vampire/core';

/** Симулятор партий (этап 6). Пока только проверяет, что зависимости подключены. */
export function describeSim(): string {
  return `sim: core data ${CORE_DATA_VERSION}, bots data ${BOTS_CORE_DATA_VERSION}`;
}
