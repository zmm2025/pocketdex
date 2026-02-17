/**
 * PocketDex Asset + Data Sync (Serebii.net only)
 *
 * All data and assets are retrieved from Serebii TCG Pocket:
 *   Set list:     https://www.serebii.net/tcgpocket/sets.shtml
 *   Set page:     https://www.serebii.net/tcgpocket/{setSlug}/  (e.g. geneticapex)
 *   Card list:    same set page (Card List table; full 286 cards for A1 at geneticapex/)
 *   Card images:  full card only from detail page (e.g. .../geneticapex/001.shtml → .../geneticapex/1.jpg); do not use th/ cropped art as substitute
 *   Set logos:    https://www.serebii.net/tcgpocket/logo/{setSlug}.png
 *   Pack art:     from Booster Pack List on set page (links to setSlug/{pack}.shtml, images relative)
 *
 * Usage (pass flags after -- so npm forwards them):
 *   npm run assets
 *   npm run assets -- --data-only
 *   npm run assets -- --assets-only
 *   npm run assets -- --limit-cards-per-set N
 *   npm run assets -- --set A1,A2
 *   npm run assets -- --keep-cache
 *   npm run assets -- --force-cards   Re-download card images (e.g. to get full-card art from setSlug/num.jpg)
 */

import fs from "fs";
import path from "path";
import followRedirects from "follow-redirects";
import { fileURLToPath } from "url";
import process from "process";
import sharp from "sharp";

const { https } = followRedirects;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Base URL for all Serebii TCG Pocket data and assets. */
const SOURCE_BASE = "https://www.serebii.net";
/** Set list and set pages: https://www.serebii.net/tcgpocket/ */
const SEREBII_TCGPOCKET = `${SOURCE_BASE}/tcgpocket`;
const USER_AGENT = "Mozilla/5.0 (compatible; PocketDex/1.0)";

const CARD_EXT = "jpg";
const ASSETS_ROOT = path.join(__dirname, "../assets");
const DATA_DIR = path.join(ASSETS_ROOT, "data");
const DATA_SETS_DIR = path.join(DATA_DIR, "sets");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const MANUAL_FILE = path.join(DATA_DIR, "manual-sets.json");
const CACHE_ROOT = path.join(ASSETS_ROOT, ".cache");
const CACHE_DIR = path.join(CACHE_ROOT, "serebii");

const REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_FETCH_DELAY_MS = 500;
const DEFAULT_ASSET_CONCURRENCY = 2;
const DEFAULT_ASSET_DELAY_MS = 200;

/** Serebii set URL slug → our setId (from manual-sets / app convention). */
const SEREBII_SLUG_TO_SET_ID = {
  geneticapex: "A1",
  mythicalisland: "A1a",
  "space-timesmackdown": "A2",
  triumphantlight: "A2a",
  shiningrevelry: "A2b",
  celestialguardians: "A3",
  extradimensionalcrisis: "A3a",
  eeveegrove: "A3b",
  wisdomofseaandsky: "A4",
  secludedsprings: "A4a",
  deluxepackex: "A4b",
  megarising: "B1",
  crimsonblaze: "B1a",
  "promo-a": "PROMO-A",
  "promo-b": "PROMO-B",
  fantasticalparade: "B1b",
};

const SET_RELEASE_ORDER = [
  "A1",
  "A1a",
  "A2",
  "A2a",
  "A2b",
  "A3",
  "A3a",
  "A3b",
  "A4",
  "A4a",
  "A4b",
  "B1",
  "B1a",
  "B1b",
  "PROMO-A",
  "PROMO-B",
];
const SET_RELEASE_ORDER_MAP = Object.fromEntries(
  SET_RELEASE_ORDER.map((id, idx) => [id, idx]),
);
const SET_ID_TO_SEREBII_SLUG = Object.fromEntries(
  Object.entries(SEREBII_SLUG_TO_SET_ID).map(([slug, setId]) => [setId, slug]),
);
const ART_MATCH_DISTANCE_MAX = 8;
const ART_MATCH_DISTANCE_FUZZ = 2;

const ENERGY_TYPE_MAP = {
  grass: "Grass",
  fire: "Fire",
  water: "Water",
  electric: "Lightning",
  lightning: "Lightning",
  psychic: "Psychic",
  fighting: "Fighting",
  darkness: "Darkness",
  metal: "Metal",
  dragon: "Dragon",
  colorless: "Colorless",
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const removeDir = (dirPath) => {
  if (fs.existsSync(dirPath))
    fs.rmSync(dirPath, { recursive: true, force: true });
};

const removeFile = (filePath) => {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
};

const padNumber = (num) => String(num).padStart(3, "0");

const getArgValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
};

const toNumber = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
const waitForRequestSlot = async (delayMs) => {
  const wait = lastRequest + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
};

const normalizeCacheKey = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .slice(0, 180);

const getCachePath = (url) =>
  path.join(CACHE_DIR, `${normalizeCacheKey(url)}.html`);

