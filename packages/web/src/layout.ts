import type { LocationId, RegionId } from '@vampire/data';

/**
 * Расположение на схеме региона — по картону (docs/images/board.jpg), в процентах от рамки
 * региона: локации, участки (id из data) и звезда Цитадели. Только интерфейс, не правила.
 */
export interface RegionLayout {
  /** Высота рамки региона в пикселях. */
  height: number;
  locations: Partial<Record<LocationId, [number, number]>>;
  plots: Record<string, [number, number]>;
  star: [number, number];
}

export const LAYOUT: Record<RegionId, RegionLayout> = {
  city: {
    height: 380,
    locations: {
      underground: [28, 20],
      commissariat: [70, 20],
      chancery: [33, 64],
      cityHall: [80, 64],
    },
    plots: {
      'city-underground-chancery': [9, 42],
      'city-underground-commissariat': [49, 12],
      'city-commissariat-cityHall': [93, 30],
      'city-chancery': [50, 92],
      'city-cityHall': [62, 84],
    },
    star: [55, 50],
  },
  forest: {
    height: 470,
    locations: {
      mine: [38, 24],
      witchCircle: [26, 72],
      lair: [72, 60],
    },
    plots: {
      'forest-mine': [10, 10],
      'forest-mine-lair': [78, 24],
      'forest-mine-witchCircle': [9, 48],
      'forest-witchCircle': [30, 96],
      'forest-lair': [74, 92],
    },
    star: [50, 46],
  },
  valley: {
    height: 470,
    locations: {
      market: [44, 18],
      mass: [28, 72],
      tavern: [74, 58],
    },
    plots: {
      'valley-market': [10, 18],
      'valley-market-tavern': [82, 30],
      'valley-mass': [9, 46],
      'valley-mass-tavern': [55, 94],
      'valley-tavern': [90, 86],
    },
    star: [52, 44],
  },
};
