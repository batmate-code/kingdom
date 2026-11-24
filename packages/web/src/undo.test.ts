import { getLegalActions } from '@vampire/core';
import { afterEach, describe, expect, it } from 'vitest';
import { undoIndex, useGame } from './store';

/** История из ходов кресел: снимки различаются только полем actor. */
const history = (actors: (number | null)[]) =>
  actors.map((actor) => ({
    state: useGame.getState().state!,
    log: [],
    combatReports: [],
    revealed: {},
    byHuman: false,
    actor,
  }));

/** Ходить первым допустимым ходом, пока очередь не дойдёт до кресла `seat`. */
function playUntil(seat: number) {
  for (let i = 0; i < 50; i++) {
    const s = useGame.getState().state!;
    if (s.pending?.player === seat) return;
    useGame.getState().act(getLegalActions(s)[0]!, s.pending?.player === 0);
  }
  throw new Error(`Очередь не дошла до кресла ${seat}`);
}

afterEach(() => useGame.getState().reset());

describe('Онлайн-отмена: просьба и согласие всех игроков (автор 23.11)', () => {
  it('Индекс отмены — последний ход кресла; история без кресел ходов — отмена недоступна', () => {
    useGame.getState().start(['human', 'guest', 'heuristic'], 7);
    expect(undoIndex(history([1, 0, 2, 2]), 0)).toBe(1);
    expect(undoIndex(history([0, 1, 2]), 0)).toBe(0);
    expect(undoIndex(history([0, null]), 0)).toBe(-1);
  });

  it('Хост просит отмену: нужен ответ гостя; гость согласен — партия откатывается к ходу хоста', () => {
    useGame.getState().start(['human', 'guest', 'heuristic'], 7);
    playUntil(0);
    const atHost = useGame.getState().state!;
    useGame.getState().act(getLegalActions(atHost)[0]!);
    playUntil(1);
    expect(useGame.getState().canUndo()).toBe(true);
    useGame.getState().undo();
    const vote = useGame.getState().undoVote!;
    expect(vote.requester).toBe(0);
    expect(vote.need).toEqual([1]);
    expect(vote.lines.length).toBeGreaterThan(0);
    // Пока идёт просьба, новых просьб нет.
    expect(useGame.getState().canUndo()).toBe(false);
    useGame.getState().voteUndo([1], vote.id, true);
    expect(useGame.getState().undoVote).toBeNull();
    expect(useGame.getState().state).toBe(atHost);
  });

  it('Отказ любого игрока снимает просьбу; новый ход тоже', () => {
    useGame.getState().start(['human', 'guest', 'heuristic'], 7);
    playUntil(0);
    useGame.getState().act(getLegalActions(useGame.getState().state!)[0]!);
    playUntil(1);
    const now = useGame.getState().state;
    expect(useGame.getState().requestUndo(0)).toBe(true);
    const id = useGame.getState().undoVote!.id;
    useGame.getState().voteUndo([1], id, false);
    expect(useGame.getState().undoVote).toBeNull();
    expect(useGame.getState().state).toBe(now);

    expect(useGame.getState().requestUndo(0)).toBe(true);
    useGame.getState().act(getLegalActions(useGame.getState().state!)[0]!, false);
    expect(useGame.getState().undoVote).toBeNull();
  });

  it('Чужой голос (не из списка) не засчитывается; устаревший id игнорируется', () => {
    useGame.getState().start(['human', 'guest', 'guest', 'heuristic'], 9);
    playUntil(0);
    useGame.getState().act(getLegalActions(useGame.getState().state!)[0]!);
    expect(useGame.getState().requestUndo(0)).toBe(true);
    const vote = useGame.getState().undoVote!;
    expect(vote.need).toEqual([1, 2]);
    useGame.getState().voteUndo([3], vote.id, true);
    useGame.getState().voteUndo([1], vote.id + 100, true);
    expect(useGame.getState().undoVote?.approved).toEqual([]);
    useGame.getState().voteUndo([1], vote.id, true);
    expect(useGame.getState().undoVote?.approved).toEqual([1]);
    useGame.getState().voteUndo([2], vote.id, true);
    expect(useGame.getState().undoVote).toBeNull();
  });
});
