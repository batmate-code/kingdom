import { Fragment, type ReactNode } from 'react';
import blood from './assets/icons/blood.svg';
import build from './assets/icons/build.svg';
import citadelOpen from './assets/icons/citadel-open.svg';
import citadel from './assets/icons/citadel.svg';
import cityEntryRaise from './assets/icons/city-entry-raise.svg';
import cityEntry from './assets/icons/city-entry.svg';
import compromat from './assets/icons/compromat.svg';
import gold from './assets/icons/gold.svg';
import influenceMinus from './assets/icons/influence-minus.svg';
import influence from './assets/icons/influence.svg';
import obeliskOpen from './assets/icons/obelisk-open.svg';
import obelisk from './assets/icons/obelisk.svg';
import spireOpen from './assets/icons/spire-open.svg';
import spire from './assets/icons/spire.svg';
import ore from './assets/icons/ore.svg';
import prestige from './assets/icons/prestige.svg';
import revive from './assets/icons/revive.svg';
import strengthToken from './assets/icons/strength-token.svg';
import vp from './assets/icons/vp.svg';
import styles from './Icon.module.css';

/** Иконки автора (docs/images/icons, соответствие — по легенде). */
const ICONS = {
  gold: { src: gold, title: 'Золото' },
  blood: { src: blood, title: 'Кровь' },
  ore: { src: ore, title: 'Руда' },
  compromat: { src: compromat, title: 'Компромат' },
  prestige: { src: prestige, title: 'Престиж' },
  vp: { src: vp, title: 'ПО' },
  influence: { src: influence, title: 'Влияние' },
  influenceMinus: { src: influenceMinus, title: 'Потеря влияния' },
  build: { src: build, title: 'Стройка' },
  citadel: { src: citadel, title: 'Цитадель' },
  citadelOpen: { src: citadelOpen, title: 'Цитадель доступна' },
  obelisk: { src: obelisk, title: 'Обелиск' },
  obeliskOpen: { src: obeliskOpen, title: 'Обелиск доступен' },
  spire: { src: spire, title: 'Шпиль' },
  spireOpen: { src: spireOpen, title: 'Шпиль доступен' },
  revive: { src: revive, title: 'Вернуть из госпиталя' },
  strengthToken: { src: strengthToken, title: 'Жетон силы' },
  cityEntry: { src: cityEntry, title: 'Вход в Город' },
  cityEntryRaise: { src: cityEntryRaise, title: 'Вход в Город дорожает' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  const icon = ICONS[name];
  return (
    <img
      className={styles.icon}
      src={icon.src}
      alt={icon.title}
      title={icon.title}
      style={size ? { height: size } : undefined}
    />
  );
}

/** Слова и сокращения, которые заменяются иконками в тексте интерфейса. */
const WORDS: [RegExp, IconName][] = [
  [/^(зол|золото|золота)$/i, 'gold'],
  [/^(кр|кровь|крови)$/i, 'blood'],
  [/^(руд|руда|руды|руду)$/i, 'ore'],
  [/^(комп|компромат|компромата)$/i, 'compromat'],
  [/^(вл|влияние|влияния)$/i, 'influence'],
  [/^(престиж|престижа)$/i, 'prestige'],
  [/^(ПО)$/, 'vp'],
  [/^(стройка|стройки)$/i, 'build'],
];

/** Метка фразы «жетон силы» внутри RichText (символ, которого нет в текстах). */
const TOKEN_MARK = '\u0001';

/** Текст с иконками вместо названий ресурсов («+3 зол» → «+3 [золото]»). */
export function RichText({ text }: { text: string }): ReactNode {
  // Делим на слова кириллицы и остальное, чтобы не задеть части слов («круг», «Город»).
  // «Жетон силы» — два слова, один значок (автор 23.11): заменяем фразу меткой до разбиения.
  const marked = text.replace(/жетон(?:а|ов)? силы/gi, TOKEN_MARK);
  const parts = marked.split(new RegExp(`([А-Яа-яЁё]+|${TOKEN_MARK})`));
  const iconOf = (part: string): IconName | null =>
    part === TOKEN_MARK ? 'strengthToken' : (WORDS.find(([re]) => re.test(part))?.[1] ?? null);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (!iconOf(part)) {
      // Число перед значком («получить 3 [зол]») не отрывается от него переносом строки.
      if (parts[i + 1] !== undefined && iconOf(parts[i + 1]!)) {
        const tail = /\S*\s?$/.exec(part)?.[0] ?? '';
        if (part.length > tail.length)
          out.push(<Fragment key={i}>{part.slice(0, part.length - tail.length)}</Fragment>);
        out.push(
          <span key={`${i}+`} className={styles.nowrap}>
            {tail}
            <Icon name={iconOf(parts[i + 1]!)!} />
          </span>,
        );
        return;
      }
      out.push(<Fragment key={i}>{part}</Fragment>);
      return;
    }
    // Слово-значок уже выведено вместе с текстом перед ним (split ставит текст перед каждым).
  });
  return <>{out}</>;
}
