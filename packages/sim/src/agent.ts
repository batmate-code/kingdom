/**
 * Консольная игра для агента (LLM или человека): партия хранится в JSON-файле, каждый вызов —
 * один ход. Агент видит только наблюдение своего игрока (getObservation), выбирает ход по номеру
 * и пишет обоснование. Рядом записывается ход, который выбрал бы эвристический бот, — по
 * расхождениям потом дорабатываем бота.
 *
 *   npm run agent -- new  --file g.json --seats agent,heuristic,heuristic [--seed N] [--rule k=v]
 *   npm run agent -- show --file g.json [--seat N]
 *   npm run agent -- wait --file g.json --seat N [--timeout 540]   (ждать своего хода)
 *   npm run agent -- act  --file g.json [--seat N] --choice 3 --expect "часть названия хода" --why "…"
 *   npm run agent -- log  --file g.json          (решения агента и расхождения с ботом)
 *
 * Ходы ботов и единственные допустимые ходы выполняются автоматически. Если агентов за столом
 * несколько, --seat (номер игрока, с 1) обязателен: без него show и act показали бы чужую руку.
 * --expect защищает от случайного хода: номер выполняется, только если его название содержит текст.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BOT_FACTORIES } from '@vampire/bots';
import {
  actionLabel,
  applyAction,
  buildLabel,
  cityEntryPrice,
  createGame,
  decisionTitle,
  eventText,
  getLegalActions,
  getObservation,
  getScores,
  isTerminal,
  locName,
  playerName,
  priceText,
  regionName,
  resText,
  workerLabel,
  type Action,
  type GameConfigInput,
  type GameState,
  type Observation,
  type RuleToggles,
} from '@vampire/core';
import {
  CHARACTERS,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  LOCATION_ORDER,
  PROFESSIONS,
  REGION_ORDER,
  TRACKS,
  CITY_ENTRY,
  PRESTIGE_TRACK,
  TRACK_BOOSTS,
  type CharacterId,
} from '@vampire/data';
import { botSeed } from './index';

/** Бот-тень: его выбор записывается рядом с решением агента. */
const SHADOW_BOT = 'heuristic';

export interface AgentDecision {
  /** Номер действия в партии. */
  index: number;
  player: number;
  round: number;
  title: string;
  options: string[];
  choice: number;
  why: string;
  shadowChoice: number;
}

export interface AgentGame {
  config: GameConfigInput;
  seed: number;
  /** Кто в кресле: 'agent' или имя бота. */
  seats: string[];
  actions: Action[];
  decisions: AgentDecision[];
  /** События с прошлого решения каждого кресла (только открытые). */
  feed: string[][];
}

const AGENT = 'agent';

const PHASE_NAME: Record<string, string> = {
  draft: 'драфт',
  upgrade: 'улучшение',
  placement: 'размещение',
  combat: 'бои',
  upkeep: 'содержание',
  gameOver: 'конец партии',
};

function replay(g: AgentGame): GameState {
  let s = createGame(g.config, g.seed);
  for (const a of g.actions) s = applyAction(s, a, { validate: false }).state;
  return s;
}

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ход бота в кресле: бот создаётся заново с seed от номера хода — партия воспроизводима. */
function botChoice(name: string, g: AgentGame, s: GameState, seat: number): Action {
  const factory = BOT_FACTORIES[name];
  if (!factory) throw new Error(`Неизвестный бот: ${name}`);
  const bot = factory(botSeed(g.seed + g.actions.length, seat));
  return bot.chooseAction(getObservation(s, seat), getLegalActions(s));
}

function apply(g: AgentGame, s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  g.actions.push(a);
  for (const e of r.events) {
    const text = eventText(r.state, e);
    if (text) g.feed.forEach((f) => f.push(text));
  }
  return r.state;
}

