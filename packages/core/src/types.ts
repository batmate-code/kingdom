import type {
  BuildingId,
  CharacterId,
  CombatTokenId,
  LocationId,
  ProfessionId,
  RegionId,
  Resources,
  SlotIndex,
} from '@vampire/data';
import type { GameConfig } from './config';

/** Номер игрока по часовой стрелке: 0..playerCount-1. */
export type PlayerId = number;

export type Position =
  | { kind: 'reserve' }
  | { kind: 'slot'; location: LocationId; slot: SlotIndex }
  | { kind: 'hospital' }
  /** У места Цитадели региона (перемещённые Шпион и Отступление): в бою считаются, в локации не стоят. */
  | { kind: 'citadelSpot'; region: RegionId };

export interface Worker {
  id: string;
  owner: PlayerId;
  profession: ProfessionId | null;
  character: CharacterId | null;
  position: Position;
}

export interface PlayerState {
  resources: Resources;
  influence: Record<RegionId, number>;
  /** Спасовал в текущем размещении (окончательно до боя). */
  passed: boolean;
  /** Трек престижа (0..40). */
  prestige: number;
  /** Взятое на драфте этого раунда (до шага улучшения). */
  draftPick: { character: CharacterId | null; profession: ProfessionId | null };
  /**
   * Жетоны боя в руке и в сбросе. Открыто: рука выводится из сброса. Положенный в закрытую жетон
   * остаётся в руке до вскрытия, иначе рука выдала бы его.
   */
  combatTokens: { hand: Record<CombatTokenId, number>; discard: Record<CombatTokenId, number> };
}

/** Постройка. Цитадель стоит на звезде региона (plot = null), остальные — на участке. */
export interface Building {
  type: BuildingId;
  owner: PlayerId;
  region: RegionId;
  plot: string | null;
}

/** Ресурсы на карте персонажа рабочего: Доносчик — компромат, Рудный барон — руда региона. */
export interface CardStash {
  workerId: string;
  owner: PlayerId;
  character: 'snitch' | 'oreBaron';
  amount: number;
  region: RegionId;
}

/** Что строится: тип, регион и участок (Цитадель — на звезде региона, plot = null). */
export interface BuildChoice {
  building: BuildingId;
  region: RegionId;
  plot: string | null;
  /** Алхимик: 1 руда цены заменена на 1 золото. */
  alchemy?: true;
}

/** Откуда право стройки: Канцелярия (любой регион), награда за бой (этот регион), Архитектор. */
export type BuildSource =
  | { kind: 'chancery' }
  | { kind: 'reward'; region: RegionId }
  /** Ренегат: право стройки в регионе его локации. */
  | { kind: 'renegade'; region: RegionId }
  | { kind: 'architect'; workerId: string };

/** Жетон боя, положенный игроком в закрытую. Игрок без жетонов в руке ничего не кладёт. */
export interface CombatPlay {
  player: PlayerId;
  token: CombatTokenId;
}

/** Текущий бой: кто какой жетон положил. До вскрытия жетоны соперников скрыты. */
export interface CombatState {
  region: RegionId;
  plays: CombatPlay[];
  revealed: boolean;
}

export interface LocationState {
  /** Жетон профессии локации на этот раунд (открытый). */
  professionToken: ProfessionId | null;
  /** Второй слот закрыт замком после вытеснения. */
  slot2Locked: boolean;
}

export interface PowerToken {
  owner: PlayerId;
  region: RegionId;
  count: number;
}

export type Phase = 'draft' | 'upgrade' | 'placement' | 'combat' | 'upkeep' | 'gameOver';

/** Где выполняется действие слота: настоящее размещение или копирование (Подполье). */
export interface LocationActionContext {
  workerId: string;
  location: LocationId;
  slot: SlotIndex;
  /** Копирование не считается посещением локации. */
  copy: boolean;
}

