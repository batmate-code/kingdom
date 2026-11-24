import type { CharacterId } from '@vampire/data';

/** Арты персонажей автора (1200 × 900, WebP) — по id персонажа. */
const ART_URLS = import.meta.glob('./assets/art/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Прежние карты-картинки: сейчас нужна только рубашка (_back). */
const CARD_URLS = import.meta.glob('../../../docs/images/cards/_back.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function artUrl(id: CharacterId): string | undefined {
  return ART_URLS[`./assets/art/${id}.webp`];
}

/** Рубашка карты (рабочий без улучшения). */
export function backUrl(): string | undefined {
  return Object.values(CARD_URLS)[0];
}