/** Играть за ботов и вынужденные ходы, пока не дойдёт до решения агента или конца партии. */
function advance(g: AgentGame): GameState {
  let s = replay(g);
  while (!isTerminal(s) && s.pending) {
    const seat = s.pending.player;
    const legal = getLegalActions(s);
    if (legal.length === 1) s = apply(g, s, legal[0]!);
    else if (g.seats[seat] === AGENT) break;
    else s = apply(g, s, botChoice(g.seats[seat]!, g, s, seat));
  }
  return s;
}

function characterLine(c: CharacterId): string {
  const d = CHARACTERS[c];
  return `${d.name} (содержание ${d.upkeep}): ${d.text}`;
}

function where(o: Observation, id: string): string {
  const w = o.workers.find((x) => x.id === id);
  if (!w) return '?';
  const p = w.position;
  if (p.kind === 'reserve') return 'в запасе';
  if (p.kind === 'hospital') return 'в госпитале';
  if (p.kind === 'citadelSpot') return `у звезды ${regionName(p.region)}`;
  return `${locName(p.location)}, слот ${p.slot}`;
}

/** Текстовый вид позиции глазами игрока `seat`. */
export function renderView(g: AgentGame, s: GameState, seat: number): string {
  const o = getObservation(s, seat);
  const scores = getScores(s);
  const out: string[] = [];
  out.push(
    `=== Раунд ${o.round} из ${o.config.rounds}, фаза: ${PHASE_NAME[o.phase] ?? o.phase}. Вы — ${playerName(seat)}. Первым в раунде ходит ${playerName(o.firstPlayer)} ===`,
  );
  out.push('', 'ИГРОКИ');
  o.players.forEach((p, i) => {
    const sc = scores.find((x) => x.player === i);
    const hand = COMBAT_TOKEN_ORDER.filter((t) => p.combatTokens.hand[t] > 0)
      .map((t) => `${COMBAT_TOKENS[t].name}×${p.combatTokens.hand[t]}`)
      .join(', ');
    out.push(
      `${playerName(i)}${i === seat ? ' (вы)' : ''}: ПО сейчас ${sc?.vp ?? 0}, престиж ${p.prestige}; ` +
        `ресурсы ${p.resources.gold} зол, ${p.resources.blood} кр, ${p.resources.ore} руд, ${p.resources.compromat} комп; ` +
        `влияние ${REGION_ORDER.map((r) => `${regionName(r)} ${p.influence[r]}/${TRACKS[r].max}`).join(', ')}` +
        `${p.passed ? '; спасовал' : ''}; жетоны боя в руке: ${hand || 'нет'}` +
        (p.draftPick.character || p.draftPick.profession
          ? `; взято на драфте: ${[p.draftPick.character && CHARACTERS[p.draftPick.character].name, p.draftPick.profession && PROFESSIONS[p.draftPick.profession].name].filter(Boolean).join(' + ')}`
          : ''),
    );
  });
  out.push('', 'РАБОЧИЕ');
  o.players.forEach((_, i) => {
    const ws = o.workers.filter((w) => w.owner === i);
    out.push(
      `${playerName(i)}: ${ws.map((w) => `${w.id} [${workerLabel(w)}] — ${where(o, w.id)}`).join('; ')}`,
    );
  });
  out.push('', 'ЛОКАЦИИ (слот 1 / слот 2)');
  for (const l of LOCATION_ORDER) {
    const at = (slot: 1 | 2) =>
      o.workers
        .filter(
          (w) =>
            w.position.kind === 'slot' && w.position.location === l && w.position.slot === slot,
        )
        .map((w) => `${playerName(w.owner)} ${workerLabel(w)}`)
        .join(' + ') || '—';
    const st = o.locations[l];
    const notes = [
      st.slot2Locked ? 'слот 2 закрыт' : '',
      st.professionToken ? `жетон профессии: ${PROFESSIONS[st.professionToken].name}` : '',
      o.blocks.some((b) => b.location === l) ? 'заблокирована' : '',
    ].filter(Boolean);
    out.push(`${locName(l)}: ${at(1)} / ${at(2)}${notes.length ? ` (${notes.join(', ')})` : ''}`);
  }
  out.push(
    `Копилка Логова: ${JSON.stringify(o.lair)}. Вход в Город: ${priceText(cityEntryPrice(s))}.`,
  );
  out.push(
    `Жетоны первенства: ${REGION_ORDER.map((r) => `${regionName(r)} — ${o.firstToMax[r] === undefined ? 'свободен' : playerName(o.firstToMax[r]!)}`).join(', ')}.`,
  );
  if (o.commissariat) out.push(`Жетон Комиссариата: ${JSON.stringify(o.commissariat)}`);
  out.push('', 'ЗДАНИЯ');
  out.push(
    o.buildings.length
      ? o.buildings
          .map(
            (b) =>
              `${playerName(b.owner)}: ${buildLabel({ building: b.type, region: b.region, plot: b.plot })}`,
          )
          .join('; ')
      : 'нет',
  );
  if (o.offer.characters.length || o.offer.professions.length) {
    out.push('', 'ДРАФТ: на выбор');
    for (const c of o.offer.characters) out.push(`  ${characterLine(c)}`);
    out.push(
      `  Профессии: ${o.offer.professions.map((p) => PROFESSIONS[p].name).join(', ') || '—'}`,
    );
  }
  if (o.combat) {
    out.push(
      '',
      `БОЙ: ${regionName(o.combat.region)}, ${o.combat.revealed ? 'вскрыт' : 'жетоны закрыты'}: ` +
        o.combat.plays
          .map(
            (p) => `${playerName(p.player)} — ${p.token ? COMBAT_TOKENS[p.token].name : 'закрыт'}`,
          )
          .join(', '),
    );
  }
  const inPlay = new Set<CharacterId>();
  for (const w of o.workers) if (w.character) inPlay.add(w.character);
  for (const p of o.players) if (p.draftPick.character) inPlay.add(p.draftPick.character);
  if (inPlay.size) {
    out.push('', 'ПЕРСОНАЖИ В ИГРЕ');
    for (const c of inPlay) out.push(`  ${characterLine(c)}`);
  }
  const feed = g.feed[seat] ?? [];
  if (feed.length) {
    out.push('', 'ЧТО ПРОИЗОШЛО С ВАШЕГО ПРОШЛОГО РЕШЕНИЯ');
    out.push(...feed.slice(-60).map((t) => `  ${t}`));
  }
  if (isTerminal(s)) {
    out.push('', 'ПАРТИЯ ОКОНЧЕНА');
    for (const sc of [...scores].sort((a, b) => a.rank - b.rank)) {
      out.push(
        `  ${sc.rank}. ${playerName(sc.player)} (${g.seats[sc.player]}): ${sc.vp} ПО, престиж ${sc.prestige}`,
      );
    }
    return out.join('\n');
  }
  out.push('', 'ПОДСКАЗКИ', ...hints(s, o, seat).map((h) => `  ${h}`));
  if (!s.pending || s.pending.player !== seat) {
    out.push(
      '',
      `Сейчас ходит ${playerName(s.pending?.player ?? 0)} — ждите своего хода (команда wait).`,
    );
    return out.join('\n');
  }
  out.push('', `РЕШЕНИЕ: ${decisionTitle(o)}`);
  getLegalActions(s).forEach((a, i) => out.push(`  ${i + 1}. ${actionLabel(o, a)}`));
  return out.join('\n');
}

