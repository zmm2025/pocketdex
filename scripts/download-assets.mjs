/**
 * PocketDex Asset + Data Sync
 *
 * Downloads card art, set logos, icons, and pack art from pocket.pokemongohub.net
 * and scrapes card metadata via the pocket.pokemongohub.net directly.
 *
 * Usage:
 *   node scripts/download-assets.mjs
 *   node scripts/download-assets.mjs --data-only
 *   node scripts/download-assets.mjs --assets-only
 */

import fs from 'fs';
import path from 'path';
import followRedirects from 'follow-redirects';
import { fileURLToPath } from 'url';
import process from 'process';
import readline from 'readline';
import sharp from 'sharp';

const { https } = followRedirects;

// Output format: 'jpg' for photos (smaller), 'png' for icons (transparency)
const CARD_EXT = 'jpg';
const WALLPAPER_EXT = 'jpg';
const FULLART_EXT = 'jpg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_BASE = 'https://pocket.pokemongohub.net';
const USER_AGENT = 'Mozilla/5.0 (PocketDex assets)';
let SESSION_HEADERS = { 'user-agent': USER_AGENT };
let SESSION_READY = false;
let SESSION_PROMISE = null;
let PLAYWRIGHT_AVAILABLE = null;

const ASSETS_ROOT = path.join(__dirname, '../assets');
const DATA_DIR = path.join(ASSETS_ROOT, 'data');
const DATA_SETS_DIR = path.join(DATA_DIR, 'sets');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const MANUAL_FILE = path.join(DATA_DIR, 'manual-sets.json');

const REQUEST_TIMEOUT_MS = 25000;
const CACHE_DIR = path.join(ASSETS_ROOT, '.cache', 'pokemongohub');

// Defaults are intentionally conservative to avoid rate limiting.
const DEFAULT_FETCH_DELAY_MS = 600;
const DEFAULT_ASSET_CONCURRENCY = 2;
const DEFAULT_DATA_CONCURRENCY = 1;
const DEFAULT_ASSET_DELAY_MS = 200;

// ============================================================================
// HELPERS
// ============================================================================

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const removeDir = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
};

const removeFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
};

const padNumber = (num) => String(num).padStart(3, '0');

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getArgValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value ?? fallback;
};

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
const unique = (items) => Array.from(new Set(items));

const normalizeDisplayText = (value) => {
  if (!value) return '';
  const withSpaces = value
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2');
  return normalizeWhitespace(withSpaces);
};

const extractSetNameFromText = (value) => {
  const normalized = normalizeDisplayText(value);
  const match = /^(.*?)\s*Released on\s+\d{1,2}\/\d{1,2}\/\d{4}\s+This set contains\s+\d+\s+cards?\.?$/i.exec(
    normalized
  );
  if (match) return match[1].trim();
  return normalized;
};

const normalizeImageUrl = (value) => extractDirectUrl(value) || '';

const normalizePackTitle = (value) =>
  normalizeDisplayText(value).replace(/\s+Pack\s*$/i, '').trim();

const decodeHtml = (value) => {
  if (!value) return '';
  const named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (named[match]) return named[match];
    if (entity.startsWith('#x')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return match;
  });
};

const normalizeKey = (value) =>
  normalizeWhitespace(decodeHtml(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequest = 0;
const waitForRequestSlot = async (delayMs) => {
  const now = Date.now();
  const waitMs = lastRequest + delayMs - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastRequest = Date.now();
};

const fetchTextWithStatus = (url, { headers } = {}) => {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { ...SESSION_HEADERS, ...(headers || {}) } },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || '';
          const charsetMatch = /charset=([^;]+)/i.exec(contentType);
          const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
          const encoding = charset.includes('utf') ? 'utf8' : 'latin1';
          resolve({
            status: response.statusCode || 0,
            text: buffer.length ? buffer.toString(encoding) : '',
          });
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });

    request.on('error', (err) => {
      reject(err);
    });
  });
};

const normalizeCacheKey = (url) => {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_');
  return safe.toLowerCase().slice(0, 200);
};

const getCachePath = (url) => path.join(CACHE_DIR, `${normalizeCacheKey(url)}.md`);

const readCache = (url, maxAgeMs) => {
  const cachePath = getCachePath(url);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const stats = fs.statSync(cachePath);
    if (maxAgeMs > 0 && Date.now() - stats.mtimeMs > maxAgeMs) return null;
    return fs.readFileSync(cachePath, 'utf8');
  } catch (error) {
    return null;
  }
};

const readCacheAny = (url) => {
  const cachePath = getCachePath(url);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return fs.readFileSync(cachePath, 'utf8');
  } catch (error) {
    return null;
  }
};

const writeCache = (url, content) => {
  ensureDir(CACHE_DIR);
  const cachePath = getCachePath(url);
  fs.writeFileSync(cachePath, content);
};

const isCloudflareBlock = (text) => {
  if (!text) return false;
  return (
    text.includes('Just a moment') ||
    text.includes('cf-chl') ||
    text.includes('challenge-platform') ||
    text.includes('Enable JavaScript and cookies')
  );
};

const ensureBrowserSession = async () => {
  if (SESSION_READY) return;
  if (SESSION_PROMISE) {
    await SESSION_PROMISE;
    return;
  }

  SESSION_PROMISE = (async () => {
    try {
      const { chromium } = await import('playwright');
      PLAYWRIGHT_AVAILABLE = true;
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();
      await page.goto(`${SOURCE_BASE}/en`, { waitUntil: 'networkidle', timeout: 60000 });
      const cookies = await context.cookies(SOURCE_BASE);
      if (cookies && cookies.length > 0) {
        const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
        SESSION_HEADERS = { ...SESSION_HEADERS, Cookie: cookieHeader };
      }
      await browser.close();
      SESSION_READY = true;
    } catch (error) {
      console.warn(
        'Unable to launch Playwright to bypass Cloudflare. Install playwright to enable auto-bypass.'
      );
      PLAYWRIGHT_AVAILABLE = false;
      SESSION_READY = false;
    } finally {
      SESSION_PROMISE = null;
    }
  })();

  await SESSION_PROMISE;
};

const fetchMainPageDataViaBrowser = async () => {
  try {
    const { chromium } = await import('playwright');
    PLAYWRIGHT_AVAILABLE = true;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(`${SOURCE_BASE}/en`, { waitUntil: 'networkidle', timeout: 60000 });
    const data = await page.evaluate(() => {
      const getText = (el) => (el ? el.textContent || '' : '').replace(/\s+/g, ' ').trim();
      const anchors = Array.from(document.querySelectorAll('a')).map((anchor) => ({
        href: anchor.href,
        text: getText(anchor),
        img: anchor.querySelector('img')?.src || '',
      }));
      return {
        sets: anchors.filter((entry) => entry.href.includes('/en/set/')),
        packs: anchors.filter((entry) => entry.href.includes('/en/booster/')),
        colors: anchors.filter((entry) => entry.href.includes('/en/color/')),
        categories: anchors.filter((entry) =>
          ['/en/ex-cards', '/en/item-cards', '/en/pokemon-tool-cards', '/en/supporter-cards'].some(
            (slug) => entry.href.includes(slug)
          )
        ),
      };
    });
    await browser.close();
    return data;
  } catch (error) {
    return null;
  }
};

const fetchCardUrlsViaBrowser = async (url, options = {}) => {
  const mode = options.mode || 'generic';
  try {
    const { chromium } = await import('playwright');
    PLAYWRIGHT_AVAILABLE = true;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const urls = await page.evaluate((modeValue) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/en/card/"]'));
      if (modeValue === 'booster') {
        return anchors
          .filter((anchor) => {
            const img = anchor.querySelector('img');
            if (!img) return false;
            const src = img.getAttribute('src') || '';
            const srcset = img.getAttribute('srcset') || '';
            const haystack = `${src} ${srcset}`;
            return (
              haystack.includes('/tcg-pocket/cards/') ||
              haystack.includes('tcg-pocket%2Fcards') ||
              haystack.includes('tcg-pocket/cards')
            );
          })
          .map((anchor) => anchor.href);
      }
      return anchors.map((anchor) => anchor.href);
    }, mode);
    await browser.close();
    return unique(urls);
  } catch (error) {
    return [];
  }
};

