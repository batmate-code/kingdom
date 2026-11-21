import { DATA_VERSION } from '@vampire/data';

/**
 * Публичный API ядра (реализуется на этапах 1–5):
 * createGame(config, seed), getLegalActions(state), applyAction(state, action),
 * getObservation(state, player), isTerminal(state), getScores(state).
 */
export const CORE_DATA_VERSION = DATA_VERSION;
