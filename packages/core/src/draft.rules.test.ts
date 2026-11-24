import { CHARACTER_ORDER } from '@vampire/data';
import { CHARACTERS, PROFESSION_ORDER, type CharacterId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions, getObservation } from './engine';
import type { Action, GameEvent, GameState } from './types';
import { act, edit, passAll, res, skipDraft } from './testing';

/** Выложить на драфт конкретных персонажей (прежние возвращаются в колоду). */
function setOffer(state: GameState, characters: CharacterId[]): GameState {
  return edit(state, (d) => {
    d.deck.unshift(...d.offer.characters);
    d.deck = d.deck.filter((c) => !characters.includes(c));
    d.offer.characters = [...characters];
  });
}

const game = (playerCount = 3, seed = 1) =>
  setOffer(
    createGame(
      {
        playerCount,
        rules: { randomFirstPlayer: true, disabledCharacters: false, draftStart: 'first' },
      },
      seed,
    ),
    ['bloodsucker', 'storekeeper', 'officer', 'tactician', 'oreMiner'],
  );

const pickChar = (s: GameState, character: CharacterId, log?: GameEvent[]) =>
  act(s, { type: 'draftPick', pick: { kind: 'character', character } }, log);
const pickProf = (s: GameState, profession: (typeof PROFESSION_ORDER)[number]) =>
  act(s, { type: 'draftPick', pick: { kind: 'profession', profession } });
const first = (s: GameState) => act(s, getLegalActions(s)[0] as Action);

/** Пройти драфт: каждый берёт первое доступное. */
function draftAll(s: GameState): GameState {
  while (s.pending?.kind === 'draftPick') s = first(s);
  return s;
}

describe('Подготовка: выкладка драфта', () => {
  it('Выкладываются 5 случайных персонажей из колоды и 5 профессий — по одной каждой', () => {
    const s = createGame({ playerCount: 3 }, 4);
    expect(s.offer.characters).toHaveLength(5);
    expect(s.offer.professions).toEqual([...PROFESSION_ORDER]);
    expect(s.deck).toHaveLength(Object.keys(CHARACTERS).length - 5);
    expect(s.phase).toBe('draft');
  });

  it('Колода перемешивается по seed: разные seed — разная выкладка, одинаковые — одинаковая', () => {
    expect(createGame({}, 1).offer).toEqual(createGame({}, 1).offer);
    const offers = new Set(
      Array.from({ length: 10 }, (_, i) => createGame({}, i).offer.characters.join()),
    );
    expect(offers.size).toBeGreaterThan(1);
  });

  it('Порядок колоды скрыт: в наблюдении только её размер', () => {
    const obs = getObservation(createGame({}, 1), 0);
    expect('deck' in obs).toBe(false);
    expect(obs.deckSize).toBe(CHARACTER_ORDER.length - 5);
    expect(obs.offer.characters).toHaveLength(5);
  });
});

describe('Драфт', () => {
  it('Круг 1 с первого игрока: персонаж ИЛИ профессия (10 вариантов)', () => {
    const s = game();
    expect(s.pending).toEqual({ kind: 'draftPick', player: s.firstPlayer, circle: 1 });
    expect(getLegalActions(s)).toHaveLength(10);
  });

  it('Круг 2 в обратном порядке (с последнего): каждый берёт недостающее', () => {
    let s = game();
    const f = s.firstPlayer;
    const order = [f, (f + 1) % 3, (f + 2) % 3];
    s = pickChar(s, 'bloodsucker'); // первый — персонажа
    s = pickProf(s, 'spy'); // второй — профессию
    s = pickChar(s, 'officer'); // третий — персонажа
    // Круг 2 начинает последний (третий): ему нужна профессия.
    expect(s.pending).toEqual({ kind: 'draftPick', player: order[2], circle: 2 });
    expect(
      getLegalActions(s).every((a) => a.type === 'draftPick' && a.pick.kind === 'profession'),
    ).toBe(true);
    s = pickProf(s, 'guard');
    // Затем второй: ему нужен персонаж.
    expect(s.pending).toEqual({ kind: 'draftPick', player: order[1], circle: 2 });
    expect(
      getLegalActions(s).every((a) => a.type === 'draftPick' && a.pick.kind === 'character'),
    ).toBe(true);
  });

  it('После драфта остаются 2 персонажа и 2 профессии для Таверны (3 игрока)', () => {
    const s = draftAll(game());
    expect(s.offer.characters).toHaveLength(2);
    expect(s.offer.professions).toHaveLength(2);
    expect(s.players.every((p) => p.draftPick.character && p.draftPick.profession)).toBe(true);
  });

  it('При 2 и 4 игроках драфт тот же: остаётся 3+3 и 1+1', () => {
    expect(draftAll(game(2)).offer.characters).toHaveLength(3);
    expect(draftAll(game(4)).offer.professions).toHaveLength(1);
  });
});