const fetchMarkdown = async (urlOrPath, delayMs, options = {}) => {
  const target = urlOrPath.startsWith('http') ? urlOrPath : `${SOURCE_BASE}${urlOrPath}`;
  const maxRetries = options.maxRetries ?? 6;
  const cooldownMs = options.cooldownMs ?? 20000;
  const cacheMaxAgeMs = options.cacheMaxAgeMs ?? 1000 * 60 * 60 * 24 * 7;
  const forceRefresh = options.forceRefresh ?? false;
  const allowBrowserBypass = options.allowBrowserBypass ?? true;

  if (!forceRefresh) {
    const cached = readCache(target, cacheMaxAgeMs);
    if (cached && !(allowBrowserBypass && isCloudflareBlock(cached))) return cached;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await waitForRequestSlot(delayMs);
      const result = await fetchTextWithStatus(target);
      if (result.status === 200) {
        if (allowBrowserBypass && isCloudflareBlock(result.text)) {
          await ensureBrowserSession();
          if (attempt < maxRetries) {
            await sleep(cooldownMs);
            continue;
          }
          throw new Error(`Cloudflare block page received from ${target}`);
        }
        writeCache(target, result.text);
        return result.text;
      }

      if (allowBrowserBypass && (result.status === 403 || result.status === 451)) {
        await ensureBrowserSession();
      }

      if ([429, 403, 451, 500, 503].includes(result.status) && attempt < maxRetries) {
        await sleep(cooldownMs + Math.floor(Math.random() * 2000));
        continue;
      }

      throw new Error(`Status ${result.status}: ${target}`);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(cooldownMs + Math.floor(Math.random() * 2000));
        continue;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${target}`);
};

const downloadToBuffer = (url, delayMs = 0) => {
  return new Promise((resolve, reject) => {
    const startRequest = () => {
      const request = https.get(
        url,
        { headers: { ...SESSION_HEADERS } },
        (response) => {
          if (response.statusCode === 200) {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
          } else if (response.statusCode === 404) {
            resolve(null);
          } else {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8');
              const snippet = body.slice(0, 160).replace(/\s+/g, ' ').trim();
              const hint = snippet ? ` body: ${snippet}` : '';
              reject(new Error(`Status ${response.statusCode}: ${url}${hint}`));
            });
          }
        }
      );

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms: ${url}`));
      });

      request.on('error', (err) => reject(err));
    };

    if (delayMs > 0) {
      setTimeout(startRequest, delayMs);
    } else {
      startRequest();
    }
  });
};

const downloadFile = (url, dest, delayMs = 0) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const startRequest = () => {
      const request = https.get(
        url,
        { headers: { ...SESSION_HEADERS } },
        (response) => {
          if (response.statusCode === 200) {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve(true);
            });
          } else if (response.statusCode === 404) {
            fs.unlink(dest, () => {});
            resolve(false);
          } else {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              fs.unlink(dest, () => {});
              const body = Buffer.concat(chunks).toString('utf8');
              const snippet = body.slice(0, 160).replace(/\s+/g, ' ').trim();
              const hint = snippet ? ` body: ${snippet}` : '';
              reject(new Error(`Status ${response.statusCode}: ${url}${hint}`));
            });
          }
        }
      );

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms: ${url}`));
      });

      request.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    if (delayMs > 0) {
      setTimeout(startRequest, delayMs);
    } else {
      startRequest();
    }
  });
};

/**
 * Download image, compress with sharp, and save as PNG or JPG (whichever is smaller).
 * For photos (card art, wallpaper, full art): use JPG.
 * For icons with transparency: use PNG.
 */
const downloadAndCompressImage = async (url, dest, delayMs = 0, options = {}) => {
  const { format = 'auto', jpegQuality = 82, pngCompression = 9 } = options;
  const ext = path.extname(dest).toLowerCase();

  if (format === 'png' || ext === '.png') {
    const buffer = await downloadToBuffer(url, delayMs);
    if (!buffer) return false;
    ensureDir(path.dirname(dest));
    await sharp(buffer)
      .png({ compressionLevel: pngCompression, adaptiveFiltering: true })
      .toFile(dest);
    return true;
  }

  if (format === 'jpg' || format === 'jpeg' || ext === '.jpg' || ext === '.jpeg') {
    const buffer = await downloadToBuffer(url, delayMs);
    if (!buffer) return false;
    ensureDir(path.dirname(dest));
    await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toFile(dest);
    return true;
  }

  if (format === 'auto') {
    const buffer = await downloadToBuffer(url, delayMs);
    if (!buffer) return false;
    ensureDir(path.dirname(dest));
    const img = sharp(buffer);
    const meta = await img.metadata();
    if (meta.hasAlpha) {
      const pngDest = dest.replace(/\.(jpg|jpeg|webp)$/i, '.png');
      await img.png({ compressionLevel: pngCompression, adaptiveFiltering: true }).toFile(pngDest);
      return true;
    }
    const base = dest.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const pngPath = `${base}.png`;
    const jpgPath = `${base}.jpg`;
    const [pngBuf, jpgBuf] = await Promise.all([
      img.clone().png({ compressionLevel: pngCompression, adaptiveFiltering: true }).toBuffer(),
      img.clone().flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer(),
    ]);
    if (jpgBuf.length <= pngBuf.length) {
      fs.writeFileSync(jpgPath, jpgBuf);
      return true;
    }
    fs.writeFileSync(pngPath, pngBuf);
    return true;
  }

  throw new Error(`Unknown format: ${format}`);
};

const runConcurrent = async (items, concurrency, handler) => {
  const total = items.length;
  if (total === 0) return;
  const workerCount = Math.max(1, Math.min(concurrency, total));
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      await handler(items[index], index);
    }
  });
  await Promise.all(workers);
};
const createProgressTracker = (label, total, intervalMs, barWidth = 28) => {
  let lastWrite = 0;
  const makeBar = (current) => {
    if (!total || total <= 0) return '[----------------------------]';
    const width = Math.max(10, barWidth);
    const ratio = Math.min(1, Math.max(0, current / total));
    const filled = Math.floor(ratio * width);
    const empty = Math.max(0, width - filled);
    const fillChar = '=';
    const tipChar = filled < width ? '>' : '=';
    const bar =
      filled > 0
        ? `${fillChar.repeat(Math.max(0, filled - 1))}${tipChar}${'-'.repeat(empty)}`
        : `${'-'.repeat(width)}`;
    return `[${bar}]`;
  };
  const write = (message) => {
    process.stdout.write(`\r${label}: ${message}`);
  };
  const finish = (message) => {
    process.stdout.write(`\r${label}: ${message}\n`);
  };

  return {
    update(counts) {
      const now = Date.now();
      if (now - lastWrite < intervalMs && counts.current < total) return;
      lastWrite = now;
      const bar = makeBar(counts.current);
      const message = `${bar} ${counts.current}/${total} (ok:${counts.ok} skip:${counts.skip} fail:${counts.fail})`;
      write(message);
    },
    done(counts) {
      const bar = makeBar(counts.current);
      const message = `${bar} ${counts.current}/${total} (ok:${counts.ok} skip:${counts.skip} fail:${counts.fail})`;
      finish(message);
    },
    updateText(message) {
      const now = Date.now();
      if (now - lastWrite < intervalMs) return;
      lastWrite = now;
      const bar = makeBar(
        Math.min(
          total,
          Math.max(0, Number((message.match(/\b(\d+)\s*\/\s*\d+\b/) || [])[1] || 0))
        )
      );
      write(`${bar} ${message}`);
    },
    doneText(message) {
      const bar = makeBar(
        Math.min(
          total,
          Math.max(0, Number((message.match(/\b(\d+)\s*\/\s*\d+\b/) || [])[1] || 0))
        )
      );
      finish(`${bar} ${message}`);
    },
  };
};

const downloadBatch = async (
  items,
  label,
  concurrency,
  progressIntervalMs,
  progressBarWidth,
  requestDelayMs = 0,
  options = {}
) => {
  const { compress = false, format } = options;

  console.log(`\nProcessing ${label}...`);
  let success = 0;
  let fail = 0;
  let skipped = 0;
  const total = items.length;
  let index = 0;
  const tracker = createProgressTracker(label, total, progressIntervalMs, progressBarWidth);

  await runConcurrent(items, concurrency, async (item) => {
    index += 1;
    const targetUrl = extractDirectUrl(item.url);
    if (!targetUrl) {
      fail += 1;
      tracker.update({ current: index, ok: success, skip: skipped, fail });
      return;
    }
    if (fs.existsSync(item.dest)) {
      skipped += 1;
      tracker.update({ current: index, ok: success, skip: skipped, fail });
      return;
    }
    try {
      const result = compress
        ? await downloadAndCompressImage(targetUrl, item.dest, requestDelayMs, { format })
        : await downloadFile(targetUrl, item.dest, requestDelayMs);
      if (result) {
        success += 1;
      } else {
        fail += 1;
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      fail += 1;
    }
    tracker.update({ current: index, ok: success, skip: skipped, fail });
  });
  tracker.done({ current: index, ok: success, skip: skipped, fail });
  console.log(`Completed ${label}: ${success} downloaded, ${fail} failed/skipped.`);
  return { success, fail, skipped, total: index };
};

const stripUrlPunctuation = (value) => value.replace(/[).,:;]+$/g, '');

const normalizePocketUrl = (url) => {
  if (!url) return url;
  let normalized = decodeHtml(url.trim());
  normalized = stripUrlPunctuation(normalized);
  if (normalized.startsWith('http://')) {
    normalized = `https://${normalized.slice(7)}`;
  }
  return normalized;
};

