import type { BuildingDef, BuildingId, RegionId } from './types';

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  crypt: { id: 'crypt', name: 'Склеп', cost: { gold: 2 }, prestige: [1, 3, 8] },
  abbey: { id: 'abbey', name: 'Аббатство', cost: { gold: 4 }, prestige: [4, 4, 4] },
  shop: { id: 'shop', name: 'Торговая лавка', cost: { gold: 3, ore: 1 }, prestige: [5, 2, 5] },
  citadel: { id: 'citadel', name: 'Цитадель', cost: { gold: 7, ore: 3 }, prestige: [10] },
};

/** Не больше стольких зданий каждого типа у одного игрока. */
export const MAX_BUILDINGS_PER_TYPE = 3;

/** Цитадель: одна на регион на всех игроков. */
export const CITADELS_PER_REGION = 1;

export const BUILDING_EFFECTS = {
  /** Склеп: +1 к силе за каждый свой Склеп рядом с локацией, где стоит твой рабочий. */
  cryptStrength: 1,
  /** Аббатство: кровь владельцу за каждое вытеснение из соседней локации. */
  abbeyBloodPerDisplacement: 2,
  /** Лавка: золото владельцу, когда чужой рабочий приходит в соседнюю локацию. */
  shopGoldPerVisit: 1,
  /** Цитадель Леса: сила владельцу в боях Леса. */
  forestCitadelStrength: 2,
  /** Цитадель Долины: скидка на содержание каждого персонажа. */
  valleyCitadelUpkeepDiscount: 1,
  /** Цитадель Города: компромат владельцу, когда чужой рабочий посещает Город. */
  cityCitadelCompromatPerVisit: 1,
} as const;

export const CITADEL_REGIONS: readonly RegionId[] = ['forest', 'valley', 'city'];
