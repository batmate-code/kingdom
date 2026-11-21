import { describe, expect, it } from 'vitest';
import { DATA_VERSION } from './index';

describe('@vampire/data', () => {
  it('экспортирует версию данных', () => {
    expect(DATA_VERSION).toBe('0.0.0');
  });
});