const extractDirectUrl = (url) => {
  if (!url) return null;
  const clean = normalizePocketUrl(url);
  try {
    const decoded = clean.replace(/&amp;/g, '&');
    const parsed = new URL(decoded, SOURCE_BASE);
    if (parsed.pathname.startsWith('/_next/image')) {
      const raw = parsed.searchParams.get('url');
      if (raw) {
        const decodedParam = decodeURIComponent(raw);
        return `${SOURCE_BASE}${decodedParam}`;
      }
    }
    return parsed.href;
  } catch (error) {
    return clean;
  }
};

const extractImageUrls = (value) => {
  if (!value) return [];
  const matches = Array.from(value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g));
  return matches.map((match) => extractDirectUrl(match[1])).filter(Boolean);
};

const extractImageUrlsFromHtml = (value) => {
  if (!value) return [];
  const urls = [];
  const srcRegex = /<img[^>]+src="([^"]+)"/gi;
  let match;
  while ((match = srcRegex.exec(value)) !== null) {
    urls.push(match[1]);
  }
  return urls.map((url) => extractDirectUrl(url)).filter(Boolean);
};

const extractImageUrlsAny = (value) =>
  unique([...extractImageUrls(value), ...extractImageUrlsFromHtml(value)]);

const extractCardUrls = (markdown) => {
  const matches = Array.from(
    markdown.matchAll(/https?:\/\/pocket\.pokemongohub\.net\/en\/card\/[^)\s]+/gi)
  );
  const relativeMatches = Array.from(markdown.matchAll(/\/en\/card\/[^"'\\s)<>]+/gi)).map(
    (match) => `${SOURCE_BASE}${match[0]}`
  );
  return matches
    .map((match) => normalizePocketUrl(match[0]))
    .concat(relativeMatches.map((url) => normalizePocketUrl(url)))
    .filter(Boolean);
};

const extractCardUrlsFromBoosterHtml = (html) => {
  if (!html) return [];
  const anchorRegex = /<a[^>]+href="([^"]*\/en\/card\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const urls = [];
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const inner = match[2] || '';
    if (!/\/tcg-pocket\/cards\//i.test(inner) && !/tcg-pocket%2Fcards/i.test(inner)) continue;
    const absolute = href.startsWith('http') ? href : `${SOURCE_BASE}${href}`;
    urls.push(normalizePocketUrl(absolute));
  }
  return unique(urls).filter(Boolean);
};

const extractBoosterUrls = (markdown) => {
  const matches = Array.from(
    markdown.matchAll(/https?:\/\/pocket\.pokemongohub\.net\/en\/booster\/[^)\s]+/gi)
  );
  const relativeMatches = Array.from(markdown.matchAll(/\/en\/booster\/[^"'\\s)<>]+/gi)).map(
    (match) => `${SOURCE_BASE}${match[0]}`
  );
  return matches
    .map((match) => normalizePocketUrl(match[0]))
    .concat(relativeMatches.map((url) => normalizePocketUrl(url)))
    .filter(Boolean);
};

const parseSlugFromPath = (pathValue, prefix) => {
  const cleaned = pathValue.split('?')[0];
  const parts = cleaned.split('/').filter(Boolean);
  const index = parts.indexOf(prefix);
  if (index === -1 || !parts[index + 1]) return '';
  const raw = parts[index + 1];
  const hyphenIndex = raw.indexOf('-');
  if (hyphenIndex === -1) return raw;
  return raw.slice(hyphenIndex + 1);
};

const parseMainPage = (markdown) => {
  const sets = [];
  const packs = [];
  const colors = [];
  const categories = [];

  const setRegex = /\*\s+\[!\[[^\]]*]\(([^)]+)\)\s*([^\]]+?)\]\((https?:\/\/pocket\.pokemongohub\.net\/en\/set\/[^)]+)\)/g;
  let setMatchCount = 0;
  let match;
  while ((match = setRegex.exec(markdown)) !== null) {
    const imageUrl = extractDirectUrl(match[1]);
    const text = normalizeDisplayText(match[2]);
    const url = normalizePocketUrl(match[3]);
    const infoMatch = /(.*?)\s+Released on\s+([0-9/]+)\s+This set contains\s+(\d+)\s+cards?/i.exec(text);
    const name = infoMatch ? infoMatch[1].trim() : extractSetNameFromText(text);
    const releaseDate = infoMatch ? infoMatch[2] : undefined;
    const totalCards = infoMatch ? Number(infoMatch[3]) : undefined;
    const slug = parseSlugFromPath(url, 'set');
    sets.push({ name, releaseDate, totalCards, imageUrl, url, slug });
    setMatchCount += 1;
  }

  const packRegex = /\*\s+\[!\[[^\]]*]\(([^)]+)\)\s*([^\]]+?)\]\((https?:\/\/pocket\.pokemongohub\.net\/en\/booster\/[^)]+)\)/g;
  let packMatchCount = 0;
  while ((match = packRegex.exec(markdown)) !== null) {
    const imageUrl = extractDirectUrl(match[1]);
    const text = normalizeDisplayText(match[2]);
    const url = normalizePocketUrl(match[3]);
    const packTitle = normalizePackTitle(text);
    let setName = packTitle;
    let packName = packTitle;
    if (packTitle.includes(':')) {
      const parts = packTitle.split(':');
      setName = parts.shift()?.trim() || packTitle;
      packName = parts.join(':').trim() || packTitle;
    }
    const slug = parseSlugFromPath(url, 'booster');
    packs.push({ setName, packName, imageUrl, url, slug });
    packMatchCount += 1;
  }

  const colorRegex = /\[!\[[^\]]*]\(([^)]+eng-([a-z0-9-]+)\.png[^)]*)\)\*\*([^*]+) Cards\*\*]\((https?:\/\/pocket\.pokemongohub\.net\/en\/color\/[^)]+)\)/gi;
  let colorMatchCount = 0;
  while ((match = colorRegex.exec(markdown)) !== null) {
    const imageUrl = extractDirectUrl(match[1]);
    const key = match[2];
    const label = normalizeWhitespace(match[3]);
    const url = normalizePocketUrl(match[4]);
    colors.push({ key, label, imageUrl, url });
    colorMatchCount += 1;
  }

  const categoryRegex = /\[!\[[^\]]*]\(([^)]+(ex-logo|item-logo|pokemon-tool-logo|supporter-logo)\.png[^)]*)\)\*\*([^*]+)\*\*]\((https?:\/\/pocket\.pokemongohub\.net\/en\/[^)]+)\)/gi;
  let categoryMatchCount = 0;
  while ((match = categoryRegex.exec(markdown)) !== null) {
    const imageUrl = extractDirectUrl(match[1]);
    const iconFile = match[2];
    const label = normalizeWhitespace(match[3]);
    const url = normalizePocketUrl(match[4]);
    categories.push({ iconFile, label, imageUrl, url });
    categoryMatchCount += 1;
  }

  const rarityIcons = {
    diamond: extractDirectUrl(
      (markdown.match(/cmn_icn_rarity_01\.png[^)]*/i) || [])[0]
        ? `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_01.png`
        : ''
    ),
    star: extractDirectUrl(
      (markdown.match(/cmn_icn_rarity_02\.png[^)]*/i) || [])[0]
        ? `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_02.png`
        : ''
    ),
    crown: extractDirectUrl(
      (markdown.match(/cmn_icn_rarity_03\.png[^)]*/i) || [])[0]
        ? `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_03.png`
        : ''
    ),
    shiny: extractDirectUrl(
      (markdown.match(/shiny1\.png[^)]*/i) || [])[0]
        ? `${SOURCE_BASE}/tcg-pocket/icons/shiny1.png`
        : ''
    ),
  };

  return {
    sets,
    packs,
    colors,
    categories,
    rarityIcons,
    debug: { setMatchCount, packMatchCount, colorMatchCount, categoryMatchCount },
  };
};

