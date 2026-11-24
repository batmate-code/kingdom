import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from './Icon';

describe('Текст со значками', () => {
  it('«Жетон силы» во всех формах — один значок (автор 23.11)', () => {
    for (const text of [
      'Положить 1 жетон силы',
      'Положить 2 жетона силы',
      'Убрать 5 жетонов силы',
    ]) {
      const html = renderToStaticMarkup(<RichText text={text} />);
      expect(html).toContain('alt="Жетон силы"');
      expect(html.replace(/<[^>]*>/g, '')).not.toContain('силы');
    }
  });

  it('Без фразы значок жетона не появляется; слово «сила» остаётся текстом', () => {
    const html = renderToStaticMarkup(<RichText text="если у соперника там сила на 2+ больше" />);
    expect(html).not.toContain('Жетон силы');
    expect(html).toContain('сила');
  });
});