describe('Улучшение', () => {
  it('Идёт с первого игрока: назначить пару на рабочего без улучшения или сбросить', () => {
    const s = draftAll(game());
    expect(s.pending).toEqual({ kind: 'upgrade', player: s.firstPlayer });
    // Все рабочие без улучшения одинаковы — один вариант «назначить» + «сбросить».
    expect(getLegalActions(s)).toEqual([
      { type: 'upgrade', choice: { kind: 'assign', workerId: `p${s.firstPlayer}w0` } },
      { type: 'upgrade', choice: { kind: 'discard' } },
    ]);
  });

  it('Назначенная пара остаётся на рабочем', () => {
    let s = draftAll(game());
    const p = s.firstPlayer;
    const { character, profession } = s.players[p]!.draftPick;
    s = act(s, { type: 'upgrade', choice: { kind: 'assign', workerId: `p${p}w0` } });
    expect(s.workers.find((w) => w.id === `p${p}w0`)).toMatchObject({ character, profession });
    expect(s.players[p]!.draftPick).toEqual({ character: null, profession: null });
  });

  it('Сброс сразу после драфта: отступные по содержанию, профессия тоже пропадает', () => {
    let s = game();
    s = pickChar(s, 'storekeeper'); // содержание 1 → отступные 2 золота
    s = draftAll(s);
    const p = s.firstPlayer;
    const before = res(s, p).gold;
    s = act(s, { type: 'upgrade', choice: { kind: 'discard' } });
    expect(res(s, p).gold).toBe(before + 2);
    expect(s.discard).toContain('storekeeper');
    expect(s.workers.filter((w) => w.owner === p).every((w) => w.profession === null)).toBe(true);
  });

  it('Замена улучшения: за старую пару дают отступные', () => {
    let s = edit(game(), (d) => {
      const w = d.workers.find((x) => x.id === `p${d.firstPlayer}w0`)!;
      d.deck.splice(d.deck.indexOf('marauder'), 1);
      w.character = 'marauder'; // содержание 0 → отступные 1 руда
      w.profession = 'guard';
    });
    const p = s.firstPlayer;
    s = pickChar(s, 'officer');
    s = draftAll(s);
    expect(getLegalActions(s)).toContainEqual({
      type: 'upgrade',
      choice: { kind: 'assign', workerId: `p${p}w0` },
    });
    s = act(s, { type: 'upgrade', choice: { kind: 'assign', workerId: `p${p}w0` } });
    expect(res(s, p).ore).toBe(1);
    expect(s.discard).toContain('marauder');
    expect(s.workers.find((w) => w.id === `p${p}w0`)?.character).toBe('officer');
  });

  it('Отступные по таблице: 0 → 1 руда, 1 → 2 золота, 2 → 1 золото, 3 → ничего', () => {
    const severance = (character: CharacterId) => {
      const others: CharacterId[] = ['storekeeper', 'officer', 'oreMiner', 'diplomat', 'patron'];
      let s = setOffer(createGame({ rules: { draftStart: 'first' } }, 2), [
        character,
        ...others.filter((c) => c !== character).slice(0, 4),
      ]);
      const p = s.firstPlayer;
      s = pickChar(s, character);
      s = draftAll(s);
      const before = { ...res(s, p) };
      s = act(s, { type: 'upgrade', choice: { kind: 'discard' } });
      const after = res(s, p);
      return { gold: after.gold - before.gold, ore: after.ore - before.ore };
    };
    expect(severance('bloodsucker')).toEqual({ gold: 0, ore: 1 });
    expect(severance('troublemaker')).toEqual({ gold: 2, ore: 0 });
    expect(severance('oreBaron')).toEqual({ gold: 1, ore: 0 });
    expect(severance('tactician')).toEqual({ gold: 0, ore: 0 });
  });

  it('После улучшения всех игроков начинается размещение с первого игрока', () => {
    let s = draftAll(game());
    while (s.pending?.kind === 'upgrade') s = first(s);
    expect(s.phase).toBe('placement');
    expect(s.pending).toEqual({ kind: 'placement', player: s.firstPlayer });
  });
});

describe('Персонажи между раундами', () => {
  it('Невзятые персонажи (пул Таверны) в конце раунда уходят в сброс; колода не возвращается', () => {
    let s = draftAll(game());
    while (s.pending?.kind === 'upgrade') s = first(s);
    const leftovers = [...s.offer.characters];
    s = passAll(s);
    for (const c of leftovers) expect(s.discard).toContain(c);
    expect(s.offer).toEqual({ characters: [], professions: [] });
  });

  it('Колоды хватает на 6 раундов по 5 (лишние карты остаются в колоде)', () => {
    let s = createGame({ playerCount: 3 }, 8);
    for (let round = 1; round <= 6; round++) {
      expect(s.round).toBe(round);
      expect(s.offer.characters).toHaveLength(5);
      expect(s.deck).toHaveLength(CHARACTER_ORDER.length - 5 * round);
      s = draftAll(s);
      while (s.pending?.kind === 'upgrade') {
        s = act(s, { type: 'upgrade', choice: { kind: 'discard' } });
      }
      while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.deck).toHaveLength(CHARACTER_ORDER.length - 30);
  });

  it('skipDraft в помощниках тестов не теряет карты', () => {
    const s = skipDraft(createGame({}, 3));
    expect(s.deck).toHaveLength(CHARACTER_ORDER.length);
  });
});
