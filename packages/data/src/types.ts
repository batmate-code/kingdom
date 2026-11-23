export type RegionId = 'forest' | 'valley' | 'city';

export type LocationId =
  | 'mine'
  | 'witchCircle'
  | 'lair'
  | 'mass'
  | 'market'
  | 'tavern'
  | 'chancery'
  | 'underground'
  | 'commissariat'
  | 'cityHall';

export type ProfessionId = 'guard' | 'executioner' | 'architect' | 'aristocrat' | 'spy';

/** Руда на компонентах называется «серебро». */
export type ResourceId = 'gold' | 'blood' | 'ore' | 'compromat';

export type Resources = Record<ResourceId, number>;

export type BuildingId = 'crypt' | 'abbey' | 'shop' | 'citadel';

export type CombatTokenId = 'retreat' | 'attack' | 'massacre' | 'domination' | 'defense' | 'decoy';

export type SlotIndex = 1 | 2;

/** Сколько влияния даёт обмен в Ратуше и сколько руды он стоит. */
export interface CityHallOffer {
  ore: number;
  influence: number;
}

/**
 * Действие слота локации. `kind` — id обработчика в core, остальные поля — его параметры.
 * Новая цифра в правилах меняется здесь, без правки движка.
 */
export type SlotAction =
  /** Получить фиксированные ресурсы. */
  | { kind: 'gain'; gain: Partial<Resources> }
  /** Логово, второй слот: забрать всю накопленную руду. */
  /** Логово, второй слот: забрать копилку руды и до maxExchanges раз bloodPerOre крови → 1 руда. */
  | { kind: 'lairStash'; bloodPerOre: number; maxExchanges: number }
  /** Месса: одно направление до maxTimes раз, unit золота → rate крови или unit крови → rate золота. */
  /** Месса: unit золота (крови) → rate крови (золота), до maxTimes раз. */
  | { kind: 'mass'; unit: number; rate: number; maxTimes: number }
  /** Рынок: один обмен — buyCost золота/крови → ore руды или ore руды → sellGain золота/крови. */
  /** Рынок: buyCost золота/крови в любом соотношении → ore руды; sellGain — продажа руды (null — нет). */
  | { kind: 'market'; ore: number; buyCost: number; sellGain: number | null }
  /** Канцелярия, первый слот: (А) до maxTimes раз conversionCost компромата → goldBlood золота/крови или ore руды; (Б) buildRightCost компромата → право стройки. */
  | {
      kind: 'chancery';
      maxTimes: number;
      conversionCost: number;
      goldBlood: number;
      ore: number;
      buildRightCost: number;
    }
  /** Канцелярия, второй слот: compromatCost компромата → право стройки. */
  | { kind: 'chanceryBuild'; compromatCost: number }
  /** Подполье: goldCost золота → действие другой локации (кроме Подполья) из регионов scope. */
  | { kind: 'copy'; goldCost: number; scope: readonly RegionId[] }
  /** Комиссариат, первый слот: взять жетон Комиссариата и выбрать регион. */
  | { kind: 'commissariatToken' }
  /** Комиссариат, второй слот: cost → вернуть своего рабочего из госпиталя в запас (автор 23.11: 2 компромата). */
  | { kind: 'revive'; cost: Partial<Resources> }
  /** Таверна, первый слот: заменить пару «персонаж + профессия» на оставшуюся после драфта. */
  | { kind: 'tavernSwap' }
  /** Ратуша: один из обменов руды на влияние; всё влияние — в один регион. */
  | { kind: 'cityHall'; offers: readonly CityHallOffer[] };

export interface RegionDef {
  id: RegionId;
  name: string;
}

export interface LocationDef {
  id: LocationId;
  name: string;
  region: RegionId;
  /** Действия первого и второго слота. */
  slots: readonly [SlotAction, SlotAction];
}

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  color: string;
  /** Сила рабочего в бою. */
  combatStrength: number;
  /** Рабочего нельзя вытеснить. */
  immuneToDisplacement: boolean;
  /** Не платит за вход в Город. */
  freeCityEntry: boolean;
  /** Эффект профессии для подсказок интерфейса (по таблице профессий в rules.md). */
  text: string;
}

export interface TrackDef {
  region: RegionId;
  max: number;
  /** Отметки, за которые в конце игры дают по 1 ПО. */
  vpMarks: readonly number[];
  /** С какого влияния доступна Цитадель. */
  citadelAt: number;
  /** На каком влиянии вход в Город дорожает (один раз за регион); null — не дорожает. */
  cityEntryRaiseAt: number | null;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: Partial<Resources>;
  /** Престиж за 1-е, 2-е, 3-е здание этого типа у игрока. */
  prestige: readonly number[];
}

export interface PlotDef {
  id: string;
  region: RegionId;
  /** Соседние локации: одна для одиночного участка, две для двойного. */
  adjacent: readonly LocationId[];
  /** Доплата за строительство на двойном участке. */
  surcharge: Partial<Resources>;
}

export interface CombatTokenDef {
  id: CombatTokenId;
  name: string;
  /** Сколько таких жетонов в наборе игрока. */
  count: number;
  /** Прибавка к силе. */
  strength: number;
  /** Эффект жетона для интерфейса (правила, таблица жетонов боя). */
  text: string;
}

export type CharacterId =
  | 'scavenger'
  | 'snitch'
  | 'bloodsucker'
  | 'marauder'
  | 'troublemaker'
  | 'alchemist'
  | 'storekeeper'
  | 'treasurer'
  | 'werewolf'
  | 'informant'
  | 'manipulator'
  | 'officer'
  | 'madman'
  | 'infiltrator'
  | 'diplomat'
  | 'oreMiner'
  | 'intriguer'
  | 'nightHunter'
  | 'hypocrite'
  | 'commissar'
  | 'saboteur'
  | 'patron'
  | 'oreBaron'
  | 'gravedigger'
  | 'tactician'
  | 'chronicler'
  | 'mason'
  | 'pickpocket'
  | 'renegade'
  | 'blackmailer';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Содержание в крови за раунд. */
  upkeep: number;
  /** Текст эффекта с карты (для интерфейса). */
  text: string;
}

export interface UpkeepTier {
  upkeep: number;
  /** Отступные при сбросе персонажа. */
  severance: Partial<Resources>;
  /** Престиж в конце игры за сохранённого персонажа. */
  endPrestige: number;
}
