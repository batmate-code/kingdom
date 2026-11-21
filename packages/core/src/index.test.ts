import { describe, expect, it } from 'vitest';
import { CORE_DATA_VERSION } from './index';

describe('@vampire/core', () => {
  it('видит пакет data', () => {
    expect(CORE_DATA_VERSION).toBe('0.0.0');
  });
});
