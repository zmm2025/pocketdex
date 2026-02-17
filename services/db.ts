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
  SetData,
  Weakness,
} from "../types";

// ============================================================================
// ASSET CONFIGURATION
// ============================================================================
// See assets/INSTRUCTIONS.md for where to place files.
// Use Vite's base URL so assets resolve correctly when app is served from a subpath (e.g. /pocketdex/).
const ASSET_BASE = `${import.meta.env.BASE_URL || "/"}assets`;
const EXT = "jpg";
const padCardNumber = (value: number | string) =>
  String(value).padStart(3, "0");

// -- Path Generators (card images from Serebii: https://www.serebii.net/tcgpocket/th/{setSlug}/{num}.jpg) --

export const getCardPath = (setId: string, number: number | string) =>
  `${ASSET_BASE}/cards/${setId}/${padCardNumber(number)}.${EXT}`;

/** Set logos: from Serebii https://www.serebii.net/tcgpocket/logo/{setSlug}.png */
export const getSetLogoPath = (setId: string) =>
  `${ASSET_BASE}/sets/${setId}/logo.png`;

/** Pack art: from Serebii set page Booster Pack List (e.g. https://www.serebii.net/tcgpocket/geneticapex/) */
export const getPackArtPath = (setId: string, variant: string) =>
  `${ASSET_BASE}/sets/${setId}/pack_${variant}.png`;

const mapSymbolToRarity = (symbol?: RaritySymbol): Rarity => {
  switch (symbol) {
    case "diamond1":
      return Rarity.COMMON;
    case "diamond2":
      return Rarity.UNCOMMON;
    case "diamond3":
      return Rarity.RARE;
    case "diamond4":
      return Rarity.DOUBLE_RARE;
    case "star1":
      return Rarity.DOUBLE_RARE;
    case "star2":
      return Rarity.SUPER_RARE;
    case "star3":
      return Rarity.ILLUSTRATION_RARE;
    case "shiny1":
    case "shiny2":
      return Rarity.SUPER_RARE;
    case "crown":
      return Rarity.CROWN_RARE;
    default:
      return Rarity.COMMON;
  }
};

