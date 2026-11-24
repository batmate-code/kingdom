import { massRate, type Observation } from '@vampire/core';
import { COMMISSARIAT_STRENGTH_PER_WORKER, type SlotAction } from '@vampire/data';

/** Краткие подписи ресурсов для действий слотов. */
const R = { gold: 'зол', blood: 'кр', ore: 'руд', compromat: 'комп' } as const;

/** Короткие слова ресурсов в подписях слотов (заменяются значками). */
const RES_WORD: Record<string, string> = {
  gold: 'зол',
  blood: 'кр',
  ore: 'руд',
  compromat: 'комп',
};

/** Ресурсы строкой: «1 руд + 1 зол». */
function resLine(r: Partial<Record<keyof typeof R, number>>): string {
  return (Object.entries(r) as [keyof typeof R, number][])
    .map(([k, v]) => `${v} ${R[k]}`)
    .join(' + ');
}

/**
 * Действие слота как на поле: по одному обмену на строку (строки не переносятся внутри).
 * Слова ресурсов потом заменяются иконками (RichText). Все числа — из данных слота.
 */
export function slotLines(a: SlotAction, obs: Pick<Observation, 'config'>): string[] {
  switch (a.kind) {
    case 'gain':
      return [
        Object.entries(a.gain)
          .map(([k, v]) => `+${v} ${R[k as keyof typeof R]}`)
          .join('  '),
      ];
    case 'lairStash':
      return ['забрать копилку', `${a.bloodPerOre} кр → 1 руд`];
    case 'mass':
      return [
        `${a.unit} зол → ${massRate(obs, a.rate, 'gold')} кр${a.maxTimes > 1 ? `  ×${a.maxTimes}` : ''}`,
        `${a.unit} кр → ${massRate(obs, a.rate, 'blood')} зол${a.maxTimes > 1 ? `  ×${a.maxTimes}` : ''}`,
      ];
    case 'powerToken':
      return [`${a.count} жетон силы`, 'в любой регион'];
    case 'market':
      return a.sellGain === null
        ? [`${a.buyCost} зол/кр → ${a.ore} руд`]
        : [`${a.buyCost} зол/кр → ${a.ore} руд`, `${a.ore} руд → ${a.sellGain} зол/кр`];
    case 'chancery':
      return [
        `до ${a.maxActions} действий:`,
        `${a.conversionCost} комп → ${a.goldBlood} зол/кр`,
        `${a.oreConversion.compromat} комп → ${resLine(a.oreConversion.gain)}`,
        `${a.buildRightCost} комп → стройка`,
      ];
    case 'chanceryBuild':
      return [`${a.compromatCost} комп → стройка`];
    case 'copy':
      return [
        a.goldCost > 0 ? `${a.goldCost} зол → любое действие` : 'любое действие',
        a.scope.length < 3 ? 'Леса или Долины' : 'на поле',
      ];
    case 'commissariatToken':
      return [
        'жетон Комиссариата:',
        `${COMMISSARIAT_STRENGTH_PER_WORKER} силы за рабочего в госпитале`,
      ];
    case 'revive':
      return [
        `${(Object.entries(a.cost) as [string, number][]).map(([k, v]) => `${v} ${RES_WORD[k] ?? k}`).join(' + ')} → вернуть`,
        'из госпиталя',
      ];
    case 'tavernSwap':
      return ['заменить пару', 'на пару из пула'];
    case 'cityHall':
      return a.offers.map((o) => `${resLine(o.cost)} → ${o.influence} вл`);
  }
}
