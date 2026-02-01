import {
  Ability,
  Attack,
  Card,
  CardType,
  EnergyCost,
  EnergyType,
  ExStatus,
  PokemonStage,
  Rarity,
  RaritySymbol,
  RARITY_DESCRIPTIONS_BY_SYMBOL,
  RarityDescription,
  SetData,
  Weakness,
} from '../types';

// ============================================================================
// ASSET CONFIGURATION
// ============================================================================
// See assets/INSTRUCTIONS.md for where to place files.
// Use Vite's base URL so assets resolve correctly when app is served from a subpath (e.g. /pocketdex/).
const ASSET_BASE = `${import.meta.env.BASE_URL || '/'}assets`;
const EXT = 'jpg';
const padCardNumber = (value: number | string) => String(value).padStart(3, '0');

// -- Path Generators (card images from Serebii: https://www.serebii.net/tcgpocket/th/{setSlug}/{num}.jpg) --

export const getCardPath = (setId: string, number: number | string) =>
  `${ASSET_BASE}/cards/${setId}/${padCardNumber(number)}.${EXT}`;

/** Set logos: from Serebii https://www.serebii.net/tcgpocket/logo/{setSlug}.png */
export const getSetLogoPath = (setId: string) =>
  `${ASSET_BASE}/sets/${setId}/logo.png`;

/** Pack art: from Serebii set page Booster Pack List (e.g. https://www.serebii.net/tcgpocket/geneticapex/) */
export const getPackArtPath = (setId: string, variant: string) =>
  `${ASSET_BASE}/sets/${setId}/pack_${variant}.png`;

const RARITY_SYMBOLS: RaritySymbol[] = [
  'diamond1',
  'diamond2',
  'diamond3',
  'diamond4',
  'star1',
  'star2',
  'star3',
  'shiny1',
  'shiny2',
  'crown',
];

const RARITY_SYMBOL_SET = new Set<RaritySymbol>(RARITY_SYMBOLS);

const mapRarityToSymbol = (rarity: Rarity): RaritySymbol => {
  switch (rarity) {
    case Rarity.COMMON:
      return 'diamond1';
    case Rarity.UNCOMMON:
      return 'diamond2';
    case Rarity.RARE:
      return 'diamond3';
    case Rarity.DOUBLE_RARE:
    case Rarity.ART_RARE:
      return 'star1';
    case Rarity.SUPER_RARE:
      return 'star2';
    case Rarity.ILLUSTRATION_RARE:
      return 'star3';
    case Rarity.CROWN_RARE:
      return 'crown';
    case Rarity.PROMO:
      return 'diamond1';
    default:
      return 'diamond1';
  }
};

const mapSymbolToRarity = (symbol?: RaritySymbol): Rarity => {
  switch (symbol) {
    case 'diamond1':
      return Rarity.COMMON;
    case 'diamond2':
      return Rarity.UNCOMMON;
    case 'diamond3':
      return Rarity.RARE;
    case 'diamond4':
      return Rarity.DOUBLE_RARE;
    case 'star1':
      return Rarity.DOUBLE_RARE;
    case 'star2':
      return Rarity.SUPER_RARE;
    case 'star3':
      return Rarity.ILLUSTRATION_RARE;
    case 'shiny1':
    case 'shiny2':
      return Rarity.SUPER_RARE;
    case 'crown':
      return Rarity.CROWN_RARE;
    default:
      return Rarity.COMMON;
  }
};

const mapRarityLabelToRarity = (label?: string): Rarity | undefined => {
  if (!label) return undefined;
  const normalized = label.toLowerCase();
  if (normalized.includes('promo')) return Rarity.PROMO;
  if (normalized.includes('common')) return Rarity.COMMON;
  if (normalized.includes('uncommon')) return Rarity.UNCOMMON;
  if (normalized.includes('rare') && normalized.includes('double')) return Rarity.DOUBLE_RARE;
  if (normalized.includes('rare') && normalized.includes('illustration')) return Rarity.ILLUSTRATION_RARE;
  if (normalized.includes('rare') && normalized.includes('special')) return Rarity.SUPER_RARE;
  if (normalized.includes('rare') && normalized.includes('art')) return Rarity.ART_RARE;
  if (normalized.includes('rare') && normalized.includes('crown')) return Rarity.CROWN_RARE;
  if (normalized.includes('rare')) return Rarity.RARE;
  return undefined;
};

export const getRarityDescription = (symbol?: RaritySymbol): RarityDescription | undefined =>
  symbol ? RARITY_DESCRIPTIONS_BY_SYMBOL[symbol] : undefined;

