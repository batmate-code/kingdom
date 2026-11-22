import type { CharacterId } from '@vampire/data';

/** Картинки карт персонажей из docs/images/cards (по id персонажа; рубашка — _back). */
const CARD_URLS = import.meta.glob('../../../docs/images/cards/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function cardUrl(id: CharacterId | '_back'): string | undefined {
  return Object.entries(CARD_URLS).find(([path]) => path.endsWith(`/${id}.jpg`))?.[1];
}
