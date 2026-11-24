import { CHARACTERS, UPKEEP_TIERS, type CharacterId, type Resources } from '@vampire/data';
import type { CSSProperties } from 'react';
import { artUrl } from './cards';
import styles from './CharacterCard.module.css';
import { Icon, RichText } from './Icon';

/**
 * Насколько подробно: lg — драфт и лупа (с подписями), md — окно улучшения,
 * sm — пары рабочих на панели (без текста свойства: в таком размере он не читается).
 */
export type CardSize = 'lg' | 'md' | 'sm';

/** Сколько букв названия помещается в строку без уменьшения шрифта. */
const NAME_FIT: Record<CardSize, number> = { lg: 12, md: 12, sm: 8 };

const RES_ICON = { gold: 'gold', blood: 'blood', ore: 'ore', compromat: 'compromat' } as const;

function Severance({ value }: { value: Partial<Resources> }) {
  const parts = Object.entries(value).filter(([, n]) => (n ?? 0) > 0) as [
    keyof Resources,
    number,
  ][];
  if (parts.length === 0) return <span className={styles.none}>—</span>;
  return (
    <>
      {parts.map(([k, n]) => (
        <span key={k} className={styles.res}>
          +{n}
          <Icon name={RES_ICON[k]} />
        </span>
      ))}
    </>
  );
}

/**
 * Карта персонажа, собранная из данных (стиль «Пергамент», выбор автора 23.11): название, текст
 * свойства, содержание, отступные и престиж берутся из @vampire/data — после правки чисел правил
 * карта обновится сама. Картинка — только арт автора. Ширина — по контейнеру.
 */
export function CharacterCard({ id, size = 'lg' }: { id: CharacterId; size?: CardSize }) {
  const c = CHARACTERS[id];
  const tier = UPKEEP_TIERS.find((t) => t.upkeep === c.upkeep);
  const art = artUrl(id);
  return (
    <div className={styles.frame}>
      <div className={`${styles.card} ${styles.parchment} ${styles[size]}`}>
        <div
          className={styles.art}
          style={art ? { backgroundImage: `url(${art})` } : undefined}
          role="img"
          aria-label={c.name}
        />
        <div className={styles.upkeep} title={`Содержание: ${c.upkeep} крови за раунд`}>
          {c.upkeep === 0 ? (
            <span className={styles.free}>0</span>
          ) : (
            Array.from({ length: c.upkeep }, (_, i) => <Icon key={i} name="blood" />)
          )}
        </div>
        {/* Длинное название уменьшается, чтобы влезть в строку. */}
        <div
          className={styles.name}
          style={{ '--fit': Math.min(1, NAME_FIT[size] / c.name.length) } as CSSProperties}
        >
          {c.name}
        </div>
        {size !== 'sm' && (
          <div className={styles.text}>
            {/* Обёртка: иначе куски текста и значки стали бы отдельными колонками flex. */}
            <span>
              <RichText text={c.text} />
            </span>
          </div>
        )}
        {tier && (
          <div className={styles.footer}>
            <span className={styles.cell} title="Отступные при сбросе">
              {size === 'lg' && <span className={styles.label}>сброс</span>}
              <Severance value={tier.severance} />
            </span>
            <span className={styles.cell} title="Престиж в конце игры">
              {size === 'lg' && <span className={styles.label}>в конце</span>}
              <span className={styles.res}>
                {tier.endPrestige}
                <Icon name="prestige" />
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