/** Чей сейчас выбор и какой. getLegalActions перечисляет варианты для него. */
export type Decision =
  | { kind: 'placement'; player: PlayerId }
  | { kind: 'locationAction'; player: PlayerId; context: LocationActionContext }
  | { kind: 'combatReward'; player: PlayerId; region: RegionId }
  /** Драфт: круг 1 — персонаж или профессия, круг 2 — недостающее. */
  | { kind: 'draftPick'; player: PlayerId; circle: 1 | 2 }
  /** Улучшение: назначить взятую пару на рабочего или сбросить её за отступные. */
  | { kind: 'upgrade'; player: PlayerId }
  /** Конец раунда: оплатить содержание персонажа рабочего или сбросить пару за отступные. */
  | { kind: 'upkeep'; player: PlayerId; workerId: string }
  /** Палач в первом слоте: вытеснить чужого рабочего из другой локации региона (или нет). */
  | { kind: 'executioner'; player: PlayerId; workerId: string }
  /** Перед боями: Шпион может перейти в другой регион (к месту Цитадели) или остаться. */
  | { kind: 'spyMove'; player: PlayerId; workerId: string }
  /** Перед боем региона: положить в закрытую жетон боя. */
  | { kind: 'combatToken'; player: PlayerId; region: RegionId }
  /** Эффект персонажа с выбором (обязателен, если есть хоть один вариант). */
  | { kind: 'character'; player: PlayerId; workerId: string }
  /** Свободный порядок: какой эффект размещения разыграть следующим. */
  | { kind: 'effectOrder'; player: PlayerId; workerId: string }
  /** Построить здание (или отказаться) по праву стройки. */
  | { kind: 'build'; player: PlayerId; source: BuildSource }
  /** Отступление: выбрать регион, где боя ещё не было. */
  | { kind: 'retreat'; player: PlayerId; region: RegionId };

/** Эффект размещения: персонаж, действие локации, профессия. */
export type EffectStep = 'character' | 'location' | 'profession';

/** Шаги партии, которые выполняются автоматически, пока не потребуется чьё-то решение. */
export type Task =
  | { t: 'startRound' }
  | { t: 'placementTurn'; first: boolean }
  | { t: 'askLocationAction'; player: PlayerId; context: LocationActionContext }
  /** Перед боями: Шпионы по очереди с первого игрока. */
  | { t: 'spyMoves' }
  | { t: 'askSpyMove'; player: PlayerId; workerId: string }
  /** Бой региона: розыгрыш жетонов → вскрытие → Отступления → итог. */
  | { t: 'combat'; region: RegionId }
  | { t: 'askCombatToken'; player: PlayerId; region: RegionId }
  | { t: 'revealCombat'; region: RegionId }
  | { t: 'askRetreat'; player: PlayerId; region: RegionId }
  | { t: 'combatOutcome'; region: RegionId }
  | { t: 'askBuild'; player: PlayerId; source: BuildSource }
  /** Эффект персонажа размещённого рабочего (до действия локации). */
  | { t: 'characterEffect'; player: PlayerId; workerId: string }
  /** Эффект профессии размещённого рабочего (после действия локации). */
  | { t: 'professionEffect'; player: PlayerId; workerId: string; directSlot1: boolean }
  /**
   * Свободный порядок эффектов: какие ещё не разыграны. `character` — персонаж на момент
   * размещения (новый персонаж из Таверны в этом размещении не срабатывает).
   */
  | {
      t: 'chooseEffect';
      player: PlayerId;
      workerId: string;
      remaining: EffectStep[];
      context: LocationActionContext;
      directSlot1: boolean;
      character: CharacterId | null;
    }
  | { t: 'askDraft'; player: PlayerId; circle: 1 | 2 }
  | { t: 'askUpgrade'; player: PlayerId }
  | { t: 'askExecutioner'; player: PlayerId; workerId: string }
  /** Конец раунда, часть 1: содержание (пока рабочие ещё на поле и в госпитале). */
  | { t: 'startUpkeep' }
  | { t: 'askUpkeep'; player: PlayerId; workerId: string }
  /** Конец раунда, часть 2: возврат рабочих, замки, Логово, первый игрок. */
  | { t: 'finishRound' };

/** Доля «любых N золота/крови». */
export interface GoldBlood {
  gold: number;
  blood: number;
}

/** Одна конверсия Канцелярии: 1 компромат → золото/кровь или руда. */
export type ChanceryConversion = { to: 'goldBlood'; gold: number; blood: number } | { to: 'ore' };

/** Выбор игрока при выполнении действия слота. */
export type LocationChoice =
  | { kind: 'skip' }
  | { kind: 'gain' }
  | { kind: 'lairStash' }
  | { kind: 'mass'; from: 'gold' | 'blood'; times: number }
  | { kind: 'marketBuy'; pay: GoldBlood }
  | { kind: 'marketSell'; receive: GoldBlood; alchemy?: true }
  | { kind: 'chancery'; conversions: ChanceryConversion[] }
  | { kind: 'cityHall'; offer: number; region: RegionId; alchemy?: true }
  | { kind: 'copy'; location: LocationId; slot: SlotIndex }
  | { kind: 'revive'; workerId: string; alchemy?: true }
  | { kind: 'commissariat'; region: RegionId }
  /** Канцелярия: заплатить компромат за право стройки. */
  | { kind: 'buildRight' }
  | { kind: 'tavernSwap'; character: CharacterId; profession: ProfessionId };

