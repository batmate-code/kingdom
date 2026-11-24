import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
  type Action,
  type GameEvent,
  type GameState,
} from '@vampire/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuestSession, type GuestSession, type GuestView } from './guest';
import { createHostSession, type HostSession } from './host';
import { newKey } from './keys';
import {
  parseGuestMessage,
  parseHostMessage,
  BUILD_ID,
  PROTOCOL_VERSION,
  sameAction,
  type HostMessage,
  type RejectReason,
} from './protocol';
import { memoryNetwork, type Link } from './transport';

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length > 0) cleanup.pop()!();
  vi.useRealTimers();
});

/** Хост с партией в переменной: кресло 0 — сам хост, 1 и 2 — гости. */
function setup(opts: { seed?: number; apply?: (a: Action) => boolean; timeoutMs?: number } = {}) {
  const net = memoryNetwork();
  let state: GameState = createGame({ playerCount: 3 }, opts.seed ?? 5);
  const keys = new Map([
    [1, newKey()],
    [2, newKey()],
  ]);
  const step = (action: Action) => {
    const r = applyAction(state, action);
    state = r.state;
    host.publish(r.events);
  };
  const host: HostSession = createHostSession({
    listener: net.listener,
    guestSeats: keys,
    getState: () => state,
    apply:
      opts.apply ??
      ((a) => {
        step(a);
        return true;
      }),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs, heartbeatMs: opts.timeoutMs / 4 } : {}),
  });
  cleanup.push(() => host.close());
  return {
    net,
    keys,
    host,
    step,
    get state() {
      return state;
    },
  };
}

function guest(link: Link, seatKey: string) {
  const rejects: RejectReason[] = [];
  const events: GameEvent[] = [];
  const snapshots: HostMessage[] = [];
  let last: GuestView | null = null;
  link.onMessage((m) => {
    const msg = parseHostMessage(m);
    if (msg?.type === 'snapshot') snapshots.push(msg);
  });
  const session: GuestSession = createGuestSession({
    link,
    seatKey,
    onSnapshot(view, ev) {
      last = view;
      events.push(...ev);
    },
    onReject: (reason) => rejects.push(reason),
  });
  cleanup.push(() => session.close());
  return { session, rejects, events, snapshots, view: () => last };
}

/** «Сырое» соединение: шлём что угодно, собираем ответы (кроме pong). */
function raw(t: ReturnType<typeof setup>) {
  const link = t.net.connect();
  const got: HostMessage[] = [];
  link.onMessage((m) => {
    const msg = parseHostMessage(m);
    if (msg && msg.type !== 'pong') got.push(msg);
  });
  cleanup.push(() => link.close());
  return { link, got, reasons: () => got.map((m) => (m.type === 'reject' ? m.reason : m.type)) };
}

