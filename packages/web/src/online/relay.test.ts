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
import { seatRoom } from './invite';
import { newKey } from './keys';
import { relayConnect, relayListener, type MakeSocket, type SocketLike } from './relay';
import { createRelayHub, isRoomName } from './relayHub';

const OPEN = 1;
const CLOSED = 3;

/**
 * Поддельная сеть: браузерные сокеты (SocketLike) подключаются к настоящему ретранслятору
 * асинхронно, как по сети. Возвращает фабрику сокетов и счётчик открытых соединений.
 */
function fakeServer() {
  let id = 0;
  const hub = createRelayHub(() => `c${id++}`);
  const open = new Set<SocketLike>();
  const make: MakeSocket = (url) => {
    const u = new URL(url);
    const role = u.searchParams.get('role') === 'host' ? 'host' : 'guest';
    const room = u.searchParams.get('room') ?? '';
    let state = 0;
    const early: string[] = [];
    const client: SocketLike = {
      get readyState() {
        return state;
      },
      send(data) {
        if (state === OPEN) queueMicrotask(() => peer.message(data));
      },
      close() {
        if (state === CLOSED) return;
        state = CLOSED;
        open.delete(client);
        queueMicrotask(() => {
          peer.closed();
          client.onclose?.();
        });
      },
      onopen: null,
      onmessage: null,
      onclose: null,
    };
    const peer = hub.connect(
      {
        // Как у настоящего WebSocket: сообщения сервера до события open не теряются.
        send: (data) => {
          if (state === OPEN) queueMicrotask(() => client.onmessage?.({ data }));
          else if (state !== CLOSED) early.push(data);
        },
        close: () => client.close(),
      },
      role,
      room,
    );
    queueMicrotask(() => {
      if (state === CLOSED) return;
      state = OPEN;
      open.add(client);
      client.onopen?.();
      for (const data of early.splice(0)) client.onmessage?.({ data });
    });
    return client;
  };
  return { make, hub, open };
}

const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

const url = (role: 'host' | 'guest', room: string) =>
  `ws://test/relay?${new URLSearchParams({ role, room }).toString()}`;

describe('Онлайн: ретранслятор сервера (npm run online)', () => {
  it('Партия целиком через ретранслятор: гость ходит, снимки доходят', async () => {
    const net = fakeServer();
    const room = seatRoom(newKey(), newKey());
    const key = newKey();
    let state: GameState = createGame({ playerCount: 2 }, 6);
    const listener = relayListener(room, net.make, url('host', room));
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
    const guest = createGuestSession({
      link: relayConnect(room, net.make, url('guest', room)),
      seatKey: key,
      onSnapshot: () => undefined,
    });
    await settle();
    expect(host.connectedSeats()).toEqual([1]);

    const bots = [BOT_FACTORIES.random!(3), BOT_FACTORIES.random!(4)];
    let guard = 0;
    while (!isTerminal(state) && guard++ < 3000) {
      if (state.pending!.player === 0) {
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
    guest.close();
    host.close();
    listener.close();
    await settle();
    expect(net.hub.size()).toBe(0);
  });

  it('Гость открыл ссылку раньше хоста: хост появляется — соединение открывается', async () => {
    const net = fakeServer();
    const room = newKey();
    const key = newKey();
    const state = createGame({ playerCount: 2 }, 1);
    const guest = createGuestSession({
      link: relayConnect(room, net.make, url('guest', room)),
      seatKey: key,
      onSnapshot: () => undefined,
      helloRetryMs: 5,
    });
    await settle();
    const listener = relayListener(room, net.make, url('host', room));
    const host = createHostSession({
      listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(guest.view()?.seat).toBe(1);
    guest.close();
    host.close();
    listener.close();
  });

  it('Хост ушёл: ретранслятор закрывает гостей (они переподключатся сами)', async () => {
    const net = fakeServer();
    const room = newKey();
    const key = newKey();
    const state = createGame({ playerCount: 2 }, 1);
    const listener = relayListener(room, net.make, url('host', room));
    const host = createHostSession({
      listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
    });
    let closed = false;
    createGuestSession({
      link: relayConnect(room, net.make, url('guest', room)),
      seatKey: key,
      onSnapshot: () => undefined,
      onClose: () => (closed = true),
    });
    await settle();
    expect(host.connectedSeats()).toEqual([1]);
    host.close();
    listener.close();
    await settle();
    expect(closed).toBe(true);
  });

  it('Хост переподключился, а старое соединение ретранслятор не заметил: гостей закрывают, они входят заново', async () => {
    const net = fakeServer();
    const room = newKey();
    const key = newKey();
    const state = createGame({ playerCount: 2 }, 1);
    const listener1 = relayListener(room, net.make, url('host', room));
    const host1 = createHostSession({
      listener: listener1,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
    });
    let closed = false;
    createGuestSession({
      link: relayConnect(room, net.make, url('guest', room)),
      seatKey: key,
      onSnapshot: () => undefined,
      onClose: () => (closed = true),
    });
    await settle();
    expect(host1.connectedSeats()).toEqual([1]);
    // Новое соединение хоста (перезагрузка страницы, обрыв) при живом старом.
    const listener2 = relayListener(room, net.make, url('host', room));
    const host2 = createHostSession({
      listener: listener2,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
    });
    await settle();
    // Гость старого хоста закрыт — переподключится (это делает страница гостя) и представится.
    expect(closed).toBe(true);
    createGuestSession({
      link: relayConnect(room, net.make, url('guest', room)),
      seatKey: key,
      onSnapshot: () => undefined,
    });
    await settle();
    expect(host2.connectedSeats()).toEqual([1]);
    host1.close();
    host2.close();
    listener1.close();
    listener2.close();
  });

  it('Имя комнаты проверяется; чужая комната не видит сообщений', async () => {
    expect(isRoomName('ab12-cd34')).toBe(true);
    expect(isRoomName('../etc')).toBe(false);
    expect(isRoomName('')).toBe(false);
    const net = fakeServer();
    const bad = net.make(url('guest', 'Не-комната'));
    let badClosed = false;
    bad.onclose = () => (badClosed = true);
    await settle();
    expect(badClosed).toBe(true);
    // Гость другой комнаты не получает ничего от хоста этой.
    const listener = relayListener('aaaa', net.make, url('host', 'aaaa'));
    const got: unknown[] = [];
    const other = relayConnect('bbbb', net.make, url('guest', 'bbbb'));
    other.onMessage((m) => got.push(m));
    listener.onConnect((l) => l.send({ type: 'pong' }));
    await settle();
    expect(got).toEqual([]);
    listener.close();
    other.close();
  });
});
