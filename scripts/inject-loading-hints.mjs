/**
 * Injects loading hints from src/loadingHints.json into index.html so the
 * HTML splash can cycle through the same hints before the app JS loads.
 * Run before build/dev (prebuild, predev).
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const hintsPath = join(root, 'src', 'loadingHints.json');
const htmlPath = join(root, 'index.html');

const hints = JSON.parse(readFileSync(hintsPath, 'utf8'));
if (!Array.isArray(hints) || hints.length === 0) {
  console.warn('inject-loading-hints: no hints in loadingHints.json, skipping');
  process.exit(0);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initial span shows first hint; script will shuffle and may replace immediately
const firstHint = escapeHtml(hints[0]);
const scriptBody = `(function(){var h=${JSON.stringify(hints)};for(var i=h.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=h[i];h[i]=h[j];h[j]=t;}var i=0;var e=document.getElementById("loading-hint-text");if(e&&h.length){e.textContent=h[0];setInterval(function(){e.textContent=h[++i%h.length];},2500);}})();`;

const placeholder = /<!-- INJECT_LOADING_HINTS -->[\s\S]*?<!-- \/INJECT_LOADING_HINTS -->/;
const replacement = `<!-- INJECT_LOADING_HINTS -->
        <span class="app-loading__hint" id="loading-hint-text">${firstHint}</span>
        <script>${scriptBody}<\/script>
      <!-- /INJECT_LOADING_HINTS -->`;

let html = readFileSync(htmlPath, 'utf8');
if (!placeholder.test(html)) {
  console.warn('inject-loading-hints: placeholder not found in index.html');
  process.exit(1);
}
html = html.replace(placeholder, replacement);
writeFileSync(htmlPath, html);
