import type {
  Action,
  BuildChoice,
  CharacterChoice,
  Decision,
  GameEvent,
  LocationChoice,
  Worker,
} from './types';
import {
  BUILDINGS,
  CHARACTERS,
  COMBAT_TOKENS,
  LOCATIONS,
  PLOTS,
  PROFESSIONS,
  REGIONS,
  type LocationId,
  type RegionId,
  type Resources,
} from '@vampire/data';

/**
 * Названия и подписи по-русски для интерфейсов (веб, консольная игра агента).
 * Принимают и состояние, и наблюдение игрока: нужны только рабочие и текущее решение.
 */
type View = { workers: readonly Worker[]; pending: Decision | null };

export const regionName = (r: RegionId) => REGIONS.find((x) => x.id === r)?.name ?? r;
export const locName = (l: LocationId) => LOCATIONS[l].name;
export const playerName = (p: number) => `Игрок ${p + 1}`;

const RES_SHORT: Record<keyof Resources, string> = {
  gold: 'зол',
  blood: 'кр',
  ore: 'руд',
  compromat: 'комп',
};

export function resText(r: Partial<Resources>): string {
  const parts = (Object.keys(RES_SHORT) as (keyof Resources)[])
    .filter((k) => r[k])
    .map((k) => `${r[k]! > 0 ? '+' : ''}${r[k]} ${RES_SHORT[k]}`);
  return parts.join(', ') || '—';
}

export function workerLabel(w: Worker | undefined): string {
  if (!w) return '?';
  const num = Number(w.id.split('w')[1] ?? 0) + 1;
  if (!w.character || !w.profession) return `рабочий ${num}`;
  return `${CHARACTERS[w.character].name} / ${PROFESSIONS[w.profession].name}`;
}

const workerOf = (s: View, id: string) => s.workers.find((w) => w.id === id);

function plotName(plot: string | null, region: RegionId): string {
  if (plot === null) return `звезда (${regionName(region)})`;
  const p = PLOTS.find((x) => x.id === plot);
  return p ? p.adjacent.map(locName).join('–') : plot;
}

export function buildLabel(b: BuildChoice): string {
  return `${BUILDINGS[b.building].name}: ${plotName(b.plot, b.region)}${b.alchemy ? ' (Алхимик)' : ''}`;
}

function locationChoiceLabel(c: LocationChoice): string {
  switch (c.kind) {
    case 'skip':
      return 'Пропустить действие';
    case 'gain':
      return 'Получить';
    case 'lairStash':
      return c.exchanges ? `Забрать копилку + ${c.exchanges}× 4 крови → руда` : 'Забрать копилку';
    case 'mass':
      return `Месса: ${c.times}× ${c.from === 'gold' ? 'золото → кровь' : 'кровь → золото'}`;
    case 'marketBuy':
      return `Купить руду за ${resText({ gold: -c.pay.gold, blood: -c.pay.blood })}`;
    case 'marketSell':
      return `Продать руду → ${resText({ gold: c.receive.gold, blood: c.receive.blood })}${c.alchemy ? ' (Алхимик)' : ''}`;
    case 'chancery':
      return `Канцелярия: ${c.conversions
        .map((x) =>
          x.to === 'ore'
            ? '1 комп → руда'
            : `1 комп → ${resText({ gold: x.gold, blood: x.blood })}`,
        )
        .join('; ')}`;
    case 'buildRight':
      return 'Купить право стройки';
    case 'cityHall':
      return `Ратуша: обмен ${c.offer + 1}, влияние в ${regionName(c.region)}${c.alchemy ? ' (Алхимик)' : ''}`;
    case 'copy':
      return `Копировать: ${locName(c.location)}, слот ${c.slot}`;
    case 'revive':
      return `Вернуть из госпиталя${c.alchemy ? ' (Алхимик)' : ''}`;
    case 'commissariat':
      return `Жетон Комиссариата → ${regionName(c.region)}`;
    case 'tavernSwap':
      return `Заменить пару на ${CHARACTERS[c.character].name} / ${PROFESSIONS[c.profession].name}`;
  }
}

