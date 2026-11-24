import { CHARACTER_ORDER } from '@vampire/data';
import { CharacterCard, type CardSize } from './CharacterCard';

/** Страница проверки карт (?cards): все персонажи в трёх размерах. */
const SIZES: { size: CardSize; width: number; title: string }[] = [
  { size: 'lg', width: 260, title: 'Большой — драфт и лупа' },
  { size: 'md', width: 180, title: 'Средний — окно улучшения' },
  { size: 'sm', width: 110, title: 'Маленький — панель игрока' },
];

export function CardsPreview() {
  return (
    <div style={{ padding: 24, color: '#ece6f2', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: "'Cormorant SC', serif", margin: '0 0 4px' }}>Карты персонажей</h1>
      {SIZES.map(({ size, width, title }) => (
        <section key={size} style={{ margin: '24px 0 36px' }}>
          <h2 style={{ fontFamily: "'Cormorant SC', serif", margin: '0 0 12px' }}>{title}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {CHARACTER_ORDER.map((id) => (
              <div key={id} style={{ width }}>
                <CharacterCard id={id} size={size} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
