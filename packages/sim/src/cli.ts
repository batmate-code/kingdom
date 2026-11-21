import { firstLegalBot } from '@vampire/bots';
import { playGame } from './index';

const seed = Number(process.argv[2] ?? 1);
const state = playGame({ playerCount: 3 }, seed, [firstLegalBot, firstLegalBot, firstLegalBot]);
console.log(`Партия ${seed} сыграна: ${state.round} раундов`);
state.players.forEach((p, i) => {
  console.log(
    `Игрок ${i}: ресурсы ${JSON.stringify(p.resources)}, влияние ${JSON.stringify(p.influence)}`,
  );
});
