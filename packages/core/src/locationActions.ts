import { LOCATIONS, LOCATION_ORDER, REGION_ORDER, TRACKS, type SlotAction } from '@vampire/data';
import { distinctWorkers, getWorker } from './board';
import type { Ctx } from './context';
import { changeInfluence, changeResources, pay } from './economy';
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

function mismatch(choice: LocationChoice): never {
  throw new Error(`Выбор ${choice.kind} не подходит к действию слота`);
}

/** Действия, которые появятся на следующих этапах, пока ничего не предлагают. */
const notYetImplemented: SlotHandler<SlotAction> = {
  mandatory: false,
  options: () => [],
  apply: (_c, _p, _ctx, _a, choice) => mismatch(choice),
};

const HANDLERS: HandlerRegistry = {
  gain: {
    mandatory: true,
    options: () => [{ kind: 'gain' }],
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'gain') mismatch(choice);
      changeResources(c, player, action.gain, 'location');
    },
  },

  lairStash: {
    mandatory: true,
    options: () => [{ kind: 'lairStash' }],
    apply(c, player, _ctx, _action, choice) {
      if (choice.kind !== 'lairStash') mismatch(choice);
      const ore = c.draft.lair.stash;
      c.draft.lair.stash = 0;
      changeResources(c, player, { ore }, 'lairStash');
    },
  },

  mass: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const r = res(state, player);
      const out: LocationChoice[] = [];
      for (const from of ['gold', 'blood'] as const) {
        for (let times = 1; times <= action.maxTimes; times++) {
          if (r[from] >= times) out.push({ kind: 'mass', from, times });
        }
      }
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'mass') mismatch(choice);
      const to = choice.from === 'gold' ? 'blood' : 'gold';
      changeResources(
        c,
        player,
        { [choice.from]: -choice.times, [to]: action.rate * choice.times },
        'mass',
      );
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
      if (r.ore >= 1) {
        for (const receive of goldBloodSplits(action.sellGain)) {
          out.push({ kind: 'marketSell', receive });
        }
      }
      return out;
    },
    apply(c, player, _ctx, _action, choice) {
      if (choice.kind === 'marketBuy') {
        changeResources(
          c,
          player,
          { gold: -choice.pay.gold, blood: -choice.pay.blood, ore: 1 },
          'market',
        );
      } else if (choice.kind === 'marketSell') {
        changeResources(
          c,
          player,
          { ore: -1, gold: choice.receive.gold, blood: choice.receive.blood },
          'market',
        );
      } else {
        mismatch(choice);
      }
    },
  },

  chancery: {
    mandatory: false,
    // Вариант (Б) «2 компромата → право стройки» появится вместе со зданиями (этап 4).
    options(state, player, _ctx, action) {
      const kinds: ChanceryConversion[] = [
        ...goldBloodSplits(action.goldBlood).map((s): ChanceryConversion => ({
          to: 'goldBlood',
          gold: s.gold,
          blood: s.blood,
        })),
        { to: 'ore' },
      ];
      const maxCount = Math.min(action.maxTimes, res(state, player).compromat);
      const out: LocationChoice[] = [];
      // Мультимножества конверсий размером 1..maxCount (индексы по неубыванию — без повторов).
      const build = (start: number, acc: ChanceryConversion[]) => {
        if (acc.length > 0) out.push({ kind: 'chancery', conversions: [...acc] });
        if (acc.length === maxCount) return;
        for (let i = start; i < kinds.length; i++)
          build(i, [...acc, kinds[i] as ChanceryConversion]);
      };
      build(0, []);
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'chancery') mismatch(choice);
      for (const conv of choice.conversions) {
        if (conv.to === 'ore') {
          changeResources(c, player, { compromat: -1, ore: action.ore }, 'chancery');
        } else {
          changeResources(
            c,
            player,
            { compromat: -1, gold: conv.gold, blood: conv.blood },
            'chancery',
          );
        }
      }
    },
  },

  // Право стройки — этап 4.
  chanceryBuild: notYetImplemented as SlotHandler<SlotActionOf<'chanceryBuild'>>,

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

  // Жетон Комиссариата — этап 3.
  commissariatToken: notYetImplemented as SlotHandler<SlotActionOf<'commissariatToken'>>,

  revive: {
    mandatory: false,
    options(state, player, _ctx, action) {
      if (res(state, player).ore < action.oreCost) return [];
      const inHospital = state.workers.filter(
        (w) => w.owner === player && w.position.kind === 'hospital',
      );
      return distinctWorkers(inHospital).map((w) => ({ kind: 'revive', workerId: w.id }));
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'revive') mismatch(choice);
      pay(c, player, { ore: action.oreCost }, 'revive');
      const w = c.draft.workers.find((x) => x.id === choice.workerId);
      if (!w || w.owner !== player || w.position.kind !== 'hospital') {
        throw new Error(`Рабочий ${choice.workerId} не в госпитале`);
      }
      w.position = { kind: 'reserve' };
      c.events.push({ type: 'workerRevived', player, workerId: w.id });
    },
  },

  // Замена пары в Таверне — этап 2. Рабочий без улучшения ничего не получает (ответ автора).
  tavernSwap: notYetImplemented as SlotHandler<SlotActionOf<'tavernSwap'>>,

  cityHall: {
    mandatory: false,
    options(state, player, _ctx, action) {
      const p = state.players[player];
      if (!p) throw new Error(`Нет игрока ${player}`);
      const out: LocationChoice[] = [];
      action.offers.forEach((offer, index) => {
        if (p.resources.ore < offer.ore) return;
        for (const region of REGION_ORDER) {
          // OQ-5: обмен в регионе с полным треком.
          const full = p.influence[region] >= TRACKS[region].max;
          if (full && !state.config.rules.cityHallAllowsFullTrack) continue;
          out.push({ kind: 'cityHall', offer: index, region });
        }
      });
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'cityHall') mismatch(choice);
      const offer = action.offers[choice.offer];
      if (!offer) throw new Error(`Нет обмена ${choice.offer} в Ратуше`);
      pay(c, player, { ore: offer.ore }, 'cityHall');
      changeInfluence(c, player, choice.region, offer.influence);
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
