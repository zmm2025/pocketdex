export enum Rarity {
  COMMON = 'Common', // Diamond 1
  UNCOMMON = 'Uncommon', // Diamond 2
  RARE = 'Rare', // Diamond 3
  DOUBLE_RARE = 'Double Rare', // Star 1
  ART_RARE = 'Art Rare', // Star 1 (Full Art)
  SUPER_RARE = 'Super Rare', // Star 2
  ILLUSTRATION_RARE = 'Illustration Rare', // Star 3 (Immersive)
  CROWN_RARE = 'Crown Rare', // Crown
}

export enum CardType {
  POKEMON = 'Pokémon',
  TRAINER = 'Trainer',
  ITEM = 'Item',
  SUPPORTER = 'Supporter',
}

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


export interface Card {
  id: string;
  name: string;
  set: string;
  number: number;
  image: string;
  rarity: Rarity;
  type: CardType;
  hp?: number;
  description?: string;
}

export interface Attack {
  name: string;
  cost: EnergyCost[];
  damage?: number;
  text?: string;
}

export interface EnergyCost {
  type: EnergyType;
  count: number;
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

export interface Weakness {
  type: EnergyType;
  value: number;
}

export interface SetData {
  id: string;
  name: string;
  totalCards: number;
  coverImage: string;
}

export type CollectionState = Record<string, number>; // CardID -> Count

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  COLLECTION = 'COLLECTION',
  STATS = 'STATS',
}