/** Выбор в эффекте персонажа. */
export type CharacterChoice =
  | { kind: 'manipulator'; to: RegionId }
  | { kind: 'renegade'; gain: 'ore' | 'build' }
  | { kind: 'blackmailer'; target: PlayerId }
  | { kind: 'hypocrite'; workerId: string; profession: ProfessionId }
  | { kind: 'intriguer'; location: LocationId }
  | { kind: 'madman'; location: LocationId }
  | {
      kind: 'commissar';
      workerId: string;
      location: LocationId;
      slot: SlotIndex;
      displace: boolean;
    }
  | { kind: 'gravedigger'; workerIds: string[] }
  | { kind: 'tactician'; workerId: string };

export type DraftPick =
  { kind: 'character'; character: CharacterId } | { kind: 'profession'; profession: ProfessionId };

export type UpgradeChoice = { kind: 'assign'; workerId: string } | { kind: 'discard' };

export type Action =
  | { type: 'place'; workerId: string; location: LocationId; slot: SlotIndex; displace: boolean }
  | { type: 'pass' }
  | { type: 'locationAction'; choice: LocationChoice }
  | { type: 'combatReward'; choice: 'influence' | 'build' }
  | { type: 'build'; choice: BuildChoice | null }
  | { type: 'character'; choice: CharacterChoice }
  | { type: 'effectOrder'; effect: EffectStep }
  | { type: 'draftPick'; pick: DraftPick }
  | { type: 'upgrade'; choice: UpgradeChoice }
  | { type: 'upkeep'; choice: 'pay' | 'discard' }
  | { type: 'executioner'; target: string | null }
  | { type: 'spyMove'; region: RegionId | null }
  | { type: 'combatToken'; token: CombatTokenId }
  | { type: 'retreat'; to: RegionId };

/** Причина изменения ресурсов (для журнала и статистики). */
export type ResourceReason =
  | 'location'
  | 'lairStash'
  | 'mass'
  | 'market'
  | 'chancery'
  | 'copy'
  | 'revive'
  | 'cityHall'
  | 'cityEntry'
  | 'displaced'
  | 'executioner'
  | 'severance'
  | 'upkeep'
  | 'build'
  | 'abbey'
  | 'shop'
  | 'cityCitadel'
  | 'character'
  | 'snitch'
  | 'oreBaron';

/** Откуда престиж: постройка или сохранённый персонаж в конце игры. */
export type PrestigeReason = 'building' | 'character' | 'effect';

export interface CombatStrength {
  player: PlayerId;
  strength: number;
  workers: number;
}

export type GameEvent =
  | { type: 'roundStarted'; round: number; firstPlayer: PlayerId }
  | { type: 'professionTokensDealt'; tokens: Record<LocationId, ProfessionId> }
  | {
      type: 'workerPlaced';
      player: PlayerId;
      workerId: string;
      location: LocationId;
      slot: SlotIndex;
    }
  | { type: 'cityEntryPaid'; player: PlayerId; gold: number }
  | {
      type: 'workerDisplaced';
      by: PlayerId;
      workerId: string;
      owner: PlayerId;
      location: LocationId;
      /** slot2 — обычное вытеснение из второго слота; executioner — Палач. */
      method: 'slot2' | 'executioner';
    }
  | { type: 'passed'; player: PlayerId }
  | {
      type: 'locationActionResolved';
      player: PlayerId;
      location: LocationId;
      slot: SlotIndex;
      copy: boolean;
      choice: LocationChoice;
    }
  | {
      type: 'resourcesChanged';
      player: PlayerId;
      delta: Partial<Resources>;
      reason: ResourceReason;
    }
  | { type: 'influenceChanged'; player: PlayerId; region: RegionId; from: number; to: number }
  | { type: 'cityEntryRaised'; region: RegionId; cost: number }
  | { type: 'workerRevived'; player: PlayerId; workerId: string }
  | {
      type: 'workerMoved';
      player: PlayerId;
      workerId: string;
      to: RegionId;
      /** spy — перемещение Шпиона перед боями; retreat — Отступление. */
      method: 'spy' | 'retreat';
    }
  | ({ type: 'buildingBuilt'; player: PlayerId } & BuildChoice)
  | {
      type: 'prestigeChanged';
      player: PlayerId;
      from: number;
      to: number;
      reason: PrestigeReason;
    }
  | { type: 'characterTriggered'; player: PlayerId; workerId: string; character: CharacterId }
  | { type: 'characterChoice'; player: PlayerId; workerId: string; choice: CharacterChoice }
  | { type: 'locationBlocked'; player: PlayerId; location: LocationId }
  | { type: 'locationUnblocked'; location: LocationId }
  | { type: 'professionChanged'; player: PlayerId; workerId: string; profession: ProfessionId }
  | { type: 'workerReturned'; player: PlayerId; workerId: string; to: 'reserve' | 'hospital' }
  | { type: 'commissariatTaken'; player: PlayerId; region: RegionId }
  | { type: 'combatTokenPlayed'; player: PlayerId; region: RegionId }
  | { type: 'combatTokensRevealed'; region: RegionId; plays: CombatPlay[] }
  | { type: 'combatTokensRefreshed' }
  | {
      type: 'combatResolved';
      region: RegionId;
      strengths: CombatStrength[];
      winner: PlayerId | null;
    }
  | {
      type: 'draftOffered';
      characters: CharacterId[];
      professions: ProfessionId[];
    }
  | { type: 'draftPicked'; player: PlayerId; pick: DraftPick }
  | {
      type: 'workerUpgraded';
      player: PlayerId;
      workerId: string;
      character: CharacterId;
      profession: ProfessionId;
    }
  | {
      type: 'pairDiscarded';
      player: PlayerId;
      character: CharacterId;
      profession: ProfessionId;
      reason: 'draft' | 'replaced' | 'upkeep';
    }
  | { type: 'upkeepPaid'; player: PlayerId; workerId: string; blood: number }
  | {
      type: 'tavernSwapped';
      player: PlayerId;
      workerId: string;
      character: CharacterId;
      profession: ProfessionId;
    }
  | { type: 'roundEnded'; round: number }
  | { type: 'gameOver' };

