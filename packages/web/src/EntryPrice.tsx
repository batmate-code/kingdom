import { cityEntryPrice } from '@vampire/core';
import type { Resources } from '@vampire/data';
import { Icon } from './Icon';

type View = Parameters<typeof cityEntryPrice>[0];

/** Текущая цена входа в Город иконками: «1 [кровь] 2 [золото]». */
export function EntryPrice({ view, size }: { view: View; size?: number }) {
  const price = cityEntryPrice(view);
  const parts = (Object.keys(price) as (keyof Resources)[]).filter((k) => price[k]);
  return (
    <>
      {parts.map((k) => (
        <span key={k}>
          {price[k]} <Icon name={k} {...(size !== undefined ? { size } : {})} />{' '}
        </span>
      ))}
    </>
  );
}
