import {
  LOCATIONS,
  LOCATION_ORDER,
  MASS_WEAK_BLOOD_TO_GOLD_PENALTY,
  REGION_ORDER,
  TRACKS,
  type Resources,
  type SlotAction,
} from '@vampire/data';
import { distinctWorkers, getWorker } from './board';
import { buildOptions } from './buildings';
import type { Ctx } from './context';
import { upkeepTier } from './draft';
import { changeInfluence, changeResources, pay, payMaybeAlchemy, paymentVariants } from './economy';
import type {
  ChanceryConversion,
  GameState,
  GoldBlood,
  LocationActionContext,
  LocationChoice,
  PlayerId,
} from './types';

type SlotActionOf<K extends SlotAction['kind']> = Extract<SlotAction, { kind: K }>;

/**
 * Обработчик действия слота, зарегистрированный по `kind` из data.
 * options — все допустимые выборы, кроме «пропустить»; apply — выполнить выбор.
 */
interface SlotHandler<A extends SlotAction> {
  /** Бесплатное действие выполняется всегда, «пропустить» для него не предлагается. */
  mandatory: boolean;
  options(
    state: GameState,
    player: PlayerId,
    ctx: LocationActionContext,
    action: A,
  ): LocationChoice[];
  apply(
    c: Ctx,
    player: PlayerId,
    ctx: LocationActionContext,
    action: A,
    choice: LocationChoice,
  ): void;
}

type HandlerRegistry = { [K in SlotAction['kind']]: SlotHandler<SlotActionOf<K>> };

/** Все способы разложить total на золото и кровь. */
function goldBloodSplits(total: number): GoldBlood[] {
  const out: GoldBlood[] = [];
  for (let blood = 0; blood <= total; blood++) out.push({ gold: total - blood, blood });
  return out;
}

function res(state: GameState, player: PlayerId) {
  const p = state.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  return p.resources;
}

/**
 * Право стройки Канцелярии: сразу, в любом регионе, на любом свободном участке, по полной цене.
 */
/** OQ-29 (автор: нет): право стройки предлагается, только если сейчас есть что построить. */
function canBuyBuildRight(state: GameState, player: PlayerId, compromat: number): boolean {
  if (res(state, player).compromat < compromat) return false;
  return (
    state.config.rules.buildRightWithoutOptions ||
    buildOptions(state, player, { kind: 'chancery' }).length > 0
  );
}

function buyBuildRight(c: Ctx, player: PlayerId, compromat: number): void {
  changeResources(c, player, { compromat: -compromat }, 'chancery');
  c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'chancery' } });
}

type ChanceryAction = SlotActionOf<'chancery'>;

/** Изменение ресурсов от одной конверсии Канцелярии. */
function conversionDelta(action: ChanceryAction, conv: ChanceryConversion): Partial<Resources> {
  return conv.to === 'ore'
    ? { compromat: -action.conversionCost, ore: action.ore }
    : { compromat: -action.conversionCost, gold: conv.gold, blood: conv.blood };
}

/** Право стройки после конверсий: хватает компромата и (OQ-29) есть что строить с новыми ресурсами. */
function canAffordBuildRightAfter(
  state: GameState,
  player: PlayerId,
  action: ChanceryAction,
  conversions: readonly ChanceryConversion[],
): boolean {
  if (conversions.length === 0) return canBuyBuildRight(state, player, action.buildRightCost);
  const r = { ...res(state, player) };
  for (const conv of conversions) {
    for (const [k, v] of Object.entries(conversionDelta(action, conv)) as [
      keyof Resources,
      number,
    ][])
      r[k] += v;
  }
  const after: GameState = {
    ...state,
    players: state.players.map((p, i) => (i === player ? { ...p, resources: r } : p)),
  };
  return canBuyBuildRight(after, player, action.buildRightCost);
}

/** Курс Мессы: сколько получаешь за единицу (кровь → золото ослаблена переключателем massBloodToGold). */
export function massRate(
  state: Pick<GameState, 'config'>,
  baseRate: number,
  from: 'gold' | 'blood',
): number {
  const weak = from === 'blood' && state.config.rules.massBloodToGold === 'weak';
  return weak ? baseRate - MASS_WEAK_BLOOD_TO_GOLD_PENALTY : baseRate;
}

function mismatch(choice: LocationChoice): never {
  throw new Error(`Выбор ${choice.kind} не подходит к действию слота`);
}

