import { firstLegalBot } from '@vampire/bots';
import { isTerminal } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { playGame } from './index';

describe('playGame', () => {
  it('играет партию ботами до конца', () => {
    const state = playGame({ playerCount: 3 }, 7, [firstLegalBot, firstLegalBot, firstLegalBot]);
    expect(isTerminal(state)).toBe(true);
  });
});