function characterChoiceLabel(s: View, c: CharacterChoice): string {
  switch (c.kind) {
    case 'manipulator':
      return `Манипулятор: +2 влияния в ${regionName(c.to)}`;
    case 'renegade':
      return c.gain === 'ore' ? 'Ренегат: руда' : 'Ренегат: право стройки';
    case 'blackmailer':
      return `Шантажист: забрать влияние у ${playerName(c.target)}`;
    case 'hypocrite':
      return `Лицемер: ${workerLabel(workerOf(s, c.workerId))} → ${PROFESSIONS[c.profession].name}`;
    case 'intriguer':
      return `Интриган: заблокировать ${locName(c.location)}`;
    case 'madman':
      return c.location
        ? `Безумец: действие ${locName(c.location)}, слот 1`
        : 'Безумец: не использовать (своё действие)';
    case 'commissar':
      return `Комиссар: ${workerLabel(workerOf(s, c.workerId))} → ${locName(c.location)}, слот ${c.slot}${c.displace ? ', вытеснить' : ''}`;
    case 'gravedigger':
      return c.workerIds.length
        ? `Могильщик: в госпиталь ${c.workerIds.map((id) => workerLabel(workerOf(s, id))).join(', ')}`
        : 'Могильщик: никого';
    case 'tactician':
      return `Тактик: вернуть ${workerLabel(workerOf(s, c.workerId))}`;
  }
}

/** Подпись кнопки хода. */
export function actionLabel(s: View, a: Action): string {
  switch (a.type) {
    case 'place':
      return `${workerLabel(workerOf(s, a.workerId))} → ${locName(a.location)}, слот ${a.slot}${a.displace ? ' (вытеснить)' : ''}`;
    case 'pass':
      return 'Пас';
    case 'locationAction':
      return locationChoiceLabel(a.choice);
    case 'combatReward':
      return a.choice === 'influence' ? 'Награда: +1 влияние' : 'Награда: право стройки';
    case 'draftPick':
      return a.pick.kind === 'character'
        ? `Взять персонажа: ${CHARACTERS[a.pick.character].name} (содержание ${CHARACTERS[a.pick.character].upkeep})`
        : `Взять профессию: ${PROFESSIONS[a.pick.profession].name}`;
    case 'upgrade':
      return a.choice.kind === 'discard'
        ? 'Сбросить пару за отступные'
        : `Улучшить: ${workerLabel(workerOf(s, a.choice.workerId))}`;
    case 'upkeep':
      return a.choice === 'pay' ? 'Оплатить содержание' : 'Сбросить за отступные';
    case 'executioner':
      return a.target ? `Палач: вытеснить ${workerLabel(workerOf(s, a.target))}` : 'Палач: никого';
    case 'spyMove':
      return a.region ? `Шпион → ${regionName(a.region)}` : 'Шпион остаётся';
    case 'combatToken':
      return `Жетон боя: ${COMBAT_TOKENS[a.token].name}`;
    case 'retreat':
      return `Отступить в ${regionName(a.to)}`;
    case 'build':
      return a.choice ? `Построить ${buildLabel(a.choice)}` : 'Не строить';
    case 'character':
      return characterChoiceLabel(s, a.choice);
    case 'effectOrder':
      return {
        character: 'Сначала персонаж',
        location: 'Сначала локация',
        profession: 'Сначала профессия',
      }[a.effect];
  }
}

