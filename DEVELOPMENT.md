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
