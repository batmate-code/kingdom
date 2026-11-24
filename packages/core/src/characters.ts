import {
  CHARACTER_PARAMS as P,
  LOCATIONS,
  LOCATION_ORDER,
  PROFESSION_ORDER,
  REGION_ORDER,
  type CharacterId,
  type LocationId,
  type RegionId,
} from '@vampire/data';
import { busyWorkerIds, distinctWorkers, getWorker, regionOfWorker } from './board';
import { combatStrengths } from './combat';
import type { Ctx } from './context';
import { influenceMin } from './reverse';
import { changeInfluence, changeResources } from './economy';
import { applyPlace, placementsFor } from './placement';
import { addPrestige } from './prestige';
import type { CardStash, CharacterChoice, GameState, PlayerId, Worker } from './types';

// Циклический импорт characters ↔ placement безопасен: на верхнем уровне модулей нет вызовов,
// функции друг друга используются только внутри обработчиков.

/** Где и чей эффект: размещённый рабочий, его локация и регион («текущий регион»). */
export interface EffectCtx {
  player: PlayerId;
  workerId: string;
  location: LocationId;
  region: RegionId;
}

/**
 * Эффект персонажа, зарегистрированный по id из data. Срабатывает один раз при размещении,
 * до действия локации; эффекты обязательны (OQ-11). С выбором — `options`: пустой список
 * значит «эффект невозможен и не срабатывает».
 */
interface CharacterEffect {
  options?(state: GameState, e: EffectCtx): CharacterChoice[];
  apply(c: Ctx, e: EffectCtx, choice: CharacterChoice | null): void;
}

const passive: CharacterEffect = { apply: () => {} };

function gain(resources: Parameters<typeof changeResources>[2]): CharacterEffect {
  return { apply: (c, e) => changeResources(c, e.player, resources, 'character') };
}

function addPowerTokens(c: Ctx, player: PlayerId, region: RegionId, count: number): void {
  const existing = c.draft.powerTokens.find((t) => t.owner === player && t.region === region);
  if (existing) existing.count += count;
  else c.draft.powerTokens.push({ owner: player, region, count });
}

function ownBuildingsIn(state: GameState, player: PlayerId, region: RegionId): number {
  return state.buildings.filter((b) => b.owner === player && b.region === region).length;
}

function workersInRegion(state: GameState, player: PlayerId, region: RegionId): Worker[] {
  return state.workers.filter((w) => w.owner === player && regionOfWorker(w) === region);
}

function expect<K extends CharacterChoice['kind']>(
  choice: CharacterChoice | null,
  kind: K,
): Extract<CharacterChoice, { kind: K }> {
  if (!choice || choice.kind !== kind) throw new Error(`Ожидался выбор ${kind}`);
  return choice as Extract<CharacterChoice, { kind: K }>;
}

/** Все подмножества (для Могильщика: рабочих в регионе не больше двух). */
function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);
}

/** Положить ресурсы на карту рабочего (прежние записи этого рабочего уходят в банк). */
function putOnCard(c: Ctx, stash: CardStash): void {
  clearCard(c, stash.workerId);
  c.draft.cardStash.push(stash);
}

/** Рабочий ушёл с поля не вытеснением (Тактик, Могильщик): его карта уходит в банк. */
function clearCard(c: Ctx, workerId: string): void {
  c.draft.cardStash = c.draft.cardStash.filter((s) => s.workerId !== workerId);
}

/** Контекст действия локации текущего размещения рабочего (в очереди или в свободном выборе). */
function locationContextOf(state: GameState, workerId: string) {
  for (const t of state.tasks) {
    if (t.t === 'askLocationAction' && t.context.workerId === workerId) return t.context;
    if (t.t === 'chooseEffect' && t.workerId === workerId) return t.context;
  }
  return null;
}

/** Ещё не разыгранное действие локации рабочего (в очереди или в свободном выборе). */
function pendingLocationStep(state: GameState, workerId: string) {
  for (const t of state.tasks) {
    if (t.t === 'askLocationAction' && t.context.workerId === workerId) return t;
    if (t.t === 'chooseEffect' && t.workerId === workerId && t.remaining.includes('location')) {
      return t;
    }
  }
  return null;
}

