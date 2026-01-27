/**
 * PocketDex Asset + Data Sync
 *
 * Downloads card images, logos, icons, and pack art from Serebii
 * and scrapes card metadata for local pre-fill.
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

// Extract https from the default export of the CommonJS module
const { https } = followRedirects;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_ROOT = path.join(__dirname, '../assets');
const DATA_DIR = path.join(ASSETS_ROOT, 'data');
const DATA_SETS_DIR = path.join(DATA_DIR, 'sets');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const REQUEST_TIMEOUT_MS = 20000;

// ============================================================================
// CONFIGURATION
// ============================================================================

const SETS_TO_DOWNLOAD = [
  // --- Block A ---
  {
    id: 'A1',
    name: 'Genetic Apex',
    slug: 'geneticapex',
    packNames: {
      pikachu: 'Pikachu',
      charizard: 'Charizard',
      mewtwo: 'Mewtwo',
    },
    start: 1,
    end: 286,
    packs: ['pikachu', 'charizard', 'mewtwo'],
  },
  { id: 'A1a', name: 'Mythical Island', slug: 'mythicalisland', start: 1, end: 86 },
  { id: 'A2', name: 'Space-Time Smackdown', slug: 'space-timesmackdown', start: 1, end: 207 },
  { id: 'A2a', name: 'Triumphant Light', slug: 'triumphantlight', start: 1, end: 96 },
  { id: 'A2b', name: 'Shining Revelry', slug: 'shiningrevelry', start: 1, end: 112 },
  { id: 'A3', name: 'Celestial Guardians', slug: 'celestialguardians', start: 1, end: 239 },
  { id: 'A3a', name: 'Extradimensional Crisis', slug: 'extradimensionalcrisis', start: 1, end: 103 },
  { id: 'A3b', name: 'Eevee Grove', slug: 'eeveegrove', start: 1, end: 107 },
  { id: 'A4', name: 'Wisdom of Sea and Sky', slug: 'wisdomofseaandsky', start: 1, end: 241 },
  { id: 'A4a', name: 'Secluded Springs', slug: 'secludedsprings', start: 1, end: 105 },
  { id: 'A4b', name: 'Deluxe Pack ex', slug: 'deluxepackex', start: 1, end: 379 },

  // --- Block B ---
  { id: 'B1', name: 'Mega Rising', slug: 'megarising', start: 1, end: 331 },
  { id: 'B1a', name: 'Crimson Blaze', slug: 'crimsonblaze', start: 1, end: 103 },

  // --- Promos ---
  { id: 'PROMO-A', name: 'Promo-A', slug: 'promo-a', start: 1 },
  { id: 'PROMO-B', name: 'Promo-B', slug: 'promo-b', start: 1 },
];

const RARITY_ICONS = [
  'diamond1.png',
  'diamond2.png',
  'diamond3.png',
  'diamond4.png',
  'star1.png',
  'star2.png',
  'star3.png',
  'shiny1.png',
  'shiny2.png',
  'crown.png',
];

// Mapped icons to handle Serebii naming mismatches (e.g., electric -> lightning)
const TYPE_ICONS = [
  { src: 'grass.png', dest: 'grass.png' },
  { src: 'fire.png', dest: 'fire.png' },
  { src: 'water.png', dest: 'water.png' },
  { src: 'electric.png', dest: 'lightning.png' }, // Fix: Map electric to lightning
  { src: 'psychic.png', dest: 'psychic.png' },
  { src: 'fighting.png', dest: 'fighting.png' },
  { src: 'darkness.png', dest: 'darkness.png' },
  { src: 'metal.png', dest: 'metal.png' },
  { src: 'dragon.png', dest: 'dragon.png' },
  { src: 'colorless.png', dest: 'colorless.png' },
];

const ENERGY_TYPE_MAP = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  electric: 'Lightning',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  colorless: 'Colorless',
};

const RARITY_SYMBOLS = new Set([
  'diamond1',
  'diamond2',
  'diamond3',
  'diamond4',
  'star1',
  'star2',
  'star3',
  'shiny1',
  'shiny2',
  'crown',
]);

// ============================================================================
// HELPERS
// ============================================================================

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const padNumber = (num) => num.toString().padStart(3, '0');

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
    '&eacute;': 'é',
    '&Eacute;': 'É',
    '&rsquo;': '’',
    '&ndash;': '–',
    '&mdash;': '—',
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

const normalizeWhitespace = (value) =>
  value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

const normalizeText = (html) => {
  if (!html) return '';
  const withAlt = html.replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, ' $1 ');
  const withBreaks = withAlt.replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeHtml(stripped));
};

const normalizeEnergyType = (value) => {
  if (!value) return undefined;
  const key = value.toLowerCase();
  return ENERGY_TYPE_MAP[key] || undefined;
};

const toEnergyCounts = (energies) => {
  const counts = {};
  energies.forEach((energy) => {
    if (!energy) return;
    counts[energy] = (counts[energy] || 0) + 1;
  });

  return Object.entries(counts).map(([type, count]) => ({ type, count }));
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
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
        fs.unlink(dest, () => {});
        reject(new Error(`Status ${response.statusCode}: ${url}`));
      }
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const fetchText = (url) => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 404) {
        resolve(null);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Status ${response.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || '';
        const charsetMatch = /charset=([^;]+)/i.exec(contentType);
        const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'latin1';
        const encoding = charset.includes('utf') ? 'utf8' : 'latin1';
        resolve(buffer.toString(encoding));
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });

    request.on('error', (err) => {
      reject(err);
    });
  });
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
    updateText(message) {
      const now = Date.now();
      if (now - lastWrite < intervalMs) return;
      lastWrite = now;
      const bar = makeBar(
        Math.min(
          total,
          Math.max(
            0,
            Number((message.match(/\b(\d+)\s*\/\s*\d+\b/) || [])[1] || 0)
          )
        )
      );
      write(`${bar} ${message}`);
    },
    done(counts) {
      const bar = makeBar(counts.current);
      const message = `${bar} ${counts.current}/${total} (ok:${counts.ok} skip:${counts.skip} fail:${counts.fail})`;
      finish(message);
    },
    doneText(message) {
      const bar = makeBar(
        Math.min(
          total,
          Math.max(
            0,
            Number((message.match(/\b(\d+)\s*\/\s*\d+\b/) || [])[1] || 0)
          )
        )
      );
      finish(`${bar} ${message}`);
    },
  };
};

const downloadBatch = async (items, label, concurrency, progressIntervalMs, progressBarWidth) => {
  console.log(`\nProcessing ${label}...`);
  let success = 0;
  let fail = 0;
  let skipped = 0;
  const total = items.length;
  let index = 0;
  const tracker = createProgressTracker(label, total, progressIntervalMs, progressBarWidth);

  await runConcurrent(items, concurrency, async (item) => {
    index += 1;
    if (fs.existsSync(item.dest)) {
      skipped += 1;
      tracker.update({ current: index, ok: success, skip: skipped, fail });
      return;
    }
    try {
      const result = await downloadFile(item.url, item.dest);
      if (result) {
        success++;
      } else {
        fail++;
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      fail++;
    }
    tracker.update({ current: index, ok: success, skip: skipped, fail });
  });
  tracker.done({ current: index, ok: success, skip: skipped, fail });
  console.log(`Completed ${label}: ${success} downloaded, ${fail} failed/skipped.`);
  return { success, fail, skipped, total: index };
};

const extractCardNumbers = (html, slug) => {
  if (!html) return [];
  const regex = new RegExp(`/${slug}/(\\d{1,3})\\.shtml`, 'g');
  const numbers = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    numbers.add(Number(match[1]));
  }
  return Array.from(numbers).sort((a, b) => a - b);
};

const extractCells = (rowHtml) => {
  const cells = [];
  const regex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = regex.exec(rowHtml)) !== null) {
    cells.push(match[1]);
  }
  return cells;
};

const parseIllustrator = (html) => {
  const match = /Illustration:\s*<a[^>]*><u>([^<]+)<\/u>/i.exec(html);
  if (!match) return undefined;
  return normalizeWhitespace(decodeHtml(match[1]));
};

const parseRaritySymbol = (html) => {
  const illustrationIndex = html.indexOf('Illustration');
  const scope = illustrationIndex > -1 ? html.slice(0, illustrationIndex) : html;
  const matches = Array.from(scope.matchAll(/tcgpocket\/image\/([a-z0-9]+)\.png/gi));
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const symbol = matches[i][1];
    if (RARITY_SYMBOLS.has(symbol)) {
      return symbol;
    }
  }
  return undefined;
};

const parseWeakness = (html) => {
  const match = /Weakness<\/b><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html);
  if (!match) return undefined;
  const cell = match[1];
  const typeMatch = /tcgpocket\/image\/([a-z0-9]+)\.png/i.exec(cell);
  const valueMatch = /\.png"[^>]*>([^<]*)/i.exec(cell);
  const type = normalizeEnergyType(typeMatch ? typeMatch[1] : undefined);
  const value = normalizeWhitespace(decodeHtml(valueMatch ? valueMatch[1] : normalizeText(cell)));
  if (!type) return undefined;
  return { type, value };
};

const parseRetreatCost = (html) => {
  const match = /Retreat Cost<\/b><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html);
  if (!match) return undefined;
  const cell = match[1];
  const energies = Array.from(cell.matchAll(/tcgpocket\/image\/([a-z0-9]+)\.png/gi)).map(
    (entry) => normalizeEnergyType(entry[1])
  );
  const counts = toEnergyCounts(energies.filter(Boolean));
  return counts.length > 0 ? counts : undefined;
};

const parseAttackRows = (html) => {
  const attacks = [];
  const rows = Array.from(html.matchAll(/<tr>([\s\S]*?\/tcgpocket\/dex\/moves\/[\s\S]*?)<\/tr>/gi));

  rows.forEach((rowMatch) => {
    const rowHtml = rowMatch[0];
    if (/ability\.png/i.test(rowHtml)) return;

    const cells = extractCells(rowHtml);
    const energyCell = cells[0] || '';
    const attackCell = cells[1] || '';
    const damageCell = cells[cells.length - 1] || '';

    const energyMatches = Array.from(energyCell.matchAll(/<img[^>]*alt="([^"]+)"[^>]*>/gi));
    const energies = energyMatches.map((match) => normalizeEnergyType(match[1])).filter(Boolean);
    const cost = toEnergyCounts(energies);

    const nameMatch = /<b>([^<]+)<\/b>/i.exec(attackCell);
    const name = normalizeWhitespace(decodeHtml(nameMatch ? nameMatch[1] : ''));
    const fullText = normalizeText(attackCell);
    const text = normalizeWhitespace(fullText.replace(new RegExp(`^${name}`, 'i'), '').trim());

    const damageText = normalizeText(damageCell);

    attacks.push({
      name,
      cost,
      damage: damageText || undefined,
      text: text || undefined,
    });
  });

  return attacks;
};

const parseAbilityRows = (html) => {
  const abilities = [];
  const rows = Array.from(html.matchAll(/<tr>([\s\S]*?ability\.png[\s\S]*?)<\/tr>/gi));

  rows.forEach((rowMatch) => {
    const rowHtml = rowMatch[0];
    if (!/ability\.png/i.test(rowHtml)) return;

    const cells = extractCells(rowHtml);
    const abilityCell = cells[1] || '';

    const nameMatch = /<b>([^<]+)<\/b>/i.exec(abilityCell);
    const name = normalizeWhitespace(decodeHtml(nameMatch ? nameMatch[1] : ''));
    const fullText = normalizeText(abilityCell);
    const text = normalizeWhitespace(fullText.replace(new RegExp(`^${name}`, 'i'), '').trim());

    if (!name) return;
    abilities.push({ name, text: text || undefined });
  });

  return abilities;
};

const parseCardName = (html) => {
  const headerMatch = /<td[^>]*class="main"[^>]*><b>\s*<font size="2">([^<]+)<\/font>\s*([^<]*)<\/b>/i.exec(
    html
  );
  if (headerMatch) {
    return normalizeWhitespace(decodeHtml(`${headerMatch[1]} ${headerMatch[2]}`));
  }

  const titleMatch = /<title>[^#]*#\d+\s+([^<]+?)\s+-\s+Pok/i.exec(html);
  if (titleMatch) {
    return normalizeWhitespace(decodeHtml(titleMatch[1]));
  }

  return '';
};

const parseHeaderRow = (html) => {
  const startIndex = html.indexOf('<td class="cardinfo">');
  if (startIndex === -1) return '';
  const snippet = html.slice(startIndex);
  const rowMatch = /<tr>([\s\S]*?)<\/tr>/i.exec(snippet);
  return rowMatch ? rowMatch[1] : '';
};

const parsePokemonType = (headerRow) => {
  const match = /tcgpocket\/image\/([a-z0-9]+)\.png/i.exec(headerRow);
  return normalizeEnergyType(match ? match[1] : undefined);
};

const parseHp = (headerRow) => {
  const match = /(\d+)\s*HP/i.exec(headerRow);
  return match ? Number(match[1]) : undefined;
};

const parseDexId = (html) => {
  const match = /\/tcgpocket\/dex\/(\d+)\.shtml/i.exec(html);
  return match ? match[1].padStart(3, '0') : undefined;
};

const stageCache = new Map();

const fetchPokemonStage = async (dexId) => {
  if (!dexId) return null;
  if (stageCache.has(dexId)) return stageCache.get(dexId);

  const dexUrl = `https://www.serebii.net/pokedex/${dexId}.shtml`;
  const html = await fetchText(dexUrl);
  if (!html) {
    stageCache.set(dexId, null);
    return null;
  }

  const evoMatch = /class="evochain"[\s\S]*?<\/table>/i.exec(html);
  if (!evoMatch) {
    stageCache.set(dexId, null);
    return null;
  }

  const numbers = Array.from(evoMatch[0].matchAll(/\/pokedex\/(\d+)\.shtml/g)).map(
    (match) => match[1]
  );
  const unique = [];
  numbers.forEach((num) => {
    if (!unique.includes(num)) unique.push(num);
  });

  const index = unique.indexOf(dexId);
  let stage = null;
  if (index === 0) stage = 'Basic';
  if (index === 1) stage = 'Stage 1';
  if (index >= 2) stage = 'Stage 2';

  stageCache.set(dexId, stage);
  return stage;
};

const parseCardPage = async (html, options) => {
  const name = parseCardName(html);
  const headerRow = parseHeaderRow(html);
  const pokemonType = parsePokemonType(headerRow);
  const hp = parseHp(headerRow);
  const dexId = parseDexId(html);

  const exStatus = /\bmega\b/i.test(name) && /\bex\b/i.test(name)
    ? 'mega-ex'
    : /\bex\b/i.test(name)
    ? 'ex'
    : 'non-ex';

  const pokemonName = normalizeWhitespace(
    name
      .replace(/\bmega\b/i, '')
      .replace(/\bex\b/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const cardInfoBlockMatch = /<td class="cardinfo">([\s\S]*?)<p><h2>Available Booster Packs<\/h2><\/p>/i.exec(
    html
  );
  const cardInfoBlock = cardInfoBlockMatch ? cardInfoBlockMatch[0] : html;

  const attacks = parseAttackRows(cardInfoBlock);
  const abilities = parseAbilityRows(cardInfoBlock);
  const weakness = parseWeakness(cardInfoBlock);
  const retreatCost = parseRetreatCost(cardInfoBlock);
  const illustrator = parseIllustrator(html);
  const raritySymbol = parseRaritySymbol(html);

  const pokemonStage = options.includeStage ? await fetchPokemonStage(dexId) : null;

  return {
    id: options.id,
    set: options.setId,
    number: options.number,
    name,
    pokemonName: pokemonName || undefined,
    pokemonStage,
    hp,
    pokemonType,
    attacks,
    abilities,
    weakness,
    retreatCost,
    illustrator,
    raritySymbol,
    exStatus,
  };
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const run = async () => {
  const args = new Set(process.argv.slice(2));
  const assetsOnly = args.has('--assets-only');
  const dataOnly = args.has('--data-only');
  const includeStage = !args.has('--skip-stage');
  const maxConcurrency = toNumber(getArgValue('--concurrency', ''), 0);
  const assetConcurrency = toNumber(
    getArgValue('--concurrency-assets', ''),
    maxConcurrency || 12
  );
  const dataConcurrency = toNumber(
    getArgValue('--concurrency-data', ''),
    maxConcurrency || 8
  );
  const progressIntervalMs = toNumber(getArgValue('--progress-ms', ''), 250);
  const progressEvery = toNumber(getArgValue('--progress', ''), 25);
  const progressBarWidth = toNumber(getArgValue('--progress-width', ''), 28);
  const setArgIndex = process.argv.indexOf('--set');
  const setFilter = setArgIndex !== -1 ? process.argv[setArgIndex + 1] : null;
  const setIds = setFilter
    ? new Set(
        setFilter
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    : null;

  const summary = {
    sets: 0,
    assets: {
      downloaded: 0,
      skipped: 0,
      failed: 0,
    },
    data: {
      parsed: 0,
      failed: 0,
      setFiles: 0,
      indexWritten: false,
    },
  };

  console.log('Starting Serebii Sync...');
  ensureDir(ASSETS_ROOT);
  ensureDir(DATA_DIR);
  ensureDir(DATA_SETS_DIR);

  // 1. Download Static Icons (Rarity & Types)
  if (!dataOnly) {
    const iconDirRarity = path.join(ASSETS_ROOT, 'icons/rarity');
    const iconDirTypes = path.join(ASSETS_ROOT, 'icons/types');
    ensureDir(iconDirRarity);
    ensureDir(iconDirTypes);

    const rarityTasks = RARITY_ICONS.map((file) => ({
      url: `https://www.serebii.net/tcgpocket/image/${file}`,
      dest: path.join(iconDirRarity, file),
    }));

    const typeTasks = TYPE_ICONS.map((icon) => ({
      url: `https://www.serebii.net/tcgpocket/image/${icon.src}`,
      dest: path.join(iconDirTypes, icon.dest),
    }));

    const rarityResult = await downloadBatch(
      rarityTasks,
      'Rarity Icons',
      assetConcurrency,
      progressIntervalMs,
      progressBarWidth
    );
    const typeResult = await downloadBatch(
      typeTasks,
      'Type Icons',
      assetConcurrency,
      progressIntervalMs,
      progressBarWidth
    );
    summary.assets.downloaded += rarityResult.success + typeResult.success;
    summary.assets.failed += rarityResult.fail + typeResult.fail;
    summary.assets.skipped += rarityResult.skipped + typeResult.skipped;
  }

  const setData = [];

  const selectedSets = setIds
    ? SETS_TO_DOWNLOAD.filter((setInfo) => setIds.has(setInfo.id))
    : SETS_TO_DOWNLOAD;

  if (setIds && selectedSets.length === 0) {
    console.warn(`No matching set ids found for --set ${setFilter}`);
    return;
  }

  for (const setInfo of selectedSets) {
    console.log(`\n=== Set: ${setInfo.id} (${setInfo.slug}) ===`);

    const setDir = path.join(ASSETS_ROOT, 'sets', setInfo.id);
    const cardDir = path.join(ASSETS_ROOT, 'cards', setInfo.id);
    ensureDir(setDir);
    ensureDir(cardDir);

    // -- Set Assets (Logo, Icon, Packs) --
    if (!dataOnly) {
      const setAssets = [
        {
          url: `https://www.serebii.net/tcgpocket/logo/${setInfo.slug}.png`,
          dest: path.join(setDir, 'logo.png'),
        },
        {
          url: `https://www.serebii.net/tcgpocket/logo/${setInfo.slug}-th.png`,
          dest: path.join(setDir, 'icon.png'),
        },
      ];

      if (setInfo.packs) {
        setInfo.packs.forEach((variant) => {
          setAssets.push({
            url: `https://www.serebii.net/tcgpocket/${setInfo.slug}/${variant}.jpg`,
            dest: path.join(setDir, `pack_${variant}.jpg`),
          });
        });
      }

      const setAssetResult = await downloadBatch(
        setAssets,
        `${setInfo.id} Branding & Packs`,
        assetConcurrency,
        progressIntervalMs,
        progressBarWidth
      );
      summary.assets.downloaded += setAssetResult.success;
      summary.assets.failed += setAssetResult.fail;
      summary.assets.skipped += setAssetResult.skipped;
    }

    // -- Card Numbers --
    let cardNumbers = [];
    try {
      const setHtml = await fetchText(`https://www.serebii.net/tcgpocket/${setInfo.slug}/`);
      cardNumbers = extractCardNumbers(setHtml, setInfo.slug);
    } catch (error) {
      console.warn(`Unable to fetch set list for ${setInfo.id}: ${error.message}`);
    }

    if (cardNumbers.length === 0) {
      const fallbackEnd = setInfo.end || setInfo.start + 299;
      cardNumbers = Array.from({ length: fallbackEnd - setInfo.start + 1 }, (_, i) => setInfo.start + i);
    }

    setData.push({
      id: setInfo.id,
      name: setInfo.name,
      packName: setInfo.name,
      packs: setInfo.packs
        ? setInfo.packs.map((variant) =>
            (setInfo.packNames && setInfo.packNames[variant]) ||
            `${variant.charAt(0).toUpperCase()}${variant.slice(1)}`
          )
        : [],
      totalCards: cardNumbers.length,
    });

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let parsedCount = 0;
    let parseFailCount = 0;
    const setCards = [];

    const totalCards = cardNumbers.length;
    let completed = 0;
    const setTracker = createProgressTracker(
      `${setInfo.id} Cards`,
      totalCards,
      progressIntervalMs,
      progressBarWidth
    );
    const handleCard = async (num) => {
      const paddedNum = padNumber(num);
      const fileName = `${paddedNum}.jpg`;
      const filePath = path.join(cardDir, fileName);
      const imageUrl = `https://www.serebii.net/tcgpocket/${setInfo.slug}/${num}.jpg`;
      const cardUrl = `https://www.serebii.net/tcgpocket/${setInfo.slug}/${paddedNum}.shtml`;

      const tasks = [];

      if (!dataOnly) {
        if (fs.existsSync(filePath)) {
          skipCount++;
        } else {
          tasks.push(
            downloadFile(imageUrl, filePath)
              .then((success) => {
                if (success) {
                  successCount++;
                } else {
                  failCount++;
                }
              })
              .catch(() => {
                failCount++;
              })
          );
        }
      }

      if (!assetsOnly) {
        tasks.push(
          fetchText(cardUrl)
            .then(async (html) => {
              if (!html) {
                parseFailCount++;
                return;
              }
              const card = await parseCardPage(html, {
                id: `${setInfo.id}-${paddedNum}`,
                setId: setInfo.id,
                number: paddedNum,
                includeStage,
              });
              setCards.push(card);
              parsedCount++;
            })
            .catch(() => {
              parseFailCount++;
            })
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      completed += 1;
      if (completed % progressEvery === 0 || completed === totalCards) {
        const assetStatus = dataOnly
          ? ''
          : `assets: ${completed}/${totalCards} (ok:${successCount} skip:${skipCount} fail:${failCount})`;
        const dataStatus = assetsOnly
          ? ''
          : `data: ${completed}/${totalCards} (ok:${parsedCount} fail:${parseFailCount})`;
        const parts = [assetStatus, dataStatus].filter(Boolean).join(' | ');
        if (parts) {
          setTracker.updateText(parts);
        }
      }
    };

    const concurrency = assetsOnly ? dataConcurrency : dataOnly ? assetConcurrency : Math.max(assetConcurrency, dataConcurrency);
    await runConcurrent(cardNumbers, concurrency, handleCard);

    const finalAssetStatus = dataOnly
      ? ''
      : `assets: ${completed}/${totalCards} (ok:${successCount} skip:${skipCount} fail:${failCount})`;
    const finalDataStatus = assetsOnly
      ? ''
      : `data: ${completed}/${totalCards} (ok:${parsedCount} fail:${parseFailCount})`;
    const finalParts = [finalAssetStatus, finalDataStatus].filter(Boolean).join(' | ');
    if (finalParts) {
      setTracker.doneText(finalParts);
    }

    if (!dataOnly) {
      console.log(`\nCards Summary: +${successCount} new, ${failCount} failed.`);
    }

    if (!assetsOnly) {
      const setPayload = {
        generatedAt: new Date().toISOString(),
        source: 'https://www.serebii.net/tcgpocket/',
        set: {
          id: setInfo.id,
          name: setInfo.name,
          packName: setInfo.name,
          totalCards: cardNumbers.length,
          packs: setInfo.packs
            ? setInfo.packs.map((variant) =>
                (setInfo.packNames && setInfo.packNames[variant]) ||
                `${variant.charAt(0).toUpperCase()}${variant.slice(1)}`
              )
            : [],
        },
        cards: setCards,
      };
      const setPath = path.join(DATA_SETS_DIR, `${setInfo.id}.json`);
      fs.writeFileSync(setPath, JSON.stringify(setPayload, null, 2));
      console.log(`  Saved ${setInfo.id} data to ${path.relative(process.cwd(), setPath)}`);
      summary.data.setFiles += 1;
    }

    summary.sets += 1;
    summary.assets.downloaded += successCount;
    summary.assets.failed += failCount;
    summary.assets.skipped += skipCount;
    summary.data.parsed += parsedCount;
    summary.data.failed += parseFailCount;
  }

  if (!assetsOnly) {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'https://www.serebii.net/tcgpocket/',
      sets: setData,
    };

    fs.writeFileSync(INDEX_FILE, JSON.stringify(payload, null, 2));
    console.log(`\nSaved set index to ${path.relative(process.cwd(), INDEX_FILE)}`);
    summary.data.indexWritten = true;
  }

  console.log('\nFinal Summary');
  console.log(
    `  Sets processed: ${summary.sets}\n` +
      `  Assets - downloaded: ${summary.assets.downloaded}, skipped: ${summary.assets.skipped}, failed: ${summary.assets.failed}\n` +
      `  Data   - parsed: ${summary.data.parsed}, failed: ${summary.data.failed}, set files: ${summary.data.setFiles}, index: ${summary.data.indexWritten ? 'yes' : 'no'}`
  );
  console.log('\nAll operations completed.');
};

run().catch(console.error);
