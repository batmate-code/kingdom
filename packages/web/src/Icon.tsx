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
import ore from './assets/icons/ore.svg';
import prestige from './assets/icons/prestige.svg';
import revive from './assets/icons/revive.svg';
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
  revive: { src: revive, title: 'Вернуть из госпиталя' },
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

/** Текст с иконками вместо названий ресурсов («+3 зол» → «+3 [золото]»). */
export function RichText({ text }: { text: string }): ReactNode {
  // Делим на слова кириллицы и остальное, чтобы не задеть части слов («круг», «Город»).
  const parts = text.split(/([А-Яа-яЁё]+)/);
  return (
    <>
      {parts.map((part, i) => {
        const hit = WORDS.find(([re]) => re.test(part));
        return hit ? <Icon key={i} name={hit[1]} /> : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
