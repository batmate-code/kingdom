import {
  CHARACTERS,
  CHARACTER_ORDER,
  LOCATIONS,
  LOCATION_ORDER,
  REGION_ORDER,
  REGIONS,
  TRACKS,
} from '@vampire/data';
import type { AggregateStats } from './stats';

type Res = 'gold' | 'blood' | 'ore' | 'compromat';
const RES: readonly Res[] = ['gold', 'blood', 'ore', 'compromat'];
const RES_NAME: Record<Res, string> = {
  gold: 'Золото',
  blood: 'Кровь',
  ore: 'Руда',
  compromat: 'Компромат',
};

/** Причины изменения ресурсов по-русски (для отчёта). */
export const REASON_NAME: Record<string, string> = {
  location: 'действие локации',
  lairStash: 'копилка Логова',
  lairExchange: 'Логово (кровь → руда)',
  mass: 'Месса',
  market: 'Рынок',
  chancery: 'Канцелярия',
  copy: 'Подполье (плата)',
  revive: 'Комиссариат (возврат)',
  cityHall: 'Ратуша',
  cityEntry: 'вход в Город',
  displaced: 'компенсация за вытеснение',
  executioner: 'компенсация от Палача',
  severance: 'отступные',
  upkeep: 'содержание',
  build: 'стройка',
  abbey: 'Аббатство',
  shop: 'Торговая лавка',
  cityCitadel: 'Цитадель Города',
  character: 'эффекты персонажей',
  snitch: 'Доносчик',
  oreBaron: 'Рудный барон',
};

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : '—');

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** Отчёт в Markdown: локации, персонажи, ресурсы. Доли — на партию или на игрока. */
export function renderReport(s: AggregateStats, title: string): string {
  const g = Math.max(1, s.games);
  const perPlayer = Math.max(1, s.playerSlots);
  /** Доля мест-победителей среди всех мест: «нормальная» доля побед. */
  const baseWin = s.winnerSlots / perPlayer;
  const out: string[] = [
    `# ${title}`,
    '',
    `Партий: ${s.games}. Ожидаемая доля побед игрока: ${pct(baseWin)}.`,
    '',
  ];

  // Локации
  const totalPlacements = LOCATION_ORDER.reduce(
    (sum, id) => sum + (s.locations[id]?.placements.reduce((a, b) => a + b, 0) ?? 0),
    0,
  );
  out.push('## Локации', '');
  out.push(
    'Размещений за партию по слотам, доля от всех размещений, доля размещений победителей (выше нормы — локация «выигрышная»), вытеснения и пропуски действия.',
    '',
  );
  out.push(
    table(
      [
        'Локация',
        'Слот 1 / партию',
        'Слот 2 / партию',
        'Доля размещений',
        'У победителей (норма ' + pct(baseWin) + ')',
        'Вытеснений / партию',
        'Пропуск действия',
        'Копий / партию',
      ],
      LOCATION_ORDER.map((id) => {
        const l = s.locations[id] ?? {
          placements: [0, 0],
          winnerPlacements: 0,
          displaced: 0,
          skipped: 0,
          copied: 0,
        };
        const placed = l.placements[0] + l.placements[1];
        return [
          LOCATIONS[id].name,
          f2(l.placements[0] / g),
          f2(l.placements[1] / g),
          pct(placed / Math.max(1, totalPlacements)),
          pct(l.winnerPlacements / Math.max(1, placed)),
          f2(l.displaced / g),
          pct(l.skipped / Math.max(1, placed)),
          f2(l.copied / g),
        ];
      }),
    ),
    '',
  );

  // Персонажи
  out.push('## Персонажи', '');
  out.push(
    'Как часто берут, когда выложен; доля побед у тех, кто держал персонажа к концу (норма ' +
      pct(baseWin) +
      '); средние ПО владельца; как часто сбрасывают на содержании после назначения.',
    '',
  );
  const charRows = CHARACTER_ORDER.map((id) => {
    const c = s.characters[id] ?? {
      offered: 0,
      drafted: 0,
      draftedByWinner: 0,
      assigned: 0,
      triggered: 0,
      discardedUpkeep: 0,
      discardedDraft: 0,
      replaced: 0,
      heldAtEnd: 0,
      heldAtEndByWinner: 0,
      heldAtEndVp: 0,
    };
    return {
      id,
      winHeld: c.heldAtEndByWinner / Math.max(1, c.heldAtEnd),
      row: [
        `${CHARACTERS[id].name} (${CHARACTERS[id].upkeep})`,
        pct(c.drafted / Math.max(1, c.offered)),
        pct(c.draftedByWinner / Math.max(1, c.drafted)),
        f2(c.heldAtEnd / g),
        c.heldAtEnd ? pct(c.heldAtEndByWinner / c.heldAtEnd) : '—',
        c.heldAtEnd ? f1(c.heldAtEndVp / c.heldAtEnd) : '—',
        pct(c.discardedUpkeep / Math.max(1, c.assigned)),
        f2(c.triggered / g),
      ],
    };
  }).sort((a, b) => b.winHeld - a.winHeld);
  out.push(
    table(
      [
        'Персонаж (содержание)',
        'Берут при выкладке',
        'Взят победителем',
        'Держат к концу / партию',
        'Побед у держателя',
        'ПО держателя',
        'Сброс на содержании',
        'Срабатываний / партию',
      ],
      charRows.map((r) => r.row),
    ),
    '',
    `Пар сброшено на содержании: ${f2(s.upkeepDiscards / g)} за партию.`,
    '',
  );

  // Ресурсы
  out.push('## Ресурсы', '');
  out.push(
    'На игрока за партию: сколько получено и потрачено, сколько осталось неистраченным в конце.',
    '',
  );
  out.push(
    table(
      ['Ресурс', 'Получено', 'Потрачено', 'Осталось в конце', 'Осталось у победителя'],
      RES.map((r) => {
        const x = s.resources[r];
        const gained = Object.values(x.gained).reduce((a, b) => a + b, 0);
        const spent = Object.values(x.spent).reduce((a, b) => a + b, 0);
        return [
          RES_NAME[r],
          f1(gained / perPlayer),
          f1(spent / perPlayer),
          f1(x.leftAtEnd / perPlayer),
          f1(x.leftAtEndWinners / Math.max(1, s.winnerSlots)),
        ];
      }),
    ),
    '',
  );
  for (const r of RES) {
    const x = s.resources[r];
    const rows = (bucket: Record<string, number>) =>
      Object.entries(bucket)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, v]) => `${REASON_NAME[reason] ?? reason} ${f2(v / perPlayer)}`)
        .join(', ') || '—';
    out.push(`**${RES_NAME[r]}.** Откуда: ${rows(x.gained)}. Куда: ${rows(x.spent)}.`, '');
  }
  out.push('Запас на игрока в конце раунда:', '');
  const rounds = Math.max(...RES.map((r) => s.stockByRound[r].length));
  out.push(
    table(
      ['Ресурс', ...Array.from({ length: rounds }, (_, i) => `Р${i + 1}`)],
      RES.map((r) => [
        RES_NAME[r],
        ...Array.from({ length: rounds }, (_, i) => f1((s.stockByRound[r][i] ?? 0) / perPlayer)),
      ]),
    ),
    '',
  );
  // Влияние
  const INF_REASON: Record<string, string> = {
    combat: 'победа в бою',
    combatBonus: 'награда за бой',
    domination: 'Доминирование',
    cityHall: 'Ратуша',
    diplomat: 'Дипломат',
    manipulator: 'Манипулятор',
    renegade: 'Ренегат',
    blackmailer: 'Шантажист',
    patron: 'Меценат',
  };
  out.push('## Влияние', '');
  out.push(
    'На игрока за партию: приход влияния по источникам, итог в конце; доля игроков, дошедших до каждой отметки ПО; как часто разыгрывается жетон первенства и строится Цитадель.',
    '',
  );
  out.push(
    table(
      [
        'Регион',
        'Итог у игрока',
        'Итог у победителя',
        'Отметки (доля игроков)',
        'Первенство',
        'Цитадель',
        'Источники',
      ],
      REGION_ORDER.map((region) => {
        const x = s.influence[region];
        const name = REGIONS.find((r) => r.id === region)?.name ?? region;
        if (!x) return [name, '—', '—', '—', '—', '—', '—'];
        const marks = TRACKS[region].vpMarks
          .map((m) => `${m}: ${pct((x.reached[String(m)] ?? 0) / perPlayer)}`)
          .join(', ');
        const sources = Object.entries(x.gained)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${INF_REASON[k] ?? k} ${f2(v / perPlayer)}`)
          .join(', ');
        return [
          name,
          f1(x.final / perPlayer),
          f1(x.finalWinners / Math.max(1, s.winnerSlots)),
          marks,
          pct(x.firstToMax / g),
          pct(x.citadels / g),
          sources || '—',
        ];
      }),
    ),
    '',
  );
  return out.join('\n');
}
