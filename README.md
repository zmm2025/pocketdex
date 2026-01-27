# PocketDex Tracker

A mobile-first companion app for Pokémon TCG Pocket. Track your collection, view statistics, and get AI-powered deck advice.

## Prerequisites

- Node.js (v18 or later recommended)
- npm

## Getting Started

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Download Assets**
    This pulls card images and icons from the web.
    ```bash
    npm run assets
    ```

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

## GitHub Pages (No Build)

This repo includes a GitHub Pages workflow that deploys the site directly from the repository root on every push to `main`. There is no build step required. In your repo settings, set Pages to deploy from **GitHub Actions**.

## Features

-   **Track Collection**: Click to add cards, right-click (PC) to remove.
-   **Drag Selection**: Click/Touch and drag across multiple cards to quickly add them. Right-click and drag to remove.
-   **Stats**: View completion progress for each set.
-   **AI Advice**: Get deck suggestions based on your collection (requires Gemini API Key).
