import type {
  CharacterId,
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

export type Phase = 'placement' | 'combat' | 'gameOver';

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
  | { kind: 'combatReward'; player: PlayerId; region: RegionId };

/** Шаги партии, которые выполняются автоматически, пока не потребуется чьё-то решение. */
export type Task =
  | { t: 'startRound' }
  | { t: 'placementTurn'; first: boolean }
  | { t: 'askLocationAction'; player: PlayerId; context: LocationActionContext }
  | { t: 'combat'; region: RegionId }
  | { t: 'endRound' };

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
  | { kind: 'marketSell'; receive: GoldBlood }
  | { kind: 'chancery'; conversions: ChanceryConversion[] }
  | { kind: 'cityHall'; offer: number; region: RegionId }
  | { kind: 'copy'; location: LocationId; slot: SlotIndex }
  | { kind: 'revive'; workerId: string };

export type Action =
  | { type: 'place'; workerId: string; location: LocationId; slot: SlotIndex; displace: boolean }
  | { type: 'pass' }
  | { type: 'locationAction'; choice: LocationChoice }
  | { type: 'combatReward'; choice: 'influence' };

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
  | 'displaced';

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
      type: 'combatResolved';
      region: RegionId;
      strengths: CombatStrength[];
      winner: PlayerId | null;
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
  /** Чей ход размещения сейчас (или был последним). */
  placementCurrent: PlayerId;
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
  placementCurrent: PlayerId;
  pending: Decision | null;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
