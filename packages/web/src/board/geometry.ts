import type { LocationId, RegionId } from '@vampire/data';

/**
 * Геометрия поля по картону автора (docs/images/board.jpg, 2000 × 1670), в единицах viewBox.
 * Только интерфейс: числа правил берутся из @vampire/data.
 *
 * Поле растянуто по горизонтали в SX раз (решение автора А1, 22.11: пропорции под экран ≈1,45:1).
 * Координаты ниже записаны в исходной сетке картона и проходят через sx(); размеры карточек,
 * участков и шрифтов не растягиваются — между элементами просто становится больше места.
 */
export const SX = 1.45;

export type Pt = readonly [number, number];

/**
 * Город выше на CITY_DY (решение автора 22.11: четырём локациям было тесно): контур Города
 * растягивается по вертикали, всё ниже Города (Лес, Долина, Госпиталь, река, треки, престиж)
 * сдвигается вниз на CITY_DY. Координаты в таблицах — по-прежнему в сетке картона.
 */
export const CITY_DY = 110;
const CITY_K = (905 + CITY_DY) / 905;

/** Точка ниже Города: сдвиг вниз. */
export function dn([x, y]: Pt): Pt {
  return [x, y + CITY_DY];
}

/** Точка из сетки картона → координаты поля. */
export function sx([x, y]: Pt): Pt {
  return [x * SX, y];
}

/** Применить f к каждому значению таблицы, сохранив ключи. */
function mapValues<K extends string, V, W>(table: Record<K, V>, f: (v: V) => W): Record<K, W> {
  const out = {} as Record<K, W>;
  for (const k of Object.keys(table) as K[]) out[k] = f(table[k]);
  return out;
}

const mapPts = <K extends string>(t: Record<K, readonly Pt[]>) => mapValues(t, (v) => v.map(sx));
const mapPt = <K extends string>(t: Record<K, Pt>) => mapValues(t, sx);

/** Трек престижа внизу (решение автора А3: выше прежнего). */
export const PRESTIGE_BOX = { x: 70 * SX, y: 1612 + CITY_DY, w: 1920 * SX, h: 100 } as const;

export const VIEW = { width: 2000 * SX, height: PRESTIGE_BOX.y + PRESTIGE_BOX.h + 10 } as const;

/** Контуры регионов — неровные, как на картоне. */
const SHAPES_RAW: Record<RegionId | 'hospital', readonly Pt[]> = {
  city: [
    [243, 45],
    [430, 8],
    [1410, 2],
    [1745, 40],
    [1745, 330],
    [1675, 590],
    [1405, 592],
    [1340, 650],
    [1070, 905],
    [915, 905],
    [620, 590],
    [400, 560],
    [325, 500],
  ],
  // Верхний край Леса — ниже реки и стены Города (раньше заходил на Город после сглаживания).
  forest: [
    [300, 640],
    [420, 612],
    [640, 655],
    [945, 990],
    // Край у Госпиталя — зеркало края Долины относительно x = 1000 (без перекоса).
    [940, 1240],
    [860, 1420],
    [790, 1590],
    [120, 1585],
    [60, 1265],
    [100, 1000],
    [165, 760],
    [235, 700],
  ],
  valley: [
    [1350, 648],
    [1535, 632],
    [1820, 720],
    [1900, 1000],
    [1940, 1280],
    [1830, 1440],
    [1840, 1520],
    [1660, 1590],
    [1210, 1590],
    [1140, 1420],
    [1060, 1240],
    [1050, 975],
  ],
  hospital: [
    [920, 1228],
    [1100, 1240],
    [1140, 1460],
    [1210, 1585],
    [795, 1580],
    [880, 1455],
  ],
};

export const REGION_SHAPES: Record<RegionId | 'hospital', readonly Pt[]> = mapPts({
  city: SHAPES_RAW.city.map(([x, y]): Pt => [x, y * CITY_K]),
  forest: SHAPES_RAW.forest.map(dn),
  valley: SHAPES_RAW.valley.map(dn),
  hospital: SHAPES_RAW.hospital.map(dn),
});