const EFFECTS: Record<CharacterId, CharacterEffect> = {
  // Содержание 0
  scavenger: {
    apply(c, e) {
      const n = c.draft.workers.filter((w) => w.position.kind === 'hospital').length;
      changeResources(
        c,
        e.player,
        {
          gold: n * P.scavenger.goldPerHospitalWorker,
          blood: n * P.scavenger.bloodPerHospitalWorker,
          compromat: n * P.scavenger.compromatPerHospitalWorker,
        },
        'character',
      );
    },
  },
  snitch: {
    // Автор 24.11: +1 компромат сразу; ещё 2 на карту — владельцу при вытеснении, иначе в конце раунда в банк.
    apply(c, e) {
      changeResources(c, e.player, { compromat: P.snitch.compromat }, 'character');
      putOnCard(c, {
        workerId: e.workerId,
        owner: e.player,
        character: 'snitch',
        amount: P.snitch.onDisplaced,
        region: e.region,
      });
    },
  },
  bloodsucker: gain({ blood: P.bloodsucker.blood }),
  marauder: passive, // при вытеснении чужого рабочего — onCharacterDisplaced
  chronicler: { apply: (c, e) => addPrestige(c, e.player, P.chronicler.prestige, 'effect') },

  // Содержание 1
  troublemaker: {
    apply: (c, e) => addPowerTokens(c, e.player, e.region, P.troublemaker.powerTokens),
  },
  alchemist: {
    // До конца этого размещения: раз за действие 1 руду цены можно заменить 1 золотом.
    apply(c, e) {
      c.draft.alchemy = e.player;
    },
  },
  storekeeper: gain({ gold: P.storekeeper.gold }),
  treasurer: {
    apply(c, e) {
      const { compromatCost, gold } = P.treasurer;
      if ((c.draft.players[e.player]?.resources.compromat ?? 0) < compromatCost) return;
      changeResources(c, e.player, { compromat: -compromatCost, gold }, 'character');
    },
  },
  werewolf: {
    apply(c, e) {
      // Текущая сила по ответу автора: рабочие + жетоны силы + Склепы + Цитадель Леса,
      // без жетонов боя и жетона Комиссариата (OQ-41).
      const strengths = combatStrengths(c.draft, e.region, [], { commissariat: false });
      const own = strengths.find((s) => s.player === e.player)?.strength ?? 0;
      if (
        strengths.some((s) => s.player !== e.player && s.strength >= own + P.werewolf.strengthGap)
      ) {
        addPowerTokens(c, e.player, e.region, P.werewolf.powerTokens);
      }
    },
  },
  informant: {
    apply(c, e) {
      // Автор 24.11: только себе, соперники больше ничего не получают.
      changeResources(c, e.player, { compromat: P.informant.compromat }, 'character');
    },
  },
  manipulator: {
    options: (state, e) =>
      (state.players[e.player]?.influence[e.region] ?? 0) - influenceMin(state) <
      P.manipulator.influenceLoss
        ? []
        : REGION_ORDER.filter((r) => r !== e.region).map((to) => ({ kind: 'manipulator', to })),
    apply(c, e, choice) {
      const { to } = expect(choice, 'manipulator');
      changeInfluence(c, e.player, e.region, -P.manipulator.influenceLoss, 'manipulator');
      changeInfluence(c, e.player, to, P.manipulator.influenceGain, 'manipulator');
    },
  },
  mason: {
    // Цитадель считается зданием (OQ-13).
    apply(c, e) {
      const { goldPerBuilding, maxGold } = P.mason;
      const gold = Math.min(maxGold, goldPerBuilding * ownBuildingsIn(c.draft, e.player, e.region));
      changeResources(c, e.player, { gold }, 'character');
    },
  },
  pickpocket: {
    // По 1 золоту у каждого соперника, чьи рабочие стоят в регионе (OQ-12).
    apply(c, e) {
      c.draft.players.forEach((p, other) => {
        const gold = P.pickpocket.goldPerOpponent;
        if (other === e.player || p.resources.gold < gold) return;
        if (workersInRegion(c.draft, other, e.region).length === 0) return;
        changeResources(c, other, { gold: -gold }, 'character');
        changeResources(c, e.player, { gold }, 'character');
      });
    },
  },
  renegade: {
    options(state, e) {
      const loss = P.renegade.influenceLoss;
      // Ниже нижнего предела трека терять нечего (0; в эксперименте influenceModel=reverse — −4).
      if ((state.players[e.player]?.influence[e.region] ?? 0) - influenceMin(state) < loss)
        return [];
      // Автор 24.11: только руда (право стройки убрано).
      return [{ kind: 'renegade', gain: 'ore' }];
    },
    apply(c, e, choice) {
      const { gain: what } = expect(choice, 'renegade');
      changeInfluence(c, e.player, e.region, -P.renegade.influenceLoss, 'renegade');
      if (what === 'ore') changeResources(c, e.player, { ore: P.renegade.ore }, 'character');
      else {
        c.draft.tasks.unshift({
          t: 'askBuild',
          player: e.player,
          source: { kind: 'renegade', region: e.region },
        });
      }
    },
  },

  // Содержание 2
  officer: { apply: (c, e) => addPowerTokens(c, e.player, e.region, P.officer.powerTokens) },
  madman: {
    // Вместо действия своей локации — первый слот другой локации региона (не посещение).
    // При свободном порядке действие локации может быть уже разыграно — тогда заменять нечего.
    options: (state, e) =>
      pendingLocationStep(state, e.workerId)
        ? [
            ...LOCATION_ORDER.filter(
              (l) => l !== e.location && LOCATIONS[l].region === e.region,
            ).map((location): CharacterChoice => ({ kind: 'madman', location })),
            // Эффект можно не использовать — тогда обычное действие своей локации (автор, 23.11).
            { kind: 'madman', location: null },
          ]
        : [],
    apply(c, e, choice) {
      const { location } = expect(choice, 'madman');
      if (location === null) return;
      const task = pendingLocationStep(c.draft, e.workerId);
      if (!task) throw new Error('Нет действия локации');
      task.context = { workerId: e.workerId, location, slot: 1, copy: true };
    },
  },
  infiltrator: passive, // встаёт в занятый первый слот — placementsFor
  diplomat: {
    // Автор 24.11: только если в регионе стоит рабочий соперника.
    apply(c, e) {
      const rival = c.draft.workers.some(
        (w) => w.owner !== e.player && regionOfWorker(w) === e.region,
      );
      if (rival) changeInfluence(c, e.player, e.region, P.diplomat.influence, 'diplomat');
    },
  },
  oreMiner: gain({ ore: P.oreMiner.ore }),
  intriguer: {
    options: (state, e) =>
      LOCATION_ORDER.filter(
        (l) => l !== e.location && !state.blocks.some((b) => b.location === l),
      ).map((location) => ({ kind: 'intriguer', location })),
    apply(c, e, choice) {
      const { location } = expect(choice, 'intriguer');
      c.draft.blocks.push({ location, owner: e.player });
      c.events.push({ type: 'locationBlocked', player: e.player, location });
    },
  },
  nightHunter: passive, // закрытый второй слот — placementsFor
  hypocrite: {
    options: (state, e) =>
      distinctWorkers(
        state.workers.filter((w) => w.owner === e.player && w.profession !== null),
      ).flatMap((w) =>
        PROFESSION_ORDER.filter(
          (p) =>
            p !== w.profession &&
            // При драфте по числу игроков новая профессия берётся из пула.
            (state.config.rules.draftSize !== 'players' || state.professionPool.includes(p)),
        ).map((profession): CharacterChoice => ({
          kind: 'hypocrite',
          workerId: w.id,
          profession,
        })),
      ),
    apply(c, e, choice) {
      const { workerId, profession } = expect(choice, 'hypocrite');
      const w = getWorker(c.draft, workerId);
      if (w.owner !== e.player || w.profession === null) {
        throw new Error(`Нельзя сменить профессию ${workerId}`);
      }
      if (c.draft.config.rules.draftSize === 'players') {
        const pool = c.draft.professionPool;
        const i = pool.indexOf(profession);
        if (i < 0) throw new Error(`Профессии ${profession} нет в пуле`);
        pool.splice(i, 1);
        pool.push(w.profession);
      }
      w.profession = profession;
      c.events.push({ type: 'professionChanged', player: e.player, workerId, profession });
    },
  },
  blackmailer: {
    // Соперник с 0 влияния не выбирается (OQ-14); при своём полном треке ты ничего не получаешь.
    options(state, e) {
      const cost = P.blackmailer.compromatCost;
      if ((state.players[e.player]?.resources.compromat ?? 0) < cost) return [];
      return state.players.flatMap((p, target) =>
        target !== e.player && p.influence[e.region] > influenceMin(state)
          ? [{ kind: 'blackmailer' as const, target }]
          : [],
      );
    },
    apply(c, e, choice) {
      const { target } = expect(choice, 'blackmailer');
      const { compromatCost, influence } = P.blackmailer;
      changeResources(c, e.player, { compromat: -compromatCost }, 'character');
      changeInfluence(c, target, e.region, -influence, 'blackmailer');
      changeInfluence(c, e.player, e.region, influence, 'blackmailer');
    },
  },

  // Содержание 3
  commissar: {
    // Свой рабочий из госпиталя сразу размещается с действием; вход в Город платный (автор 24.11).
    options(state, e) {
      const inHospital = state.workers.filter(
        (w) => w.owner === e.player && w.position.kind === 'hospital',
      );
      return placementsFor(state, e.player, inHospital).map((p) => ({
        kind: 'commissar',
        ...p,
      }));
    },
    apply(c, e, choice) {
      const { kind: _kind, ...placement } = expect(choice, 'commissar');
      applyPlace(c, e.player, placement, { nested: true });
    },
  },
  saboteur: {
    apply(c, e) {
      let removed = 0;
      c.draft.powerTokens = c.draft.powerTokens.filter((t) => {
        if (t.owner === e.player || t.region !== e.region) return true;
        removed += t.count;
        return false;
      });
      changeResources(c, e.player, { gold: removed * P.saboteur.goldPerToken }, 'character');
    },
  },
  patron: {
    // Автор 24.11: +1, если у тебя в регионе не меньше 2 зданий (с Цитаделью).
    apply(c, e) {
      if (ownBuildingsIn(c.draft, e.player, e.region) >= P.patron.minBuildings) {
        changeInfluence(c, e.player, e.region, P.patron.influence, 'patron');
      }
    },
  },
  oreBaron: {
    apply(c, e) {
      putOnCard(c, {
        workerId: e.workerId,
        owner: e.player,
        character: 'oreBaron',
        amount: P.oreBaron.ore,
        region: e.region,
      });
    },
  },
  gravedigger: {
    // Любое число других своих рабочих региона — в госпиталь (не вытеснение), +1 руда за каждого.
    options(state, e) {
      // Рабочих, ещё не доигравших свой ход, трогать нельзя (OQ-44, автор).
      const busy = busyWorkerIds(state);
      const others = workersInRegion(state, e.player, e.region).filter(
        (w) => w.id !== e.workerId && !busy.has(w.id),
      );
      if (others.length === 0) return [];
      return subsets(others.map((w) => w.id)).map((workerIds) => ({
        kind: 'gravedigger',
        workerIds,
      }));
    },
    apply(c, e, choice) {
      const { workerIds } = expect(choice, 'gravedigger');
      for (const id of workerIds) {
        const w = getWorker(c.draft, id);
        if (w.owner !== e.player || regionOfWorker(w) !== e.region || id === e.workerId) {
          throw new Error(`Могильщик не может отправить ${id}`);
        }
        w.position = { kind: 'hospital' };
        clearCard(c, id);
        c.events.push({ type: 'workerReturned', player: e.player, workerId: id, to: 'hospital' });
      }
      changeResources(
        c,
        e.player,
        { ore: workerIds.length * P.gravedigger.orePerWorker },
        'character',
      );
    },
  },
  tactician: {
    options: (state, e) =>
      state.workers
        .filter(
          (w) =>
            w.owner === e.player &&
            w.id !== e.workerId &&
            !busyWorkerIds(state).has(w.id) &&
            (w.position.kind === 'slot' || w.position.kind === 'citadelSpot'),
        )
        .map((w) => ({ kind: 'tactician', workerId: w.id })),
    apply(c, e, choice) {
      const { workerId } = expect(choice, 'tactician');
      const w = getWorker(c.draft, workerId);
      if (w.owner !== e.player || w.id === e.workerId) {
        throw new Error(`Тактик не может вернуть ${workerId}`);
      }
      w.position = { kind: 'reserve' };
      clearCard(c, workerId);
      c.events.push({ type: 'workerReturned', player: e.player, workerId, to: 'reserve' });
    },
  },
  // Новые карты автора (24.11)
  mercenary: {
    // Жетоны силы — на карту рабочего (не больше maxTokens); выкладываются перед боем (combat.ts).
    apply(c, e) {
      const w = getWorker(c.draft, e.workerId);
      w.garrison = Math.min(P.mercenary.maxTokens, (w.garrison ?? 0) + P.mercenary.powerTokens);
    },
  },
  armorer: {
    // Автор 24.11: действие локации этого размещения выполняется ещё раз (сразу, отдельным шагом).
    apply(c, e) {
      const context = locationContextOf(c.draft, e.workerId);
      if (!context) return;
      for (let i = 1; i < P.armorer.locationActions; i++) {
        c.draft.tasks.unshift({ t: 'askLocationAction', player: e.player, context });
      }
    },
  },
  shapeshifter: {
    // Эффект персонажа соперника: по одному варианту на персонажа (и на выбор внутри эффекта).
    options(state, e) {
      const seen = new Set<CharacterId>();
      const out: CharacterChoice[] = [];
      for (const w of state.workers) {
        const ch = w.character;
        if (w.owner === e.player || ch === null || seen.has(ch) || !copyable(ch)) continue;
        seen.add(ch);
        const inner = EFFECTS[ch].options;
        if (!inner) out.push({ kind: 'shapeshifter', character: ch });
        else
          for (const o of inner(state, e))
            out.push({ kind: 'shapeshifter', character: ch, inner: o });
      }
      return out;
    },
    apply(c, e, choice) {
      const { character, inner } = expect(choice, 'shapeshifter');
      EFFECTS[character].apply(c, e, inner ?? null);
    },
  },
  contractor: {
    apply(c, e) {
      c.draft.tasks.unshift({
        t: 'askBuild',
        player: e.player,
        source: { kind: 'contractor', region: e.region },
      });
    },
  },
};