/** Что сейчас решается — заголовок панели хода. */
export function decisionTitle(s: View): string {
  const p = s.pending;
  if (!p) return 'Партия окончена';
  const who = playerName(p.player);
  switch (p.kind) {
    case 'placement':
      return `${who}: размещение`;
    case 'locationAction':
      return `${who}: действие — ${locName(p.context.location)}, слот ${p.context.slot}${p.context.copy ? ' (копия)' : ''}`;
    case 'combatReward':
      return `${who}: награда за бой (${regionName(p.region)})`;
    case 'draftPick':
      return `${who}: драфт, круг ${p.circle}`;
    case 'upgrade':
      return `${who}: улучшение`;
    case 'upkeep':
      return `${who}: содержание — ${workerLabel(workerOf(s, p.workerId))}`;
    case 'executioner':
      return `${who}: Палач`;
    case 'spyMove':
      return `${who}: перемещение Шпиона`;
    case 'combatToken':
      return `${who}: жетон боя (${regionName(p.region)})`;
    case 'retreat':
      return `${who}: куда отступить`;
    case 'build':
      return `${who}: стройка`;
    case 'character':
      return `${who}: эффект — ${workerLabel(workerOf(s, p.workerId))}`;
    case 'effectOrder':
      return `${who}: порядок эффектов`;
  }
}

/** Событие журнала по-русски (null — не показывать). */
export function eventText(s: View, e: GameEvent): string | null {
  switch (e.type) {
    case 'roundStarted':
      return `— Раунд ${e.round}, первый ходит ${playerName(e.firstPlayer)} —`;
    case 'workerPlaced':
      return `${playerName(e.player)}: ${workerLabel(workerOf(s, e.workerId))} → ${locName(e.location)}, слот ${e.slot}`;
    case 'workerDisplaced':
      return `${playerName(e.by)} вытесняет ${workerLabel(workerOf(s, e.workerId))} (${playerName(e.owner)}) из ${locName(e.location)}${e.method === 'executioner' ? ' Палачом' : ''}`;
    case 'passed':
      return `${playerName(e.player)} пасует`;
    case 'resourcesChanged':
      return `${playerName(e.player)}: ${resText(e.delta)}`;
    case 'influenceChanged':
      return `${playerName(e.player)}: влияние ${regionName(e.region)} ${e.from} → ${e.to}`;
    case 'prestigeChanged':
      return `${playerName(e.player)}: престиж ${e.from} → ${e.to}`;
    case 'combatTokensRevealed':
      return `Бой ${regionName(e.region)}: ${e.plays.map((p) => `${playerName(p.player)} — ${COMBAT_TOKENS[p.token].name}`).join(', ')}`;
    case 'combatResolved':
      return `Бой ${regionName(e.region)}: ${e.strengths.map((x) => `${playerName(x.player)} ${x.strength}`).join(', ') || 'никого'} → ${e.winner === null ? 'победителя нет' : `побеждает ${playerName(e.winner)}`}`;
    case 'workerMoved':
      return `${playerName(e.player)}: ${workerLabel(workerOf(s, e.workerId))} → ${regionName(e.to)} (${e.method === 'spy' ? 'Шпион' : 'Отступление'})`;
    case 'buildingBuilt':
      return `${playerName(e.player)} строит ${BUILDINGS[e.building].name}: ${plotName(e.plot, e.region)}`;
    case 'draftPicked':
      return `${playerName(e.player)} берёт ${e.pick.kind === 'character' ? CHARACTERS[e.pick.character].name : PROFESSIONS[e.pick.profession].name}`;
    case 'workerUpgraded':
      return `${playerName(e.player)}: улучшение — ${CHARACTERS[e.character].name} / ${PROFESSIONS[e.profession].name}`;
    case 'pairDiscarded':
      return `${playerName(e.player)} сбрасывает ${CHARACTERS[e.character].name}`;
    case 'characterTriggered':
      return `${playerName(e.player)}: срабатывает ${CHARACTERS[e.character].name}`;
    case 'locationBlocked':
      return `${playerName(e.player)} блокирует ${locName(e.location)}`;
    case 'commissariatTaken':
      return `${playerName(e.player)} берёт жетон Комиссариата → ${regionName(e.region)}`;
    case 'roundEnded':
      return `— Конец раунда ${e.round} —`;
    case 'gameOver':
      return '— Партия окончена —';
    default:
      return null;
  }
}
