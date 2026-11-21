import { describe, expect, it } from 'vitest';
import { appVersionLine } from './version';

describe('@vampire/web', () => {
  it('подключает core и bots', () => {
    expect(appVersionLine()).toBe('Скелет проекта: core 0.0.0, bots 0.0.0');
  });
});