const HANDLERS: HandlerRegistry = {
  gain: {
    mandatory: true,
    options: () => [{ kind: 'gain' }],
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'gain') mismatch(choice);
      changeResources(c, player, action.gain, 'location');
    },
  },

  // Копилка забирается всегда; дополнительно — обмен крови на руду (ответ автора, 22.11).
  lairStash: {
    mandatory: true,
    options(state, player, _ctx, action) {
      const max = Math.min(
        action.maxExchanges,
        Math.floor(res(state, player).blood / action.bloodPerOre),
      );
      return Array.from({ length: max + 1 }, (_, exchanges) => ({ kind: 'lairStash', exchanges }));
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'lairStash') mismatch(choice);
      const ore = c.draft.lair.stash;
      c.draft.lair.stash = 0;
      changeResources(c, player, { ore }, 'lairStash');
      if (choice.exchanges > 0) {
        changeResources(
          c,
          player,
          { blood: -action.bloodPerOre * choice.exchanges, ore: choice.exchanges },
          'lairExchange',
        );
      }
    },
  },

  mass: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const r = res(state, player);
      const out: LocationChoice[] = [];
      for (const from of ['gold', 'blood'] as const) {
        for (let times = 1; times <= action.maxTimes; times++) {
          if (r[from] >= times * action.unit) out.push({ kind: 'mass', from, times });
        }
      }
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'mass') mismatch(choice);
      const to = choice.from === 'gold' ? 'blood' : 'gold';
      const rate = massRate(c.draft, action.rate, choice.from);
      changeResources(
        c,
        player,
        { [choice.from]: -action.unit * choice.times, [to]: rate * choice.times },
        'mass',
      );
    },
  },

  powerToken: {
    mandatory: false,
    options: () => REGION_ORDER.map((region): LocationChoice => ({ kind: 'powerToken', region })),
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'powerToken') mismatch(choice);
      const t = c.draft.powerTokens.find((x) => x.owner === player && x.region === choice.region);
      if (t) t.count += action.count;
      else c.draft.powerTokens.push({ owner: player, region: choice.region, count: action.count });
    },
  },

  market: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const r = res(state, player);
      const out: LocationChoice[] = [];
      for (const pay of goldBloodSplits(action.buyCost)) {
        if (r.gold >= pay.gold && r.blood >= pay.blood) out.push({ kind: 'marketBuy', pay });
      }
      const sellGain = action.sellGain;
      if (sellGain === null) return out;
      for (const v of paymentVariants(state, player, { ore: action.ore })) {
        for (const receive of goldBloodSplits(sellGain)) {
          out.push(
            v.alchemy
              ? { kind: 'marketSell', receive, alchemy: true }
              : { kind: 'marketSell', receive },
          );
        }
      }
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind === 'marketBuy') {
        changeResources(
          c,
          player,
          { gold: -choice.pay.gold, blood: -choice.pay.blood, ore: action.ore },
          'market',
        );
      } else if (choice.kind === 'marketSell') {
        // Алхимик: вместо руды платится 1 золото (1 золото → 4 золота/крови — ответ автора).
        const cost = { ore: action.ore };
        payMaybeAlchemy(c, player, cost, choice.alchemy, 'market');
        changeResources(
          c,
          player,
          { gold: choice.receive.gold, blood: choice.receive.blood },
          'market',
        );
      } else {
        mismatch(choice);
      }
    },
  },

  chancery: {
    mandatory: false,
    // До maxActions действий (автор 23.11): обмены компромата повторяются, право стройки — один раз
    // и последним, после обменов (OQ-47).
    options(state, player, _ctx, action) {
      const kinds: ChanceryConversion[] = [
        ...goldBloodSplits(action.goldBlood).map((s): ChanceryConversion => ({
          to: 'goldBlood',
          gold: s.gold,
          blood: s.blood,
        })),
        { to: 'ore' },
      ];
      const compromat = res(state, player).compromat;
      const maxCount = Math.min(action.maxActions, Math.floor(compromat / action.conversionCost));
      const out: LocationChoice[] = [];
      // Мультимножества конверсий размером 0..maxCount (индексы по неубыванию — без повторов).
      const build = (start: number, acc: ChanceryConversion[]) => {
        if (acc.length > 0) out.push({ kind: 'chancery', conversions: [...acc] });
        if (
          acc.length < action.maxActions &&
          canAffordBuildRightAfter(state, player, action, acc)
        ) {
          out.push(
            acc.length === 0
              ? { kind: 'buildRight' }
              : { kind: 'chancery', conversions: [...acc], buildRight: true },
          );
        }
        if (acc.length === maxCount) return;
        for (let i = start; i < kinds.length; i++)
          build(i, [...acc, kinds[i] as ChanceryConversion]);
      };
      build(0, []);
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind === 'buildRight') {
        buyBuildRight(c, player, action.buildRightCost);
        return;
      }
      if (choice.kind !== 'chancery') mismatch(choice);
      for (const conv of choice.conversions) {
        changeResources(c, player, conversionDelta(action, conv), 'chancery');
      }
      if (choice.buildRight) buyBuildRight(c, player, action.buildRightCost);
    },
  },

  chanceryBuild: {
    mandatory: false,
    options: (state, player, _ctx, action) =>
      canBuyBuildRight(state, player, action.compromatCost) ? [{ kind: 'buildRight' }] : [],
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'buildRight') mismatch(choice);
      buyBuildRight(c, player, action.compromatCost);
    },
  },

  copy: {
    mandatory: false,
    options(state, player, ctx, action) {
      if (res(state, player).gold < action.goldCost) return [];
      const usefulOnly = !state.config.rules.copyAllowsUselessTarget;
      // Состояние после оплаты копирования — чтобы понять, будет ли чем выполнить копию (OQ-6).
      const afterPay: GameState = usefulOnly
        ? {
            ...state,
            players: state.players.map((p, i) =>
              i === player
                ? { ...p, resources: { ...p.resources, gold: p.resources.gold - action.goldCost } }
                : p,
            ),
          }
        : state;
      const out: LocationChoice[] = [];
      for (const location of LOCATION_ORDER) {
        const def = LOCATIONS[location];
        if (!action.scope.includes(def.region)) continue;
        // «Кроме Подполья»: копирующую локацию скопировать нельзя.
        if (def.slots.some((s) => s.kind === 'copy')) continue;
        for (const slot of [1, 2] as const) {
          if (usefulOnly) {
            const target = { workerId: ctx.workerId, location, slot, copy: true };
            const targetAction = slotActionOf(target);
            if (
              handlerFor(targetAction).options(afterPay, player, target, targetAction).length === 0
            ) {
              continue;
            }
          }
          out.push({ kind: 'copy', location, slot });
        }
      }
      return out;
    },
    apply(c, player, ctx, action, choice) {
      if (choice.kind !== 'copy') mismatch(choice);
      pay(c, player, { gold: action.goldCost }, 'copy');
      c.draft.tasks.unshift({
        t: 'askLocationAction',
        player,
        context: {
          workerId: ctx.workerId,
          location: choice.location,
          slot: choice.slot,
          copy: true,
        },
      });
    },
  },

  // Взять жетон Комиссариата и выбрать регион: в бою там сила рабочих госпиталя идёт тебе.
  // Жетон один: взявший позже (в том числе копией через Подполье) забирает его.
  commissariatToken: {
    mandatory: true,
    options: () => REGION_ORDER.map((region) => ({ kind: 'commissariat', region })),
    apply(c, player, _ctx, _action, choice) {
      if (choice.kind !== 'commissariat') mismatch(choice);
      c.draft.commissariat = { owner: player, region: choice.region };
      c.events.push({ type: 'commissariatTaken', player, region: choice.region });
    },
  },

  revive: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const inHospital = state.workers.filter(
        (w) => w.owner === player && w.position.kind === 'hospital',
      );
      return paymentVariants(state, player, action.cost).flatMap((v) =>
        distinctWorkers(inHospital).map((w): LocationChoice =>
          v.alchemy
            ? { kind: 'revive', workerId: w.id, alchemy: true }
            : { kind: 'revive', workerId: w.id },
        ),
      );
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'revive') mismatch(choice);
      const cost = action.cost;
      payMaybeAlchemy(c, player, cost, choice.alchemy, 'revive');
      const w = c.draft.workers.find((x) => x.id === choice.workerId);
      if (!w || w.owner !== player || w.position.kind !== 'hospital') {
        throw new Error(`Рабочий ${choice.workerId} не в госпитале`);
      }
      w.position = { kind: 'reserve' };
      c.events.push({ type: 'workerRevived', player, workerId: w.id });
    },
  },

  // Замена пары на оставшуюся после драфта; старая пара возвращается в пул, за неё — отступные.
  // Рабочий без улучшения бесплатно берёт пару из пула (ответ автора, 22.11).
  // Новый персонаж в этом размещении не срабатывает: эффект персонажа уже прошёл.
  tavernSwap: {
    mandatory: false,
    options(state) {
      const out: LocationChoice[] = [];
      // Копии карт в пуле (колода добирается повторами) — один вариант на одинаковую пару.
      for (const character of new Set(state.offer.characters)) {
        for (const profession of new Set(state.offer.professions)) {
          out.push({ kind: 'tavernSwap', character, profession });
        }
      }
      return out;
    },
    apply(c, player, ctx, _action, choice) {
      if (choice.kind !== 'tavernSwap') mismatch(choice);
      const worker = c.draft.workers.find((w) => w.id === ctx.workerId);
      if (!worker) throw new Error(`Нет рабочего ${ctx.workerId}`);
      const offer = c.draft.offer;
      const ci = offer.characters.indexOf(choice.character);
      const pi = offer.professions.indexOf(choice.profession);
      if (ci < 0 || pi < 0) throw new Error('Такой пары нет в пуле Таверны');
      if (worker.character !== null && worker.profession !== null) {
        offer.characters.splice(ci, 1, worker.character);
        offer.professions.splice(pi, 1, worker.profession);
        // Автор 23.11: за старую пару — отступные по её содержанию (пара уходит в пул Таверны).
        changeResources(c, player, upkeepTier(worker.character).severance, 'severance');
      } else {
        offer.characters.splice(ci, 1);
        offer.professions.splice(pi, 1);
      }
      worker.character = choice.character;
      delete worker.garrison;
      worker.profession = choice.profession;
      // Ресурсы с карты старого персонажа (Доносчик, Рудный барон) уходят в банк (OQ-40, автор).
      c.draft.cardStash = c.draft.cardStash.filter((s) => s.workerId !== worker.id);
      c.events.push({
        type: 'tavernSwapped',
        player,
        workerId: worker.id,
        character: choice.character,
        profession: choice.profession,
      });
    },
  },

  cityHall: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const p = state.players[player];
      if (!p) throw new Error(`Нет игрока ${player}`);
      const out: LocationChoice[] = [];
      action.offers.forEach((offer, index) => {
        for (const v of paymentVariants(state, player, { ore: offer.ore })) {
          const open = REGION_ORDER.filter(
            // OQ-5: обмен в регионе с полным треком.
            (r) => state.config.rules.cityHallAllowsFullTrack || p.influence[r] < TRACKS[r].max,
          );
          const alchemy = v.alchemy ? ({ alchemy: true } as const) : {};
          for (const region of open) {
            out.push({ kind: 'cityHall', offer: index, region, ...alchemy });
            // Автор 24.11: обмен на 2 влияния можно разделить между двумя регионами.
            if (offer.influence < 2) continue;
            for (const split of open.slice(open.indexOf(region) + 1)) {
              out.push({ kind: 'cityHall', offer: index, region, split, ...alchemy });
            }
          }
        }
      });
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'cityHall') mismatch(choice);
      const offer = action.offers[choice.offer];
      if (!offer) throw new Error(`Нет обмена ${choice.offer} в Ратуше`);
      const cost = { ore: offer.ore };
      payMaybeAlchemy(c, player, cost, choice.alchemy, 'cityHall');
      if (choice.split) {
        changeInfluence(c, player, choice.region, offer.influence - 1, 'cityHall');
        changeInfluence(c, player, choice.split, 1, 'cityHall');
      } else changeInfluence(c, player, choice.region, offer.influence, 'cityHall');
    },
  },
};