describe('Онлайн: протокол хоста и гостя (транспорт в памяти)', () => {
  it('Партия доигрывается через протокол; наблюдения гостей совпадают с хостом, чужие жетоны в снимках скрыты', () => {
    const t = setup();
    const g1 = guest(t.net.connect(), t.keys.get(1)!);
    const g2 = guest(t.net.connect(), t.keys.get(2)!);
    expect(t.host.connectedSeats()).toEqual([1, 2]);
    const bots = [0, 1, 2].map((i) => BOT_FACTORIES.random!(100 + i));
    let guard = 0;
    while (!isTerminal(t.state) && guard++ < 5000) {
      const player = t.state.pending!.player;
      if (player === 0) {
        t.step(bots[0]!.chooseAction(getObservation(t.state, 0), getLegalActions(t.state)));
        continue;
      }
      const g = player === 1 ? g1 : g2;
      const view = g.view()!;
      expect(view.legal.length).toBeGreaterThan(0);
      g.session.act(bots[player]!.chooseAction(view.observation, view.legal));
    }
    expect(isTerminal(t.state)).toBe(true);
    expect(g1.rejects).toEqual([]);
    expect(g2.rejects).toEqual([]);
    for (const [seat, g] of [
      [1, g1],
      [2, g2],
    ] as const) {
      expect(g.view()!.observation).toEqual(getObservation(t.state, seat));
      expect(g.events.some((e) => e.type === 'gameOver')).toBe(true);
      // Снимок по сети: чужие жетоны боя до вскрытия — null, колоды и генератора нет.
      for (const snap of g.snapshots) {
        if (snap.type !== 'snapshot') continue;
        expect(snap.observation).not.toHaveProperty('deck');
        expect(snap.observation).not.toHaveProperty('rng');
        const combat = snap.observation.combat;
        if (combat && !combat.revealed) {
          for (const p of combat.plays) if (p.player !== seat) expect(p.token).toBeNull();
        }
      }
    }
  });

  it('Неверный ключ кресла и чужая версия протокола — отказ, кресло не занято', () => {
    const t = setup();
    const bad = guest(t.net.connect(), 'чужой-ключ');
    expect(bad.rejects).toEqual(['badKey']);
    const r = raw(t);
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION + 1,
      build: BUILD_ID,
    });
    // Другая сборка игры (у гостя устаревшая страница) — тоже отказ.
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION,
      build: 'старая',
    });
    expect(r.reasons()).toEqual(['protocol', 'protocol']);
    expect(t.host.connectedSeats()).toEqual([]);
  });

  it('Ход не в свою очередь, недопустимый и устаревший ход — отказ, партия не меняется', () => {
    const t = setup();
    const g1 = guest(t.net.connect(), t.keys.get(1)!);
    // Драфт начинает кресло 0 (хост): ход гостя 1 — не в свою очередь.
    expect(t.state.pending?.player).toBe(0);
    const before = t.state;
    g1.session.act({ type: 'pass' });
    expect(g1.rejects).toEqual(['notYourTurn']);
    expect(t.state).toBe(before);
    while (t.state.pending?.player !== 1) t.step(getLegalActions(t.state)[0]!);
    g1.session.act({ type: 'pass' });
    expect(g1.rejects.at(-1)).toBe('illegal');
    // Устаревший номер снимка: хост отказывает и присылает свежий снимок.
    const r = raw(t);
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION,
      build: BUILD_ID,
    });
    r.link.send({ type: 'act', seq: -1, action: getLegalActions(t.state)[0] });
    expect(r.reasons()).toEqual(['snapshot', 'stale', 'snapshot']);
    expect(t.state.pending?.player).toBe(1);
  });

  it('Ход принимается при другом порядке полей; применяется ход из списка допустимых', () => {
    const applied: Action[] = [];
    const t = setup({
      apply: (a) => {
        applied.push(a);
        return true;
      },
    });
    while (t.state.pending?.player !== 1) t.step(getLegalActions(t.state)[0]!);
    const legal = getLegalActions(t.state)[0]!;
    const reversed = Object.fromEntries(Object.entries(legal).reverse());
    const r = raw(t);
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION,
      build: BUILD_ID,
    });
    const first = r.got[0];
    const seq = first?.type === 'snapshot' ? first.seq : -1;
    r.link.send({ type: 'act', seq, action: { ...reversed, лишнее: 1 } });
    expect(applied).toEqual([]);
    r.link.send({ type: 'act', seq, action: reversed });
    expect(applied).toHaveLength(1);
    expect(sameAction(applied[0]!, legal)).toBe(true);
    expect(Object.keys(applied[0]!)).toEqual(Object.keys(legal));
  });

  it('Хост не смог применить ход — гость получает отказ failed', () => {
    const t = setup({ apply: () => false });
    while (t.state.pending?.player !== 1) t.step(getLegalActions(t.state)[0]!);
    const g1 = guest(t.net.connect(), t.keys.get(1)!);
    g1.session.act(g1.view()!.legal[0]!);
    expect(g1.rejects).toEqual(['failed']);
  });

  it('Переподключение: новое соединение того же кресла вытесняет старое и получает снимок', () => {
    const t = setup();
    const first = t.net.connect();
    let closed = false;
    first.onClose(() => (closed = true));
    guest(first, t.keys.get(1)!);
    const second = guest(t.net.connect(), t.keys.get(1)!);
    expect(closed).toBe(true);
    expect(t.host.connectedSeats()).toEqual([1]);
    expect(second.view()?.seat).toBe(1);
  });

  it('Без hello ходить нельзя; повторный hello с ключом другого кресла — отказ', () => {
    const t = setup();
    const r = raw(t);
    r.link.send({ type: 'act', seq: 0, action: { type: 'pass' } });
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION,
      build: BUILD_ID,
    });
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(2),
      protocol: PROTOCOL_VERSION,
      build: BUILD_ID,
    });
    expect(r.reasons()).toEqual(['notJoined', 'snapshot', 'alreadyJoined']);
    expect(t.host.connectedSeats()).toEqual([1]);
  });

  it('Нумерация снимков продолжается с initialSeq (хост после перезагрузки страницы)', () => {
    const net = memoryNetwork();
    const state = createGame({ playerCount: 2 }, 1);
    const key = newKey();
    const host = createHostSession({
      listener: net.listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
      initialSeq: 42,
    });
    cleanup.push(() => host.close());
    const g = guest(net.connect(), key);
    expect(g.view()?.seq).toBe(42);
  });

  it('Хост перезапустился и не знает гостя: гость представляется заново и принимает снимки с новой нумерацией', () => {
    const t = setup();
    // Соединение, по которому говорит «хост»: снимки и отказы подаём вручную.
    const sent: unknown[] = [];
    const handlers: ((m: unknown) => void)[] = [];
    const fake: Link = {
      send: (m) => sent.push(m),
      onMessage: (h) => {
        handlers.push(h);
        return () => undefined;
      },
      onClose: () => () => undefined,
      close: () => undefined,
    };
    const views: number[] = [];
    const s = createGuestSession({
      link: fake,
      seatKey: t.keys.get(1)!,
      onSnapshot: (v) => views.push(v.seq),
    });
    cleanup.push(() => s.close());
    const deliver = (m: unknown) => handlers.forEach((h) => h(m));
    const snap = (seq: number): HostMessage => ({
      type: 'snapshot',
      seq,
      seat: 1,
      observation: getObservation(t.state, 1),
      legal: [],
      events: [],
      canUndo: false,
      undoVote: null,
    });
    deliver(snap(7));
    sent.length = 0;
    s.act({ type: 'pass' });
    deliver({ type: 'reject', reason: 'notJoined', message: 'Сначала представьтесь' });
    expect(sent.some((m) => (m as { type?: string }).type === 'hello')).toBe(true);
    deliver(snap(0));
    expect(views).toEqual([7, 0]);
  });

  it('Тишина дольше таймаута: хост закрывает соединение гостя, кресло освобождается', () => {
    vi.useFakeTimers();
    const t = setup({ timeoutMs: 400 });
    const r = raw(t);
    r.link.send({
      type: 'hello',
      seatKey: t.keys.get(1),
      protocol: PROTOCOL_VERSION,
      build: BUILD_ID,
    });
    expect(t.host.connectedSeats()).toEqual([1]);
    vi.advanceTimersByTime(300);
    expect(t.host.connectedSeats()).toEqual([1]);
    vi.advanceTimersByTime(300);
    expect(t.host.connectedSeats()).toEqual([]);
  });

  it('Гость с проверкой связи остаётся в сети', () => {
    vi.useFakeTimers();
    const t = setup({ timeoutMs: 400 });
    const session = createGuestSession({
      link: t.net.connect(),
      seatKey: t.keys.get(1)!,
      onSnapshot: () => undefined,
      heartbeatMs: 100,
      timeoutMs: 400,
    });
    cleanup.push(() => session.close());
    vi.advanceTimersByTime(2000);
    expect(t.host.connectedSeats()).toEqual([1]);
  });

  it('Хост замолчал, не закрыв соединение: гость сам закрывает связь по таймауту', () => {
    vi.useFakeTimers();
    const net = memoryNetwork();
    const state = createGame({ playerCount: 2 }, 1);
    // Поддельный хост: отвечает на hello одним снимком и больше ничего не шлёт.
    net.listener.onConnect((link) =>
      link.onMessage((m) => {
        if (parseGuestMessage(m)?.type !== 'hello') return;
        link.send({
          type: 'snapshot',
          seq: 1,
          seat: 1,
          observation: getObservation(state, 1),
          legal: [],
          events: [],
          canUndo: false,
          undoVote: null,
        } satisfies HostMessage);
      }),
    );
    let closed = false;
    const session = createGuestSession({
      link: net.connect(),
      seatKey: 'k',
      onSnapshot: () => undefined,
      onClose: () => (closed = true),
      heartbeatMs: 100,
      timeoutMs: 400,
    });
    cleanup.push(() => session.close());
    expect(session.view()?.seq).toBe(1);
    vi.advanceTimersByTime(300);
    expect(closed).toBe(false);
    vi.advanceTimersByTime(300);
    expect(closed).toBe(true);
  });
});