/** Подсказки игроку: отметки ПО, вход в Город, бонусы треков, кровь на содержание. */
function hints(s: GameState, o: Observation, seat: number): string[] {
  const p = o.players[seat]!;
  const out: string[] = [];
  for (const r of REGION_ORDER) {
    const t = TRACKS[r];
    const next = t.vpMarks.find((m) => m > p.influence[r]);
    out.push(
      `Влияние ${regionName(r)} ${p.influence[r]}: по 1 ПО на отметках ${t.vpMarks.join(', ')} (по позиции в конце игры)` +
        (next !== undefined ? `, до следующей ${next - p.influence[r]}` : ', все отметки взяты') +
        `; первенство (1 ПО навсегда) — первому дошедшему до ${t.max}.`,
    );
  }
  const nextPrestige = PRESTIGE_TRACK.vpMarks.find((m) => m > p.prestige);
  out.push(
    `Престиж ${p.prestige}: по 1 ПО на отметках ${PRESTIGE_TRACK.vpMarks.join(', ')}` +
      (nextPrestige !== undefined ? `, до следующей ${nextPrestige - p.prestige}.` : '.'),
  );
  const aristocrat = o.workers.some((w) => w.owner === seat && w.profession === 'aristocrat');
  out.push(
    `Вход в Город сейчас ${priceText(cityEntryPrice(s))} (всего не больше ${CITY_ENTRY.max})` +
      (aristocrat ? '; ваш Аристократ входит бесплатно.' : '.'),
  );
  for (const r of REGION_ORDER) {
    const at = TRACKS[r].cityEntryRaiseAt;
    if (at === null || o.cityEntryRaisedRegions.includes(r)) continue;
    out.push(
      `Первый, кто дойдёт до ${at} влияния в регионе ${regionName(r)} (вы тоже), поднимет вход в Город на ${CITY_ENTRY.raiseStep}${o.config.rules.cityEntryResource === 'mixed' ? ' зол' : ''}.`,
    );
  }
  if (o.config.rules.trackBoosts) {
    const left = REGION_ORDER.flatMap((r) =>
      TRACK_BOOSTS[r]
        .filter((b) => !p.trackBoostsTaken.includes(`${r}-${b.at}`))
        .map((b) => `${regionName(r)} ${b.at}: ${resText(b.gain)}`),
    );
    if (left.length) out.push(`Ваши ещё не полученные бонусы позиций треков: ${left.join('; ')}.`);
  }
  const upkeep = o.workers
    .filter((w) => w.owner === seat && w.character)
    .reduce((sum, w) => sum + CHARACTERS[w.character!].upkeep, 0);
  if (upkeep > 0) {
    out.push(
      `Содержание ваших персонажей в конце раунда: ${upkeep} кр (без скидок), у вас ${p.resources.blood} кр.` +
        (p.resources.blood < upkeep
          ? ' Не хватает — придётся сбросить пару или добыть кровь.'
          : ''),
    );
  }
  return out;
}

