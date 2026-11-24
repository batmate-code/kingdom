import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
  type GameState,
} from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { createGuestSession } from './guest';
import { createHostSession } from './host';
import { newKey } from './keys';
import { seatRoom } from './invite';
import { mergeListeners } from './transport';
import { webrtcConnect, webrtcListener, type OpenRoom, type RoomLike } from './webrtc';

/**
 * Поддельные комнаты Trystero: пиры одной комнаты узнают друг о друге (onPeerJoin у обоих,
 * асинхронно — как в настоящей библиотеке), сообщения адресуются по peerId.
 */
function fakeRooms(): OpenRoom {
  const rooms = new Map<
    string,
    Map<string, RoomLike & { deliver(ns: string, data: string, from: string): void }>
  >();
  let nextId = 0;
  return (roomId) => {
    const members = rooms.get(roomId) ?? new Map();
    rooms.set(roomId, members);
    const id = `peer-${nextId++}`;
    const actions = new Map<
      string,
      { onMessage: ((d: string, c: { peerId: string }) => void) | null }
    >();
    const room: RoomLike & { deliver(ns: string, data: string, from: string): void } = {
      onPeerJoin: null,
      onPeerLeave: null,
      makeAction(ns) {
        const action = {
          onMessage: null as ((d: string, c: { peerId: string }) => void) | null,
          send: async (data: string, options?: { target?: string }) => {
            for (const [peerId, peer] of members) {
              if (peerId === id || (options?.target && options.target !== peerId)) continue;
              queueMicrotask(() => peer.deliver(ns, data, id));
            }
          },
        };
        actions.set(ns, action);
        return action;
      },
      deliver(ns, data, from) {
        actions.get(ns)?.onMessage?.(data, { peerId: from });
      },
      async leave() {
        members.delete(id);
        for (const peer of members.values()) queueMicrotask(() => peer.onPeerLeave?.(id));
      },
    };
    const others = [...members.entries()];
    members.set(id, room);
    queueMicrotask(() => {
      for (const [otherId, other] of others) {
        other.onPeerJoin?.(id);
        room.onPeerJoin?.(otherId);
      }
    });
    return room;
  };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('Онлайн: транспорт WebRTC (поддельные комнаты Trystero)', () => {
  it('Партия через комнату: гость находит хоста, ходит, получает снимки; уход хоста закрывает связь', async () => {
    const open = fakeRooms();
    const room = newKey();
    const key = newKey();
    let state: GameState = createGame({ playerCount: 2 }, 4);
    const listener = webrtcListener(room, open);
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
    let closed = false;
    const guest = createGuestSession({
      link: webrtcConnect(room, open),
      seatKey: key,
      onSnapshot: () => undefined,
      onClose: () => (closed = true),
    });
    await settle();
    expect(host.connectedSeats()).toEqual([1]);
    expect(guest.view()?.seat).toBe(1);

    const bots = [BOT_FACTORIES.random!(1), BOT_FACTORIES.random!(2)];
    let guard = 0;
    while (!isTerminal(state) && guard++ < 3000) {
      const player = state.pending!.player;
      if (player === 0) {
        const r = applyAction(
          state,
          bots[0]!.chooseAction(getObservation(state, 0), getLegalActions(state)),
        );
        state = r.state;
        host.publish(r.events);
      } else {
        const view = guest.view()!;
        guest.act(bots[1]!.chooseAction(view.observation, view.legal));
      }
      await settle();
    }
    expect(isTerminal(state)).toBe(true);
    expect(guest.view()!.observation).toEqual(getObservation(state, 1));

    host.close();
    listener.close();
    await settle();
    expect(closed).toBe(true);
  });

  it('Чужие пиры в комнате (другие гости) не могут писать от имени хоста', async () => {
    const open = fakeRooms();
    const room = newKey();
    const got: unknown[] = [];
    const link = webrtcConnect(room, open);
    link.onMessage((m) => got.push(m));
    // Пир без кадра role («не хост») шлёт сообщение — гость его игнорирует.
    const stranger = open(room);
    const msg = stranger.makeAction('msg');
    await settle();
    await msg.send(JSON.stringify({ type: 'pong' }));
    await settle();
    expect(got).toEqual([]);
    link.close();
  });

  it('Отдельная комната на кресло: два гостя подключаются каждый в свою, хост видит обоих', async () => {
    const open = fakeRooms();
    const room = newKey();
    const keys = [newKey(), newKey()];
    const state = createGame({ playerCount: 3 }, 2);
    const listener = mergeListeners(keys.map((k) => webrtcListener(seatRoom(room, k), open)));
    const host = createHostSession({
      listener,
      guestSeats: new Map([
        [1, keys[0]!],
        [2, keys[1]!],
      ]),
      getState: () => state,
      apply: () => false,
    });
    const g1 = createGuestSession({
      link: webrtcConnect(seatRoom(room, keys[0]!), open),
      seatKey: keys[0]!,
      onSnapshot: () => undefined,
    });
    const g2 = createGuestSession({
      link: webrtcConnect(seatRoom(room, keys[1]!), open),
      seatKey: keys[1]!,
      onSnapshot: () => undefined,
    });
    await settle();
    expect(host.connectedSeats()).toEqual([1, 2]);
    expect(g1.view()?.seat).toBe(1);
    expect(g2.view()?.seat).toBe(2);
    for (const s of [g1, g2]) s.close();
    host.close();
    listener.close();
  });
});