const getRarityIconKey = (symbol: RaritySymbol) => {
  if (symbol.startsWith('diamond')) return 'diamond';
  if (symbol.startsWith('star')) return 'star';
  if (symbol.startsWith('shiny')) return 'shiny';
  if (symbol === 'crown') return 'crown';
  return 'diamond';
};

export const getRarityIconCount = (rarity: Rarity | RaritySymbol) => {
  const symbol = RARITY_SYMBOL_SET.has(rarity as RaritySymbol)
    ? (rarity as RaritySymbol)
    : mapRarityToSymbol(rarity as Rarity);
  if (symbol.startsWith('diamond')) return Number(symbol.replace('diamond', '')) || 1;
  if (symbol.startsWith('star')) return Number(symbol.replace('star', '')) || 1;
  if (symbol.startsWith('shiny')) return Number(symbol.replace('shiny', '')) || 1;
  return 1;
};

export const getRarityIconPath = (rarity: Rarity | RaritySymbol) => {
  const symbol = RARITY_SYMBOL_SET.has(rarity as RaritySymbol)
    ? (rarity as RaritySymbol)
    : mapRarityToSymbol(rarity as Rarity);
  return `${ASSET_BASE}/icons/rarity/${getRarityIconKey(symbol)}.png`;
};

export const getTypeIconPath = (type: string) =>
  `${ASSET_BASE}/icons/types/${type.toLowerCase()}.png`;

// ============================================================================
// DATA
// ============================================================================

type ScrapedSet = {
  id: string;
  name: string;
  totalCards: number;
  slug?: string;
  releaseDate?: string;
  packs?: { id: string; name: string }[];
};

type ScrapedCard = {
  name: string;
  set: string;
  number: number;
  cardNumber?: number;
  type?: string;
  hp?: number;
  health?: number;
  pokemonStage?: PokemonStage | null;
  stage?: PokemonStage;
  pokemonType?: EnergyType;
  energyType?: EnergyType;
  attacks?: Attack[];
  moves?: Attack[];
  abilities?: Ability[];
  weakness?: Weakness;
  retreatCost?: EnergyCost[];
  illustrator?: string;
  raritySymbol?: RaritySymbol;
  rarityLabel?: string;
  description?: string;
  exStatus?: ExStatus;
  boosterPacks?: string[];
  costToCraft?: number;
};

type ScrapedSetPayload = {
  /** Set id (new format) or full set object (legacy) */
  set?: ScrapedSet | string;
  cards?: ScrapedCard[];
};

type IndexSetEntry = {
  id: string;
  name: string;
  slug?: string;
  packs?: { id: string; name: string }[];
  totalCards: number;
  releaseDate?: string;
};

type IndexData = {
  sets?: IndexSetEntry[];
};

