import type { LocationId, RegionId } from '@vampire/data';

/**
 * Карта по наброску автора (22.11): Город за стеной в центре, Долина с горами и развалинами
 * слева, Лес справа, река от Города вниз и вдоль нижнего края. Единицы viewBox; только интерфейс.
 */
export const MAP = { width: 2400, height: 1600 } as const;

export type Pt = readonly [number, number];

/** Центры овалов локаций. Замок — Ратуша, развалины — Месса. */
export const LOC: Record<LocationId, Pt> = {
  cityHall: [1225, 400],
  chancery: [960, 690],
  commissariat: [1470, 700],
  underground: [1210, 960],
  mass: [430, 380],
  tavern: [380, 790],
  market: [420, 1200],
  lair: [2030, 360],
  mine: [2010, 780],
  witchCircle: [2040, 1200],
};

/** Полуоси овала локации. */
export const OVAL = { rx: 182, ry: 118 } as const;

/** Подпись-образ локации на карте (по наброску). */
export const LOC_FLAVOR: Partial<Record<LocationId, string>> = {
  cityHall: 'Замок',
  mass: 'Развалины',
};

/** Участки — кружки на дорогах; двойные стоят между двумя локациями. */
export const PLOT_AT: Record<string, Pt> = {
  'city-cityHall': [990, 440],
  'city-chancery': [905, 870],
  'city-commissariat-cityHall': [1505, 465],
  'city-underground-commissariat': [1450, 935],
  'city-underground-chancery': [975, 960],
  'valley-mass': [740, 300],
  'valley-mass-tavern': [175, 590],
  'valley-tavern': [650, 735],
  'valley-market-tavern': [655, 1010],
  'valley-market': [720, 1330],
  'forest-lair': [1745, 300],
  'forest-mine-lair': [2280, 575],
  'forest-mine': [1840, 940],
  'forest-mine-witchCircle': [2285, 1000],
  'forest-witchCircle': [1760, 1330],
};

export const PLOT_R = 46;

/** Места Цитаделей. */
export const STAR_AT: Record<RegionId, Pt> = {
  city: [1215, 690],
  valley: [175, 1000],
  forest: [1770, 1080],
};

/** Стена Города: неровный восьмиугольник, ворота — номера сторон. */
export const WALL: readonly Pt[] = [
  [1075, 175],
  [1420, 185],
  [1690, 380],
  [1730, 760],
  [1560, 1100],
  [1060, 1125],
  [790, 920],
  [775, 455],
];
export const GATES = [6, 3, 5] as const;

/** Вход в Город — у нижних ворот. */
export const ENTRY_AT: Pt = [1310, 1170];

/** Госпиталь — на берегу реки внизу. */
export const HOSPITAL_AT: Pt = [1215, 1395];

/** Река: от западной стены Города вниз и вдоль нижнего края направо. */
export const RIVER =
  'M 770 560 C 700 700, 820 820, 770 980 S 690 1260, 820 1420 S 1150 1540, 1500 1505 S 2050 1440, 2420 1480';

/** Мосты: точка на реке и угол. */
export const BRIDGES: readonly { at: Pt; angle: number }[] = [
  { at: [755, 905], angle: 10 },
  { at: [1010, 1500], angle: 95 },
  { at: [1700, 1485], angle: 88 },
];

/** Горы за развалинами (вершины хребта). */
export const MOUNTAINS: readonly { x: number; y: number; h: number; w: number }[] = [
  { x: 90, y: 250, h: 190, w: 260 },
  { x: 260, y: 220, h: 230, w: 300 },
  { x: 470, y: 230, h: 200, w: 260 },
  { x: 650, y: 200, h: 160, w: 220 },
  { x: 30, y: 270, h: 140, w: 180 },
  { x: 800, y: 160, h: 120, w: 170 },
];

/** Дороги: пары точек (локация/участок/ворота), рисуются изгибом. */
export const ROADS: readonly [Pt, Pt][] = [
  [LOC.mass, LOC.tavern],
  [LOC.tavern, LOC.market],
  [LOC.mass, [740, 300]],
  [LOC.tavern, [650, 735]],
  [LOC.market, [720, 1330]],
  [
    [650, 735],
    [790, 760],
  ],
  [
    [720, 1330],
    [1010, 1500],
  ],
  [[1010, 1500], HOSPITAL_AT],
  [HOSPITAL_AT, [1310, 1125]],
  [HOSPITAL_AT, [1700, 1485]],
  [[1700, 1485], LOC.witchCircle],
  [LOC.lair, LOC.mine],
  [LOC.mine, LOC.witchCircle],
  [
    [1710, 570],
    [1745, 300],
  ],
  [[1710, 570], LOC.mine],
];

export function pts(shape: readonly Pt[]): string {
  return shape.map(([x, y]) => `${x},${y}`).join(' ');
}

export function starPts([cx, cy]: Pt, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (Math.PI / 5) * i;
    return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/** Детерминированный «случайный» генератор для расстановки деревьев. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Занятые места (овалы, участки, звёзды), чтобы не сажать на них деревья. */
export function occupied([x, y]: Pt): boolean {
  for (const [cx, cy] of Object.values(LOC)) {
    if (((x - cx) / (OVAL.rx + 40)) ** 2 + ((y - cy) / (OVAL.ry + 40)) ** 2 < 1) return true;
  }
  for (const [cx, cy] of [...Object.values(PLOT_AT), ...Object.values(STAR_AT)]) {
    if (Math.hypot(x - cx, y - cy) < 95) return true;
  }
  return false;
}
