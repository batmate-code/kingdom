import {
  BUILDINGS,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  GAME,
  CHARACTERS,
  PLOTS,
  CHARACTER_ORDER,
  LOCATIONS,
  LOCATION_ORDER,
  REGION_ORDER,
  REVERSE_TRACK,
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
  trackBoost: 'бонус трека',
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
      draftedRoundSum: 0,
      draftedOrderSum: 0,
      draftedByRound: [],
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
        c.drafted ? f1(c.draftedRoundSum / c.drafted) : '—',
        c.drafted ? f1(c.draftedOrderSum / c.drafted) : '—',
        Array.from({ length: GAME.rounds }, (_, i) => c.draftedByRound[i] ?? 0).join(' / '),
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
        'Средний раунд пика',
        'Очерёдность пика в раунде',
        'Пиков по раундам 1–6',
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
  out.push('Запас на игрока в конце раунда (в скобках — у победителя):', '');
  const rounds = Math.max(...RES.map((r) => s.stockByRound[r].length));
  out.push(
    table(
      ['Ресурс', ...Array.from({ length: rounds }, (_, i) => `Р${i + 1}`)],
      RES.map((r) => [
        RES_NAME[r],
        ...Array.from(
          { length: rounds },
          (_, i) =>
            `${f1((s.stockByRound[r][i] ?? 0) / perPlayer)} (${f1((s.stockByRoundWinners[r][i] ?? 0) / Math.max(1, s.winnerSlots))})`,
        ),
      ]),
    ),
    '',
  );
  out.push(
    `Рабочих в госпитале (максимум за раунд, на партию, все игроки): ${Array.from(
      { length: rounds },
      (_, i) => `Р${i + 1} ${f2((s.hospitalByRound[i] ?? 0) / g)}`,
    ).join(', ')}.`,
    '',
  );
  // Влияние
  const INF_REASON: Record<string, string> = {
    combat: 'победа в бою',
    combatBonus: 'награда за бой',
    domination: 'Доминация',
    cityHall: 'Ратуша',
    diplomat: 'Дипломат',
    manipulator: 'Манипулятор',
    renegade: 'Ренегат',
    blackmailer: 'Шантажист',
    patron: 'Меценат',
    decoy: 'Приманка',
    retreat: 'Отступление',
    obelisk: 'Обелиск',
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
  // Участки
  // Здания на звезде региона и ПО Шпиля (эксперимент influenceModel=reverse).
  const mons = s.monuments ?? {};
  if (Object.keys(mons).length > 0) {
    out.push('## Здания на звезде', '');
    out.push(
      'Сколько построено за партию, доля у победителей (норма ' +
        pct(baseWin) +
        '); ПО, которые принёс Шпиль (эксперимент обратных треков).',
      '',
    );
    const names: Record<string, string> = { citadel: 'Цитадель / Шпиль', obelisk: 'Обелиск' };
    out.push(
      table(
        [
          'Здание',
          'Построено / партию',
          'У победителей',
          'ПО Шпиля / партию',
          'ПО Шпиля у победителей',
        ],
        Object.entries(mons).map(([k, m]) => [
          names[k] ?? k,
          f2(m.built / g),
          pct(m.byWinner / Math.max(1, m.built)),
          m.vp ? f2(m.vp / g) : '—',
          m.vp ? pct(m.vpByWinner / m.vp) : '—',
        ]),
      ),
      '',
    );
  }

  // Спуск по трекам ниже 0 (обратные треки).
  const ds = s.descent;
  if (ds && (ds.wentBelowZero > 0 || Object.keys(ds.marks).length > 0)) {
    const pairs = s.playerSlots * REGION_ORDER.length;
    const winnerPairs = s.winnerSlots * REGION_ORDER.length;
    out.push('## Спуск по трекам', '');
    out.push(
      '«Игроко-регион» — один игрок в одном регионе (на партию их игроков × 3). Сколько из них хоть раз уходили ниже 0, какой минимум влияния был за партию, кто опускал ниже 0 и какие отметки снизу срабатывали.',
      '',
    );
    out.push(
      `Уходили ниже 0: ${f2(ds.wentBelowZero / g)} игроко-региона за партию (${pct(ds.wentBelowZero / pairs)} всех; у победителей ${pct(ds.wentBelowZeroWinners / Math.max(1, winnerPairs))}). Закончили партию ниже 0: ${f2(ds.endBelowZero / g)} за партию.`,
      '',
    );
    out.push(
      table(
        ['Минимум за партию', '−1', '−2', '−3', '−4'],
        [
          [
            'Игроко-регионов / партию',
            ...['-1', '-2', '-3', '-4'].map((k) => f2((ds.minReached[k] ?? 0) / g)),
          ],
        ],
      ),
      '',
    );
    const reasons = Object.entries(ds.belowZeroByReason).sort((a, b) => b[1] - a[1]);
    if (reasons.length > 0) {
      out.push(
        `Кто опускает ниже 0 (единиц влияния за партию): ${reasons
          .map(([k, v]) => `${INF_REASON[k] ?? k} ${f2(v / g)}`)
          .join(', ')}.`,
        '',
      );
    }
    out.push(
      table(
        ['Отметка снизу', 'Награда', 'Срабатываний / партию', 'У победителей'],
        REVERSE_TRACK.marks.map((m) => {
          const n = ds.marks[String(m.at)] ?? 0;
          const reward =
            m.reward.kind === 'ore'
              ? `${m.reward.ore} руда`
              : m.reward.kind === 'buildRight'
                ? 'право стройки'
                : m.reward.kind === 'strength'
                  ? `+${m.reward.strength} сила навсегда`
                  : 'право на Обелиск';
          return [
            String(m.at),
            reward + (m.once ? ' (раз)' : ''),
            f2(n / g),
            pct((ds.marksWinners[String(m.at)] ?? 0) / Math.max(1, n)),
          ];
        }),
      ),
      '',
    );
  }

  // Жетоны боя: частота и доля выигранных боёв у сыгравшего.
  const tokens = s.combatTokens ?? {};
  if (Object.keys(tokens).length > 0) {
    out.push('## Жетоны боя', '');
    out.push(
      'Сколько раз сыгран за партию (все игроки), доля боёв, выигранных сыгравшим; у Приманки в эксперименте — выбранная потеря влияния.',
      '',
    );
    out.push(
      table(
        ['Жетон', 'Сыгран / партию', 'Бой выигран', 'Приманка: потеря 0 / 1 / 2'],
        COMBAT_TOKEN_ORDER.filter((t) => tokens[t]).map((t) => {
          const c = tokens[t]!;
          return [
            COMBAT_TOKENS[t].name,
            f2(c.played / g),
            pct(c.won / Math.max(1, c.played)),
            c.decoyLoss.length > 0 ? [0, 1, 2].map((i) => c.decoyLoss[i] ?? 0).join(' / ') : '—',
          ];
        }),
      ),
      '',
    );
  }

  out.push('## Участки', '');
  out.push(
    'Как часто участок застраивается за партию (не больше одного здания на участок), в каком раунде в среднем, доля построек у победителей и какие здания. Двойные участки — с доплатой; Цитадели — на звёздах.',
    '',
  );
  const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;
  const keys = [...PLOTS.map((p) => p.id), ...REGION_ORDER.map((r) => `citadel-${r}`)];
  out.push(
    table(
      ['Участок', 'Тип', 'Застроен', 'Раунд', 'У победителей', 'Здания'],
      keys.map((key) => {
        const plot = PLOTS.find((p) => p.id === key);
        const kind = plot ? (plot.adjacent.length > 1 ? 'двойной' : 'одиночный') : 'Цитадель';
        const name = plot
          ? `${regionName(plot.region)}: ${plot.adjacent.map((l) => LOCATIONS[l].name).join(' + ')}`
          : `Цитадель: ${regionName(key.replace('citadel-', ''))}`;
        const x = s.plots[key];
        if (!x) return [name, kind, '0%', '—', '—', '—'];
        const buildings = Object.entries(x.buildings)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([b, n]) => `${BUILDINGS[b as keyof typeof BUILDINGS]?.name ?? b} ${pct(n / x.built)}`,
          )
          .join(', ');
        return [
          name,
          kind,
          pct(x.built / g),
          f1(x.round / x.built),
          pct(x.byWinner / x.built),
          buildings,
        ];
      }),
    ),
    '',
    `Норма доли у победителей: ${pct(s.winnerSlots / Math.max(1, s.playerSlots))}.`,
    '',
  );
  const builtWhere = (pred: (key: string) => boolean) =>
    Object.entries(s.plots)
      .filter(([k]) => pred(k))
      .reduce((a, [, x]) => a + x.built, 0) / g;
  const adjacentCount = (k: string) => PLOTS.find((p) => p.id === k)?.adjacent.length ?? 0;
  out.push(
    `Построек за партию: одиночные участки ${f2(builtWhere((k) => adjacentCount(k) === 1))}, двойные ${f2(builtWhere((k) => adjacentCount(k) > 1))}, Цитадели ${f2(builtWhere((k) => k.startsWith('citadel-')))}.`,
    '',
  );
  return out.join('\n');
}
