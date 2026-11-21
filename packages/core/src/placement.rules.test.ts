import { describe, expect, it } from 'vitest';
import { act, moveWorker, newGame, place, placeActions, res, turnTo } from './testing';

const start = () => turnTo(newGame(), 0);

describe('Размещение', () => {
  it('Первый слот: свободный, любой рабочий, действие первого слота (Рудник +3 золота)', () => {
    const s = place(start(), 'mine', 1);
    expect(res(s, 0).gold).toBe(2 + 3);
    expect(s.workers.find((w) => w.id === 'p0w0')?.position).toEqual({
      kind: 'slot',
      location: 'mine',
      slot: 1,
    });
  });

  it('Второй слот можно занять, даже если первый свободен (ответ автора 4)', () => {
    const s = place(start(), 'mine', 2);
    expect(res(s, 0).gold).toBe(2 + 2);
  });

  it('Занятый первый слот недоступен', () => {
    const s = place(start(), 'mine', 1);
    expect(placeActions(s).some((a) => a.location === 'mine' && a.slot === 1)).toBe(false);
    expect(placeActions(s).some((a) => a.location === 'mine' && a.slot === 2)).toBe(true);
  });

  it('Ход идёт по кругу, начиная с первого игрока', () => {
    let s = start();
    expect(s.pending).toEqual({ kind: 'placement', player: 0 });
    s = place(s, 'mine', 1);
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    s = place(s, 'witchCircle', 1);
    expect(s.pending).toEqual({ kind: 'placement', player: 2 });
    s = place(s, 'lair', 1);
    expect(s.pending).toEqual({ kind: 'placement', player: 0 });
  });

  it('Пас окончательный: спасовавший больше не выставляет рабочих до боя', () => {
    let s = act(start(), { type: 'pass' });
    s = place(s, 'mine', 1);
    s = place(s, 'witchCircle', 1);
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Игрок без рабочих в запасе пропускается', () => {
    let s = start();
    for (const id of ['p0w0', 'p0w1', 'p0w2']) s = moveWorker(s, id, { kind: 'hospital' });
    s = turnTo(s, 1);
    s = place(s, 'mine', 1);
    s = place(s, 'witchCircle', 1);
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Все выставили рабочих — начинаются бои, затем следующий раунд', () => {
    let s = start();
    // Локации без выбора в действии: ход сразу переходит дальше.
    const order = [
      ['mine', 1],
      ['witchCircle', 1],
      ['lair', 1],
      ['tavern', 2],
      ['mine', 2],
      ['witchCircle', 2],
      ['lair', 2],
      ['tavern', 1],
      ['chancery', 1],
    ] as const;
    for (const [loc, slot] of order) s = place(s, loc, slot);
    expect(s.round).toBe(2);
    // Новый раунд начинается с драфта.
    expect(s.phase).toBe('draft');
    expect(s.pending).toMatchObject({ kind: 'draftPick', player: s.firstPlayer, circle: 1 });
  });

  it('Рабочего из запаса можно выбрать любого — одинаковые рабочие дают одно действие', () => {
    const s = start();
    const mine1 = placeActions(s).filter((a) => a.location === 'mine' && a.slot === 1);
    expect(mine1).toHaveLength(1);
  });
});
