import { Card, Rarity } from '../types';
import { CARDS } from './db';

// Simplified approximate odds based on general TCG Pocket data (unofficial)
// In reality, each specific card has an individual weight (e.g. 0.02%), but we'll use rarity buckets for the demo.

const SLOT_ODDS = {
  // Slots 1-3: Mostly Common/Uncommon
  REGULAR: {
    [Rarity.COMMON]: 98.0,
    [Rarity.UNCOMMON]: 2.0,
  },
  // Slot 4: Uncommon guaranteed, small chance of rare
  UNCOMMON_PLUS: {
    [Rarity.UNCOMMON]: 90.0,
    [Rarity.RARE]: 5.0,
    [Rarity.DOUBLE_RARE]: 3.5,
    [Rarity.ART_RARE]: 1.0,
    [Rarity.SUPER_RARE]: 0.4,
    [Rarity.ILLUSTRATION_RARE]: 0.1,
  },
  // Slot 5: Rare+, but can technically still be lower in some generic sets, 
  // but for "Pocket" usually specific slots have high variance. 
  // Let's model a "Rare Slot":
  RARE_SLOT: {
    [Rarity.RARE]: 60.0,
    [Rarity.DOUBLE_RARE]: 25.0,
    [Rarity.ART_RARE]: 10.0,
    [Rarity.SUPER_RARE]: 3.0,
    [Rarity.ILLUSTRATION_RARE]: 1.5,
    [Rarity.CROWN_RARE]: 0.5,
  }
};

const getRandomRarity = (odds: Record<string, number>): Rarity => {
  const rand = Math.random() * 100;
  let accumulated = 0;
  for (const [rarity, chance] of Object.entries(odds)) {
    accumulated += chance;
    if (rand <= accumulated) {
      return rarity as Rarity;
    }
  }
  return Rarity.COMMON; // Fallback
};

const getCardByRarity = (rarity: Rarity): Card => {
  const pool = CARDS.filter(c => c.rarity === rarity);
  if (pool.length === 0) {
    // Fallback if our mock DB is missing a rarity type
    return CARDS[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
};

export const openPack = (): Card[] => {
  const pack: Card[] = [];

  // Slot 1, 2, 3
  for (let i = 0; i < 3; i++) {
    const r = getRandomRarity(SLOT_ODDS.REGULAR);
    pack.push(getCardByRarity(r));
  }

  // Slot 4
  const r4 = getRandomRarity(SLOT_ODDS.UNCOMMON_PLUS);
  pack.push(getCardByRarity(r4));

  // Slot 5
  const r5 = getRandomRarity(SLOT_ODDS.RARE_SLOT);
  pack.push(getCardByRarity(r5));

  return pack;
};