const DEFAULT_SETS: SetData[] = [
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
  { id: 'PROMO-B', name: 'Promo-B', totalCards: 10, coverImage: getSetLogoPath('PROMO-B') },
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

const generateFallbackCards = (sets: SetData[]): Card[] =>
  sets.flatMap((set) => {
    return Array.from({ length: set.totalCards }, (_, i) => {
      const numInt = i + 1;
      const numStr = numInt.toString().padStart(3, '0');
      const id = `${set.id}-${numStr}`;
      const known = KNOWN_METADATA[id];

      return {
        id,
        set: set.id,
        number: numInt,
        cardNumber: numInt,
        image: getCardPath(set.id, numInt),
        name: known?.name || `${set.name} #${numStr}`,
        rarity: known?.rarity || Rarity.COMMON,
        type: known?.type || CardType.POKEMON,
        hp: known?.hp,
        ...known,
      } as Card;
    });
  });

const normalizeScrapedCard = (raw: ScrapedCard): Card => {
  const number = Number(raw.number ?? raw.cardNumber);
  const safeNumber = Number.isFinite(number) ? number : 0;
  const id = `${raw.set}-${padCardNumber(safeNumber)}`;
  const energyType = raw.energyType ?? raw.pokemonType;
  const health = raw.health ?? raw.hp;
  const stage = raw.stage ?? raw.pokemonStage ?? null;
  const attacks = raw.attacks ?? raw.moves ?? [];
  const moves = raw.moves ?? raw.attacks ?? [];
  const rarity =
    (raw.raritySymbol ? mapSymbolToRarity(raw.raritySymbol) : undefined) ||
    mapRarityLabelToRarity(raw.rarityLabel) ||
    Rarity.COMMON;

  let type = CardType.POKEMON;
  if (raw.type) {
    const normalized = raw.type.toLowerCase();
    if (normalized === 'item') type = CardType.ITEM;
    if (normalized === 'supporter') type = CardType.SUPPORTER;
    if (normalized === 'pokemontool') type = CardType.POKEMON_TOOL;
  }

  return {
    id,
    set: raw.set,
    number: safeNumber,
    cardNumber: safeNumber,
    image: getCardPath(raw.set, safeNumber),
    name: raw.name,
    rarity,
    raritySymbol: raw.raritySymbol,
    rarityLabel: raw.rarityLabel,
    type,
    hp: raw.hp,
    health,
    description: raw.description,
    pokemonStage: raw.pokemonStage ?? null,
    stage: stage ?? undefined,
    pokemonType: raw.pokemonType ?? energyType,
    energyType,
    attacks,
    moves,
    abilities: raw.abilities ?? [],
    weakness: raw.weakness,
    retreatCost: raw.retreatCost,
    illustrator: raw.illustrator,
    exStatus: raw.exStatus ?? 'non-ex',
    boosterPacks: raw.boosterPacks,
    costToCraft: raw.costToCraft,
  };
};

// Set/card data: generated by `npm run assets` from Serebii (source URL in index.json: https://www.serebii.net/tcgpocket/)
const indexModules = import.meta.glob<{ default?: IndexData }>('../assets/data/index.json', {
  eager: true,
});
const indexData: IndexData | null =
  (Object.values(indexModules)[0] as { default?: IndexData } | undefined)?.default ?? null;

const setModules = import.meta.glob('../assets/data/sets/*.json', { eager: true });
const scrapedPayloads = Object.values(setModules).map((module) => {
  const payload = (module as { default?: ScrapedSetPayload }).default;
  return payload ?? (module as ScrapedSetPayload);
});

// Support new format { set: setId, cards } and legacy { set: { id, name, ... }, cards }
const scrapedSetsFromFiles = scrapedPayloads
  .map((p) => p.set)
  .filter((s): s is ScrapedSet => typeof s === 'object' && s != null && 'id' in s);

const scrapedCards = scrapedPayloads.flatMap((payload) => {
  const setId = typeof payload.set === 'string' ? payload.set : payload.set?.id;
  const cards = payload.cards ?? [];
  return setId ? cards.map((c) => ({ ...c, set: c.set ?? setId })) : cards;
});
const hasScrapedCards = scrapedCards.length > 0;

// Prefer index.json (single source); fall back to set metadata embedded in set files (legacy)
const cardCountBySet = scrapedCards.reduce<Record<string, number>>((acc, c) => {
  acc[c.set] = (acc[c.set] ?? 0) + 1;
  return acc;
}, {});

// Deduplicate by id so each set+number appears once (fixes duplicate cards from asset script)
const normalizedScraped = scrapedCards.map(normalizeScrapedCard);
const seenIds = new Set<string>();
const dedupedCards = normalizedScraped.filter((c) => {
  if (seenIds.has(c.id)) return false;
  seenIds.add(c.id);
  return true;
});

const dedupedCardCountBySet = dedupedCards.reduce<Record<string, number>>((acc, c) => {
  acc[c.set] = (acc[c.set] ?? 0) + 1;
  return acc;
}, {});

const setsFromIndex: SetData[] =
  indexData?.sets?.length ?? 0
    ? (indexData!.sets!.map((s) => ({
        id: s.id,
        name: s.name,
        totalCards: dedupedCardCountBySet[s.id] ?? s.totalCards ?? cardCountBySet[s.id] ?? 0,
        coverImage: getSetLogoPath(s.id),
        releaseDate: s.releaseDate,
        packs: s.packs,
      })) as SetData[])
    : [];

export const SETS: SetData[] =
  setsFromIndex.length > 0
    ? setsFromIndex
    : hasScrapedCards && scrapedSetsFromFiles.length > 0
      ? scrapedSetsFromFiles.map((set) => ({
          id: set.id,
          name: set.name,
          totalCards: dedupedCardCountBySet[set.id] ?? set.totalCards,
          coverImage: getSetLogoPath(set.id),
          releaseDate: set.releaseDate,
          packs: set.packs,
        }))
      : DEFAULT_SETS;

export const CARDS: Card[] = hasScrapedCards
  ? dedupedCards
  : generateFallbackCards(DEFAULT_SETS);

// Get all cards
export const getAllCards = () => CARDS;

// Get card by ID
export const getCardById = (id: string) => CARDS.find((c) => c.id === id);

// Get Set Progress
export const getSetProgress = (setId: string, collection: Record<string, number>) => {
  const setCards = CARDS.filter((c) => c.set === setId);
  const total = setCards.length;
  const owned = setCards.filter((c) => (collection[c.id] || 0) > 0).length;
  return { total, owned, percentage: total === 0 ? 0 : Math.round((owned / total) * 100) };
};