export interface GameState {
  config: GameConfig;
  round: number;
  firstPlayer: PlayerId;
  phase: Phase;
  players: PlayerState[];
  workers: Worker[];
  locations: Record<LocationId, LocationState>;
  lair: { stash: number; visited: boolean };
  /** Регионы, в которых уже сработал рубеж подорожания входа в Город. */
  cityEntryRaisedRegions: RegionId[];
  /** Кто первым достиг максимума трека (жетон первенства). */
  firstToMax: Partial<Record<RegionId, PlayerId>>;
  powerTokens: PowerToken[];
  /** Жетон Комиссариата на этот раунд: у кого и для боя какого региона. */
  commissariat: { owner: PlayerId; region: RegionId } | null;
  /** Постройки (строительство — этап 4). */
  buildings: Building[];
  /** Идущий бой (между розыгрышем жетонов и итогом). */
  combat: CombatState | null;
  /** Победители боёв этого раунда (для Рудного барона). */
  combatWinners: Partial<Record<RegionId, PlayerId | null>>;
  /** Ресурсы «на карте» персонажа (Доносчик, Рудный барон) до конца раунда. */
  cardStash: CardStash[];
  /** Локации, закрытые Интриганом до начала следующего хода владельца. */
  blocks: { location: LocationId; owner: PlayerId }[];
  /** Алхимик активен в текущем размещении этого игрока. */
  alchemy: PlayerId | null;
  /** Чей ход размещения сейчас (или был последним). */
  placementCurrent: PlayerId;
  /** Колода персонажей. Порядок скрыт от игроков. */
  deck: CharacterId[];
  /** Сброшенные персонажи (из игры не возвращаются: 30 карт = 6 раундов × 5). */
  discard: CharacterId[];
  /** Выложенное на драфт; после драфта — пары, оставшиеся для Таверны. Открыто. */
  offer: { characters: CharacterId[]; professions: ProfessionId[] };
  tasks: Task[];
  pending: Decision | null;
  /** Состояние генератора случайных чисел. Скрыто от игроков. */
  rng: number;
}

/** Что видит игрок: всё открытое, без скрытой информации. */
export interface Observation {
  viewer: PlayerId;
  config: GameState['config'];
  round: number;
  firstPlayer: PlayerId;
  phase: Phase;
  players: PlayerState[];
  workers: Worker[];
  locations: GameState['locations'];
  lair: GameState['lair'];
  cityEntryRaisedRegions: RegionId[];
  firstToMax: GameState['firstToMax'];
  powerTokens: PowerToken[];
  commissariat: GameState['commissariat'];
  buildings: Building[];
  /** Идущий бой: до вскрытия видны только свои жетоны, чужие — как null. */
  combat: {
    region: RegionId;
    revealed: boolean;
    plays: { player: PlayerId; token: CombatTokenId | null }[];
  } | null;
  combatWinners: GameState['combatWinners'];
  cardStash: CardStash[];
  blocks: GameState['blocks'];
  alchemy: PlayerId | null;
  placementCurrent: PlayerId;
  /** Сколько карт осталось в колоде (порядок скрыт). */
  deckSize: number;
  discard: CharacterId[];
  offer: GameState['offer'];
  /** Очередь предстоящих шагов (без скрытых данных). */
  tasks: Task[];
  pending: Decision | null;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
