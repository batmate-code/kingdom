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
    upkeep: 0,
    text: '1 кровь за каждого рабочего в госпитале',
  },
  snitch: {
    id: 'snitch',
    name: 'Доносчик',
    upkeep: 0,
    text: 'При размещении кладёт на себя компромат; при вытеснении получает его дополнительно',
  },
  bloodsucker: { id: 'bloodsucker', name: 'Кровосос', upkeep: 0, text: 'Получить 1 кровь' },
  marauder: {
    id: 'marauder',
    name: 'Мародёр',
    upkeep: 0,
    text: 'При вытеснении чужого рабочего получить 2 золота',
  },
  chronicler: { id: 'chronicler', name: 'Летописец', upkeep: 0, text: 'Получить 2 престижа' },

  // Содержание 1
  troublemaker: {
    id: 'troublemaker',
    name: 'Баламут',
    upkeep: 1,
    text: 'Положить 1 жетон силы в текущий регион',
  },
  alchemist: {
    id: 'alchemist',
    name: 'Алхимик',
    upkeep: 1,
    text: 'При выполнении действия можешь заменить оплату 1 руды на 1 золото',
  },
  storekeeper: { id: 'storekeeper', name: 'Кладовщик', upkeep: 1, text: 'Получить 2 золота' },
  treasurer: {
    id: 'treasurer',
    name: 'Казначей',
    upkeep: 1,
    text: 'Потратить 1 компромат, получить 3 золота',
  },
  werewolf: {
    id: 'werewolf',
    name: 'Оборотень',
    upkeep: 1,
    text: '2 жетона силы в текущий регион, если у соперника там сила на 2+ больше твоей',
  },
  informant: {
    id: 'informant',
    name: 'Информатор',
    upkeep: 1,
    text: 'Получить 2 компромата; остальные игроки получают по 1',
  },
  manipulator: {
    id: 'manipulator',
    name: 'Манипулятор',
    upkeep: 1,
    text: '−1 влияние в текущем регионе → +2 в другом; нельзя при нуле здесь',
  },
  mason: {
    id: 'mason',
    name: 'Каменщик',
    upkeep: 1,
    text: '+1 золото за каждое своё здание в текущем регионе, максимум 3',
  },
  pickpocket: {
    id: 'pickpocket',
    name: 'Карманник',
    upkeep: 1,
    text: 'Забери 1 золото у каждого игрока, чьи рабочие находятся в текущем регионе',
  },
  renegade: {
    id: 'renegade',
    name: 'Ренегат',
    upkeep: 1,
    text: 'Потеряй 1 влияние здесь (нельзя при 0): получи 1 руду или право стройки в этом регионе по полной цене',
  },

  // Содержание 2
  officer: {
    id: 'officer',
    name: 'Офицер',
    upkeep: 2,
    text: 'Положить 2 жетона силы в текущий регион',
  },
  madman: {
    id: 'madman',
    name: 'Безумец',
    upkeep: 2,
    text: 'Вместо действия своей локации — действие первого слота любой другой локации этого региона (не считается посещением)',
  },
  infiltrator: {
    id: 'infiltrator',
    name: 'Лазутчик',
    upkeep: 2,
    text: 'Занять занятый первый слот без вытеснения; оба рабочих остаются',
  },
  diplomat: {
    id: 'diplomat',
    name: 'Дипломат',
    upkeep: 2,
    text: '+1 политическое влияние в текущем регионе',
  },
  oreMiner: { id: 'oreMiner', name: 'Рудокоп', upkeep: 2, text: 'Получить 1 руду' },
  intriguer: {
    id: 'intriguer',
    name: 'Интриган',
    upkeep: 2,
    text: 'Заблокировать другую локацию до начала своего следующего хода',
  },
  nightHunter: {
    id: 'nightHunter',
    name: 'Ночной охотник',
    upkeep: 2,
    text: 'Использовать уже закрытый второй слот',
  },
  hypocrite: {
    id: 'hypocrite',
    name: 'Лицемер',
    upkeep: 2,
    text: 'Поменять профессию одного своего рабочего на любую из пяти',
  },
  blackmailer: {
    id: 'blackmailer',
    name: 'Шантажист',
    upkeep: 2,
    text: 'Потрать 2 компромата: забери 1 влияние у выбранного соперника в текущем регионе',
  },

  // Содержание 3
  commissar: {
    id: 'commissar',
    name: 'Комиссар',
    upkeep: 3,
    text: 'Вернуть своего рабочего из госпиталя и немедленно разместить снова с действием',
  },
  saboteur: {
    id: 'saboteur',
    name: 'Диверсант',
    upkeep: 3,
    text: 'Удалить все чужие жетоны силы в текущем регионе; 1 золото за каждый',
  },
  patron: {
    id: 'patron',
    name: 'Меценат',
    upkeep: 3,
    text: '+1 влияние здесь и +1 за каждое своё здание в регионе, максимум 3',
  },
  oreBaron: {
    id: 'oreBaron',
    name: 'Рудный барон',
    upkeep: 3,
    text: 'Положи 2 руды на карту; получи их в конце раунда, если барон остался в регионе и ты выиграл там бой',
  },
  gravedigger: {
    id: 'gravedigger',
    name: 'Могильщик',
    upkeep: 3,
    text: 'Отправить любое число других своих рабочих из этого региона в госпиталь, +1 руда за каждого',
  },
  tactician: {
    id: 'tactician',
    name: 'Тактик',
    upkeep: 3,
    text: 'Верни другого своего рабочего с поля в запас; его слот освобождается, рабочего можно выставить снова',
  },
};

/** Порядок колоды до перемешивания. */
export const CHARACTER_ORDER = Object.keys(CHARACTERS) as CharacterId[];

/** Отступные и престиж в зависимости от содержания персонажа (совпадают с картами). */
export const UPKEEP_TIERS: readonly UpkeepTier[] = [
  { upkeep: 0, severance: { ore: 1 }, endPrestige: 1 },
  { upkeep: 1, severance: { gold: 2 }, endPrestige: 2 },
  { upkeep: 2, severance: { gold: 1 }, endPrestige: 3 },
  { upkeep: 3, severance: {}, endPrestige: 4 },
];
