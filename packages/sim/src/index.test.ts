import { describe, expect, it } from 'vitest';
import { describeSim } from './index';

describe('@vampire/sim', () => {
  it('подключает core и bots', () => {
    expect(describeSim()).toBe('sim: core data 0.0.0, bots data 0.0.0');
  });
});
