import type { Decision, GameEvent, PlayerId } from './types';

/**
 * Видимость событий для зрителя (онлайн-режим: хост шлёт гостю только то, что тот вправе знать).
 *
 * public — событие открыто всем; own — только участнику события (поле player); hidden — никому.
 * Таблица исчерпывающая: новый тип события не скомпилируется, пока для него не решено, видно ли
 * оно. Сейчас все события открыты: жетон боя до вскрытия передаётся без вида жетона
 * (combatTokenPlayed), колода раскрывается только выкладкой на драфт.
 */
export type Visibility = 'public' | 'own' | 'hidden';

/** Таблица видимости: для каждого типа события — кому оно открыто. */
export type VisibilityTable = Record<GameEvent['type'], Visibility>;

const EVENT_VISIBILITY: VisibilityTable = {
  roundStarted: 'public',
  professionTokensDealt: 'public',
  workerPlaced: 'public',
  cityEntryPaid: 'public',
  trackBoost: 'public',
  undergroundMark: 'public',
  spireVp: 'public',
  workerDisplaced: 'public',
  passed: 'public',
  locationActionResolved: 'public',
  resourcesChanged: 'public',
  influenceChanged: 'public',
  cityEntryRaised: 'public',
  workerRevived: 'public',
  workerMoved: 'public',
  garrisonDeployed: 'public',
  buildingBuilt: 'public',
  prestigeChanged: 'public',
  characterTriggered: 'public',
  characterChoice: 'public',
  locationBlocked: 'public',
  locationUnblocked: 'public',
  professionChanged: 'public',
  workerReturned: 'public',
  commissariatTaken: 'public',
  combatTokenPlayed: 'public',
  combatTokensRevealed: 'public',
  combatTokensRefreshed: 'public',
  combatResolved: 'public',
  draftOffered: 'public',
  draftPicked: 'public',
  workerUpgraded: 'public',
  pairDiscarded: 'public',
  upkeepPaid: 'public',
  tavernSwapped: 'public',
  roundEnded: 'public',
  gameOver: 'public',
};

/** Видимость события данного типа (для тестов и проверок протокола). */
export function eventVisibility(type: GameEvent['type']): Visibility {
  return EVENT_VISIBILITY[type];
}

/**
 * Фильтр по таблице (отдельно — чтобы проверять ветки own/hidden на искусственной таблице).
 * own: событие видно только игроку из поля player; у события без player — никому.
 */
export function filterEvents(
  events: readonly GameEvent[],
  viewer: PlayerId,
  table: VisibilityTable,
): GameEvent[] {
  return events.filter((e) => {
    const v = table[e.type];
    if (v === 'public') return true;
    if (v === 'own') return 'player' in e && e.player === viewer;
    return false;
  });
}

/** События, которые зритель вправе увидеть (в том же порядке). */
export function eventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return filterEvents(events, viewer, EVENT_VISIBILITY);
}

/**
 * Решения, где примерка хода (предпросмотр итога в интерфейсе) раскрыла бы скрытое: исход
 * зависит от жетонов боя соперников. Таблица исчерпывающая — новое решение не скомпилируется,
 * пока не решено, можно ли показывать его итог заранее.
 */
const PREVIEW_HIDES_INFO: Record<Decision['kind'], boolean> = {
  draftPick: false,
  upgrade: false,
  placement: false,
  effectOrder: false,
  character: false,
  locationAction: false,
  executioner: false,
  build: false,
  upkeep: false,
  combatReward: false,
  combatToken: true,
  retreat: true,
  spyMove: true,
  // Решение принимается до вскрытия жетонов боя: итог зависит от скрытого.
  garrison: true,
};

/** Можно ли показывать итог хода в этом решении заранее (false — раскрыло бы скрытое). */
export function previewHidesInfo(kind: Decision['kind']): boolean {
  return PREVIEW_HIDES_INFO[kind];
}
