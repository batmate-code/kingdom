import type { Observation } from '@vampire/core';
import { BUILDINGS, REVERSE_TRACK, type BuildingId } from '@vampire/data';

/**
 * Эксперимент «обратные треки, Шпиль и Обелиск» (influenceModel=reverse) в интерфейсе:
 * названия и тексты, которые зависят от режима.
 */
export function isReverseView(obs: Pick<Observation, 'config'>): boolean {
  return obs.config.rules.influenceModel === 'reverse';
}

/** В эксперименте Цитадель называется Шпилем. */
export function buildingName(obs: Pick<Observation, 'config'>, type: BuildingId): string {
  return type === 'citadel' && isReverseView(obs) ? 'Шпиль' : BUILDINGS[type].name;
}

export const SPIRE_TEXT = `Победа в бою этого региона — можно взять ${REVERSE_TRACK.spireVp} ПО навсегда вместо награды. Без эффектов региона`;

export const OBELISK_TEXT = `Строится при ${REVERSE_TRACK.min} влияния, после постройки влияние снова 0. +${REVERSE_TRACK.obeliskCompromatPerRivalWin} комп, когда соперник выигрывает бой в этом регионе`;

/** Подпись награды отметки отрицательного трека (для подсказок). */
export function undergroundRewardText(at: number): string {
  const mark = REVERSE_TRACK.marks.find((m) => m.at === at);
  if (!mark) return '';
  const r = mark.reward;
  switch (r.kind) {
    case 'ore':
      return `+${r.ore} руд`;
    case 'buildRight':
      return 'право стройки в этом регионе';
    case 'strength':
      return `+${r.strength} сила в боях региона навсегда`;
    case 'obelisk':
      return 'можно строить Обелиск';
  }
}
