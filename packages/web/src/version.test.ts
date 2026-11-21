import { describe, expect, it } from 'vitest';
import { appVersionLine } from './version';

describe('@vampire/web', () => {
  it('создаёт партию через ядро', () => {
    expect(appVersionLine()).toMatch(/^Ядро подключено: раунд 1, первый игрок [123]$/);
  });
});
