import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, createReadStream, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Plugin } from 'vite';

function copyDirSync(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

function serveAssetsPlugin(): Plugin {
  const assetsDir = join(process.cwd(), 'assets');
  return {
    name: 'serve-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? '';
        if (!urlPath.startsWith('/assets')) return next();
        // Let Vite handle .json (e.g. import.meta.glob) so they are transformed as modules
        if (urlPath.endsWith('.json')) return next();
        const filePath = join(assetsDir, urlPath.slice('/assets'.length));
        if (!filePath.startsWith(assetsDir)) return next();
        const stat = statSync(filePath, { throwIfNoEntry: false });
        if (!stat?.isFile()) return next();
        res.setHeader('Content-Type', getMime(filePath));
        createReadStream(filePath).pipe(res);
      });
    }
  };
}

function getMime(filePath: string): string {
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

export default defineConfig({
  plugins: [
    react(),
    serveAssetsPlugin(),
    {
      name: 'copy-assets',
      closeBundle() {
        const outDir = join(process.cwd(), 'dist');
        const assetsSrc = join(process.cwd(), 'assets');
        const assetsDest = join(outDir, 'assets');
        if (statSync(assetsSrc).isDirectory()) {
          copyDirSync(assetsSrc, assetsDest);
        }
        // Favicon at dist root (e.g. pocketdex.zain.build/favicon.png)
        const faviconSrc = join(process.cwd(), 'favicon.png');
        const faviconDest = join(outDir, 'favicon.png');
        if (statSync(faviconSrc, { throwIfNoEntry: false })?.isFile()) {
          copyFileSync(faviconSrc, faviconDest);
        }
        // .nojekyll so GitHub Pages serves files as-is (no Jekyll processing)
        const noJekyll = join(process.cwd(), '.nojekyll');
        if (statSync(noJekyll, { throwIfNoEntry: false })?.isFile()) {
          copyFileSync(noJekyll, join(outDir, '.nojekyll'));
        }
      }
    }
  ],
  base: '/',
  server: {
    port: 3000,
    open: true
  },
  preview: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist'
  }
});