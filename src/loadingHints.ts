/**
 * Loading screen hint phrases (Pokémon-themed). Single source of truth: edit
 * loadingHints.json; the build injects these into index.html for the HTML splash.
 */
import hintsJson from './loadingHints.json';

export const LOADING_HINTS: readonly string[] = hintsJson as string[];

/** Number of recently-shown hints to exclude when picking next; derived from list length (~1/3, at least 1 when possible, never all). */
export const LOADING_HINT_RECENT_COUNT =
  LOADING_HINTS.length <= 1
    ? 0
    : Math.min(Math.max(1, Math.floor(LOADING_HINTS.length / 3)), LOADING_HINTS.length - 1);

/**
 * Returns a random hint that is not in the recently-shown list to avoid repetition.
 * If all hints were shown recently (e.g. list length <= LOADING_HINT_RECENT_COUNT), picks from all.
 */
export function getNextHint(recentlyShown: readonly string[]): string {
  const hints = [...LOADING_HINTS];
  if (hints.length === 0) return 'Loading...';

  const exclude = recentlyShown.slice(-LOADING_HINT_RECENT_COUNT);
  const pool = hints.filter((h) => !exclude.includes(h));
  const choices = pool.length > 0 ? pool : hints;
  return choices[Math.floor(Math.random() * choices.length)];
}
