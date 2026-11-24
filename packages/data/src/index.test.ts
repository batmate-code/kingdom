import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  CHARACTERS,
  COMBAT_TOKENS,
  LOCATIONS,
  LOCATION_ORDER,
  LOCATION_PROFESSION_TOKENS,
  PLOTS,
  PRESTIGE_TRACK,
  REGION_ORDER,
  TRACKS,
  UPKEEP_TIERS,
} from './index';

describe('данные правил согласованы', () => {
  it('10 локаций: Лес 3, Долина 3, Город 4', () => {
    expect(LOCATION_ORDER).toHaveLength(10);
    expect(new Set(LOCATION_ORDER).size).toBe(10);
    const byRegion = REGION_ORDER.map(
      (r) => LOCATION_ORDER.filter((l) => LOCATIONS[l].region === r).length,
    );
    expect(byRegion).toEqual([3, 3, 4]);
  });

  it('бои идут в порядке Лес → Долина → Город', () => {
    expect(REGION_ORDER).toEqual(['forest', 'valley', 'city']);
  });

  it('жетонов профессий локаций 10, по 2 каждой профессии', () => {
    expect(LOCATION_PROFESSION_TOKENS).toHaveLength(LOCATION_ORDER.length);
    for (const p of new Set(LOCATION_PROFESSION_TOKENS)) {
      expect(LOCATION_PROFESSION_TOKENS.filter((t) => t === p)).toHaveLength(2);
    }
  });

  it('участков по 6 на регион (автор 23.11), соседние локации — из того же региона', () => {
    for (const r of REGION_ORDER) {
      const plots = PLOTS.filter((p) => p.region === r);
      expect(plots).toHaveLength(6);
      for (const plot of plots) {
        for (const loc of plot.adjacent) expect(LOCATIONS[loc].region).toBe(r);
        // Доплата только у двойных участков Леса и Долины; в Городе участки бесплатны.
        const paid = plot.adjacent.length === 2 && r !== 'city';
        expect(Object.keys(plot.surcharge).length > 0).toBe(paid);
      }
    }
  });

  it('треки влияния: Лес и Долина до 6, Город до 8; ПО на отметках', () => {
    expect(TRACKS.forest.max).toBe(6);
    expect(TRACKS.valley.max).toBe(6);
    expect(TRACKS.city.max).toBe(8);
    expect(TRACKS.city.vpMarks).toEqual([3, 5, 8]);
    expect(PRESTIGE_TRACK.vpMarks).toHaveLength(11); // автор 24.11: трек до 58
  });

  it('в колоде 34 персонажа (автор 24.11: новые карты и пересмотр содержания): 0/1/2/3 — 7/11/10/6', () => {
    const all = Object.values(CHARACTERS);
    expect(all).toHaveLength(34);
    const counts = [0, 1, 2, 3].map((u) => all.filter((c) => c.upkeep === u).length);
    expect(counts).toEqual([7, 11, 10, 6]);
    for (const c of all) expect(UPKEEP_TIERS.some((t) => t.upkeep === c.upkeep)).toBe(true);
  });

  it('набор жетонов боя — 10 штук', () => {
    const total = Object.values(COMBAT_TOKENS).reduce((s, t) => s + t.count, 0);
    expect(total).toBe(10);
  });

  it('цены зданий по ответам автора', () => {
    expect(BUILDINGS.shop.cost).toEqual({ gold: 3, ore: 1 });
    expect(BUILDINGS.citadel.cost).toEqual({ gold: 7, ore: 3 });
    expect(BUILDINGS.crypt.prestige).toEqual([1, 3, 8]);
  });
});
