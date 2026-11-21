import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from './types';
import { edit, newGame, place, placeActions, res, setWorker, turnTo } from './testing';

/** Игрок 0 стоит в первом слоте Рудника; жетон Рудника — Шпион; у игрока 1 рабочий-Шпион. */
function setup(
  opts: { victimProfession?: 'guard'; rules?: { allowDisplaceOwnWorker: boolean } } = {},
): GameState {
  let s = turnTo(newGame(opts.rules ? { rules: opts.rules } : {}), 0);
  s = edit(s, (d) => {
    d.locations.mine.professionToken = 'spy';
  });
  if (opts.victimProfession) s = setWorker(s, 'p0w0', { profession: opts.victimProfession });
  s = place(s, 'mine', 1, { workerId: 'p0w0' });
  return setWorker(s, 'p1w0', { profession: 'spy' });
}

const canDisplaceMine = (s: GameState) =>
  placeActions(s).some((a) => a.location === 'mine' && a.slot === 2 && a.displace);

describe('Вытеснение', () => {
  it('Совпадение профессии и занятый первый слот — можно вытеснить', () => {
    expect(canDisplaceMine(setup())).toBe(true);
  });

  it('Вытесненный уходит в госпиталь, владелец получает 1 компромат; вытесняющий встаёт в первый слот, делает действие второго, второй слот закрыт', () => {
    const log: GameEvent[] = [];
    const s = place(setup(), 'mine', 2, { displace: true, workerId: 'p1w0', log });
    expect(s.workers.find((w) => w.id === 'p0w0')?.position).toEqual({ kind: 'hospital' });
    expect(res(s, 0).compromat).toBe(1);
    expect(s.workers.find((w) => w.id === 'p1w0')?.position).toEqual({
      kind: 'slot',
      location: 'mine',
      slot: 1,
    });
    expect(res(s, 1).gold).toBe(2 + 2);
    expect(s.locations.mine.slot2Locked).toBe(true);
    expect(log.some((e) => e.type === 'workerDisplaced' && e.workerId === 'p0w0')).toBe(true);
  });

  it('Действие вытесненного уже выполнено и не отменяется', () => {
    const s = place(setup(), 'mine', 2, { displace: true, workerId: 'p1w0' });
    expect(res(s, 0).gold).toBe(2 + 3);
  });

  it('Вытеснение по желанию: можно встать во второй слот без вытеснения', () => {
    const s = place(setup(), 'mine', 2, { displace: false, workerId: 'p1w0' });
    expect(s.workers.find((w) => w.id === 'p0w0')?.position).toMatchObject({
      kind: 'slot',
      slot: 1,
    });
    expect(s.workers.find((w) => w.id === 'p1w0')?.position).toMatchObject({
      kind: 'slot',
      slot: 2,
    });
    expect(s.locations.mine.slot2Locked).toBe(false);
  });

  it('Без совпадения профессии вытеснить нельзя', () => {
    const s = setWorker(setup(), 'p1w0', { profession: 'architect' });
    expect(canDisplaceMine(s)).toBe(false);
  });

  it('Рабочий без профессии вытеснить не может', () => {
    const s = setWorker(setup(), 'p1w0', { profession: null });
    expect(canDisplaceMine(s)).toBe(false);
  });

  it('Пустой первый слот — вытеснять некого', () => {
    let s = turnTo(newGame(), 1);
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = setWorker(s, 'p1w0', { profession: 'spy' });
    expect(canDisplaceMine(s)).toBe(false);
  });

  it('Страж не может быть вытеснен', () => {
    expect(canDisplaceMine(setup({ victimProfession: 'guard' }))).toBe(false);
  });

  it('Закрытый второй слот недоступен для размещения до конца раунда', () => {
    const s = place(setup(), 'mine', 2, { displace: true, workerId: 'p1w0' });
    expect(placeActions(s).some((a) => a.location === 'mine')).toBe(false);
  });

  it('OQ-2: своего рабочего вытеснить можно (по умолчанию) или нельзя (переключатель)', () => {
    const own = (allow: boolean) => {
      let s = turnTo(newGame({ rules: { allowDisplaceOwnWorker: allow } }), 0);
      s = edit(s, (d) => {
        d.locations.mine.professionToken = 'spy';
      });
      s = place(s, 'mine', 1, { workerId: 'p0w0' });
      s = setWorker(s, 'p0w1', { profession: 'spy' });
      return canDisplaceMine(turnTo(s, 0));
    };
    expect(own(true)).toBe(true);
    expect(own(false)).toBe(false);
  });
});
