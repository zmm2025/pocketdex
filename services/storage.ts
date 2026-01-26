import { CollectionState } from '../types';

const STORAGE_KEY = 'pocket_dex_collection_v1';

export const getCollection = (): CollectionState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error("Failed to load collection", e);
    return {};
  }
};

export const saveCollection = (collection: CollectionState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  } catch (e) {
    console.error("Failed to save collection", e);
  }
};

export const updateCardCount = (collection: CollectionState, cardId: string, delta: number): CollectionState => {
  const current = collection[cardId] || 0;
  const next = Math.max(0, current + delta);
  const newCollection = { ...collection, [cardId]: next };
  if (next === 0) {
    delete newCollection[cardId];
  }
  return newCollection;
};