export function slotActionOf(ctx: LocationActionContext): SlotAction {
  return LOCATIONS[ctx.location].slots[ctx.slot - 1] as SlotAction;
}

function handlerFor(action: SlotAction): SlotHandler<SlotAction> {
  return HANDLERS[action.kind] as SlotHandler<SlotAction>;
}

/** Допустимые выборы для действия слота. */
export function locationChoices(
  state: GameState,
  player: PlayerId,
  ctx: LocationActionContext,
): LocationChoice[] {
  const action = slotActionOf(ctx);
  const handler = handlerFor(action);
  const options = handler.options(state, player, ctx, action);
  if (options.length === 0) return [{ kind: 'skip' }];
  if (handler.mandatory || !state.config.rules.locationActionOptional) return options;
  return [...options, { kind: 'skip' }];
}

export function applyLocationChoice(
  c: Ctx,
  player: PlayerId,
  ctx: LocationActionContext,
  choice: LocationChoice,
): void {
  // Рабочий должен существовать (проверка целостности контекста).
  getWorker(c.draft, ctx.workerId);
  c.events.push({
    type: 'locationActionResolved',
    player,
    location: ctx.location,
    slot: ctx.slot,
    copy: ctx.copy,
    choice,
  });
  if (choice.kind === 'skip') return;
  const action = slotActionOf(ctx);
  handlerFor(action).apply(c, player, ctx, action, choice);
}