/**
 * Перевёртыш не копирует себя и карты, которые хранят что-то на своей карте (Наёмник, Рудный
 * барон, Доносчик), и пассивные свойства без эффекта при размещении.
 */
function copyable(ch: CharacterId): boolean {
  if (ch === 'shapeshifter' || ch === 'mercenary' || ch === 'oreBaron' || ch === 'snitch') {
    return false;
  }
  return EFFECTS[ch] !== passive;
}

function effectCtx(state: GameState, player: PlayerId, workerId: string): EffectCtx | null {
  const w = getWorker(state, workerId);
  if (w.character === null || w.position.kind !== 'slot') return null;
  const location = w.position.location;
  return { player, workerId, location, region: LOCATIONS[location].region };
}

export function characterOptions(
  state: GameState,
  player: PlayerId,
  workerId: string,
): CharacterChoice[] {
  const e = effectCtx(state, player, workerId);
  const w = getWorker(state, workerId);
  if (!e || w.character === null) return [];
  return EFFECTS[w.character].options?.(state, e) ?? [];
}

/** Шаг «эффект персонажа»: без выбора — сразу; с выбором — решение игрока (если есть варианты). */
export function startCharacterEffect(c: Ctx, player: PlayerId, workerId: string): void {
  const e = effectCtx(c.draft, player, workerId);
  const character = getWorker(c.draft, workerId).character;
  if (!e || character === null) return;
  const effect = EFFECTS[character];
  if (effect.options) {
    if (effect.options(c.draft, e).length === 0) return;
    c.draft.pending = { kind: 'character', player, workerId };
    return;
  }
  c.events.push({ type: 'characterTriggered', player, workerId, character });
  effect.apply(c, e, null);
}

