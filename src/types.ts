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

export interface Card {
  id: string;
  name: string;
  set: string;
  number: string;
  image: string;
  rarity: Rarity;
  type: CardType;
  hp?: number;
  description?: string;
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