/** Центры карточек локаций. */
export const LOCATION_CENTERS: Record<LocationId, Pt> = mapPt({
  // Город (автор 23.11): треугольник Подполье — Комиссариат — Ратуша, Канцелярия в центре.
  // Все 6 участков Города — на отрезках между парами локаций, связи не пересекаются.
  underground: [480, 170],
  commissariat: [1568, 170],
  chancery: [1024, 290],
  cityHall: [1024, 750],
  mine: dn([520, 830]),
  lair: dn([740, 1200]),
  witchCircle: dn([290, 1380]),
  market: dn([1467, 840]),
  tavern: dn([1695, 1196]),
  mass: dn([1317, 1365]),
});

/** Карточка локации (крупнее для читаемости на ноутбуке, 22.11). */
export const CARD = { width: 400, height: 280 } as const; // автор 24.11: шире на 40 (было 360)

/**
 * Центры гексов участков (id из PLOTS). Подобраны так, чтобы от каждой карточки локации был зазор
 * не меньше 50 — пунктир связи виден (22.11).
 */
export const PLOT_CENTERS: Record<string, Pt> = mapPt({
  'city-underground-commissariat': [1024, 65],
  'city-underground-chancery': [752, 225],
  'city-chancery-commissariat': [1296, 225],
  'city-underground-cityHall': [744, 520],
  'city-commissariat-cityHall': [1304, 520],
  'city-chancery-cityHall': [1024, 520],
  'forest-mine': dn([287, 735]),
  'forest-mine-lair': dn([757, 917]),
  'forest-mine-witchCircle': dn([235, 1050]),
  'forest-witchCircle': dn([528, 1490]),
  'forest-lair': dn([760, 1450]),
  'forest-lair-witchCircle': dn([514, 1225]),
  'valley-market': dn([1231, 905]),
  'valley-market-tavern': dn([1703, 940]),
  'valley-mass': dn([1215, 1110]),
  'valley-mass-tavern': dn([1553, 1430]),
  'valley-mass-market': dn([1360, 1102]),
  'valley-tavern': dn([1760, 1470]),
});

export const HEX_R = 58;

/**
 * Два места на звезде (автор 24.11: 3–4 игрока): сдвиг каждого места от центра звезды и радиус.
 * В Долине звезду обступают Таверна, Рынок и участки — места стоят вертикально и чуть меньше.
 */
export const STAR_PAIRS: Record<RegionId, { dx: number; dy: number; r: number; shiftY: number }> = {
  city: { dx: 70, dy: 0, r: 62, shiftY: 0 },
  forest: { dx: 70, dy: 0, r: 62, shiftY: 0 },
  valley: { dx: 0, dy: 62, r: 54, shiftY: 10 },
};

/** Места Цитаделей — в середине пространства между локациями своего региона. */
export const STARS: Record<RegionId, Pt> = mapPt({
  // Под Подпольем: центр Города занят Канцелярией.
  city: [480, 470],
  forest: dn([430, 1075]),
  valley: dn([1500, 1110]),
});

/** Треки влияния: левый верхний угол и ширина колонки; клетки сверху вниз от максимума. */
export const TRACK_BOXES: Record<RegionId, { x: number; y: number; w: number; cell: number }> = {
  city: { x: 1775 * SX, y: 30, w: 200, cell: 56 },
  forest: { x: 8, y: 640 + CITY_DY, w: 200, cell: 56 },
  // Ниже, чем раньше: над ней колонка трека Города стала выше (треки крупнее, автор 24.11).
  valley: { x: 1838 * SX - 5, y: 720 + CITY_DY, w: 200, cell: 56 },
};

/** Плашка «вход в Город» (с подписью «Вход»), по центру острия Города. */
export const CITY_ENTRY_BOX = { x: 992 * SX - 125, y: 925, w: 250, h: 76 } as const;

export function points(shape: readonly Pt[]): string {
  return shape.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Вершины шестиугольника с острыми боками (как на картоне). */
export function hexPoints([cx, cy]: Pt, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/** Пятиконечная звезда. */
export function starPoints([cx, cy]: Pt, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (Math.PI / 5) * i;
    return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}
