import { LOCATIONS, LOCATION_ORDER, REGION_ORDER, TRACKS, type SlotAction } from '@vampire/data';
import { distinctWorkers, getWorker } from './board';
import { buildOptions } from './buildings';
import type { Ctx } from './context';
import { alchemize, changeInfluence, changeResources, pay, paymentVariants } from './economy';
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
          if (r[from] >= times * action.unit) out.push({ kind: 'mass', from, times });
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
        { [choice.from]: -action.unit * choice.times, [to]: action.rate * choice.times },
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
      for (const v of paymentVariants(state, player, { ore: action.ore })) {
        for (const receive of goldBloodSplits(action.sellGain)) {
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
        pay(c, player, choice.alchemy ? alchemize(cost) : cost, 'market');
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
    // (А) конверсии компромата или (Б) компромат → право стройки.
    options(state, player, _ctx, action) {
      const kinds: ChanceryConversion[] = [
        ...goldBloodSplits(action.goldBlood).map((s): ChanceryConversion => ({
          to: 'goldBlood',
          gold: s.gold,
          blood: s.blood,
        })),
        { to: 'ore' },
      ];
      const maxCount = Math.min(
        action.maxTimes,
        Math.floor(res(state, player).compromat / action.conversionCost),
      );
      const out: LocationChoice[] = [];
      // Мультимножества конверсий размером 1..maxCount (индексы по неубыванию — без повторов).
      const build = (start: number, acc: ChanceryConversion[]) => {
        if (acc.length > 0) out.push({ kind: 'chancery', conversions: [...acc] });
        if (acc.length === maxCount) return;
        for (let i = start; i < kinds.length; i++)
          build(i, [...acc, kinds[i] as ChanceryConversion]);
      };
      build(0, []);
      if (canBuyBuildRight(state, player, action.buildRightCost)) out.push({ kind: 'buildRight' });
      return out;
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind === 'buildRight') {
        buyBuildRight(c, player, action.buildRightCost);
        return;
      }
      if (choice.kind !== 'chancery') mismatch(choice);
      for (const conv of choice.conversions) {
        if (conv.to === 'ore') {
          changeResources(
            c,
            player,
            { compromat: -action.conversionCost, ore: action.ore },
            'chancery',
          );
        } else {
          changeResources(
            c,
            player,
            { compromat: -action.conversionCost, gold: conv.gold, blood: conv.blood },
            'chancery',
          );
        }
      }
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
      return paymentVariants(state, player, { ore: action.oreCost }).flatMap((v) =>
        distinctWorkers(inHospital).map((w): LocationChoice =>
          v.alchemy
            ? { kind: 'revive', workerId: w.id, alchemy: true }
            : { kind: 'revive', workerId: w.id },
        ),
      );
    },
    apply(c, player, _ctx, action, choice) {
      if (choice.kind !== 'revive') mismatch(choice);
      const cost = { ore: action.oreCost };
      pay(c, player, choice.alchemy ? alchemize(cost) : cost, 'revive');
      const w = c.draft.workers.find((x) => x.id === choice.workerId);
      if (!w || w.owner !== player || w.position.kind !== 'hospital') {
        throw new Error(`Рабочий ${choice.workerId} не в госпитале`);
      }
      w.position = { kind: 'reserve' };
      c.events.push({ type: 'workerRevived', player, workerId: w.id });
    },
  },

  // Замена пары на оставшуюся после драфта, без отступных. Рабочий без улучшения ничего
  // не получает (ответ автора). Старая пара возвращается в пул Таверны.
  tavernSwap: {
    mandatory: false,
    options(state, _player, ctx) {
      const worker = getWorker(state, ctx.workerId);
      if (worker.character === null) return [];
      const out: LocationChoice[] = [];
      for (const character of state.offer.characters) {
        for (const profession of state.offer.professions) {
          out.push({ kind: 'tavernSwap', character, profession });
        }
      }
      return out;
    },
    apply(c, player, ctx, _action, choice) {
      if (choice.kind !== 'tavernSwap') mismatch(choice);
      const worker = c.draft.workers.find((w) => w.id === ctx.workerId);
      if (!worker || worker.character === null || worker.profession === null) {
        throw new Error('У рабочего нет пары для замены');
      }
      const offer = c.draft.offer;
      offer.characters.splice(offer.characters.indexOf(choice.character), 1, worker.character);
      offer.professions.splice(offer.professions.indexOf(choice.profession), 1, worker.profession);
      worker.character = choice.character;
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
          for (const region of REGION_ORDER) {
            // OQ-5: обмен в регионе с полным треком.
            const full = p.influence[region] >= TRACKS[region].max;
            if (full && !state.config.rules.cityHallAllowsFullTrack) continue;
            out.push(
              v.alchemy
                ? { kind: 'cityHall', offer: index, region, alchemy: true }
                : { kind: 'cityHall', offer: index, region },
            );
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
      pay(c, player, choice.alchemy ? alchemize(cost) : cost, 'cityHall');
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
