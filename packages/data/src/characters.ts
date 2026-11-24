import { ALCHEMY, CHARACTER_PARAMS as P } from './effects';
import { REVERSE_TRACK } from './reverseInfluence';
import type { CharacterDef, CharacterId, UpkeepTier } from './types';

/**
 * Колода персонажей — 30 карт (docs/images/cards/<id>.jpg).
 * Текст — с карты; у Оборотня, Безумца, Тактика и Рудного барона — из rules.md
 * (автор подтвердил, что верна формулировка правил, а не карты).
 */
export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  // Содержание 0
  scavenger: {
    id: 'scavenger',
    name: 'Падальщик',
    upkeep: 1,
    text: `${P.scavenger.goldPerHospitalWorker} золото, ${P.scavenger.bloodPerHospitalWorker} кровь и ${P.scavenger.compromatPerHospitalWorker} компромат за каждого рабочего в госпитале`,
  },
  snitch: {
    id: 'snitch',
    name: 'Доносчик',
    upkeep: 0,
    text: `+${P.snitch.compromat} компромат; при вытеснении ещё ${P.snitch.onDisplaced}`,
  },
  bloodsucker: {
    id: 'bloodsucker',
    name: 'Кровосос',
    upkeep: 0,
    text: `Получить ${P.bloodsucker.blood} кровь`,
  },
  marauder: {
    id: 'marauder',
    name: 'Мародёр',
    upkeep: 0,
    text: `При вытеснении чужого рабочего получить ${P.marauder.goldPerDisplaced} золота`,
  },
  chronicler: {
    id: 'chronicler',
    name: 'Летописец',
    upkeep: 2,
    text: `Получить ${P.chronicler.prestige} престижа`,
  },

  // Содержание 1
  troublemaker: {
    id: 'troublemaker',
    name: 'Баламут',
    upkeep: 1,
    text: `Положить ${P.troublemaker.powerTokens} жетон силы в текущий регион`,
  },
  alchemist: {
    id: 'alchemist',
    name: 'Алхимик',
    upkeep: 1,
    text: `При выполнении действия можешь заменить оплату ${ALCHEMY.oreReplaced} руды на ${ALCHEMY.goldInstead} золото`,
  },
  storekeeper: {
    id: 'storekeeper',
    name: 'Кладовщик',
    upkeep: 1,
    text: `Получить ${P.storekeeper.gold} золота`,
  },
  treasurer: {
    id: 'treasurer',
    name: 'Казначей',
    upkeep: 1,
    text: `Потратить ${P.treasurer.compromatCost} компромат, получить ${P.treasurer.gold} золота`,
  },
  werewolf: {
    id: 'werewolf',
    name: 'Оборотень',
    upkeep: 1,
    text: `${P.werewolf.powerTokens} жетона силы в текущий регион, если у соперника там сила на ${P.werewolf.strengthGap}+ больше твоей`,
  },
  informant: {
    id: 'informant',
    name: 'Информатор',
    upkeep: 0,
    text: `Получить ${P.informant.compromat} компромат`,
  },
  manipulator: {
    id: 'manipulator',
    name: 'Манипулятор',
    upkeep: 3,
    text: `−${P.manipulator.influenceLoss} влияние в текущем регионе → +${P.manipulator.influenceGain} в другом; нельзя при нуле здесь`,
  },
  mason: {
    id: 'mason',
    name: 'Каменщик',
    upkeep: 2,
    text: `+${P.mason.goldPerBuilding} золота за каждое своё здание в текущем регионе, максимум ${P.mason.maxGold}`,
  },
  pickpocket: {
    id: 'pickpocket',
    name: 'Карманник',
    upkeep: 0,
    text: `Забери ${P.pickpocket.goldPerOpponent} золото у каждого игрока, чьи рабочие находятся в текущем регионе`,
  },
  renegade: {
    id: 'renegade',
    name: 'Ренегат',
    upkeep: 2, // автор 24.11: было 0
    // Автор 24.11: можно и при 0 и ниже — нельзя только на дне трека.
    text: `Потеряй ${P.renegade.influenceLoss} влияние здесь (нельзя при −${-REVERSE_TRACK.min}): получи ${P.renegade.ore} руды`,
  },

  // Содержание 2
  officer: {
    id: 'officer',
    name: 'Офицер',
    upkeep: 2,
    text: `Положить ${P.officer.powerTokens} жетона силы в текущий регион`,
  },
  madman: {
    id: 'madman',
    name: 'Безумец',
    upkeep: 1,
    text: 'Вместо действия своей локации — действие первого слота любой другой локации этого региона (не считается посещением)',
  },
  infiltrator: {
    id: 'infiltrator',
    name: 'Лазутчик',
    upkeep: 1,
    text: 'Занять занятый первый слот без вытеснения; оба рабочих остаются',
  },
  diplomat: {
    id: 'diplomat',
    name: 'Дипломат',
    upkeep: 3,
    text: `+${P.diplomat.influence} политическое влияние в текущем регионе, если там стоит рабочий соперника`,
  },
  oreMiner: { id: 'oreMiner', name: 'Рудокоп', upkeep: 2, text: `Получить ${P.oreMiner.ore} руду` },
  intriguer: {
    id: 'intriguer',
    name: 'Интриган',
    upkeep: 0,
    text: 'Заблокировать другую локацию до начала своего следующего хода',
  },
  nightHunter: {
    id: 'nightHunter',
    name: 'Ночной охотник',
    upkeep: 1,
    text: 'Использовать уже закрытый второй слот',
  },
  hypocrite: {
    id: 'hypocrite',
    name: 'Лицемер',
    upkeep: 1,
    text: 'Смени профессию любого своего рабочего с профессией (и самого Лицемера) на другую; новая профессия Лицемера срабатывает сразу',
  },
  blackmailer: {
    id: 'blackmailer',
    name: 'Шантажист',
    upkeep: 3,
    text: `Потрать ${P.blackmailer.compromatCost} компромата: забери ${P.blackmailer.influence} влияние у выбранного соперника в текущем регионе`,
  },

  // Содержание 3
  commissar: {
    id: 'commissar',
    name: 'Комиссар',
    upkeep: 2,
    text: 'Вернуть своего рабочего из госпиталя и немедленно разместить снова с действием',
  },
  saboteur: {
    id: 'saboteur',
    name: 'Диверсант',
    upkeep: 2,
    text: `Удалить все чужие жетоны силы в текущем регионе; ${P.saboteur.goldPerToken} золота за каждый`,
  },
  patron: {
    id: 'patron',
    name: 'Меценат',
    upkeep: 3,
    text: `+${P.patron.influence} влияние здесь, если у тебя в регионе ${P.patron.minBuildings}+ зданий`,
  },
  oreBaron: {
    id: 'oreBaron',
    name: 'Рудный барон',
    upkeep: 2,
    text: `Положи ${P.oreBaron.ore} руды на карту; получи их в конце раунда, если барон остался в регионе`,
  },
  gravedigger: {
    id: 'gravedigger',
    name: 'Могильщик',
    upkeep: 1,
    text: `Отправить любое число других своих рабочих из этого региона в госпиталь, +${P.gravedigger.orePerWorker} руда за каждого`,
  },
  tactician: {
    id: 'tactician',
    name: 'Тактик',
    upkeep: 3,
    text: 'Верни другого своего рабочего с поля в запас; его слот освобождается, рабочего можно выставить снова',
  },
  // Новые карты автора (24.11)
  armorer: {
    id: 'armorer',
    name: 'Латник',
    upkeep: 3,
    text: 'Действие локации выполняется дважды',
  },
  mercenary: {
    id: 'mercenary',
    name: 'Наёмник',
    upkeep: 0,
    text: `Положи ${P.mercenary.powerTokens} жетон силы на эту карту (копятся, не больше ${P.mercenary.maxTokens}); можешь сразу выложить все жетоны с карты в текущий регион`,
  },
  shapeshifter: {
    id: 'shapeshifter',
    name: 'Перевёртыш',
    upkeep: 2,
    text: 'Выполни эффект персонажа любого рабочего другого игрока (кроме Перевёртыша, Наёмника, Рудного барона и Доносчика)',
  },
  contractor: {
    id: 'contractor',
    name: 'Подрядчик',
    upkeep: 2,
    text: 'Право стройки в текущем регионе по полной цене',
  },
};

/** Порядок колоды до перемешивания. */
export const CHARACTER_ORDER = Object.keys(CHARACTERS) as CharacterId[];

/**
 * Временно убраны из колоды (автор 23.11): их нет ни в партиях, ни в прогонах. Колода
 * добирается до полного размера повторами оставшихся карт (characterDeck в core).
 */
export const CHARACTERS_DISABLED: readonly CharacterId[] = ['manipulator', 'patron'];

/** Отступные и престиж в зависимости от содержания персонажа (совпадают с картами). */
export const UPKEEP_TIERS: readonly UpkeepTier[] = [
  { upkeep: 0, severance: { ore: 1 }, endPrestige: 1 },
  { upkeep: 1, severance: { gold: 2 }, endPrestige: 2 },
  { upkeep: 2, severance: { gold: 1 }, endPrestige: 3 },
  { upkeep: 3, severance: {}, endPrestige: 4 },
];
