import { Card, CardType, Rarity, SetData } from '../types';

// ============================================================================
// ASSET CONFIGURATION
// ============================================================================
// See assets/INSTRUCTIONS.md for where to place files.

const ASSET_BASE = '/assets';
const EXT = 'jpg'; 

// -- Path Generators --

export const getCardPath = (setId: string, number: string) => 
  `${ASSET_BASE}/cards/${setId}/${number}.${EXT}`;

export const getSetLogoPath = (setId: string) => 
  `${ASSET_BASE}/sets/${setId}/logo.png`; // Logos are PNG

export const getPackArtPath = (setId: string, variant: string) => 
  `${ASSET_BASE}/sets/${setId}/pack_${variant}.jpg`; // Pack art is JPG

export const getRarityIconPath = (rarity: Rarity) => {
  // Updated to match Serebii file naming convention (no underscores)
  let filename = 'diamond1';
  switch (rarity) {
    case Rarity.COMMON: filename = 'diamond1'; break;
    case Rarity.UNCOMMON: filename = 'diamond2'; break;
    case Rarity.RARE: filename = 'diamond3'; break;
    case Rarity.DOUBLE_RARE: 
    case Rarity.ART_RARE: filename = 'star1'; break;
    case Rarity.SUPER_RARE: filename = 'star2'; break;
    case Rarity.ILLUSTRATION_RARE: filename = 'star3'; break;
    case Rarity.CROWN_RARE: filename = 'crown'; break;
  }
  return `${ASSET_BASE}/icons/rarity/${filename}.png`;
};

export const getTypeIconPath = (type: string) => 
  `${ASSET_BASE}/icons/types/${type.toLowerCase()}.png`;


// ============================================================================
// DATA
// ============================================================================

export const SETS: SetData[] = [
  // Block A
  { id: 'A1', name: 'Genetic Apex', totalCards: 286, coverImage: getSetLogoPath('A1') },
  { id: 'A1a', name: 'Mythical Island', totalCards: 86, coverImage: getSetLogoPath('A1a') },
  { id: 'A2', name: 'Space-Time Smackdown', totalCards: 207, coverImage: getSetLogoPath('A2') },
  { id: 'A2a', name: 'Triumphant Light', totalCards: 96, coverImage: getSetLogoPath('A2a') },
  { id: 'A2b', name: 'Shining Revelry', totalCards: 112, coverImage: getSetLogoPath('A2b') },
  { id: 'A3', name: 'Celestial Guardians', totalCards: 239, coverImage: getSetLogoPath('A3') },
  { id: 'A3a', name: 'Extradimensional Crisis', totalCards: 103, coverImage: getSetLogoPath('A3a') },
  { id: 'A3b', name: 'Eevee Grove', totalCards: 107, coverImage: getSetLogoPath('A3b') },
  { id: 'A4', name: 'Wisdom of Sea and Sky', totalCards: 241, coverImage: getSetLogoPath('A4') },
  { id: 'A4a', name: 'Secluded Springs', totalCards: 105, coverImage: getSetLogoPath('A4a') },
  { id: 'A4b', name: 'Deluxe Pack ex', totalCards: 379, coverImage: getSetLogoPath('A4b') },
  
  // Block B
  { id: 'B1', name: 'Mega Rising', totalCards: 331, coverImage: getSetLogoPath('B1') },
  { id: 'B1a', name: 'Crimson Blaze', totalCards: 103, coverImage: getSetLogoPath('B1a') },
  
  // Promos
  { id: 'PROMO-A', name: 'Promo-A', totalCards: 24, coverImage: getSetLogoPath('PROMO-A') },
  { id: 'PROMO-B', name: 'Promo-B', totalCards: 10, coverImage: getSetLogoPath('PROMO-B') }
];

// Metadata override for known cards to provide better UX than generic generated names
const KNOWN_METADATA: Record<string, Partial<Card>> = {
  // A1 Highlights
  'A1-001': { name: 'Bulbasaur', rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 70 },
  'A1-002': { name: 'Ivysaur', rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 100 },
  'A1-003': { name: 'Venusaur ex', rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 190 },
  'A1-004': { name: 'Charmander', rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 60 },
  'A1-005': { name: 'Charmeleon', rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 90 },
  'A1-006': { name: 'Charizard ex', rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 180 },
  'A1-007': { name: 'Squirtle', rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 60 },
  'A1-008': { name: 'Wartortle', rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 90 },
  'A1-009': { name: 'Blastoise ex', rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 180 },
  'A1-025': { name: 'Pikachu ex', rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 120 },
  'A1-096': { name: 'Mewtwo ex', rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 150 },
  'A1-150': { name: 'Professor Oak', rarity: Rarity.UNCOMMON, type: CardType.SUPPORTER },
  'A1-151': { name: 'Red Card', rarity: Rarity.COMMON, type: CardType.ITEM },
  'A1-152': { name: 'X Speed', rarity: Rarity.COMMON, type: CardType.ITEM },
  // Immersive
  'A1-220': { name: 'Mewtwo (Immersive)', rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 150 },
  'A1-221': { name: 'Charizard (Immersive)', rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 180 },
  'A1-222': { name: 'Pikachu (Immersive)', rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 120 },
};

// Generate full card list based on sets and total counts
export const CARDS: Card[] = SETS.flatMap(set => {
  return Array.from({ length: set.totalCards }, (_, i) => {
    const numInt = i + 1;
    const numStr = numInt.toString().padStart(3, '0');
    const id = `${set.id}-${numStr}`;
    const known = KNOWN_METADATA[id];

    return {
      id,
      set: set.id,
      number: numStr,
      image: getCardPath(set.id, numStr),
      name: known?.name || `${set.name} #${numStr}`,
      rarity: known?.rarity || Rarity.COMMON,
      type: known?.type || CardType.POKEMON,
      hp: known?.hp,
      ...known
    } as Card;
  });
});

// Get all cards
export const getAllCards = () => CARDS;

// Get card by ID
export const getCardById = (id: string) => CARDS.find(c => c.id === id);

// Get Set Progress
export const getSetProgress = (setId: string, collection: Record<string, number>) => {
  const setCards = CARDS.filter(c => c.set === setId);
  const total = setCards.length;
  const owned = setCards.filter(c => (collection[c.id] || 0) > 0).length;
  return { total, owned, percentage: total === 0 ? 0 : Math.round((owned / total) * 100) };
};