function load(file: string): AgentGame {
  return JSON.parse(readFileSync(file, 'utf8')) as AgentGame;
}

/** Запись через временный файл: читатель (wait, веб) не увидит наполовину записанный JSON. */
function save(file: string, g: AgentGame): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(g));
  renameSync(tmp, file);
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Чьими глазами смотреть: --seat (с 1) или единственный агент за столом. */
function viewerSeat(g: AgentGame, argv: string[]): number {
  const raw = arg(argv, '--seat');
  const agents = g.seats.flatMap((x, i) => (x === AGENT ? [i] : []));
  if (raw !== undefined) {
    const seat = Number(raw) - 1;
    if (g.seats[seat] !== AGENT) throw new Error(`Игрок ${raw} — не агент`);
    return seat;
  }
  if (agents.length !== 1) throw new Error('Агентов за столом несколько — укажите --seat N');
  return agents[0]!;
}

function show(g: AgentGame, s: GameState, seat: number): string {
  return renderView(g, s, seat);
}

export function main(argv: string[]): string {
  const [cmd] = argv;
  const raw = arg(argv, '--file');
  if (!raw) throw new Error('Нужен --file');
  // npm запускает скрипт из каталога пакета; путь считаем от каталога, где вызвали npm.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), raw);
  if (cmd === 'new') {
    const seats = (arg(argv, '--seats') ?? 'agent,heuristic,heuristic').split(',');
    const rules: Partial<RuleToggles> = {};
    argv.forEach((x, i) => {
      if (x !== '--rule') return;
      const [k, v] = (argv[i + 1] ?? '').split('=');
      (rules as Record<string, unknown>)[k!] = v === 'true' ? true : v === 'false' ? false : v;
    });
    const g: AgentGame = {
      config: { playerCount: seats.length, rules },
      seed: Number(arg(argv, '--seed') ?? Date.now() % 100000),
      seats,
      actions: [],
      decisions: [],
      feed: seats.map(() => []),
    };
    const s = advance(g);
    save(file, g);
    const agents = seats.flatMap((x, i) => (x === AGENT ? [i] : []));
    return agents.length === 1
      ? show(g, s, agents[0]!)
      : `Партия создана: ${file}. Агенты: ${agents.map((i) => playerName(i)).join(', ')}.`;
  }
  const g = load(file);
  if (cmd === 'show') return show(g, replay(g), viewerSeat(g, argv));
  if (cmd === 'wait') {
    const seat = viewerSeat(g, argv);
    const deadline = Date.now() + Number(arg(argv, '--timeout') ?? 540) * 1000;
    for (;;) {
      const cur = load(file);
      const s = replay(cur);
      if (isTerminal(s) || s.pending?.player === seat) return show(cur, s, seat);
      if (Date.now() > deadline) {
        return `Ещё не ваш ход: сейчас ходит ${playerName(s.pending?.player ?? 0)}. Вызовите wait снова.`;
      }
      sleepMs(1000);
    }
  }
  if (cmd === 'act') {
    const seat = viewerSeat(g, argv);
    let s = replay(g);
    if (isTerminal(s) || !s.pending) return show(g, s, seat);
    if (s.pending.player !== seat) {
      throw new Error(
        `Сейчас ходит ${playerName(s.pending.player)}, не вы. Дождитесь хода: wait --seat ${seat + 1}`,
      );
    }
    const legal = getLegalActions(s);
    const n = Number(arg(argv, '--choice'));
    const action = legal[n - 1];
    if (!action) throw new Error(`Нет хода с номером ${n}; допустимо 1…${legal.length}`);
    const o = getObservation(s, seat);
    const expected = arg(argv, '--expect');
    const label = actionLabel(o, action);
    if (!expected) {
      throw new Error(`Нужен --expect: часть названия хода ${n} («${label}»). Ход не выполнен.`);
    }
    if (!label.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(
        `Ход ${n} — «${label}», в нём нет «${expected}». Ход не выполнен; проверьте номер.`,
      );
    }
    const shadow = botChoice(SHADOW_BOT, g, s, seat);
    g.decisions.push({
      index: g.actions.length,
      player: seat,
      round: s.round,
      title: decisionTitle(o),
      options: legal.map((a) => actionLabel(o, a)),
      choice: n,
      why: arg(argv, '--why') ?? '',
      shadowChoice: legal.findIndex((a) => sameAction(a, shadow)) + 1,
    });
    g.feed[seat] = [];
    s = apply(g, s, action);
    s = advance(g);
    save(file, g);
    return show(g, s, seat);
  }
  if (cmd === 'log') {
    const lines = g.decisions.map((d) => {
      const differs = d.shadowChoice !== d.choice;
      return [
        `#${d.index} Р${d.round} ${d.title}${differs ? '  ← РАСХОЖДЕНИЕ С БОТОМ' : ''}`,
        `  агент: ${d.options[d.choice - 1]} — ${d.why}`,
        ...(differs ? [`  бот:   ${d.options[d.shadowChoice - 1] ?? '?'}`] : []),
      ].join('\n');
    });
    const diff = g.decisions.filter((d) => d.shadowChoice !== d.choice).length;
    return `${lines.join('\n')}\n\nРешений агента: ${g.decisions.length}, расхождений с ботом: ${diff}`;
  }
  throw new Error(`Неизвестная команда: ${cmd}. Есть: new, show, wait, act, log`);
}

try {
  console.log(main(process.argv.slice(2)));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