const mapRarityLabelToRarity = (label?: string): Rarity | undefined => {
  if (!label) return undefined;
  const normalized = label.toLowerCase();
  if (normalized.includes("promo")) return Rarity.PROMO;
  if (normalized.includes("common")) return Rarity.COMMON;
  if (normalized.includes("uncommon")) return Rarity.UNCOMMON;
  if (normalized.includes("rare") && normalized.includes("double"))
    return Rarity.DOUBLE_RARE;
  if (normalized.includes("rare") && normalized.includes("illustration"))
    return Rarity.ILLUSTRATION_RARE;
  if (normalized.includes("rare") && normalized.includes("special"))
    return Rarity.SUPER_RARE;
  if (normalized.includes("rare") && normalized.includes("art"))
    return Rarity.ART_RARE;
  if (normalized.includes("rare") && normalized.includes("crown"))
    return Rarity.CROWN_RARE;
  if (normalized.includes("rare")) return Rarity.RARE;
  return undefined;
};

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
  image?: string;
  artGroupId?: string;
  artSourceSet?: string;
  artSourceNumber?: number;
  isCanonicalArt?: boolean;
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
  {
    id: "A1",
    name: "Genetic Apex",
    totalCards: 286,
    coverImage: getSetLogoPath("A1"),
    slug: "geneticapex",
  },
  {
    id: "A1a",
    name: "Mythical Island",
    totalCards: 86,
    coverImage: getSetLogoPath("A1a"),
    slug: "mythicalisland",
  },
  {
    id: "A2",
    name: "Space-Time Smackdown",
    totalCards: 207,
    coverImage: getSetLogoPath("A2"),
    slug: "space-timesmackdown",
  },
  {
    id: "A2a",
    name: "Triumphant Light",
    totalCards: 96,
    coverImage: getSetLogoPath("A2a"),
    slug: "triumphantlight",
  },
  {
    id: "A2b",
    name: "Shining Revelry",
    totalCards: 112,
    coverImage: getSetLogoPath("A2b"),
    slug: "shiningrevelry",
  },
  {
    id: "A3",
    name: "Celestial Guardians",
    totalCards: 239,
    coverImage: getSetLogoPath("A3"),
    slug: "celestialguardians",
  },
  {
    id: "A3a",
    name: "Extradimensional Crisis",
    totalCards: 103,
    coverImage: getSetLogoPath("A3a"),
    slug: "extradimensionalcrisis",
  },
  {
    id: "A3b",
    name: "Eevee Grove",
    totalCards: 107,
    coverImage: getSetLogoPath("A3b"),
    slug: "eeveegrove",
  },
  {
    id: "A4",
    name: "Wisdom of Sea and Sky",
    totalCards: 241,
    coverImage: getSetLogoPath("A4"),
    slug: "wisdomofseaandsky",
  },
  {
    id: "A4a",
    name: "Secluded Springs",
    totalCards: 105,
    coverImage: getSetLogoPath("A4a"),
    slug: "secludedsprings",
  },
  {
    id: "A4b",
    name: "Deluxe Pack ex",
    totalCards: 379,
    coverImage: getSetLogoPath("A4b"),
    slug: "deluxepackex",
  },

  // Block B
  {
    id: "B1",
    name: "Mega Rising",
    totalCards: 331,
    coverImage: getSetLogoPath("B1"),
    slug: "megarising",
  },
  {
    id: "B1a",
    name: "Crimson Blaze",
    totalCards: 103,
    coverImage: getSetLogoPath("B1a"),
    slug: "crimsonblaze",
  },

  // Promos
  {
    id: "PROMO-A",
    name: "Promo-A",
    totalCards: 24,
    coverImage: getSetLogoPath("PROMO-A"),
    slug: "promo-a",
  },
  {
    id: "PROMO-B",
    name: "Promo-B",
    totalCards: 10,
    coverImage: getSetLogoPath("PROMO-B"),
    slug: "promo-b",
  },
];

// Metadata override for known cards to provide better UX than generic generated names
const KNOWN_METADATA: Record<string, Partial<Card>> = {
  // A1 Highlights
  "A1-001": {
    name: "Bulbasaur",
    rarity: Rarity.COMMON,
    type: CardType.POKEMON,
    hp: 70,
  },
  "A1-002": {
    name: "Ivysaur",
    rarity: Rarity.UNCOMMON,
    type: CardType.POKEMON,
    hp: 100,
  },
  "A1-003": {
    name: "Venusaur ex",
    rarity: Rarity.DOUBLE_RARE,
    type: CardType.POKEMON,
    hp: 190,
  },
  "A1-004": {
    name: "Charmander",
    rarity: Rarity.COMMON,
    type: CardType.POKEMON,
    hp: 60,
  },
  "A1-005": {
    name: "Charmeleon",
    rarity: Rarity.UNCOMMON,
    type: CardType.POKEMON,
    hp: 90,
  },
  "A1-006": {
    name: "Charizard ex",
    rarity: Rarity.DOUBLE_RARE,
    type: CardType.POKEMON,
    hp: 180,
  },
  "A1-007": {
    name: "Squirtle",
    rarity: Rarity.COMMON,
    type: CardType.POKEMON,
    hp: 60,
  },
  "A1-008": {
    name: "Wartortle",
    rarity: Rarity.UNCOMMON,
    type: CardType.POKEMON,
    hp: 90,
  },
  "A1-009": {
    name: "Blastoise ex",
    rarity: Rarity.DOUBLE_RARE,
    type: CardType.POKEMON,
    hp: 180,
  },
  "A1-025": {
    name: "Pikachu ex",
    rarity: Rarity.DOUBLE_RARE,
    type: CardType.POKEMON,
    hp: 120,
  },
  "A1-096": {
    name: "Mewtwo ex",
    rarity: Rarity.DOUBLE_RARE,
    type: CardType.POKEMON,
    hp: 150,
  },
  "A1-150": {
    name: "Professor Oak",
    rarity: Rarity.UNCOMMON,
    type: CardType.SUPPORTER,
  },
  "A1-151": { name: "Red Card", rarity: Rarity.COMMON, type: CardType.ITEM },
  "A1-152": { name: "X Speed", rarity: Rarity.COMMON, type: CardType.ITEM },
  // Immersive
  "A1-220": {
    name: "Mewtwo (Immersive)",
    rarity: Rarity.ILLUSTRATION_RARE,
    type: CardType.POKEMON,
    hp: 150,
  },
  "A1-221": {
    name: "Charizard (Immersive)",
    rarity: Rarity.ILLUSTRATION_RARE,
    type: CardType.POKEMON,
    hp: 180,
  },
  "A1-222": {
    name: "Pikachu (Immersive)",
    rarity: Rarity.ILLUSTRATION_RARE,
    type: CardType.POKEMON,
    hp: 120,
  },
};

