import { CollectionState } from '../types';

/**
 * Collection and user data are stored only in the cloud (Supabase) via Clerk.
 * No local persistence - data is persisted only when user is signed in.
 */
export const updateCardCount = (collection: CollectionState, cardId: string, delta: number): CollectionState => {
  const current = collection[cardId] || 0;
  const next = Math.max(0, current + delta);
  const newCollection = { ...collection, [cardId]: next };
  if (next === 0) {
    delete newCollection[cardId];
  }
  return newCollection;
};
