import { CollectionState } from '../types';

/**
 * Collection and user data are stored in the cloud (Supabase) when signed in.
 * Guests can explore the app with on-device collection data persisted only in localStorage (demo mode).
 */
export const GUEST_COLLECTION_STORAGE_KEY = 'pocketdex_guest_collection';

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const v of Object.values(value)) {
    if (typeof v !== 'number' || v < 0 || !Number.isInteger(v)) return false;
  }
  return true;
}

export function getGuestCollection(): CollectionState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GUEST_COLLECTION_STORAGE_KEY);
    if (raw == null) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isRecordOfNumbers(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setGuestCollection(collection: CollectionState): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(collection).length === 0) {
      window.localStorage.removeItem(GUEST_COLLECTION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(GUEST_COLLECTION_STORAGE_KEY, JSON.stringify(collection));
    }
  } catch {
    // ignore
  }
}

export function clearGuestCollection(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(GUEST_COLLECTION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const updateCardCount = (collection: CollectionState, cardId: string, delta: number): CollectionState => {
  const current = collection[cardId] || 0;
  const next = Math.max(0, current + delta);
  const newCollection = { ...collection, [cardId]: next };
  if (next === 0) {
    delete newCollection[cardId];
  }
  return newCollection;
};
