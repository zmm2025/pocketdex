# PocketDex Tracker

A mobile-first companion app for Pokémon TCG Pocket. Track your collection and view statistics.

## Prerequisites

- Node.js (v18 or later recommended)
- npm

## Getting Started

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Download Assets + Card Data**
    Data and assets are retrieved from [Serebii.net TCG Pocket](https://www.serebii.net/tcgpocket/). Run with no args for a full sync, or pass flags after `--` so npm forwards them to the script:
    ```bash
    npm run assets
    npm run assets -- --data-only
    npm run assets -- --assets-only
    npm run assets -- --limit-cards-per-set N
    npm run assets -- --set A1,A1a
    npm run assets -- --keep-cache
    ```
    Generated: `assets/data/index.json`, `assets/data/sets/{SET}.json`, card images under `assets/cards/`, set logos and pack art under `assets/sets/`.

3.  **Start Development Server**
    Runs the app at `http://localhost:3000`.
    ```bash
    npm run dev
    ```

## Building for Production

To create a production build:

```bash
npm run build
```

## GitHub Pages

This repo includes a GitHub Actions workflow that builds the app and deploys the `dist` folder to GitHub Pages on every push to `main`. In your repo settings, set Pages to deploy from **GitHub Actions**.

### Custom domain (pocketdex.zain.build)

The site is built for **pocketdex.zain.build** (subdomain). Use a **CNAME** for `pocketdex` in Namecheap—do **not** use URL Redirect or Domain Forwarding for that host.


| Host       | Type     | Value                |
|------------|----------|----------------------|
| `pocketdex`| **CNAME**| `zmm2025.github.io.` (trailing dot) |



**GitHub:** Repo → **Settings** → **Pages** → **Custom domain** = `pocketdex.zain.build`. Enable **Enforce HTTPS** when offered.

### Deployment troubleshooting (MIME / 404 for JS or favicon)

If you see **"disallowed MIME type (text/html)"** for `index-….js` or **404** for the main script or favicon:

1. **Hard refresh** (Ctrl+Shift+R / Cmd+Shift+R) or try in a private window in case you had a cached `index.html` pointing at an old hashed file.
2. **Check DNS as above:** In Namecheap Advanced DNS, ensure the host you use for the site uses **A** or **CNAME** to GitHub, not URL Redirect/Forwarding.
3. After each deploy, the workflow verifies that `dist/index.html` and `dist/assets/index-*.js` exist; if that step fails, fix the build before relying on the live site.

## Features

-   **Track Collection**: Click to add cards, right-click (PC) to remove.
-   **Drag Selection**: Click/Touch and drag across multiple cards to quickly add them. Right-click and drag to remove.
-   **Stats**: View completion progress for each set.
