import { createGame, getLegalActions, applyAction, type GameState } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { broadcastConnect, broadcastListener } from './broadcast';
import { createGuestSession } from './guest';
import { createHostSession } from './host';
import { newKey } from './keys';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Онлайн: транспорт BroadcastChannel', () => {
  it('Гость в другой «вкладке» получает снимок и делает ход; закрытие доходит до хоста', async () => {
    const room = `test-${newKey()}`;
    let state: GameState = createGame({ playerCount: 2 }, 9);
    const key = newKey();
    const listener = broadcastListener(room);
    const host = createHostSession({
      listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply(action) {
        const r = applyAction(state, action);
        state = r.state;
        host.publish(r.events);
        return true;
      },
    });
    const link = broadcastConnect(room);
    const guest = createGuestSession({ link, seatKey: key, onSnapshot: () => undefined });
    await tick();
    expect(host.connectedSeats()).toEqual([1]);
    expect(guest.view()?.seat).toBe(1);

    // Хост ходит, пока очередь не дойдёт до гостя.
    while (state.pending?.player !== 1) {
      const r = applyAction(state, getLegalActions(state)[0]!);
      state = r.state;
      host.publish(r.events);
    }
    await tick();
    const before = state;
    guest.act(guest.view()!.legal[0]!);
    await tick();
    expect(state).not.toBe(before);

    guest.close();
    await tick();
    expect(host.connectedSeats()).toEqual([]);
    host.close();
    listener.close();
  });

  it('Гость открыл ссылку раньше хоста: повтор hello доходит, когда хост поднимает комнату', async () => {
    const room = `test-${newKey()}`;
    const state: GameState = createGame({ playerCount: 2 }, 3);
    const key = newKey();
    const link = broadcastConnect(room);
    const guest = createGuestSession({
      link,
      seatKey: key,
      onSnapshot: () => undefined,
      helloRetryMs: 30,
    });
    await tick();
    const listener = broadcastListener(room);
    const host = createHostSession({
      listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
    });
    await new Promise((r) => setTimeout(r, 120));
    expect(guest.view()?.seat).toBe(1);
    guest.close();
    host.close();
    listener.close();
  });
});
