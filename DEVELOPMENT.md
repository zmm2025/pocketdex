# **PocketDex** - _Development_

Internal notes for building, deploying, and configuring [PocketDex](https://pocketdex.zain.build/).

## Prerequisites

- Node.js (v18 or later recommended)
- npm

## Getting Started

1.  **Install Dependencies**

    ```
    npm install
    ```

2.  **Download Assets + Card Data**

    Data and assets are retrieved from [Serebii.net](https://www.serebii.net/tcgpocket/). Run with no args for a full sync, or pass flags after `--` so npm forwards them to the script:

    ```
    npm run assets
    npm run assets -- --data-only
    npm run assets -- --assets-only
    npm run assets -- --limit-cards-per-set N
    npm run assets -- --set A1,A1a
    npm run assets -- --keep-cache
    ```

    Generated: `assets/data/index.json`, `assets/data/sets/{SET_ID}.json`, card images under `assets/cards/`, set logos and pack art under `assets/sets/`.

3.  **Start Development Server**

    Runs the app at `http://localhost:3000`.

    ```
    npm run dev
    ```

## Deployment

The site is automatically rebuilt and deployed when changes are pushed to [`main`](https://github.com/zmm2025/pocketdex/tree/main).

### GitHub Pages

This repo includes a GitHub Actions workflow that builds the app and deploys the `dist` folder to GitHub Pages on every push to [`main`](https://github.com/zmm2025/pocketdex/tree/main). In GitHub settings, set Pages to deploy from **GitHub Actions**.

### Custom domain

The site is built for **[pocketdex.zain.build](https://pocketdex.zain.build/)**. Use a **CNAME** for `pocketdex` in DNS settings—do **not** use URL Redirect or Domain Forwarding for that host.

| Type      | Host        | Value                                 |
|-----------|-------------|---------------------------------------|
| **CNAME** | `pocketdex` | `zmm2025.github.io.` *(trailing dot)* |

**GitHub**: Repo → **Settings** → **Pages** → **Custom domain** = `pocketdex.zain.build`. Enable **Enforce HTTPS** when offered.

## Cloud sync (Clerk + Supabase Edge Function)

Sign-in and collection sync use [Clerk](https://clerk.com/) for authentication. Collection data is stored in [Supabase](https://supabase.com/) and accessed via an Edge Function that verifies Clerk's JWT (so Supabase never needs to validate Clerk tokens).

1. **Deploy the Edge Function**:

   ```
   npx supabase functions deploy collection
   ```

2. **Set Clerk verification** in Supabase Edge Function secrets (Dashboard → **Project Settings** → **Edge Functions** → **Secrets**):

   - Add `CLERK_ALLOWED_ISSUERS` = a comma-separated list of Clerk **issuer** URLs (no path):
    `https://clerk.pocketdex.zain.build,https://sweet-fowl-52.clerk.accounts.dev`
   - The function derives the JWKS URL from the JWT's `iss` claim, so both dev and prod tokens work with one config (no switching secrets).
   - Find issuer URLs in Clerk Dashboard → **Configure** → **Domains** (Frontend API domain):
     - **Production:** e.g. `https://clerk.<full-domain>`
     - **Development:** e.g. `https://<dev-slug>.clerk.accounts.dev`

After deploying and setting `CLERK_ALLOWED_ISSUERS`, sign in and collection load/save will go through the Edge Function.

## Testing guest mode

Guest mode lets users explore Collection and Statistics without an account; data is stored in `localStorage`. When they sign in, they are prompted to **Merge into account**, **Use cloud only**, or **Cancel** (stay in demo mode). Use the steps below to verify every behavior.

### Prerequisites

- Dev server running: `npm run dev` (app at `http://localhost:3000`).
- Clerk configured (e.g. `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`) so sign-in works when you test it.
- Optional: Supabase + Edge Function configured so cloud load/save works when signed in.

### 1. Guest can open home; demo banner at top; buttons enabled

- **Steps:** Open the app while signed out (or in an incognito window). Wait for Clerk to finish loading (or the “Retry sign-in” / “Sign in” button to appear).
- **Check:** A yellow demo banner is at the **very top** of the page: “You're exploring in demo mode. Sign in to save your collection to the cloud.” with a **Sign in to save** button. Both **My Collection** and **Statistics** are enabled (no subtext on the buttons).
- **Regression:** If you previously had “Sign in to view” and disabled buttons when signed out, those are removed; this confirms the change.

### 2. Guest can open Collection and Statistics (no redirect)

- **Steps:** While signed out, click **My Collection** or **Statistics**.
- **Check:** You land on `/collection` (or `/collection/:slug`) or `/statistics`; you are **not** redirected to `/`.
- **Regression:** Old behavior was redirect to home when not signed in; this confirms the guard was removed.

**Collection set hint in demo mode**

- **Steps:** While signed out, open **My Collection**, pick a set from the dropdown (e.g. a specific set), then go back to the dashboard (back button or navigate to `/`).
- **Check:** The **My Collection** button shows hint text under the label with the **name of the set you had selected** (e.g. “Starter Set”). This works the same in demo mode as when signed in.

### 3. Demo banner: top of every route, sticky (guest only)

- **Steps:** While signed out, open the dashboard (`/`), then **My Collection**, then **Statistics**.
- **Check:** The same yellow demo banner (“You're exploring in demo mode. Sign in to save your collection to the cloud.” + **Sign in to save** button) is at the **very top** on all three routes. It uses an amber-style background and stays at the top when you scroll (e.g. on Statistics).
- **Steps:** Sign in, then open any route again.
- **Check:** The demo banner is **not** shown when signed in.

### 4. Guest collection: add/remove cards and persist in localStorage

- **Steps:** Signed out, open **My Collection**, pick a set, add or remove cards (e.g. + / −).
- **Check:** Counts update and cards show as owned/unowned as expected.
- **Steps:** Refresh the page (F5) or close and reopen the tab; stay signed out.
- **Check:** Your guest collection is still there (same counts). Data is in `localStorage` under key `pocketdex_guest_collection`.
- **Optional:** DevTools → Application → Local Storage → `http://localhost:3000` → `pocketdex_guest_collection` should be a JSON object like `{"cardId": count, ...}`.

### 5. Guest collection: Statistics reflects guest data

- **Steps:** Signed out, add some cards in Collection, then open **Statistics**.
- **Check:** Statistics shows progress (e.g. “X / Y” and progress bar) that matches the guest collection you just edited.
- **Steps:** Change collection in Collection, then go back to Statistics.
- **Check:** Statistics updates to match (either immediately or after navigating; guest state is shared).

### 6. Sign out: switch to guest collection, no redirect

- **Steps:** Sign in, load your cloud collection, then sign out (e.g. UserButton → Sign out).
- **Check:** You remain on the same page (Collection or Statistics or home); you are **not** redirected to `/`. The UI shows the **guest** collection (from localStorage if any, otherwise empty).
- **Regression:** Old behavior was redirect to home and cleared collection; this confirms the change.

### 7. Sign in with guest data: prompt and three options

When the user has on-device (guest) collection data and signs in (new or existing account), a modal appears with three choices. Verify each path.

- **Steps:** As guest, add a few cards. Sign in with an account (create or sign back in).
- **Check:** A modal appears: title “You have on-device collection data” and three options with clear descriptions:
  - **Merge into account** – Combine on-device and cloud: for each card, the higher count is kept. Account is updated and on-device data cleared.
  - **Use cloud only** – Ignore on-device data and use only saved account collection. On-device demo data is discarded.
  - **Cancel** – Stay in demo mode: you are signed out. On-device data stays only on this device.

**Option: Merge into account**

- **Steps:** In the modal, click **Merge into account**.
- **Check:** Modal closes. Collection shows merged counts (per card: max of guest and cloud). Sync shows “Syncing…” then “Saved” / “Up to date”. `pocketdex_guest_collection` in localStorage is cleared.

**Option: Use cloud only**

- **Steps:** In the modal, click **Use cloud only**.
- **Check:** Modal closes. Collection shows only cloud data; on-device guest data is discarded. `pocketdex_guest_collection` in localStorage is cleared.

**Option: Cancel**

- **Steps:** In the modal, click **Cancel** (or the X).
- **Check:** Modal closes. You are signed out. Collection shows guest data again (from localStorage). You remain in demo mode; on-device data is **not** cleared.

**Loading state**

- **Steps:** As guest with on-device data, sign in; while the modal shows “Loading your account…”, click **Cancel and stay in demo mode**.
- **Check:** Modal closes, you are signed out, guest data is unchanged.

### 8. Sign in: cloud save and sync (no guest merge when no guest data)

- **Steps:** Sign in with an account that has cloud data; ensure no guest data (clear `pocketdex_guest_collection` in localStorage if needed). Change collection.
- **Check:** Sync indicator shows “Syncing…” then “Saved” / “Up to date”. No merge step; cloud load/save behaves as before.
- **Regression:** Signed-in flow is unchanged when there was no guest data.

### 9. Clerk disabled (no key): guest still works

- **Steps:** Run the app without `VITE_CLERK_PUBLISHABLE_KEY` (or with Clerk provider disabled) so “Sign-in not configured” or equivalent appears. If the app still mounts without Clerk, open Collection and add cards.
- **Check:** When there is no user, collection is loaded from and saved to `localStorage` (guest mode). No redirect from Collection/Statistics.
- **Note:** If the app does not mount without a Clerk key, this test is N/A; the implementation still loads guest collection whenever `!clerkUser` after Clerk has loaded.

### Quick checklist

| # | Scenario | What to verify |
|---|---------|----------------|
| 1 | Home, signed out | Demo banner at very top; My Collection & Statistics buttons enabled (no subtext) |
| 2 | Navigate as guest | Can open `/collection` and `/statistics` without redirect; set hint on My Collection after picking a set |
| 3 | Demo banner | Sticky at top on dashboard, Collection, and Statistics when guest; gone when signed in |
| 4 | Guest persistence | Add cards → refresh → counts still there (localStorage) |
| 5 | Statistics as guest | Statistics matches guest collection |
| 6 | Sign out | Stay on page; collection becomes guest (or empty) |
| 7 | Sign in with guest data | Prompt with Merge / Use cloud only / Cancel; verify each option’s effect |
| 8 | Sign in, no guest data | Normal cloud sync only |
| 9 | Clerk disabled | Guest collection still works if app runs |