export function applyCharacterChoice(
  c: Ctx,
  player: PlayerId,
  workerId: string,
  choice: CharacterChoice,
): void {
  const e = effectCtx(c.draft, player, workerId);
  const character = getWorker(c.draft, workerId).character;
  if (!e || character === null) throw new Error(`У рабочего ${workerId} нет персонажа`);
  c.events.push({ type: 'characterTriggered', player, workerId, character });
  c.events.push({ type: 'characterChoice', player, workerId, choice });
  EFFECTS[character].apply(c, e, choice);
}

/**
 * Вытеснение и персонажи: Доносчик отдаёт владельцу компромат с карты (сверх компенсации),
 * Мародёр получает 2 золота за каждого вытесненного чужого рабочего (OQ-35). Палач тоже считается.
 */
export function onCharacterDisplaced(c: Ctx, by: Worker, victim: Worker): void {
  const d = c.draft;
  for (const s of d.cardStash.filter((x) => x.workerId === victim.id && x.character === 'snitch')) {
    changeResources(c, victim.owner, { compromat: s.amount }, 'snitch');
  }
  d.cardStash = d.cardStash.filter((x) => !(x.workerId === victim.id && x.character === 'snitch'));
  if (by.character === 'marauder' && victim.owner !== by.owner) {
    changeResources(c, by.owner, { gold: P.marauder.goldPerDisplaced }, 'character');
  }
}

/**
 * Конец раунда (до возврата рабочих): Рудный барон приносит руду, если остался в своём регионе
 * (Шпион — в регионе, куда перешёл; автор 24.11: победа в бою не нужна); остальное с карт — в банк.
 */
export function settleCardStash(c: Ctx): void {
  const d = c.draft;
  for (const s of d.cardStash) {
    if (s.character !== 'oreBaron') continue;
    // Автор 23.11: Рудный барон-Шпион, перешедший в другой регион, получает руду за победу там.
    const w = getWorker(d, s.workerId);
    const region = w.profession === 'spy' ? regionOfWorker(w) : s.region;
    // Автор 24.11: победа в бою больше не нужна — достаточно остаться в регионе.
    if (region !== null && regionOfWorker(w) === region) {
      changeResources(c, s.owner, { ore: s.amount }, 'oreBaron');
    }
  }
  d.cardStash = [];
}