const generateFallbackCards = (sets: SetData[]): Card[] =>
  sets.flatMap((set) => {
    return Array.from({ length: set.totalCards }, (_, i) => {
      const numInt = i + 1;
      const numStr = numInt.toString().padStart(3, "0");
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
  const artSourceSet = raw.artSourceSet ?? raw.set;
  const artSourceNumber =
    Number.isFinite(Number(raw.artSourceNumber)) &&
    Number(raw.artSourceNumber) > 0
      ? Number(raw.artSourceNumber)
      : safeNumber;
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
    if (normalized === "item") type = CardType.ITEM;
    if (normalized === "supporter") type = CardType.SUPPORTER;
    if (normalized === "pokemontool") type = CardType.POKEMON_TOOL;
  }

  return {
    id,
    set: raw.set,
    number: safeNumber,
    cardNumber: safeNumber,
    image: raw.image || getCardPath(artSourceSet, artSourceNumber),
    artGroupId: raw.artGroupId,
    artSourceSet,
    artSourceNumber,
    isCanonicalArt:
      raw.isCanonicalArt ??
      (artSourceSet === raw.set && artSourceNumber === safeNumber),
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
    exStatus: raw.exStatus ?? "non-ex",
    boosterPacks: raw.boosterPacks,
    costToCraft: raw.costToCraft,
  };
};

// Set/card data: generated by `npm run assets` from Serebii (source URL in index.json: https://www.serebii.net/tcgpocket/)
const indexModules = import.meta.glob<{ default?: IndexData }>(
  "../assets/data/index.json",
  {
    eager: true,
  },
);
const indexData: IndexData | null =
  (Object.values(indexModules)[0] as { default?: IndexData } | undefined)
    ?.default ?? null;

const setModules = import.meta.glob("../assets/data/sets/*.json", {
  eager: true,
});
const scrapedPayloads = Object.values(setModules).map((module) => {
  const payload = (module as { default?: ScrapedSetPayload }).default;
  return payload ?? (module as ScrapedSetPayload);
});

// Support new format { set: setId, cards } and legacy { set: { id, name, ... }, cards }
const scrapedSetsFromFiles = scrapedPayloads
  .map((p) => p.set)
  .filter(
    (s): s is ScrapedSet => typeof s === "object" && s != null && "id" in s,
  );

const scrapedCards = scrapedPayloads.flatMap((payload) => {
  const setId = typeof payload.set === "string" ? payload.set : payload.set?.id;
  const cards = payload.cards ?? [];
  return setId ? cards.map((c) => ({ ...c, set: c.set ?? setId })) : cards;
});
const hasScrapedCards = scrapedCards.length > 0;

// Prefer index.json (single source); fall back to set metadata embedded in set files (legacy)
const cardCountBySet = scrapedCards.reduce<Record<string, number>>((acc, c) => {
  acc[c.set] = (acc[c.set] ?? 0) + 1;
  return acc;
}, {});

const normalizedScraped = scrapedCards.map(normalizeScrapedCard);
const setOrderIds =
  indexData?.sets?.map((s) => s.id) ??
  (scrapedSetsFromFiles.length > 0
    ? scrapedSetsFromFiles.map((s) => s.id)
    : DEFAULT_SETS.map((s) => s.id));
const setOrderMap = new Map(setOrderIds.map((setId, idx) => [setId, idx]));
const setSortValue = (setId: string) => setOrderMap.get(setId) ?? 9999;

type CanonicalAccumulator = {
  primary: Card;
  setIds: Set<string>;
  printings: Map<string, { set: string; number: number }>;
};

const isPreferredPrimary = (candidate: Card, current: Card): boolean => {
  const candidateCanonical = candidate.isCanonicalArt ? 0 : 1;
  const currentCanonical = current.isCanonicalArt ? 0 : 1;
  if (candidateCanonical !== currentCanonical) {
    return candidateCanonical < currentCanonical;
  }
  const setDiff = setSortValue(candidate.set) - setSortValue(current.set);
  if (setDiff !== 0) return setDiff < 0;
  return candidate.number < current.number;
};

const canonicalByGroup = new Map<string, CanonicalAccumulator>();
const canonicalIdByPrintingId = new Map<string, string>();
for (const card of normalizedScraped) {
  const groupId = card.artGroupId || card.id;
  canonicalIdByPrintingId.set(card.id, groupId);
  const printingKey = `${card.set}-${padCardNumber(card.number)}`;
  const existing = canonicalByGroup.get(groupId);
  if (!existing) {
    canonicalByGroup.set(groupId, {
      primary: card,
      setIds: new Set([card.set]),
      printings: new Map([
        [printingKey, { set: card.set, number: card.number }],
      ]),
    });
    continue;
  }
  existing.setIds.add(card.set);
  if (!existing.printings.has(printingKey)) {
    existing.printings.set(printingKey, { set: card.set, number: card.number });
  }
  if (isPreferredPrimary(card, existing.primary)) {
    existing.primary = card;
  }
}

const canonicalCards = Array.from(canonicalByGroup.entries())
  .map(([groupId, acc]) => {
    const printings = Array.from(acc.printings.values()).sort((a, b) => {
      const setDiff = setSortValue(a.set) - setSortValue(b.set);
      if (setDiff !== 0) return setDiff;
      return a.number - b.number;
    });
    const setIds = Array.from(acc.setIds).sort(
      (a, b) => setSortValue(a) - setSortValue(b),
    );
    return {
      ...acc.primary,
      id: groupId,
      artGroupId: groupId,
      set: printings[0]?.set ?? acc.primary.set,
      number: printings[0]?.number ?? acc.primary.number,
      cardNumber: printings[0]?.number ?? acc.primary.cardNumber,
      setIds,
      printings,
    } as Card;
  })
  .sort((a, b) => {
    const setDiff = setSortValue(a.set) - setSortValue(b.set);
    if (setDiff !== 0) return setDiff;
    return a.number - b.number;
  });

const canonicalCardCountBySet = canonicalCards.reduce<Record<string, number>>(
  (acc, card) => {
    const setIds =
      card.setIds && card.setIds.length > 0 ? card.setIds : [card.set];
    for (const setId of setIds) {
      acc[setId] = (acc[setId] ?? 0) + 1;
    }
    return acc;
  },
  {},
);

const setsFromIndex: SetData[] =
  (indexData?.sets?.length ?? 0)
    ? (indexData!.sets!.map((s) => ({
        id: s.id,
        name: s.name,
        totalCards:
          canonicalCardCountBySet[s.id] ??
          s.totalCards ??
          cardCountBySet[s.id] ??
          0,
        coverImage: getSetLogoPath(s.id),
        slug: s.slug,
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
          totalCards: canonicalCardCountBySet[set.id] ?? set.totalCards,
          coverImage: getSetLogoPath(set.id),
          slug: set.slug ?? set.name.toLowerCase().replace(/\s+/g, ""),
          releaseDate: set.releaseDate,
          packs: set.packs,
        }))
      : DEFAULT_SETS;

/** Longest set name by character length (for dropdown width measurement). Pre-calculated once at module load. */
export const LONGEST_SET_NAME: string =
  SETS.length > 0
    ? SETS.reduce((a, b) => (a.name.length >= b.name.length ? a : b)).name
    : "";

/** Longest set ID by character length (for dropdown badge width). Pre-calculated once at module load. */
export const LONGEST_SET_ID: string =
  SETS.length > 0
    ? SETS.reduce((a, b) => (a.id.length >= b.id.length ? a : b)).id
    : "";

export const CARDS: Card[] = hasScrapedCards
  ? canonicalCards
  : generateFallbackCards(DEFAULT_SETS);

export const getCanonicalCardId = (cardId: string): string =>
  canonicalIdByPrintingId.get(cardId) ?? cardId;

export const canonicalizeCollection = (
  collection: Record<string, number>,
): Record<string, number> => {
  const canonicalized: Record<string, number> = {};
  for (const [cardId, rawCount] of Object.entries(collection ?? {})) {
    const count =
      typeof rawCount === "number" && Number.isFinite(rawCount)
        ? Math.floor(rawCount)
        : 0;
    if (count <= 0) continue;
    const canonicalId = getCanonicalCardId(cardId);
    canonicalized[canonicalId] = (canonicalized[canonicalId] ?? 0) + count;
  }
  return canonicalized;
};

const cardBelongsToSet = (card: Card, setId: string): boolean => {
  if (card.set === setId) return true;
  if (card.setIds?.includes(setId)) return true;
  return !!card.printings?.some((p) => p.set === setId);
};

// Get Set Progress (used by Statistics and Collection)
export const getSetProgress = (
  setId: string,
  collection: Record<string, number>,
) => {
  const setCards = CARDS.filter((c) => cardBelongsToSet(c, setId));
  const total = setCards.length;
  const owned = setCards.filter((c) => (collection[c.id] || 0) > 0).length;
  const totalCopies = setCards.reduce(
    (sum, c) => sum + (collection[c.id] || 0),
    0,
  );
  return {
    total,
    owned,
    totalCopies,
    percentage: total === 0 ? 0 : (owned / total) * 100,
  };
};

/** Progress for the selected set or all sets: unique owned count, total cards, total copies, percentage. */
export const getCollectionProgress = (
  collection: Record<string, number>,
  selectedSetId: string,
): {
  total: number;
  owned: number;
  totalCopies: number;
  percentage: number;
} => {
  const cards =
    selectedSetId === "ALL"
      ? CARDS
      : CARDS.filter((c) => cardBelongsToSet(c, selectedSetId));
  const total = cards.length;
  const owned = cards.filter((c) => (collection[c.id] || 0) > 0).length;
  const totalCopies = cards.reduce(
    (sum, c) => sum + (collection[c.id] || 0),
    0,
  );
  const percentage = total === 0 ? 0 : (owned / total) * 100;
  return { total, owned, totalCopies, percentage };
};

/** Get set by URL slug (e.g. "promo-b", "space-timesmackdown"). Case-insensitive. */
export const getSetBySlug = (slug: string): SetData | undefined => {
  const lower = slug.toLowerCase();
  return SETS.find(
    (s) =>
      (s.slug ?? s.name.toLowerCase().replace(/\s+/g, "")).toLowerCase() ===
      lower,
  );
};

/** Get URL slug for a set id (for navigation). Returns undefined for "ALL". */
export const getSetSlug = (setId: string): string | undefined => {
  if (setId === "ALL") return undefined;
  const set = SETS.find((s) => s.id === setId);
  return set?.slug ?? set?.name.toLowerCase().replace(/\s+/g, "");
};
