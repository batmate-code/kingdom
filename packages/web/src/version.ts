import { BOTS_CORE_DATA_VERSION } from '@vampire/bots';
import { CORE_DATA_VERSION } from '@vampire/core';

export function appVersionLine(): string {
  return `Скелет проекта: core ${CORE_DATA_VERSION}, bots ${BOTS_CORE_DATA_VERSION}`;
}
