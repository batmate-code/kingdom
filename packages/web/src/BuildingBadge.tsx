import type { BuildingId } from '@vampire/data';
import citadelIcon from './assets/icons/citadel.svg';
import obeliskIcon from './assets/icons/obelisk.svg';
import spireIcon from './assets/icons/spire.svg';
import { BuildingGlyph } from './board/BoardSvg';
import styles from './BuildingBadge.module.css';

/** Светлый цвет силуэтов на тёмном планшете. */
const LIGHT = '#eadcc0';
/** Детали силуэта (окна, двери) — цветом фона планшета. */
const HOLE = '#1a1520';

/**
 * Здание на планшете (решение автора 24.11): светлый силуэт без фона и рамки — те же силуэты,
 * что на поле. Склеп, Аббатство и Лавка — силуэты участков; Цитадель, Шпиль и Обелиск — значки
 * звезды региона, высветленные фильтром.
 */
export function BuildingBadge({
  type,
  spire = false,
  size = 40,
}: {
  type: BuildingId;
  /** Цитадель в эксперименте «обратные треки» — Шпиль. */
  spire?: boolean;
  size?: number;
}) {
  const icon =
    type === 'obelisk'
      ? obeliskIcon
      : type === 'citadel'
        ? spire
          ? spireIcon
          : citadelIcon
        : null;
  if (icon) {
    return <img className={styles.light} src={icon} alt="" style={{ height: size }} />;
  }
  return (
    <svg viewBox="-24 -32 48 50" width={size} height={size} aria-hidden>
      <BuildingGlyph type={type} cx={0} cy={0} ink={LIGHT} detail={HOLE} />
    </svg>
  );
}
