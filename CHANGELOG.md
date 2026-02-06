# **PocketDex** - _Changelog_

Version history and planned additions. See [README.md](README.md) for the live app and overview.

## Planned Additions

List is subject to change without notice.

- **Card Registration**: Screenshot to add from pack, screen record to update full dex
- **Deck Builder**: Deck suggestions from owned cards, deck sharing
- **Lists**: Wishlists, statistics to get wishlisted cards, custom lists
- **Collection**: Filter by card stats, view similar cards, hide card count setting
- **Statistics**: Best pack to open for new cards, card draw statistics
- **App Settings**: Account-based app settings like theme & UI behavior
- **Blog**: On-website blog with changelog for updates
- **UX/UI**: Website themes, new press animations, interaction tweaks, Alpha state banner, external links (source code, donations), feedback modal, new logo and art
- **Bug fixes**: Deluxe Pack card registration, guides for testing to prevent bugs
- Community Discord
- Performance improvements
- README data privacy disclosure

## Version History

### PLACEHOLDER  - [1.0.0] - YYYY-MM-DD

Initial release.

**Added:**

- **Collection view**: Set selector, search (name/number), filter (all / owned only), card grid (responsive 3/4/6 columns). Click to add, right-click or Ctrl+click to remove; count badge and minus button per card. Rarity styling (IR, RR borders), owned vs unowned (grayscale/opacity), lazy-loaded images with fallback.
- **Statistics view**: Per-set progress (owned/total, percentage bar) for all sets.
- **Account system**: Clerk sign-in (SignInButton, UserButton), protected routes (Collection and Statistics require sign-in; redirect to home when signed out).
- **Cloud sync**: Load collection on sign-in and auto-save (debounced) via Supabase Edge Function with Clerk JWT. Sync status in header (syncing / saved / error / up to date).
- **Dashboard**: Home screen with PocketDex header, “My Collection” and “Statistics” entry points, sign-in CTA and production-key-on-localhost warning when relevant.
- **Routing**: React Router — `/`, `/collection`, `/statistics`.
