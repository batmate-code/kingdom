import type { BuildingDef, BuildingId, RegionId } from './types';

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  crypt: { id: 'crypt', name: 'Склеп', cost: { gold: 2 }, prestige: [1, 3, 8] },
  abbey: { id: 'abbey', name: 'Аббатство', cost: { gold: 4 }, prestige: [4, 4, 4] },
  shop: { id: 'shop', name: 'Торговая лавка', cost: { gold: 3, ore: 1 }, prestige: [5, 2, 5] },
  citadel: { id: 'citadel', name: 'Цитадель', cost: { gold: 7, ore: 3 }, prestige: [10] },
  // Эксперимент автора (influenceModel=reverse): строится на звезде региона вместо Шпиля;
  // 24.11 — 3 руды + 3 компромата, 5 престижа (было 2 + 2 и 0).
  obelisk: { id: 'obelisk', name: 'Обелиск', cost: { ore: 2, compromat: 2 }, prestige: [5] }, // автор 24.11: 2 + 2 (было 3 + 3)
};

/** Порядок перечисления типов зданий в действиях. */
export const BUILDING_ORDER: readonly BuildingId[] = [
  'crypt',
  'abbey',
  'shop',
  'citadel',
  'obelisk',
];

/** Не больше стольких зданий каждого типа у одного игрока. */
export const MAX_BUILDINGS_PER_TYPE = 3;

/** Цитадель: одна на регион на всех игроков. */
export const CITADELS_PER_REGION = 1;

/** Цитадель: одна на игрока (ответ автора, OQ-32); каждая даёт построившему +10 престижа. */
export const CITADELS_PER_PLAYER = 1;

/** Автор 23.11: сила жетона Комиссариата за каждого рабочего в госпитале (любого игрока). */
export const COMMISSARIAT_STRENGTH_PER_WORKER = 1; // автор 24.11: 2 было слишком сильно

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

/** Обелиск: один на игрока (OQ-48). */
export const OBELISKS_PER_PLAYER = 1;

/** Здания на звезде региона (не на участке): Цитадель (Шпиль) и Обелиск. */
export const MONUMENTS: readonly BuildingId[] = ['citadel', 'obelisk'];

export const CITADEL_REGIONS: readonly RegionId[] = ['forest', 'valley', 'city'];