const readCache = (url, maxAgeMs = 0) => {
  const p = getCachePath(url);
  if (!fs.existsSync(p)) return null;
  try {
    const stat = fs.statSync(p);
    if (maxAgeMs > 0 && Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

const writeCache = (url, body) => {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(getCachePath(url), body);
};

const fetchHtml = async (
  url,
  delayMs = DEFAULT_FETCH_DELAY_MS,
  options = {},
) => {
  const {
    useCache = true,
    cacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000,
    forceRefresh = false,
  } = options;
  if (useCache && !forceRefresh) {
    const cached = readCache(url, cacheMaxAgeMs);
    if (cached) return cached;
  }
  await waitForRequestSlot(delayMs);
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": USER_AGENT } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const ct = res.headers["content-type"] || "";
          const enc = /charset=([^;]+)/i.test(ct)
            ? ct
                .match(/charset=([^;]+)/i)[1]
                .toLowerCase()
                .includes("utf")
              ? "utf8"
              : "latin1"
            : "utf8";
          const body = Buffer.concat(chunks).toString(enc);
          if (res.statusCode === 200) {
            writeCache(url, body);
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          }
        });
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
};

const downloadToBuffer = (url, delayMs = 0) => {
  return new Promise((resolve, reject) => {
    const doReq = () => {
      const req = https.get(
        url,
        { headers: { "User-Agent": USER_AGENT } },
        (res) => {
          if (res.statusCode === 200) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          }
        },
      );
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.destroy(new Error("Timeout")),
      );
      req.on("error", reject);
    };
    if (delayMs > 0) setTimeout(doReq, delayMs);
    else doReq();
  });
};

const downloadAndCompressImage = async (url, dest, delayMs = 0, opts = {}) => {
  const { format = "jpg", jpegQuality = 82 } = opts;
  const buffer = await downloadToBuffer(url, delayMs);
  if (!buffer) return false;
  ensureDir(path.dirname(dest));
  const ext = path.extname(dest).toLowerCase();
  if (format === "png" || ext === ".png") {
    await sharp(buffer).png({ compressionLevel: 9 }).toFile(dest);
  } else {
    await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toFile(dest);
  }
  return true;
};

const runConcurrent = async (items, concurrency, handler) => {
  let cursor = 0;
  const total = items.length;
  const workers = Array.from(
    { length: Math.min(concurrency, total) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= total) return;
        await handler(items[i], i);
      }
    },
  );
  await Promise.all(workers);
};

const decodeHtml = (s) => {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    );
};

const toAbsoluteUrl = (url, baseUrl) => {
  if (!url) return null;
  try {
    return new URL(url, baseUrl || SOURCE_BASE).toString();
  } catch {
    return null;
  }
};

const compareSetIdsByRelease = (a, b) => {
  const ai = SET_RELEASE_ORDER_MAP[a];
  const bi = SET_RELEASE_ORDER_MAP[b];
  if (ai != null && bi != null) return ai - bi;
  if (ai != null) return -1;
  if (bi != null) return 1;
  return a.localeCompare(b);
};

const extractCardImageUrlFromDetailPage = (html, detailUrl) => {
  const m = html.match(
    /<td class="foocard"[^>]*>[\s\S]*?<a href="([^"]+\.(?:jpg|png))"/i,
  );
  if (m?.[1]) return toAbsoluteUrl(m[1], detailUrl);
  const fallback = html.match(
    /href="(\/tcgpocket\/[^"\s]+\/\d+\.(?:jpg|png))"/i,
  );
  return fallback?.[1] ? toAbsoluteUrl(fallback[1], detailUrl) : null;
};

const extractOtherCardsIndexUrl = (html, detailUrl) => {
  const links = [
    ...html.matchAll(/<a href="([^"]+)">\s*Other\s+[^<]+?\s+Cards\s*<\/a>/gi),
  ]
    .map((m) => m[1])
    .filter(Boolean);
  if (links.length === 0) return null;
  const scored = links
    .map((href) => {
      let score = 0;
      if (/\/dex\/\d+\.shtml$/i.test(href)) score += 10;
      if (/\/dex\/trainers\/.+\.shtml$/i.test(href)) score += 10;
      if (
        /\/supporters\.shtml$/i.test(href) ||
        /\/items\.shtml$/i.test(href) ||
        /\/tools\.shtml$/i.test(href)
      )
        score -= 20;
      score += (href.match(/\//g) || []).length;
      return { href, score };
    })
    .sort((a, b) => b.score - a.score);
  return toAbsoluteUrl(scored[0].href, detailUrl);
};

const extractCardDetailUrlsFromIndex = (html, baseUrl) => {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(
    /href="(\/tcgpocket\/[^"\s]+\/\d{3}\.shtml)"/gi,
  )) {
    const abs = toAbsoluteUrl(m[1], baseUrl);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
};

const parseCardRefFromDetailUrl = (detailUrl) => {
  const m = detailUrl.match(/\/tcgpocket\/([^/]+)\/(\d{3})\.shtml$/i);
  if (!m) return null;
  return { slug: m[1].toLowerCase(), number: parseInt(m[2], 10) };
};

