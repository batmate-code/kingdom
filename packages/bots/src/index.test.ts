import { describe, expect, it } from 'vitest';
import { BOTS_CORE_DATA_VERSION } from './index';

describe('@vampire/bots', () => {
  it('видит пакет core', () => {
    expect(BOTS_CORE_DATA_VERSION).toBe('0.0.0');
  });
});
