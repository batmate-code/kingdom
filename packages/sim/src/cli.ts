/**
 * Консольный симулятор.
 *
 *   npm run sim -- --games 10000 --bots random,random,random --seed 1 --out results.csv
 *
 * Параметры:
 *   --games N           число партий (по умолчанию 100)
 *   --bots a,b,c        боты по креслам; число игроков = число ботов (по умолчанию 3 × random)
 *   --players N --bot X N одинаковых ботов (вместо --bots)
 *   --seed S            seed первой партии; партия i получает S + i (по умолчанию 1)
 *   --rule key=value    переключатель правил (можно несколько): effectOrder=free, …
 *   --out file.csv      результаты по партиям в CSV
 *   --json file.json    результаты по партиям в JSON
 *   --errors file.json  записи партий с ошибкой (по умолчанию sim-errors.json, если ошибки есть)
 *   --check-every N     проверять инварианты каждые N ходов (по умолчанию — только в конце партии)
 *   --check-all         проверять инварианты после каждого хода (медленно)
 *   --stats file.json   собрать статистику локаций, персонажей и ресурсов (сводка в JSON)
 *   --report file.md    то же, отчёт в Markdown
 */
import { writeFileSync } from 'node:fs';
import { BOT_FACTORIES } from '@vampire/bots';
import { DEFAULT_RULES, RULE_CHOICES, resolveConfig, type RuleToggles } from '@vampire/core';
import { runSimulation, toCsv, type GameResult } from './index';
import { renderReport } from './report';

interface Args {
  games: number;
  bots: string[];
  seed: number;
  rules: Partial<RuleToggles>;
  out: string | null;
  json: string | null;
  errors: string;
  checkEvery: number;
  checkAll: boolean;
  stats: string | null;
  report: string | null;
}

function parseRule(raw: string, rules: Partial<RuleToggles>): void {
  const [key, value] = raw.split('=');
  if (!key || value === undefined || !(key in DEFAULT_RULES)) {
    throw new Error(
      `Неизвестный переключатель: ${raw}. Есть: ${Object.keys(DEFAULT_RULES).join(', ')}`,
    );
  }
  const name = key as keyof RuleToggles;
  const current = DEFAULT_RULES[name];
  if (typeof current === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`${key}: ожидается true или false, получено ${value}`);
    }
    (rules as Record<string, unknown>)[key] = value === 'true';
    return;
  }
  const allowed = RULE_CHOICES[name];
  if (allowed && !allowed.includes(value)) {
    throw new Error(`${key}: допустимо ${allowed.join(' | ')}, получено ${value}`);
  }
  (rules as Record<string, unknown>)[key] = value;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    games: 100,
    bots: [],
    seed: 1,
    rules: {},
    out: null,
    json: null,
    errors: 'sim-errors.json',
    checkEvery: 0,
    checkAll: false,
    stats: null,
    report: null,
  };
  let players = 3;
  let bot = 'random';
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Нет значения для ${flag}`);
      return v;
    };
    switch (flag) {
      case '--games':
        args.games = Number(next());
        break;
      case '--bots':
        args.bots = next().split(',');
        break;
      case '--players':
        players = Number(next());
        break;
      case '--bot':
        bot = next();
        break;
      case '--seed':
        args.seed = Number(next());
        break;
      case '--rule':
        parseRule(next(), args.rules);
        break;
      case '--out':
        args.out = next();
        break;
      case '--json':
        args.json = next();
        break;
      case '--errors':
        args.errors = next();
        break;
      case '--check-every':
        args.checkEvery = Number(next());
        break;
      case '--stats':
        args.stats = next();
        break;
      case '--report':
        args.report = next();
        break;
      case '--check-all':
        args.checkAll = true;
        break;
      default:
        throw new Error(`Неизвестный параметр: ${flag}`);
    }
  }
  if (args.bots.length === 0) args.bots = Array.from({ length: players }, () => bot);
  const positiveInt = (v: number, name: string) => {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`${name}: нужно целое число больше 0`);
  };
  positiveInt(args.games, '--games');
  if (!Number.isInteger(args.seed)) throw new Error('--seed: нужно целое число');
  if (!Number.isInteger(args.checkEvery) || args.checkEvery < 0) {
    throw new Error('--check-every: нужно целое число не меньше 0');
  }
  // Число игроков проверяет ядро — до запуска, одной понятной ошибкой.
  resolveConfig({ playerCount: args.bots.length });
  for (const b of args.bots) {
    if (!BOT_FACTORIES[b])
      throw new Error(`Неизвестный бот: ${b}. Есть: ${Object.keys(BOT_FACTORIES).join(', ')}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const step = Math.max(1, Math.floor(args.games / 20));
const errors: GameResult[] = [];
const { results, summary, stats } = runSimulation({
  games: args.games,
  bots: args.bots,
  baseSeed: args.seed,
  rules: args.rules,
  checkEveryAction: args.checkAll,
  checkEvery: args.checkEvery,
  collectStats: Boolean(args.stats || args.report),
  onResult(r, i) {
    if (r.error) {
      errors.push(r);
      console.error(`Партия ${r.seed}: ошибка — ${r.error}`);
    }
    if (process.stdout.isTTY && (i + 1) % step === 0) {
      process.stdout.write(`\r${i + 1} / ${args.games}`);
    }
  },
});
if (process.stdout.isTTY) process.stdout.write('\n');

if (args.out) writeFileSync(args.out, toCsv(results));
if (stats && args.stats) writeFileSync(args.stats, JSON.stringify(stats, null, 2));
if (stats && args.report) {
  const title = `Статистика: ${args.games} партий, боты ${args.bots.join(', ')}`;
  writeFileSync(args.report, renderReport(stats, title));
}
if (args.json)
  writeFileSync(
    args.json,
    JSON.stringify(
      results.map(({ record: _r, ...r }) => r),
      null,
      2,
    ),
  );
if (errors.length > 0) {
  writeFileSync(
    args.errors,
    JSON.stringify(
      errors.map((e) => e.record),
      null,
      2,
    ),
  );
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Партий: ${summary.games}, ошибок: ${summary.errors}, ничьих: ${summary.draws}`);
console.log(`Боты: ${args.bots.join(', ')}; правила: ${JSON.stringify(args.rules)}`);
console.log(`Победы по креслам: ${summary.winRateBySeat.map(pct).join(' / ')}`);
console.log(
  `Средние ПО: ${summary.avgVp.toFixed(2)}, ходов за партию: ${summary.avgActions.toFixed(0)}`,
);
console.log(
  `Время: ${(summary.totalMs / 1000).toFixed(1)} с, ${(summary.totalMs / Math.max(1, summary.games)).toFixed(1)} мс на партию`,
);
if (args.out) console.log(`CSV: ${args.out}`);
if (errors.length > 0) console.log(`Записи партий с ошибкой: ${args.errors}`);
process.exitCode = errors.length > 0 ? 1 : 0;