const computeDHashFromBuffer = async (buffer, hashSize = 16) => {
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .resize(hashSize + 1, hashSize, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bits = [];
  const rowWidth = hashSize + 1;
  for (let y = 0; y < hashSize; y++) {
    const offset = y * rowWidth;
    for (let x = 0; x < hashSize; x++) {
      bits.push(data[offset + x] > data[offset + x + 1] ? 1 : 0);
    }
  }
  return bits;
};

const dHashDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

// -----------------------------------------------------------------------------
// Serebii HTML parsing
// -----------------------------------------------------------------------------

/** Parse set list from https://www.serebii.net/tcgpocket/sets.shtml */
function parseSetsPage(html) {
  const sets = [];
  const linkRegex =
    /<a[^>]+href="(\/(?:tcgpocket\/)?([^"/?.]+)|https?:\/\/[^"]*tcgpocket\/([^"/?.]+))(?:\/)?[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const slug = m[2] || m[3];
    if (!slug) continue;
    const fullUrl = m[1].startsWith("/")
      ? `${SOURCE_BASE}${m[1].replace(/\/$/, "")}`
      : m[1].replace(/\/$/, "");
    let name = decodeHtml(normalizeWhitespace(m[4]));
    if (
      !name ||
      /^(Logo|Icon|Set Name|Number of Cards|Release Date)$/i.test(name)
    )
      continue;
    if (/^\d+$/.test(name)) continue;
    if (
      /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i.test(
        name,
      )
    )
      continue;
    if (/Set Icon\s*$/i.test(name)) continue;
    name = name.replace(/\s+Set Icon\s*$/i, "").trim() || name;
    const existing = sets.find((s) => s.slug === slug);
    if (existing) continue;
    sets.push({ slug, name, url: fullUrl, totalCards: undefined });
  }
  const countRegex = />\s*(\d+)\s*<\//g;
  let idx = 0;
  let countM;
  while ((countM = countRegex.exec(html)) !== null) {
    const num = parseInt(countM[1], 10);
    if (num > 0 && num < 5000 && sets[idx]) {
      sets[idx].totalCards = num;
      idx++;
      if (idx >= sets.length) break;
    }
  }
  return sets;
}

function normalizeWhitespace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Parse a set page for cards (e.g. https://www.serebii.net/tcgpocket/geneticapex/).
 * Card names appear in the Card Name column as either <font>Name</font> (Pokémon) or plain text (Trainer/Supporter).
 * Restrict to the Card List table only so we get exactly 286 cards for A1 (no duplicates from Themed Collections).
 */
function parseCardsFromSetPage(html, setSlug) {
  const cardListStart = html.indexOf("Card List</h2>");
  const themecolStart =
    cardListStart !== -1
      ? html.indexOf("Themed Collections", cardListStart)
      : -1;
  const section =
    cardListStart !== -1 && themecolStart !== -1
      ? html.slice(cardListStart, themecolStart)
      : html;
  const seen = new Set();
  const cards = [];
  const slugRe = setSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match card link; capture inner HTML and strip tags to get name (handles <font>, <u>, plain text)
  const cardLinkRe = new RegExp(
    `href="/tcgpocket/${slugRe}/(\\d+)\\.shtml"[^>]*>([\\s\\S]+?)</a>`,
    "gi",
  );
  const matches = [];
  let m;
  while ((m = cardLinkRe.exec(section)) !== null) {
    const inner = m[2];
    if (/<img\s/i.test(inner)) continue;
    const name = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.length < 2) continue;
    matches.push({ index: m.index, number: parseInt(m[1], 10), name });
  }
  for (let i = 0; i < matches.length; i++) {
    const { number, name } = matches[i];
    if (number < 1 || number > 600 || seen.has(number)) continue;
    const nameDec = decodeHtml(normalizeWhitespace(name));
    if (!nameDec || nameDec.length < 2) continue;
    seen.add(number);
    const blockStart = Math.max(0, matches[i].index - 600);
    const blockEnd =
      i + 1 < matches.length ? matches[i + 1].index : section.length;
    const block = section.slice(
      blockStart,
      Math.min(matches[i].index + 2500, blockEnd),
    );
    const rarityMatch = block.match(
      /tcgpocket\/image\/(diamond\d|star\d|shiny\d|crown)\.png/i,
    );
    const raritySymbol = rarityMatch
      ? rarityMatch[1].toLowerCase()
      : "diamond1";
    const hpMatch =
      block.match(/>\s*\*?\*?(\d+)\s*HP\s*\*?\*?/i) ||
      block.match(/(\d+)\s*HP/i);
    const health = hpMatch ? parseInt(hpMatch[1], 10) : undefined;
    const typeMatch = block.match(
      /tcgpocket\/image\/(grass|fire|water|electric|lightning|psychic|fighting|darkness|metal|dragon|colorless)\.png/i,
    );
    const energyType = typeMatch
      ? ENERGY_TYPE_MAP[typeMatch[1].toLowerCase()] || typeMatch[1]
      : undefined;
    const weakImgs = block.match(
      /tcgpocket\/image\/(grass|fire|water|electric|lightning|psychic|fighting|darkness|metal|dragon|colorless)\.png/gi,
    );
    const weaknessType =
      weakImgs && weakImgs.length >= 2
        ? ENERGY_TYPE_MAP[
            weakImgs[1].toLowerCase().replace(/.*\//, "").replace(".png", "")
          ]
        : undefined;
    const weakValMatch = block.match(/[+-](\d+)/);
    const weakness = weaknessType
      ? {
          type: weaknessType,
          value: weakValMatch ? parseInt(weakValMatch[1], 10) : 20,
        }
      : undefined;
    const retreatImgs = block.match(/tcgpocket\/image\/colorless\.png/gi) || [];
    const retreatCost =
      retreatImgs.length > 0
        ? [{ type: "Colorless", count: retreatImgs.length }]
        : undefined;
    const exStatus =
      /\bex\s*<\/|>\s*ex\b/i.test(block) || /\bex\b/i.test(nameDec)
        ? "ex"
        : "non-ex";
    let cardType = "pokemon";
    if (/Supporter/i.test(block)) cardType = "supporter";
    else if (/Trainer/i.test(block) && !/Supporter/i.test(block))
      cardType = "item";
    cards.push({
      number,
      name: nameDec,
      raritySymbol,
      health,
      energyType,
      weakness,
      retreatCost,
      exStatus,
      type: cardType,
    });
  }
  cards.sort((a, b) => a.number - b.number);
  return cards;
}

/** Parse Booster Pack List from set page (e.g. https://www.serebii.net/tcgpocket/geneticapex/) */
function parsePacksFromSetPage(html, setSlug) {
  const packs = [];
  const sectionMatch = html.match(
    /Booster Pack List[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!sectionMatch) return packs;
  const table = sectionMatch[1];
  const linkRegex =
    /<a[^>]+href="([^"]*)\/([^"/]+)\.shtml"[^>]*>[\s\S]*?<img[^>]+src="([^"]*)"[^>]*>/gi;
  let m;
  while ((m = linkRegex.exec(table)) !== null) {
    const baseUrl = m[1];
    const slug = m[2];
    let imgSrc = m[3];
    if (imgSrc.startsWith("/")) imgSrc = SOURCE_BASE + imgSrc;
    else if (!imgSrc.startsWith("http"))
      imgSrc = `${SOURCE_BASE}/tcgpocket/${setSlug}/${imgSrc}`;
    packs.push({
      id: slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      imageUrl: imgSrc,
    });
  }
  return packs;
}

