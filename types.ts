export enum Rarity {
  COMMON = 'Common', // Diamond 1
  UNCOMMON = 'Uncommon', // Diamond 2
  RARE = 'Rare', // Diamond 3
  DOUBLE_RARE = 'Double Rare', // Star 1
  ART_RARE = 'Art Rare', // Star 1 (Full Art)
  SUPER_RARE = 'Super Rare', // Star 2
  ILLUSTRATION_RARE = 'Illustration Rare', // Star 3 (Immersive)
  CROWN_RARE = 'Crown Rare', // Crown
  PROMO = 'Promo', // Promo cards (no rarity icon)
}

export enum CardType {
  POKEMON = 'Pokemon',
  TRAINER = 'Trainer',
  ITEM = 'Item',
  SUPPORTER = 'Supporter',
  POKEMON_TOOL = 'Pokemon Tool',
}

export type EnergyType =
  | 'Grass'
  | 'Fire'
  | 'Water'
  | 'Lightning'
  | 'Psychic'
  | 'Fighting'
  | 'Darkness'
  | 'Metal'
  | 'Dragon'
  | 'Colorless';

export interface EnergyCost {
  type: EnergyType;
  count: number;
}

export interface Attack {
  name: string;
  cost: EnergyCost[];
  damage?: number;
  text?: string;
}

export interface Ability {
  name: string;
  text?: string;
}

export interface Weakness {
  type: EnergyType;
  value: number;
}

export type PokemonStage = 'Basic' | 'Stage 1' | 'Stage 2';

export type RaritySymbol =
  | 'diamond1'
  | 'diamond2'
  | 'diamond3'
  | 'diamond4'
  | 'star1'
  | 'star2'
  | 'star3'
  | 'shiny1'
  | 'shiny2'
  | 'crown';

export type RarityDescription =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Double Rare'
  | 'Art Rare'
  | 'Special Art Rare'
  | 'Immersive Rare'
  | 'Shiny Rare'
  | 'Double Shiny Rare'
  | 'Crown Rare';

export const RARITY_DESCRIPTIONS_BY_SYMBOL: Record<RaritySymbol, RarityDescription> = {
  diamond1: 'Common',
  diamond2: 'Uncommon',
  diamond3: 'Rare',
  diamond4: 'Double Rare',
  star1: 'Art Rare',
  star2: 'Special Art Rare',
  star3: 'Immersive Rare',
  shiny1: 'Shiny Rare',
  shiny2: 'Double Shiny Rare',
  crown: 'Crown Rare',
};

export type ExStatus = 'non-ex' | 'ex' | 'mega-ex';

export interface Card {
  id: string;
  name: string;
  set: string;
  number: number;
  cardNumber?: number;
  image: string;
  rarity: Rarity;
  raritySymbol?: RaritySymbol;
  rarityLabel?: string;
  type: CardType;
  hp?: number;
  health?: number;
  description?: string;
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
  exStatus?: ExStatus;
  boosterPacks?: string[];
  costToCraft?: number;
}

export interface SetData {
  id: string;
  name: string;
  totalCards: number;
  coverImage: string;
  slug?: string;
}

export type CollectionState = Record<string, number>; // CardID -> Count

