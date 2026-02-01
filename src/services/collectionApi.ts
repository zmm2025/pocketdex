/**
 * Collection API: load/save via Supabase Edge Function that verifies Clerk JWT.
 * Use this when auth is Clerk so Supabase never has to verify Clerk's JWT directly.
 */

import type { CollectionState } from '../types';

const COLLECTION_FN = 'collection';

export async function loadCollection(
  token: string,
  functionsBaseUrl: string
): Promise<CollectionState | null> {
  const url = `${functionsBaseUrl}/${COLLECTION_FN}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string })?.error ?? res.statusText;
    throw new Error(msg);
  }
  const data = (await res.json()) as { collection: CollectionState | null };
  return data.collection ?? null;
}

export async function saveCollection(
  token: string,
  _userId: string,
  collection: CollectionState,
  functionsBaseUrl: string
): Promise<void> {
  const url = `${functionsBaseUrl}/${COLLECTION_FN}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collection }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string })?.error ?? res.statusText;
    throw new Error(msg);
  }
}