// -----------------------------------------------------------------------------
// Manual data (packs per setId)
// -----------------------------------------------------------------------------

function loadManualData() {
  if (!fs.existsSync(MANUAL_FILE)) return { setIds: {}, packs: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(MANUAL_FILE, "utf8"));
    return { setIds: raw.setIds || {}, packs: raw.packs || {} };
  } catch {
    return { setIds: {}, packs: {} };
  }
}

// -----------------------------------------------------------------------------
// Progress (tenths, [ok/total], optional " - N failed", bar on same line; bar removed when done)
// -----------------------------------------------------------------------------

const PROGRESS_BAR_WIDTH = 24;
/** Width of a category line including bar; used to clear the bar when a category completes. */
const CATEGORY_LINE_WIDTH = 80;

function formatDurationTenths(ms) {
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s.toFixed(1)}s`;
  return `${s.toFixed(1)}s`;
}

function makeProgressBar(current, total, width = PROGRESS_BAR_WIDTH) {
  if (total <= 0) return "[" + " ".repeat(width) + "]";
  const pct = Math.min(1, current / total);
  const filled = Math.round(width * pct);
  return (
    "[" +
    "=".repeat(filled) +
    ">".repeat(filled < width ? 1 : 0) +
    " ".repeat(Math.max(0, width - filled - (filled < width ? 1 : 0))) +
    "]"
  );
}

function writeCategoryLine(label, ok, total, elapsedMs, fail, withBar) {
  const failSuffix = fail > 0 ? ` - ${fail} failed` : "";
  const text = `  ${label}: [${ok}/${total}] (${formatDurationTenths(elapsedMs)})${failSuffix}`;
  if (withBar) {
    process.stdout.write(`\r${text} ${makeProgressBar(ok, total)}`);
  } else {
    process.stdout.write(
      `\r${text}` + " ".repeat(Math.max(0, CATEGORY_LINE_WIDTH - text.length)),
    );
  }
}

function writeCategoryDone(label, ok, total, elapsedMs, fail) {
  const failSuffix = fail > 0 ? ` - ${fail} failed` : "";
  process.stdout.write(
    `\r  ${label}: [${ok}/${total}] (${formatDurationTenths(elapsedMs)})${failSuffix}\n`,
  );
}

const SET_HEADER_LINE_WIDTH = 80;

function writeSetHeaderLine(header, setStep, setTotal, elapsedMs, withBar) {
  const time = elapsedMs >= 0 ? ` (${formatDurationTenths(elapsedMs)})` : "";
  const text = `--- ${header} ---${time}`;
  if (withBar) {
    process.stdout.write(`\r${text} ${makeProgressBar(setStep, setTotal)}`);
  } else {
    process.stdout.write(
      `\r${text}` +
        " ".repeat(Math.max(0, SET_HEADER_LINE_WIDTH - text.length)),
    );
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function run() {
  const args = new Set(process.argv.slice(2));
  const dataOnly = args.has("--data-only");
  const assetsOnly = args.has("--assets-only");
  const limitCardsPerSet = toNumber(
    getArgValue("--limit-cards-per-set", ""),
    0,
  );
  const setFilterRaw = getArgValue("--set", "");
  const setFilter = setFilterRaw
    ? new Set(
        setFilterRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  const fetchDelayMs = toNumber(
    getArgValue("--fetch-delay", ""),
    DEFAULT_FETCH_DELAY_MS,
  );
  const assetConcurrency = toNumber(
    getArgValue("--asset-concurrency", ""),
    DEFAULT_ASSET_CONCURRENCY,
  );
  const assetDelayMs = toNumber(
    getArgValue("--asset-delay", ""),
    DEFAULT_ASSET_DELAY_MS,
  );
  const keepCache = args.has("--keep-cache");
  const forceCards = args.has("--force-cards");

  ensureDir(ASSETS_ROOT);
  ensureDir(DATA_DIR);
  ensureDir(DATA_SETS_DIR);

  const cardsBase = path.join(ASSETS_ROOT, "cards");
  if (fs.existsSync(cardsBase)) {
    for (const ent of fs.readdirSync(cardsBase, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        removeDir(path.join(cardsBase, ent.name, "wallpapers"));
        removeDir(path.join(cardsBase, ent.name, "fullart"));
      }
    }
  }
  if (!dataOnly) {
    removeDir(path.join(ASSETS_ROOT, "cards"));
    removeDir(path.join(ASSETS_ROOT, "sets"));
  }
  if (!assetsOnly) {
    removeFile(INDEX_FILE);
    removeDir(DATA_SETS_DIR);
    ensureDir(DATA_SETS_DIR);
  }

  // Source: https://www.serebii.net/tcgpocket/sets.shtml
  console.log("Fetching Serebii set list...");
  const setsHtml = await fetchHtml(
    `${SEREBII_TCGPOCKET}/sets.shtml`,
    fetchDelayMs,
  );
  const serebiiSets = parseSetsPage(setsHtml);
  const manual = loadManualData();

  const selectedSets = serebiiSets.filter((s) => {
    const setId = SEREBII_SLUG_TO_SET_ID[s.slug];
    if (!setId) return false;
    if (setFilter && !setFilter.has(setId)) return false;
    return true;
  });

  if (selectedSets.length === 0) {
    console.warn(
      "No sets matched. Check SEREBII_SLUG_TO_SET_ID and --set filter.",
    );
    return;
  }

  selectedSets.sort((a, b) => {
    const aId = SEREBII_SLUG_TO_SET_ID[a.slug] || a.slug;
    const bId = SEREBII_SLUG_TO_SET_ID[b.slug] || b.slug;
    return compareSetIdsByRelease(aId, bId);
  });
  const selectedSetIds = new Set(
    selectedSets.map((s) => SEREBII_SLUG_TO_SET_ID[s.slug]).filter(Boolean),
  );
  const imageHashCache = new Map();
  const detailPageCache = new Map();

  const getImageHash = async (imageUrl) => {
    if (!imageUrl) return null;
    if (imageHashCache.has(imageUrl)) return imageHashCache.get(imageUrl);
    const buffer = await downloadToBuffer(imageUrl, assetDelayMs);
    if (!buffer) {
      imageHashCache.set(imageUrl, null);
      return null;
    }
    const hash = await computeDHashFromBuffer(buffer);
    imageHashCache.set(imageUrl, hash);
    return hash;
  };

  const getDetailPage = async (detailUrl) => {
    if (detailPageCache.has(detailUrl)) return detailPageCache.get(detailUrl);
    const html = await fetchHtml(detailUrl, fetchDelayMs);
    detailPageCache.set(detailUrl, html);
    return html;
  };

  const resolveCanonicalArt = async (setId, setSlug, cardNumber) => {
    const currentDetailUrl = `${SEREBII_TCGPOCKET}/${setSlug}/${padNumber(cardNumber)}.shtml`;
    const currentImageUrl = `${SEREBII_TCGPOCKET}/${setSlug}/${cardNumber}.jpg`;
    const currentHash = await getImageHash(currentImageUrl);
    if (!currentHash) return { sourceSet: setId, sourceNumber: cardNumber };

    const currentDetailHtml = await getDetailPage(currentDetailUrl);
    const otherIndexUrl = extractOtherCardsIndexUrl(
      currentDetailHtml,
      currentDetailUrl,
    );
    if (!otherIndexUrl) return { sourceSet: setId, sourceNumber: cardNumber };

    const otherIndexHtml = await fetchHtml(otherIndexUrl, fetchDelayMs);
    const candidates = extractCardDetailUrlsFromIndex(
      otherIndexHtml,
      otherIndexUrl,
    );
    const scored = [];
    for (const candidateDetailUrl of candidates) {
      const parsed = parseCardRefFromDetailUrl(candidateDetailUrl);
      if (!parsed) continue;
      const candidateSetId = SEREBII_SLUG_TO_SET_ID[parsed.slug];
      if (!candidateSetId || !selectedSetIds.has(candidateSetId)) continue;
      if (compareSetIdsByRelease(candidateSetId, setId) >= 0) continue;

      const candidateDetailHtml = await getDetailPage(candidateDetailUrl);
      const candidateImageUrl = extractCardImageUrlFromDetailPage(
        candidateDetailHtml,
        candidateDetailUrl,
      );
      const candidateHash = await getImageHash(candidateImageUrl);
      if (!candidateHash) continue;
      scored.push({
        distance: dHashDistance(currentHash, candidateHash),
        sourceSet: candidateSetId,
        sourceNumber: parsed.number,
      });
    }

    if (scored.length === 0)
      return { sourceSet: setId, sourceNumber: cardNumber };
    scored.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      const rel = compareSetIdsByRelease(a.sourceSet, b.sourceSet);
      if (rel !== 0) return rel;
      return a.sourceNumber - b.sourceNumber;
    });
    const best = scored[0];
    if (best.distance > ART_MATCH_DISTANCE_MAX) {
      return { sourceSet: setId, sourceNumber: cardNumber };
    }
    const accepted = scored.filter(
      (s) =>
        s.distance <= ART_MATCH_DISTANCE_MAX &&
        s.distance <= best.distance + ART_MATCH_DISTANCE_FUZZ,
    );
    accepted.sort((a, b) => {
      const rel = compareSetIdsByRelease(a.sourceSet, b.sourceSet);
      if (rel !== 0) return rel;
      return a.sourceNumber - b.sourceNumber;
    });
    return {
      sourceSet: accepted[0].sourceSet,
      sourceNumber: accepted[0].sourceNumber,
    };
  };

  console.log(`Processing ${selectedSets.length} set(s) from Serebii.`);
  const runStartMs = Date.now();

  const setData = [];
  let totalCardsProcessed = 0;
  let totalImagesOk = 0;
  let totalImagesFail = 0;
  const PROGRESS_UPDATE_INTERVAL_MS = 100;
  let setIndex = 0;

  for (const setInfo of selectedSets) {
    setIndex++;
    const setId = SEREBII_SLUG_TO_SET_ID[setInfo.slug];
    if (!setId) continue;

    const setHeader = `${setInfo.name} (${setId})`;
    const setStartMs = Date.now();
    let setStep = 0;
    const setDataSteps = assetsOnly ? 0 : 2;
    const packEntries = manual.packs[setId] || [];
    // Source: https://www.serebii.net/tcgpocket/{setSlug}/ (e.g. geneticapex/)
    const setPageUrl = setInfo.url.startsWith("http")
      ? setInfo.url
      : `${SEREBII_TCGPOCKET}/${setInfo.slug}/`;
    const setPageHtml = await fetchHtml(setPageUrl, fetchDelayMs);

    const rawCards = parseCardsFromSetPage(setPageHtml, setInfo.slug);
    let cards = rawCards;
    if (limitCardsPerSet > 0) cards = rawCards.slice(0, limitCardsPerSet);
    const artSourceByCardId = new Map();
    for (const card of cards) {
      const cardId = `${setId}-${padNumber(card.number)}`;
      try {
        const art = await resolveCanonicalArt(setId, setInfo.slug, card.number);
        artSourceByCardId.set(cardId, art);
      } catch {
        artSourceByCardId.set(cardId, {
          sourceSet: setId,
          sourceNumber: card.number,
        });
      }
    }
    const inferredPacks = parsePacksFromSetPage(setPageHtml, setInfo.slug);
    const packListForCount = packEntries.length ? packEntries : inferredPacks;
    const hasPacks = packListForCount.length > 0;
    const setArtTotal = hasPacks ? 1 + packListForCount.length : 1;
    const cardArtTotal = cards.length;
    const setTotalSteps =
      setDataSteps + (dataOnly ? 0 : setArtTotal + cardArtTotal);

    if (setIndex > 1) process.stdout.write("\n");
    writeSetHeaderLine(setHeader, 0, setTotalSteps, 0, true);
    process.stdout.write("\n");
    const completedCategoryLines = [];
    let lastProgressUpdate = 0;

    const updateSetAndCategory = (
      categoryLabel,
      categoryOk,
      categoryTotal,
      categoryFail,
      withCategoryBar,
    ) => {
      const now = Date.now();
      const isComplete = categoryOk >= categoryTotal;
      if (
        withCategoryBar &&
        !isComplete &&
        now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL_MS
      )
        return;
      lastProgressUpdate = now;
      const elapsedSet = Date.now() - setStartMs;
      const numLines = 1 + completedCategoryLines.length;
      const up = "\x1b[" + numLines + "A";
      process.stdout.write(up);
      writeSetHeaderLine(setHeader, setStep, setTotalSteps, elapsedSet, true);
      process.stdout.write("\n");
      for (const line of completedCategoryLines)
        process.stdout.write(line + "\n");
      writeCategoryLine(
        categoryLabel,
        categoryOk,
        categoryTotal,
        elapsedSet,
        categoryFail,
        withCategoryBar,
      );
    };

    if (!assetsOnly) {
      const setCardDir = path.join(ASSETS_ROOT, "cards", setId);
      ensureDir(setCardDir);

      const cardPayload = cards.map((c) => {
        const cardId = `${setId}-${padNumber(c.number)}`;
        const artSource = artSourceByCardId.get(cardId) || {
          sourceSet: setId,
          sourceNumber: c.number,
        };
        return {
          set: setId,
          number: c.number,
          cardNumber: c.number,
          artGroupId: `${artSource.sourceSet}-${padNumber(artSource.sourceNumber)}`,
          artSourceSet: artSource.sourceSet,
          artSourceNumber: artSource.sourceNumber,
          isCanonicalArt:
            artSource.sourceSet === setId &&
            artSource.sourceNumber === c.number,
          name: c.name,
          type: c.type || "pokemon",
          exStatus: c.exStatus || "non-ex",
          abilities: [],
          moves: [],
          boosterPacks: [],
          energyType: c.energyType,
          raritySymbol: c.raritySymbol,
          rarityLabel: c.raritySymbol
            ? c.raritySymbol.startsWith("diamond")
              ? c.raritySymbol === "diamond1"
                ? "Common"
                : c.raritySymbol === "diamond2"
                  ? "Uncommon"
                  : c.raritySymbol === "diamond3"
                    ? "Rare"
                    : "Double Rare"
              : c.raritySymbol.startsWith("star")
                ? "Art Rare"
                : "Crown Rare"
            : undefined,
          health: c.health,
          weakness: c.weakness,
          retreatCost: c.retreatCost,
        };
      });

      setStep += 1;
      updateSetAndCategory("Set data", 1, 2, 0, true);
      const setPath = path.join(DATA_SETS_DIR, `${setId}.json`);
      fs.writeFileSync(
        setPath,
        JSON.stringify({ set: setId, cards: cardPayload }, null, 2),
      );
      setStep += 1;
      updateSetAndCategory("Set data", 2, 2, 0, false);
      const setDataDone = `  Set data: [2/2] (${formatDurationTenths(Date.now() - setStartMs)})`;
      completedCategoryLines.push(setDataDone);
      process.stdout.write("\n");

      setData.push({
        id: setId,
        name: setInfo.name,
        totalCards: cardPayload.length,
        packs: packEntries.length
          ? packEntries
          : inferredPacks.map((p) => ({ id: p.id, name: p.name })),
        slug: setInfo.slug,
      });
      totalCardsProcessed += cardPayload.length;
    }

    if (!dataOnly) {
      const setDir = path.join(ASSETS_ROOT, "sets", setId);
      const setCardDir = path.join(ASSETS_ROOT, "cards", setId);
      ensureDir(setDir);
      ensureDir(setCardDir);

      let cardOk = 0;
      let cardFail = 0;

      if (hasPacks) {
        let setArtOk = 0;
        let setArtFail = 0;
        const setArtTotalN = 1 + packListForCount.length;
        // Source: https://www.serebii.net/tcgpocket/logo/{setSlug}.png
        const logoUrl = `${SEREBII_TCGPOCKET}/logo/${setInfo.slug}.png`;
        const logoDest = path.join(setDir, "logo.png");
        try {
          const ok = await downloadAndCompressImage(
            logoUrl,
            logoDest,
            assetDelayMs,
            { format: "png" },
          );
          if (ok) {
            totalImagesOk++;
            setArtOk++;
          } else {
            totalImagesFail++;
            setArtFail++;
          }
        } catch (e) {
          totalImagesFail++;
          setArtFail++;
        }
        setStep += 1;
        updateSetAndCategory(
          "Set art",
          setArtOk,
          setArtTotalN,
          setArtFail,
          true,
        );

        for (const pack of packListForCount) {
          const packId =
            pack.id || pack.name?.toLowerCase().replace(/\s+/g, "-");
          const imgUrl =
            pack.imageUrl ||
            inferredPacks.find((p) => p.id === packId)?.imageUrl ||
            `${SEREBII_TCGPOCKET}/${setInfo.slug}/${packId}.jpg`;
          const packDest = path.join(setDir, `pack_${packId}.png`);
          try {
            const ok = await downloadAndCompressImage(
              imgUrl,
              packDest,
              assetDelayMs,
              { format: "png" },
            );
            if (ok) {
              totalImagesOk++;
              setArtOk++;
            } else {
              totalImagesFail++;
              setArtFail++;
            }
          } catch (e) {
            totalImagesFail++;
            setArtFail++;
          }
          setStep += 1;
          updateSetAndCategory(
            "Set art",
            setArtOk,
            setArtTotalN,
            setArtFail,
            true,
          );
        }
        updateSetAndCategory(
          "Set art",
          setArtOk,
          setArtTotalN,
          setArtFail,
          false,
        );
        const setArtDone = `  Set art: [${setArtOk}/${setArtTotalN}] (${formatDurationTenths(Date.now() - setStartMs)})${setArtFail > 0 ? ` - ${setArtFail} failed` : ""}`;
        completedCategoryLines.push(setArtDone);
        process.stdout.write("\n");
      } else {
        let setArtOk = 0;
        let setArtFail = 0;
        const logoUrl = `${SEREBII_TCGPOCKET}/logo/${setInfo.slug}.png`;
        const logoDest = path.join(setDir, "logo.png");
        try {
          const ok = await downloadAndCompressImage(
            logoUrl,
            logoDest,
            assetDelayMs,
            { format: "png" },
          );
          if (ok) {
            totalImagesOk++;
            setArtOk++;
          } else {
            totalImagesFail++;
            setArtFail++;
          }
        } catch (e) {
          totalImagesFail++;
          setArtFail++;
        }
        setStep += 1;
        updateSetAndCategory("Set art", setArtOk, 1, setArtFail, false);
        const setArtDone = `  Set art: [${setArtOk}/1] (${formatDurationTenths(Date.now() - setStartMs)})${setArtFail > 0 ? ` - ${setArtFail} failed` : ""}`;
        completedCategoryLines.push(setArtDone);
        process.stdout.write("\n");
      }

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const cardId = `${setId}-${padNumber(c.number)}`;
        const artSource = artSourceByCardId.get(cardId) || {
          sourceSet: setId,
          sourceNumber: c.number,
        };
        const sourceSetSlug =
          SET_ID_TO_SEREBII_SLUG[artSource.sourceSet] || setInfo.slug;
        const destSetDir = path.join(ASSETS_ROOT, "cards", artSource.sourceSet);
        ensureDir(destSetDir);
        const dest = path.join(
          destSetDir,
          `${padNumber(artSource.sourceNumber)}.${CARD_EXT}`,
        );
        if (forceCards || !fs.existsSync(dest)) {
          try {
            // Full-card image only (card detail page e.g. geneticapex/001.shtml → geneticapex/1.jpg). Do not use th/ cropped art.
            const fullCardUrl = `${SEREBII_TCGPOCKET}/${sourceSetSlug}/${artSource.sourceNumber}.jpg`;
            const downloaded = await downloadAndCompressImage(
              fullCardUrl,
              dest,
              assetDelayMs,
              { format: "jpg" },
            );
            if (downloaded) {
              totalImagesOk++;
              cardOk++;
            } else {
              totalImagesFail++;
              cardFail++;
            }
          } catch (e) {
            totalImagesFail++;
            cardFail++;
          }
        } else {
          cardOk++;
        }
        setStep += 1;
        updateSetAndCategory("Card Art", cardOk, cardArtTotal, cardFail, true);
      }
      updateSetAndCategory("Card Art", cardOk, cardArtTotal, cardFail, false);
      const cardArtDone = `  Card Art: [${cardOk}/${cardArtTotal}] (${formatDurationTenths(Date.now() - setStartMs)})${cardFail > 0 ? ` - ${cardFail} failed` : ""}`;
      completedCategoryLines.push(cardArtDone);
      process.stdout.write("\n");
    }

    const setElapsedMs = Date.now() - setStartMs;
    const upFinal = "\x1b[" + (1 + completedCategoryLines.length) + "A";
    process.stdout.write(upFinal);
    writeSetHeaderLine(
      setHeader,
      setTotalSteps,
      setTotalSteps,
      setElapsedMs,
      false,
    );
    process.stdout.write("\n");
    for (const line of completedCategoryLines)
      process.stdout.write(line + "\n");
  }

  if (!assetsOnly && setData.length > 0) {
    const indexPayload = {
      generatedAt: new Date().toISOString(),
      source: "https://www.serebii.net/tcgpocket/",
      sets: setData,
    };
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexPayload, null, 2));
    console.log(`Wrote ${INDEX_FILE}`);
  }

  if (!keepCache && fs.existsSync(CACHE_ROOT)) {
    removeDir(CACHE_ROOT);
    console.log("Cache cleared.");
  }

  const totalElapsedMs = Date.now() - runStartMs;
  console.log("\nDone.");
  console.log(
    `  Sets: ${setData.length}, Cards: ${totalCardsProcessed}, Images OK: ${totalImagesOk}, Fail: ${totalImagesFail}`,
  );
  console.log(`Total time: ${formatDurationTenths(totalElapsedMs)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
