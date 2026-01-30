import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionState } from '../types';

const TABLE = 'user_collections';

/**
 * Load the current user's collection from Supabase.
 * RLS ensures only the signed-in user's row is returned.
 */
export async function loadCollection(
  supabase: SupabaseClient
): Promise<CollectionState | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('collection')
    .maybeSingle();

  if (error) {
    console.error('Supabase load error', error);
    throw error;
  }

  if (!data?.collection || typeof data.collection !== 'object') {
    return null;
  }

  return data.collection as CollectionState;
}

/**
 * Upsert the current user's collection to Supabase.
 * Pass userId (Clerk user id) so RLS can validate the row belongs to the user.
 */
export async function saveCollection(
  supabase: SupabaseClient,
  userId: string,
  collection: CollectionState
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      collection,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('Supabase save error', error);
    throw error;
  }
}