const stripHtml = (value) =>
  normalizeWhitespace(
    decodeHtml(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
  );

const parseMainPageHtml = (html) => {
  const anchors = [];
  const regex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const inner = match[2];
    const imgMatch = /<img[^>]*src="([^"]+)"/i.exec(inner);
    anchors.push({
      href: href.startsWith('/') ? `${SOURCE_BASE}${href}` : href,
      text: stripHtml(inner),
      img: imgMatch ? (imgMatch[1].startsWith('/') ? `${SOURCE_BASE}${imgMatch[1]}` : imgMatch[1]) : '',
    });
  }

  const sets = anchors
    .filter((entry) => entry.href.includes('/en/set/'))
    .map((entry) => ({
      name: extractSetNameFromText(entry.text),
      releaseDate: undefined,
      totalCards: undefined,
      imageUrl: normalizeImageUrl(entry.img),
      url: entry.href,
      slug: parseSlugFromPath(entry.href, 'set'),
    }));

  const packs = anchors
    .filter((entry) => entry.href.includes('/en/booster/'))
    .map((entry) => {
      const normalizedText = normalizePackTitle(entry.text);
      return {
        setName: normalizedText.split(':')[0] || normalizedText,
        packName: normalizedText.includes(':')
          ? normalizedText.split(':').slice(1).join(':').trim()
          : normalizedText,
        imageUrl: normalizeImageUrl(entry.img),
        url: entry.href,
        slug: parseSlugFromPath(entry.href, 'booster'),
      };
    });

  const colors = anchors
    .filter((entry) => entry.href.includes('/en/color/'))
    .map((entry) => ({
      key: entry.href.split('/').pop() || '',
      label: normalizeDisplayText(entry.text).replace(/Cards$/i, '').trim(),
      imageUrl: normalizeImageUrl(entry.img),
      url: entry.href,
    }));

  const categories = anchors
    .filter((entry) =>
      ['/en/ex-cards', '/en/item-cards', '/en/pokemon-tool-cards', '/en/supporter-cards'].some(
        (slug) => entry.href.includes(slug)
      )
    )
    .map((entry) => ({
      iconFile: entry.img.split('/').pop() || '',
      label: normalizeDisplayText(entry.text),
      imageUrl: normalizeImageUrl(entry.img),
      url: entry.href,
    }));

  const rarityIcons = {
    diamond: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_01.png`,
    star: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_02.png`,
    crown: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_03.png`,
    shiny: `${SOURCE_BASE}/tcg-pocket/icons/shiny1.png`,
  };

  return { sets, packs, colors, categories, rarityIcons };
};

const loadManualData = () => {
  if (!fs.existsSync(MANUAL_FILE)) {
    return { setIds: {}, packs: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf8'));
    return {
      setIds: raw.setIds || {},
      packs: raw.packs || {},
    };
  } catch (error) {
    console.warn(`Failed to read ${MANUAL_FILE}, starting fresh.`);
    return { setIds: {}, packs: {} };
  }
};

const saveManualData = (manual) => {
  ensureDir(DATA_DIR);
  fs.writeFileSync(MANUAL_FILE, JSON.stringify(manual, null, 2));
};

const promptUser = async (promptText) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(promptText, resolve));
  rl.close();
  return answer;
};

const promptForSetIds = async (sets, manual) => {
  const missing = sets.filter((setInfo) => !manual.setIds[setInfo.slug]);
  if (missing.length === 0) return manual;

  console.log('\nMissing set IDs. Please provide the IDs used in the app (e.g. A1, A1a).');
  for (const setInfo of missing) {
    let answer = '';
    while (!answer) {
      const displayName = extractSetNameFromText(setInfo.name);
      answer = normalizeWhitespace(await promptUser(`Set ID for "${displayName}": `));
    }
    manual.setIds[setInfo.slug] = answer;
  }
  saveManualData(manual);
  return manual;
};

const parsePackInput = (input) => {
  const trimmed = normalizeWhitespace(input);
  if (!trimmed || trimmed.toLowerCase() === 'none') return [];
  const entries = trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
  const packs = [];
  entries.forEach((entry) => {
    const separator = entry.includes('=') ? '=' : ':';
    const parts = entry.split(separator).map((part) => part.trim());
    if (parts.length === 0) return;
    const id = parts[0];
    const name = parts[1] || id;
    if (!id) return;
    packs.push({ id, name });
  });
  return packs;
};

const promptForPackData = async (sets, manual) => {
  let updated = false;
  for (const setInfo of sets) {
    const setId = manual.setIds[setInfo.slug];
    if (!setId) continue;
    const existing = manual.packs[setId];
    if (Array.isArray(existing)) continue;

    console.log(`\nMissing pack data for ${setId} (${setInfo.name}).`);
    console.log('Enter packs as id=name pairs, comma-separated. Example: mewtwo=Mewtwo,pikachu=Pikachu');
    console.log('Leave blank or type "none" if the set has no booster packs.');

    let parsed = null;
    while (!Array.isArray(parsed)) {
      const answer = await promptUser(`Packs for ${setId}: `);
      parsed = parsePackInput(answer);
    }
    manual.packs[setId] = parsed;
    updated = true;
  }

  if (updated) {
    saveManualData(manual);
  }
  return manual;
};

const ENERGY_TYPE_MAP = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  colorless: 'Colorless',
};

const normalizeEnergyType = (value) => {
  if (!value) return undefined;
  const key = value.toLowerCase();
  return ENERGY_TYPE_MAP[key] || undefined;
};

const extractEnergyFromUrl = (url) => {
  const match = /eng-([a-z0-9-]+)\.png/i.exec(url || '');
  return normalizeEnergyType(match ? match[1] : undefined);
};

const toEnergyCounts = (energies) => {
  const counts = {};
  energies.forEach((energy) => {
    if (!energy) return;
    counts[energy] = (counts[energy] || 0) + 1;
  });
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
};
const parseCardStats = (markdown) => {
  const stats = {};
  const sectionIndex = markdown.indexOf('Card Stats');
  if (sectionIndex === -1) return stats;
  const tail = markdown.slice(sectionIndex);
  const endMatch = /\n[A-Za-z].*\n[-]{2,}\n/.exec(tail.slice(10));
  const section = endMatch ? tail.slice(0, endMatch.index + 10) : tail;
  const rows = section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim());

  rows.forEach((line) => {
    const parts = line.split('|').map((part) => normalizeWhitespace(part));
    if (parts.length < 3) return;
    const key = parts[1];
    const value = parts[2];
    if (!key || key === '---') return;
    stats[key] = value;
  });

  if (!stats['Card Number']) {
    const numberMatch = /Card Number\s*\|\s*(\d+)/i.exec(section);
    if (numberMatch) stats['Card Number'] = numberMatch[1];
  }

  return stats;
};

const isHtmlDocument = (value) => /<!doctype html|<html/i.test(value || '');

const parseCardStatsFromHtml = (html) => {
  const stats = {};
  const tableMatch = /<h2[^>]*>\s*Card Stats\s*<\/h2>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i.exec(
    html
  );
  const tableHtml = tableMatch ? tableMatch[1] : html;
  const rowRegex =
    /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(tableHtml)) !== null) {
    const key = stripHtml(match[1]);
    if (!key) continue;
    stats[key] = match[2];
  }
  return stats;
};

const extractSectionHtml = (html, title) => {
  if (!html) return '';
  const regex = new RegExp(
    `<h2[^>]*>\\s*${title}\\s*<\\/h2>([\\s\\S]*?)(?=<h2|$)`,
    'i'
  );
  const match = regex.exec(html);
  return match ? match[1] : '';
};

const parseRaritySymbol = (value) => {
  const urls = extractImageUrlsAny(value || '');
  const counts = {
    diamond: urls.filter((url) => /cmn_icn_rarity_01\.png/i.test(url)).length,
    star: urls.filter((url) => /cmn_icn_rarity_02\.png/i.test(url)).length,
    crown: urls.filter((url) => /cmn_icn_rarity_03\.png/i.test(url)).length,
    shiny: urls.filter((url) => /shiny1\.png/i.test(url)).length,
  };

  if (counts.shiny > 0) {
    return counts.shiny >= 2 ? 'shiny2' : 'shiny1';
  }
  if (counts.crown > 0) return 'crown';
  if (counts.star > 0) {
    const count = Math.min(3, counts.star);
    return `star${count}`;
  }
  if (counts.diamond > 0) {
    const count = Math.min(4, counts.diamond);
    return `diamond${count}`;
  }
  return undefined;
};

const parseWeakness = (value) => {
  const urls = extractImageUrlsAny(value || '');
  const type = urls.map(extractEnergyFromUrl).find(Boolean);
  const numberMatch = /([+-]?\d+)/.exec(value || '');
  if (!type || !numberMatch) return undefined;
  return { type, value: Number(numberMatch[1]) };
};

const parseRetreatCost = (value) => {
  const urls = extractImageUrlsAny(value || '');
  const energies = urls.map(extractEnergyFromUrl).filter(Boolean);
  const costs = toEnergyCounts(energies);
  return costs.length ? costs : undefined;
};

const extractSection = (markdown, title, endTitles) => {
  const startIndex = markdown.indexOf(title);
  if (startIndex === -1) return '';
  const slice = markdown.slice(startIndex + title.length);
  let endIndex = slice.length;
  for (const endTitle of endTitles) {
    const idx = slice.indexOf(endTitle);
    if (idx !== -1 && idx < endIndex) endIndex = idx;
  }
  return slice.slice(0, endIndex);
};

const parseMoves = (markdown) => {
  const section = extractSection(markdown, 'Moves', [
    'Card Stats',
    'Abilities',
    'Ability',
    'Pull Rates',
    'Set',
    'Wallpaper',
    'Full Art',
  ]);
  if (!section) return [];
  const lines = section.split('\n');
  const moves = [];
  let currentMove = null;
  let pendingEnergies = [];
  let descriptionLines = [];
  let expectingDamage = false;

  const flushMove = () => {
    if (!currentMove) return;
    const text = normalizeWhitespace(descriptionLines.join(' '));
    if (text) currentMove.text = text;
    moves.push(currentMove);
    currentMove = null;
    descriptionLines = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.includes('![Image') && line.includes('eng-')) {
      const urls = extractImageUrls(line);
      urls.forEach((url) => {
        const energy = extractEnergyFromUrl(url);
        if (energy) pendingEnergies.push(energy);
      });
      return;
    }

    if (line.startsWith('### ')) {
      flushMove();
      const name = normalizeWhitespace(line.replace(/^###\s+/, ''));
      currentMove = { name, cost: toEnergyCounts(pendingEnergies) };
      pendingEnergies = [];
      expectingDamage = true;
      return;
    }

    if (!currentMove) return;

    if (expectingDamage) {
      if (line.startsWith('*') || line.includes('![Image')) return;
      const damageMatch = line.match(/-?\d+/);
      if (damageMatch) {
        currentMove.damage = Number(damageMatch[0]);
      } else {
        descriptionLines.push(line);
      }
      expectingDamage = false;
      return;
    }

    if (line.startsWith('*') || line.includes('![Image')) return;
    descriptionLines.push(line);
  });

  flushMove();
  return moves;
};

const parseAbilities = (markdown) => {
  const section = extractSection(markdown, 'Abilities', [
    'Moves',
    'Card Stats',
    'Pull Rates',
    'Set',
    'Wallpaper',
    'Full Art',
  ]);
  if (!section) return [];
  const lines = section.split('\n');
  const abilities = [];
  let current = null;
  let descriptionLines = [];

  const flushAbility = () => {
    if (!current) return;
    const text = normalizeWhitespace(descriptionLines.join(' '));
    if (text) current.text = text;
    abilities.push(current);
    current = null;
    descriptionLines = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('### ')) {
      flushAbility();
      const name = normalizeWhitespace(line.replace(/^###\s+/, ''));
      current = { name };
      return;
    }
    if (!current) return;
    if (line.startsWith('*') || line.includes('![Image')) return;
    descriptionLines.push(line);
  });

  flushAbility();
  return abilities;
};

const parseCardMetaLine = (markdown) => {
  const line = markdown.split('\n').find((value) => /illustrated by/i.test(value));
  return line || '';
};

const parseIllustrator = (markdown) => {
  const line = markdown.split('\n').find((value) => /Illustrator:/i.test(value));
  if (line) {
    const match = /Illustrator:\s*([^\n]+)/i.exec(line);
    if (match) return normalizeWhitespace(match[1]);
  }
  const metaLine = parseCardMetaLine(markdown);
  const match = /illustrated by\s+([^\.]+)/i.exec(metaLine || '');
  return match ? normalizeWhitespace(match[1]) : undefined;
};

const parseCardType = (markdown) => {
  const metaLine = parseCardMetaLine(markdown).toLowerCase();
  if (metaLine.includes('pokemon tool card')) return 'pokemonTool';
  if (metaLine.includes('supporter card')) return 'supporter';
  if (metaLine.includes('item card')) return 'item';
  if (metaLine.includes('pokemon card')) return 'pokemon';
  return 'pokemon';
};

const parseSetName = (markdown) => {
  const metaLine = parseCardMetaLine(markdown);
  const match = /from the\s+(.+?)\s+set/i.exec(metaLine || '');
  if (match) return normalizeWhitespace(match[1]);
  const titleMatch = /Title:\s*[^\(]+\(([^#]+)#/i.exec(markdown);
  if (titleMatch) return normalizeWhitespace(titleMatch[1]);
  return '';
};

const parseCardName = (markdown) => {
  const headingLine = markdown.split('\n').find((line) => line.trim().startsWith('# '));
  if (headingLine) return normalizeWhitespace(headingLine.replace(/^#\s+/, ''));
  const titleMatch = /Title:\s*([^\(]+)\(/i.exec(markdown);
  return titleMatch ? normalizeWhitespace(titleMatch[1]) : '';
};

const parseCardNumberFromStats = (stats) => {
  const value = stats['Card Number'] || '';
  const match = /(\d+)/.exec(value);
  return match ? Number(match[1]) : undefined;
};

const parseCostToCraft = (stats) => {
  const value = stats['Cost to craft'] || '';
  const match = /(\d+)/.exec(value);
  return match ? Number(match[1]) : undefined;
};

const parseEnergyType = (stats) => {
  const value = stats['Energy type'] || '';
  const urls = extractImageUrlsAny(value);
  const energy = urls.map(extractEnergyFromUrl).find(Boolean);
  if (energy) return energy;
  const text = stripHtml(normalizeWhitespace(value.replace(/!\[[^\]]*]\([^)]+\)/g, '')));
  return normalizeEnergyType(text);
};

const parseHealth = (stats) => {
  const value = stats['Health'] || '';
  const match = /(\d+)/.exec(value);
  return match ? Number(match[1]) : undefined;
};

const parseStage = (stats) => {
  const value = stats['Stage'] || '';
  const text = stripHtml(normalizeWhitespace(value.replace(/\*\*/g, '')));
  return text || undefined;
};

const parseDescription = (stats) => {
  const value = stats['Description'] || '';
  const text = stripHtml(normalizeWhitespace(value.replace(/\*\*/g, '')));
  return text || undefined;
};

const parseRarityLabel = (stats) => {
  const value = stats['Rarity description'] || '';
  const text = stripHtml(normalizeWhitespace(value.replace(/\*\*/g, '')));
  return text || undefined;
};

const parseCardImages = (markdown) => {
  const directUrls = extractImageUrlsAny(markdown);
  const ogMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(markdown || '');
  if (ogMatch && ogMatch[1]) {
    directUrls.push(extractDirectUrl(ogMatch[1]));
  }
  const cardUrl = directUrls.find(
    (url) => url.includes('/tcg-pocket/cards/') && !url.includes('/wallpapers/')
  );
  const wallpaperUrl = directUrls.find((url) => url.includes('/tcg-pocket/cards/wallpapers/'));
  const fullArtUrl = directUrls.find((url) => url.includes('/tcg-pocket/illustrations/'));
  return {
    cardUrl: cardUrl ? normalizePocketUrl(cardUrl) : undefined,
    wallpaperUrl: wallpaperUrl ? normalizePocketUrl(wallpaperUrl) : undefined,
    fullArtUrl: fullArtUrl ? normalizePocketUrl(fullArtUrl) : undefined,
  };
};

const parseCardNameFromHtml = (html) => {
  const match = /<h1[^>]*class="[^"]*text-4xl[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (match) return stripHtml(match[1]);
  const metaMatch = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i.exec(html);
  if (metaMatch) {
    const text = decodeHtml(metaMatch[1]);
    const nameMatch = /^([^()]+)\s*\(/.exec(text);
    return nameMatch ? nameMatch[1].trim() : text.trim();
  }
  return '';
};

const parseSetNameFromHtml = (html) => {
  const match = /href="\/en\/set\/[^"]+">([^<]+)<\/a>/i.exec(html);
  if (match) return stripHtml(match[1]);
  const summaryMatch = /card from the\s+([^<]+?)\s+set/i.exec(stripHtml(html));
  return summaryMatch ? summaryMatch[1].trim() : '';
};

const parseIllustratorFromHtml = (html) => {
  const emMatch = /<em[^>]*>[\s\S]*?Illustrator[\s\S]*?<\/em>/i.exec(html);
  if (emMatch) {
    const text = stripHtml(emMatch[0]);
    const match = /Illustrator:\s*(.+)$/i.exec(text);
    if (match) return match[1].trim();
  }
  return undefined;
};

const parseCardTypeFromHtml = (html) => {
  const summaryMatch = /<p[^>]*class="[^"]*prose[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const text = summaryMatch ? stripHtml(summaryMatch[1]) : '';
  const match = /It is a\s+([^\.]+)\s+card/i.exec(text);
  const descriptor = match ? match[1].toLowerCase() : '';
  if (descriptor.includes('supporter')) return 'supporter';
  if (descriptor.includes('pokemon tool') || descriptor.includes('pokémon tool')) return 'pokemonTool';
  if (descriptor.includes('item')) return 'item';
  return 'pokemon';
};

const parseMovesFromHtml = (html) => {
  const section = extractSectionHtml(html, 'Moves');
  if (!section) return [];
  const items = Array.from(
    section.matchAll(/<li[^>]*class="[^"]*p-4[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)
  );
  return items.map((item) => {
    const chunk = item[1];
    const nameMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
    const name = nameMatch ? stripHtml(nameMatch[1]) : '';
    const damageMatch = /<span[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)/i.exec(chunk);
    const damage = damageMatch ? Number((damageMatch[1].match(/-?\d+/) || [])[0]) : undefined;
    const descMatch = /<p[^>]*class="[^"]*text-sm[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    const text = descMatch ? stripHtml(descMatch[1]) : '';
    const energies = extractImageUrlsFromHtml(chunk).map(extractEnergyFromUrl).filter(Boolean);
    const move = { name, cost: toEnergyCounts(energies) };
    if (Number.isFinite(damage)) move.damage = damage;
    if (text) move.text = text;
    return move;
  }).filter((move) => move.name);
};

const parseAbilitiesFromHtml = (html) => {
  const section = extractSectionHtml(html, 'Abilities') || extractSectionHtml(html, 'Ability');
  if (!section) return [];
  const items = Array.from(
    section.matchAll(/<li[^>]*class="[^"]*p-4[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)
  );
  return items
    .map((item) => {
      const chunk = item[1];
      const nameMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(chunk);
      const name = nameMatch ? stripHtml(nameMatch[1]) : '';
      const descMatch = /<p[^>]*class="[^"]*text-sm[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
      const text = descMatch ? stripHtml(descMatch[1]) : '';
      const ability = { name };
      if (text) ability.text = text;
      return ability;
    })
    .filter((ability) => ability.name);
};

const determineExStatus = (name) => {
  const lower = name.toLowerCase();
  if (lower.includes('mega ') && lower.includes(' ex')) return 'mega-ex';
  if (lower.includes(' ex')) return 'ex';
  return 'non-ex';
};

const parseCardPageHtml = (html) => {
  if (/<title>Page Not Found/i.test(html)) return null;
  const stats = parseCardStatsFromHtml(html);
  const name = parseCardNameFromHtml(html);
  const setName = parseSetNameFromHtml(html);
  const number = parseCardNumberFromStats(stats);
  const illustrator = parseIllustratorFromHtml(html);
  const moves = parseMovesFromHtml(html);
  const abilities = parseAbilitiesFromHtml(html);
  const raritySymbol = parseRaritySymbol(stats['Rarity']);
  const rarityLabel = parseRarityLabel(stats);
  const energyType = parseEnergyType(stats);
  const health = parseHealth(stats);
  const stage = parseStage(stats);
  const weakness = parseWeakness(stats['Weakness']);
  const retreatCost = parseRetreatCost(stats['Retreat Cost']);
  const costToCraft = parseCostToCraft(stats);
  const description = parseDescription(stats);
  const type = parseCardTypeFromHtml(html);
  const exStatus = determineExStatus(name);
  const images = parseCardImages(html);
  const boosterUrls = extractBoosterUrls(html);

  return {
    name,
    setName,
    number,
    illustrator,
    moves,
    abilities,
    raritySymbol,
    rarityLabel,
    energyType,
    health,
    stage,
    weakness,
    retreatCost,
    costToCraft,
    description,
    type,
    exStatus,
    images,
    boosterUrls,
  };
};

const parseCardPage = (markdown) => {
  if (isHtmlDocument(markdown)) {
    return parseCardPageHtml(markdown);
  }
  const stats = parseCardStats(markdown);
  const name = parseCardName(markdown);
  const setName = parseSetName(markdown);
  const number = parseCardNumberFromStats(stats);
  const illustrator = parseIllustrator(markdown);
  const moves = parseMoves(markdown);
  const abilities = parseAbilities(markdown);
  const raritySymbol = parseRaritySymbol(stats['Rarity']);
  const rarityLabel = parseRarityLabel(stats);
  const energyType = parseEnergyType(stats);
  const health = parseHealth(stats);
  const stage = parseStage(stats);
  const weakness = parseWeakness(stats['Weakness']);
  const retreatCost = parseRetreatCost(stats['Retreat Cost']);
  const costToCraft = parseCostToCraft(stats);
  const description = parseDescription(stats);
  const type = parseCardType(markdown);
  const exStatus = determineExStatus(name);
  const images = parseCardImages(markdown);
  const boosterUrls = extractBoosterUrls(markdown);

  return {
    name,
    setName,
    number,
    illustrator,
    moves,
    abilities,
    raritySymbol,
    rarityLabel,
    energyType,
    health,
    stage,
    weakness,
    retreatCost,
    costToCraft,
    description,
    type,
    exStatus,
    images,
    boosterUrls,
  };
};

const mapCardBoosterPacks = (boosterUrls, packs, setsByName, manual) => {
  if (!boosterUrls || boosterUrls.length === 0) return [];
  const ids = new Set();
  boosterUrls.forEach((url) => {
    const slug = parseSlugFromPath(url, 'booster');
    const packEntry = packs.find((pack) => pack.slug === slug);
    if (!packEntry) return;
    const setInfo = setsByName.get(normalizeKey(packEntry.setName));
    if (!setInfo) return;
    const setId = manual.setIds[setInfo.slug];
    if (!setId) return;
    const packList = manual.packs[setId] || [];
    const match = packList.find(
      (item) => normalizeKey(item.name) === normalizeKey(packEntry.packName)
    );
    if (match) ids.add(match.id);
  });
  return Array.from(ids);
};

const resolvePackAsset = (setInfo, packEntry, allPacks) => {
  const setKey = normalizeKey(setInfo.name);
  const packKey = normalizeKey(packEntry.name);
  let match = allPacks.find(
    (pack) => normalizeKey(pack.setName) === setKey && normalizeKey(pack.packName) === packKey
  );
  if (!match) {
    match = allPacks.find(
      (pack) =>
        normalizeKey(pack.setName) === setKey &&
        normalizeKey(pack.slug).includes(normalizeKey(packEntry.id))
    );
  }
  return match || null;
};
// ============================================================================
// MAIN EXECUTION
// ============================================================================

const run = async () => {
  const args = new Set(process.argv.slice(2));
  const assetsOnly = args.has('--assets-only');
  const dataOnly = args.has('--data-only');
  const includeStage = !args.has('--skip-stage');
  const keepCache = args.has('--keep-cache');
  const maxConcurrency = toNumber(getArgValue('--concurrency', ''), 0);
  const assetConcurrency = toNumber(
    getArgValue('--concurrency-assets', ''),
    maxConcurrency || DEFAULT_ASSET_CONCURRENCY
  );
  const dataConcurrency = toNumber(
    getArgValue('--concurrency-data', ''),
    maxConcurrency || DEFAULT_DATA_CONCURRENCY
  );
  const progressIntervalMs = toNumber(getArgValue('--progress-ms', ''), 250);
  const progressBarWidth = toNumber(getArgValue('--progress-width', ''), 28);
  const fetchDelayMs = toNumber(getArgValue('--fetch-delay', ''), DEFAULT_FETCH_DELAY_MS);
  const fetchRetry = toNumber(getArgValue('--fetch-retry', ''), 6);
  const fetchCooldownMs = toNumber(getArgValue('--fetch-cooldown', ''), 20000);
  const assetDelayMs = toNumber(getArgValue('--asset-delay', ''), DEFAULT_ASSET_DELAY_MS);
  const cacheHours = toNumber(getArgValue('--cache-hours', ''), 168);
  const forceRefresh = args.has('--force-refresh');
  const allowBrowserBypass = !args.has('--no-browser');
  const fetchOptions = {
    maxRetries: fetchRetry,
    cooldownMs: fetchCooldownMs,
    cacheMaxAgeMs: cacheHours * 60 * 60 * 1000,
    forceRefresh,
    allowBrowserBypass,
  };
  const setArgIndex = process.argv.indexOf('--set');
  const setFilter = setArgIndex !== -1 ? process.argv[setArgIndex + 1] : null;
  const setIdsFilter = setFilter
    ? new Set(
        setFilter
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    : null;
  const limitCards = toNumber(getArgValue('--limit-cards', ''), 0);

  const summary = {
    sets: 0,
    assets: { downloaded: 0, skipped: 0, failed: 0 },
    data: { parsed: 0, failed: 0, setFiles: 0, indexWritten: false },
  };

  const cleanupCache = () => {
    if (keepCache) return;
    if (!fs.existsSync(CACHE_DIR)) return;
    try {
      removeDir(CACHE_DIR);
      console.log('\nCache cleared.');
    } catch (error) {
      // ignore cleanup issues
    }
  };

  try {
    console.log('Starting PocketGoHub sync...');

    ensureDir(ASSETS_ROOT);
    ensureDir(DATA_DIR);
    ensureDir(DATA_SETS_DIR);

    if (!assetsOnly) {
      removeFile(INDEX_FILE);
      removeDir(DATA_SETS_DIR);
      ensureDir(DATA_SETS_DIR);
    }

    if (!dataOnly) {
      removeDir(path.join(ASSETS_ROOT, 'cards'));
      removeDir(path.join(ASSETS_ROOT, 'sets'));
      removeDir(path.join(ASSETS_ROOT, 'icons'));
    }

    if (allowBrowserBypass) {
      await ensureBrowserSession();
    }

    const mainPage = await fetchMarkdown('/en', fetchDelayMs, fetchOptions);
    if (!mainPage) throw new Error('Failed to load main page.');

  let parsedMain = parseMainPage(mainPage);
  if (parsedMain.sets.length === 0) {
    const cachedMain = readCacheAny(`${SOURCE_BASE}/en`);
    if (cachedMain) {
      parsedMain = parseMainPage(cachedMain);
    }
  }

  let { sets, packs, colors, categories, rarityIcons } = parsedMain;
  if (sets.length === 0 && mainPage.toLowerCase().includes('<!doctype html')) {
    const htmlParsed = parseMainPageHtml(mainPage);
    if (htmlParsed.sets.length > 0) {
      sets = htmlParsed.sets;
      packs = htmlParsed.packs;
      colors = htmlParsed.colors;
      categories = htmlParsed.categories;
      rarityIcons = htmlParsed.rarityIcons;
      console.warn('Main page parse failed; using HTML anchor extraction.');
    }
  }
  if (sets.length === 0 && allowBrowserBypass) {
    const browserData = await fetchMainPageDataViaBrowser();
    if (browserData) {
      sets = browserData.sets.map((entry) => ({
        name: extractSetNameFromText(entry.text),
        releaseDate: undefined,
        totalCards: undefined,
        imageUrl: normalizeImageUrl(entry.img),
        url: entry.href,
        slug: parseSlugFromPath(entry.href, 'set'),
      }));
      packs = browserData.packs.map((entry) => {
        const normalizedText = normalizePackTitle(entry.text);
        return {
          setName: normalizedText.split(':')[0] || normalizedText,
          packName: normalizedText.includes(':')
            ? normalizedText.split(':').slice(1).join(':').trim()
            : normalizedText,
          imageUrl: normalizeImageUrl(entry.img),
          url: entry.href,
          slug: parseSlugFromPath(entry.href, 'booster'),
        };
      });
      colors = browserData.colors.map((entry) => ({
        key: entry.href.split('/').pop() || '',
        label: normalizeDisplayText(entry.text).replace(/Cards$/i, '').trim(),
        imageUrl: normalizeImageUrl(entry.img),
        url: entry.href,
      }));
      categories = browserData.categories.map((entry) => ({
        iconFile: entry.img.split('/').pop() || '',
        label: normalizeDisplayText(entry.text),
        imageUrl: normalizeImageUrl(entry.img),
        url: entry.href,
      }));
      rarityIcons = {
        diamond: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_01.png`,
        star: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_02.png`,
        crown: `${SOURCE_BASE}/tcg-pocket/icons/cmn_icn_rarity_03.png`,
        shiny: `${SOURCE_BASE}/tcg-pocket/icons/shiny1.png`,
      };
      console.warn('Main page parse failed; using Playwright DOM extraction.');
    }
  }
  if (sets.length === 0) {
    const debugPath = path.join(CACHE_DIR, 'debug-main.html');
    ensureDir(CACHE_DIR);
    fs.writeFileSync(debugPath, mainPage);
    console.error(`Debug: saved main page HTML to ${debugPath}`);
    console.error(`Debug: parse matches -> sets:${parsedMain.debug?.setMatchCount ?? 0}, packs:${parsedMain.debug?.packMatchCount ?? 0}, colors:${parsedMain.debug?.colorMatchCount ?? 0}, categories:${parsedMain.debug?.categoryMatchCount ?? 0}`);
    console.error(`Debug: first 200 chars -> ${mainPage.slice(0, 200)}`);
    if (isCloudflareBlock(mainPage)) {
      throw new Error(
        'Main page is blocked by Cloudflare. Ensure Playwright is installed (npm install + npx playwright install chromium) or rerun without --no-browser.'
      );
    }
    let fallbackSets = [];
    if (fs.existsSync(INDEX_FILE)) {
      try {
        const existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        if (existingIndex && Array.isArray(existingIndex.sets)) {
          fallbackSets = existingIndex.sets.map((set) => ({
            name: set.name,
            releaseDate: set.releaseDate,
            totalCards: set.totalCards,
            imageUrl: getSetLogoPath(set.id),
            url: `${SOURCE_BASE}/en`,
            slug: set.slug || set.id.toLowerCase(),
          }));
        }
      } catch (error) {
        // ignore
      }
    }
    if (fallbackSets.length > 0) {
      console.warn('Main page parse failed; falling back to existing index.json sets.');
      parsedMain.sets = fallbackSets;
    } else {
      throw new Error('Failed to parse sets list from main page.');
    }
  }

  let manual = loadManualData();
  manual = await promptForSetIds(sets, manual);
  manual = await promptForPackData(sets, manual);

  const setsByName = new Map();
  sets.forEach((setInfo) => setsByName.set(normalizeKey(setInfo.name), setInfo));

  const selectedSets = setIdsFilter
    ? sets.filter((setInfo) => setIdsFilter.has(manual.setIds[setInfo.slug]))
    : sets;

  if (setIdsFilter && selectedSets.length === 0) {
    console.warn(`No matching set ids found for --set ${setFilter}`);
    return;
  }

  // Icons
  if (!dataOnly) {
    const rarityDir = path.join(ASSETS_ROOT, 'icons', 'rarity');
    const typeDir = path.join(ASSETS_ROOT, 'icons', 'types');
    const categoryDir = path.join(ASSETS_ROOT, 'icons', 'categories');
    ensureDir(rarityDir);
    ensureDir(typeDir);
    ensureDir(categoryDir);

    const rarityTasks = Object.entries(rarityIcons)
      .filter(([, url]) => url)
      .map(([key, url]) => ({ url, dest: path.join(rarityDir, `${key}.png`) }));

    const typeTasks = colors.map((entry) => ({
      url: entry.imageUrl,
      dest: path.join(typeDir, `${entry.key}.png`),
    }));

    const categoryMap = {
      'ex-logo': 'ex',
      'item-logo': 'item',
      'pokemon-tool-logo': 'pokemonTool',
      'supporter-logo': 'supporter',
    };

    const categoryTasks = categories.map((entry) => {
      const key = categoryMap[entry.iconFile] || entry.label;
      return { url: entry.imageUrl, dest: path.join(categoryDir, `${key}.png`) };
    });

    const rarityResult = await downloadBatch(
      rarityTasks,
      'Rarity Icons',
      assetConcurrency,
      progressIntervalMs,
      progressBarWidth,
      assetDelayMs,
      { compress: true, format: 'png' }
    );
    const typeResult = await downloadBatch(
      typeTasks,
      'Type Icons',
      assetConcurrency,
      progressIntervalMs,
      progressBarWidth,
      assetDelayMs,
      { compress: true, format: 'png' }
    );
    const categoryResult = await downloadBatch(
      categoryTasks,
      'Category Icons',
      assetConcurrency,
      progressIntervalMs,
      progressBarWidth,
      assetDelayMs,
      { compress: true, format: 'png' }
    );

    summary.assets.downloaded +=
      rarityResult.success + typeResult.success + categoryResult.success;
    summary.assets.failed += rarityResult.fail + typeResult.fail + categoryResult.fail;
    summary.assets.skipped +=
      rarityResult.skipped + typeResult.skipped + categoryResult.skipped;
  }

  // Set logos and pack art
  if (!dataOnly) {
    for (const setInfo of selectedSets) {
      const setId = manual.setIds[setInfo.slug];
      if (!setId) continue;
      const setDir = path.join(ASSETS_ROOT, 'sets', setId);
      ensureDir(setDir);
      const logoDest = path.join(setDir, 'logo.png');
      if (!fs.existsSync(logoDest)) {
        const logoUrl = extractDirectUrl(setInfo.imageUrl);
        if (!logoUrl) continue;
        try {
          await downloadAndCompressImage(logoUrl, logoDest, assetDelayMs, { format: 'png' });
        } catch (error) {
          console.warn(`Failed to download logo for ${setId}: ${error.message}`);
        }
      }

      const packEntries = manual.packs[setId] || [];
      const inferredPacks =
        packEntries.length === 0
          ? packs.filter((pack) => normalizeKey(pack.setName) === normalizeKey(setInfo.name))
          : [];
      const packTasks = packEntries
        .map((entry) => {
          const match = resolvePackAsset(setInfo, entry, packs);
          if (!match) {
            console.warn(`No pack art match for ${setId} ${entry.name}`);
            return null;
          }
          const packUrl = extractDirectUrl(match.imageUrl);
          if (!packUrl) return null;
          return {
            url: packUrl,
            dest: path.join(setDir, `pack_${entry.id}.png`),
          };
        })
        .filter(Boolean);

      const inferredTasks = inferredPacks
        .map((pack) => {
          const packUrl = extractDirectUrl(pack.imageUrl);
          if (!packUrl) return null;
          return {
            url: packUrl,
            dest: path.join(setDir, `pack_${pack.slug}.png`),
          };
        })
        .filter(Boolean);

      if (packTasks.length > 0) {
        const packResult = await downloadBatch(
          packTasks,
          `${setId} Packs`,
          assetConcurrency,
          progressIntervalMs,
          progressBarWidth,
          assetDelayMs,
          { compress: true, format: 'png' }
        );
        summary.assets.downloaded += packResult.success;
        summary.assets.failed += packResult.fail;
        summary.assets.skipped += packResult.skipped;
      } else if (inferredTasks.length > 0) {
        console.warn(
          `No manual packs for ${setId}; downloading ${inferredTasks.length} booster image(s) inferred from main page.`
        );
        const inferredResult = await downloadBatch(
          inferredTasks,
          `${setId} Packs (inferred)`,
          assetConcurrency,
          progressIntervalMs,
          progressBarWidth,
          assetDelayMs,
          { compress: true, format: 'png' }
        );
        summary.assets.downloaded += inferredResult.success;
        summary.assets.failed += inferredResult.fail;
        summary.assets.skipped += inferredResult.skipped;
      }
    }
  }

  // Discover card URLs from set pages (all sets use the same discovery path)
  const setListPages = selectedSets
    .filter((setInfo) => manual.setIds[setInfo.slug])
    .map((setInfo) => setInfo.url)
    .filter(Boolean);

  console.log(`\nDiscovering cards from ${setListPages.length} set page(s)...`);

  const cardUrlSet = new Set();
  for (const url of setListPages) {
    const markdown = await fetchMarkdown(url, fetchDelayMs, fetchOptions);
    let urls = [];
    if (markdown && !isCloudflareBlock(markdown)) {
      urls = extractCardUrls(markdown);
    }
    if ((urls.length === 0 || isCloudflareBlock(markdown)) && allowBrowserBypass) {
      const browserUrls = await fetchCardUrlsViaBrowser(url, { mode: 'generic' });
      if (browserUrls.length > 0) {
        urls = browserUrls;
      }
    }
    urls.forEach((cardUrl) => cardUrlSet.add(cardUrl));
    if (urls.length === 0) {
      console.warn(`Found 0 card URLs from ${url}`);
    } else {
      console.log(`Found ${urls.length} card URLs from ${url}`);
    }
  }

  let cardUrls = Array.from(cardUrlSet);
  if (limitCards > 0 && cardUrls.length > limitCards) {
    cardUrls = cardUrls.slice(0, limitCards);
    console.warn(`Limiting card processing to first ${limitCards} URLs (--limit-cards).`);
  }
  if (cardUrls.length === 0) {
    throw new Error('No card URLs discovered. Check set pages and retry.');
  }

  console.log(`\nDiscovered ${cardUrls.length} unique card URLs.`);

  const cardsBySet = new Map();

  let parsedCount = 0;
  let parseFailCount = 0;
  let parseFailLogged = 0;
  const tracker = createProgressTracker('Cards', cardUrls.length, progressIntervalMs, progressBarWidth);

  await runConcurrent(cardUrls, dataConcurrency, async (cardUrl, index) => {
    try {
      const markdown = await fetchMarkdown(cardUrl, fetchDelayMs, fetchOptions);
      if (!markdown) {
        parseFailCount += 1;
        tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
        return;
      }
      const parsed = parseCardPage(markdown);
      if (!parsed || !parsed.name || !parsed.number) {
        if (parseFailLogged < 5) {
          console.warn(
            `Parse failed for ${cardUrl} (name:${parsed?.name || 'none'}, number:${parsed?.number || 'none'})`
          );
          parseFailLogged += 1;
        }
        parseFailCount += 1;
        tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
        return;
      }

      const setInfo = setsByName.get(normalizeKey(parsed.setName));
      if (!setInfo) {
        console.warn(`Unknown set for card ${parsed.name}: ${parsed.setName}`);
        parseFailCount += 1;
        tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
        return;
      }

      const setId = manual.setIds[setInfo.slug];
      if (!setId) {
        console.warn(`Missing manual set ID for ${setInfo.name}`);
        parseFailCount += 1;
        tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
        return;
      }

      if (setIdsFilter && !setIdsFilter.has(setId)) {
        parsedCount += 1;
        tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
        return;
      }

      const boosterPacks = mapCardBoosterPacks(parsed.boosterUrls, packs, setsByName, manual);

      if (!dataOnly) {
        const setCardDir = path.join(ASSETS_ROOT, 'cards', setId);
        const wallpaperDir = path.join(setCardDir, 'wallpapers');
        const fullArtDir = path.join(setCardDir, 'fullart');
        ensureDir(setCardDir);
        ensureDir(wallpaperDir);
        ensureDir(fullArtDir);

        const cardFile = path.join(setCardDir, `${padNumber(parsed.number)}.${CARD_EXT}`);
        const wallpaperFile = parsed.images.wallpaperUrl
          ? path.join(wallpaperDir, `${padNumber(parsed.number)}.${WALLPAPER_EXT}`)
          : null;
        const fullArtFile = parsed.images.fullArtUrl
          ? path.join(fullArtDir, `${padNumber(parsed.number)}.${FULLART_EXT}`)
          : null;

        if (parsed.images.cardUrl && !fs.existsSync(cardFile)) {
          try {
            const ok = await downloadAndCompressImage(parsed.images.cardUrl, cardFile, assetDelayMs, {
              format: 'jpg',
              jpegQuality: 82,
            });
            summary.assets.downloaded += ok ? 1 : 0;
            summary.assets.failed += ok ? 0 : 1;
            if (!ok) {
              console.warn(`Failed card image ${parsed.images.cardUrl} (${cardUrl})`);
            }
          } catch (error) {
            console.warn(`Card image error ${parsed.images.cardUrl}: ${error.message}`);
            summary.assets.failed += 1;
          }
        } else {
          summary.assets.skipped += 1;
        }

        if (wallpaperFile && parsed.images.wallpaperUrl && !fs.existsSync(wallpaperFile)) {
          try {
            const ok = await downloadAndCompressImage(
              parsed.images.wallpaperUrl,
              wallpaperFile,
              assetDelayMs,
              { format: 'jpg', jpegQuality: 82 }
            );
            summary.assets.downloaded += ok ? 1 : 0;
            summary.assets.failed += ok ? 0 : 1;
            if (!ok) {
              console.warn(`Failed wallpaper ${parsed.images.wallpaperUrl} (${cardUrl})`);
            }
          } catch (error) {
            console.warn(`Wallpaper error ${parsed.images.wallpaperUrl}: ${error.message}`);
            summary.assets.failed += 1;
          }
        }

        if (fullArtFile && parsed.images.fullArtUrl && !fs.existsSync(fullArtFile)) {
          try {
            const ok = await downloadAndCompressImage(
              parsed.images.fullArtUrl,
              fullArtFile,
              assetDelayMs,
              { format: 'jpg', jpegQuality: 82 }
            );
            summary.assets.downloaded += ok ? 1 : 0;
            summary.assets.failed += ok ? 0 : 1;
            if (!ok) {
              console.warn(`Failed full art ${parsed.images.fullArtUrl} (${cardUrl})`);
            }
          } catch (error) {
            console.warn(`Full art error ${parsed.images.fullArtUrl}: ${error.message}`);
            summary.assets.failed += 1;
          }
        }
      }

      if (!assetsOnly) {
        const setCards = cardsBySet.get(setId) || [];
        setCards.push({
          set: setId,
          number: parsed.number,
          cardNumber: parsed.number,
          name: parsed.name,
          type: parsed.type,
          exStatus: parsed.exStatus,
          illustrator: parsed.illustrator,
          abilities: parsed.abilities,
          moves: parsed.moves,
          boosterPacks,
          description: parsed.description,
          costToCraft: parsed.costToCraft,
          energyType: parsed.energyType,
          raritySymbol: parsed.raritySymbol,
          rarityLabel: parsed.rarityLabel,
          health: parsed.health,
          stage: includeStage ? parsed.stage : undefined,
          weakness: parsed.weakness,
          retreatCost: parsed.retreatCost,
        });
        cardsBySet.set(setId, setCards);
      }

      parsedCount += 1;
      tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
    } catch (error) {
      parseFailCount += 1;
      tracker.update({ current: index + 1, ok: parsedCount, skip: 0, fail: parseFailCount });
    }
  });

  tracker.done({ current: cardUrls.length, ok: parsedCount, skip: 0, fail: parseFailCount });

  if (!assetsOnly) {
    const setData = [];

    for (const setInfo of selectedSets) {
      const setId = manual.setIds[setInfo.slug];
      if (!setId) continue;
      const cards = cardsBySet.get(setId) || [];
      cards.sort((a, b) => a.number - b.number);
      const packEntries = manual.packs[setId] || [];

      const payload = {
        generatedAt: new Date().toISOString(),
        source: `${SOURCE_BASE}/en`,
        set: {
          id: setId,
          name: setInfo.name,
          releaseDate: setInfo.releaseDate,
          totalCards: setInfo.totalCards,
          packs: packEntries,
          slug: setInfo.slug,
        },
        cards,
      };

      const setPath = path.join(DATA_SETS_DIR, `${setId}.json`);
      fs.writeFileSync(setPath, JSON.stringify(payload, null, 2));
      summary.data.setFiles += 1;

      setData.push({
        id: setId,
        name: setInfo.name,
        releaseDate: setInfo.releaseDate,
        totalCards: setInfo.totalCards,
        packs: packEntries,
        slug: setInfo.slug,
      });
      summary.sets += 1;
    }

    const indexPayload = {
      generatedAt: new Date().toISOString(),
      source: `${SOURCE_BASE}/en`,
      sets: setData,
    };
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexPayload, null, 2));
    summary.data.indexWritten = true;
  }

  summary.data.parsed = parsedCount;
  summary.data.failed = parseFailCount;

  console.log('\nFinal Summary');
  console.log(
    `  Sets processed: ${summary.sets}\n` +
      `  Assets - downloaded: ${summary.assets.downloaded}, skipped: ${summary.assets.skipped}, failed: ${summary.assets.failed}\n` +
      `  Data   - parsed: ${summary.data.parsed}, failed: ${summary.data.failed}, set files: ${summary.data.setFiles}, index: ${summary.data.indexWritten ? 'yes' : 'no'}`
  );
    console.log('\nAll operations completed.');
  } finally {
    cleanupCache();
  }
};

run().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});