describe('Онлайн: разбор недоверенных сообщений', () => {
  it('Сообщения гостя: неверная форма отбрасывается', () => {
    for (const bad of [
      null,
      [],
      'hello',
      { type: 'hello', seatKey: 1, protocol: PROTOCOL_VERSION },
      { type: 'hello', seatKey: 'x'.repeat(1000), protocol: PROTOCOL_VERSION },
      { type: 'hello', seatKey: 'k', protocol: '1' },
      { type: 'act', seq: '1', action: { type: 'pass' } },
      { type: 'act', seq: 1.5, action: { type: 'pass' } },
      { type: 'act', seq: 1, action: null },
      { type: 'неизвестно' },
    ]) {
      expect(parseGuestMessage(bad)).toBeNull();
    }
    expect(parseGuestMessage({ type: 'ping' })).toEqual({ type: 'ping' });
  });

  it('Сообщения хоста: битый снимок отбрасывается', () => {
    expect(parseHostMessage({ type: 'snapshot', seq: 1 })).toBeNull();
    expect(
      parseHostMessage({
        type: 'snapshot',
        seq: 1,
        seat: 0,
        observation: null,
        legal: [],
        events: [],
      }),
    ).toBeNull();
    expect(parseHostMessage({ type: 'reject', reason: 'badKey' })).toBeNull();
    expect(parseHostMessage({ type: 'pong' })).toEqual({ type: 'pong' });
  });

  it('Отмена хода гостя: хост разрешает — откатывает; не разрешает — отказ cannotUndo', () => {
    let allowed = true;
    const undone: number[] = [];
    const net = memoryNetwork();
    const state = createGame({ playerCount: 2 }, 1);
    const key = newKey();
    const host = createHostSession({
      listener: net.listener,
      guestSeats: new Map([[1, key]]),
      getState: () => state,
      apply: () => false,
      canUndo: () => allowed,
      undo: (seat) => {
        if (!allowed) return false;
        undone.push(seat);
        return true;
      },
    });
    cleanup.push(() => host.close());
    const g = guest(net.connect(), key);
    expect(g.view()?.canUndo).toBe(true);
    g.session.undo();
    expect(undone).toEqual([1]);
    allowed = false;
    const raw2 = net.connect();
    const got: string[] = [];
    raw2.onMessage((m) => {
      const msg = parseHostMessage(m);
      if (msg && msg.type !== 'pong') got.push(msg.type === 'reject' ? msg.reason : msg.type);
    });
    raw2.send({ type: 'hello', seatKey: key, protocol: PROTOCOL_VERSION, build: BUILD_ID });
    raw2.send({ type: 'undo', seq: 0 });
    expect(got).toEqual(['snapshot', 'cannotUndo']);
  });
});
