import { regionName, resText, type GameEvent } from '@vampire/core';
import { REGION_ORDER, type RegionId, type Resources } from '@vampire/data';

/**
 * Лента изменений для тостов (решение автора 23.11): что получил или потратил каждый игрок за
 * один ход — ресурсы, влияние, престиж. Одна строка на игрока; нулевые итоги не показываются.
 */
export interface FeedLine {
  player: number;
  /** Текст со словами ресурсов (RichText заменяет их значками). */
  text: string;
}

interface Totals {
  resources: Partial<Resources>;
  influence: Partial<Record<RegionId, number>>;
  prestige: number;
  /** Постоянные ПО (Шпиль, эксперимент influenceModel=reverse). */
  vp: number;
}

export function summarizeEvents(events: readonly GameEvent[]): FeedLine[] {
  const byPlayer = new Map<number, Totals>();
  const totals = (player: number): Totals => {
    let t = byPlayer.get(player);
    if (!t) {
      t = { resources: {}, influence: {}, prestige: 0, vp: 0 };
      byPlayer.set(player, t);
    }
    return t;
  };
  for (const e of events) {
    if (e.type === 'resourcesChanged') {
      const t = totals(e.player);
      for (const [k, v] of Object.entries(e.delta) as [keyof Resources, number][]) {
        t.resources[k] = (t.resources[k] ?? 0) + v;
      }
    } else if (e.type === 'influenceChanged') {
      const t = totals(e.player);
      t.influence[e.region] = (t.influence[e.region] ?? 0) + e.to - e.from;
    } else if (e.type === 'prestigeChanged') {
      totals(e.player).prestige += e.to - e.from;
    } else if (e.type === 'spireVp') {
      totals(e.player).vp += e.vp;
    }
  }

  const lines: FeedLine[] = [];
  for (const [player, t] of [...byPlayer].sort(([a], [b]) => a - b)) {
    const parts: string[] = [];
    const res = Object.fromEntries(Object.entries(t.resources).filter(([, v]) => v !== 0));
    if (Object.keys(res).length > 0) parts.push(resText(res));
    for (const region of REGION_ORDER) {
      const d = t.influence[region] ?? 0;
      if (d !== 0) parts.push(`${d > 0 ? '+' : ''}${d} вл ${regionName(region)}`);
    }
    if (t.prestige !== 0) parts.push(`${t.prestige > 0 ? '+' : ''}${t.prestige} престиж`);
    if (t.vp !== 0) parts.push(`+${t.vp} ПО`);
    if (parts.length > 0) lines.push({ player, text: parts.join(', ') });
  }
  return lines;
}
