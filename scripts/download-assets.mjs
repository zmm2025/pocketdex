/**
 * PocketDex Asset Downloader
 * 
 * Automatically downloads card images, logos, icons, and pack art from Serebii
 * and organizes them into the expected directory structure.
 * 
 * Usage: node scripts/download-assets.mjs
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const SETS_TO_DOWNLOAD = [
  // --- Block A ---
  { 
    id: 'A1', 
    slug: 'geneticapex', 
    start: 1, 
    end: 286,
    packs: ['pikachu', 'charizard', 'mewtwo'] 
  },
  { id: 'A1a', slug: 'mythicalisland', start: 1, end: 86 },
  { id: 'A2', slug: 'space-timesmackdown', start: 1, end: 207 },
  { id: 'A2a', slug: 'triumphantlight', start: 1, end: 96 },
  { id: 'A2b', slug: 'shiningrevelry', start: 1, end: 112 },
  { id: 'A3', slug: 'celestialguardians', start: 1, end: 239 },
  { id: 'A3a', slug: 'extradimensionalcrisis', start: 1, end: 103 },
  { id: 'A3b', slug: 'eeveegrove', start: 1, end: 107 },
  { id: 'A4', slug: 'wisdomofseaandsky', start: 1, end: 241 },
  { id: 'A4a', slug: 'secludedsprings', start: 1, end: 105 },
  { id: 'A4b', slug: 'deluxepackex', start: 1, end: 379 },
  
  // --- Block B ---
  { id: 'B1', slug: 'megarising', start: 1, end: 331 },
  { id: 'B1a', slug: 'crimsonblaze', start: 1, end: 103 },
  
  // --- Promos ---
  { id: 'PROMO-A', slug: 'promo-a', start: 1 },
  { id: 'PROMO-B', slug: 'promo-b', start: 1 },
];

const RARITY_ICONS = [
  'diamond1.png', 'diamond2.png', 'diamond3.png', 'diamond4.png',
  'star1.png', 'star2.png', 'star3.png',
  'shiny1.png', 'shiny2.png',
  'crown.png'
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
  { src: 'colorless.png', dest: 'colorless.png' }
];

// ============================================================================
// HELPERS
// ============================================================================

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    // console.log(`Created directory: ${dirPath}`);
  }
};

const padNumber = (num) => num.toString().padStart(3, '0');

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

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const downloadBatch = async (items, label) => {
  console.log(`\nProcessing ${label}...`);
  let success = 0;
  let fail = 0;

  for (const item of items) {
    if (fs.existsSync(item.dest)) {
      continue;
    }
    try {
      // process.stdout.write(`Downloading ${path.basename(item.dest)}... `);
      const result = await downloadFile(item.url, item.dest);
      if (result) {
        success++;
      } else {
        // process.stdout.write('404 ');
        fail++;
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      fail++;
    }
  }
  console.log(`Completed ${label}: ${success} downloaded, ${fail} failed/skipped.`);
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const run = async () => {
  console.log('Starting Asset Download...');
  ensureDir(ASSETS_ROOT);

  // 1. Download Static Icons (Rarity & Types)
  const iconDirRarity = path.join(ASSETS_ROOT, 'icons/rarity');
  const iconDirTypes = path.join(ASSETS_ROOT, 'icons/types');
  ensureDir(iconDirRarity);
  ensureDir(iconDirTypes);

  const rarityTasks = RARITY_ICONS.map(file => ({
    url: `https://www.serebii.net/tcgpocket/image/${file}`,
    dest: path.join(iconDirRarity, file)
  }));
  
  const typeTasks = TYPE_ICONS.map(icon => ({
    url: `https://www.serebii.net/tcgpocket/image/${icon.src}`,
    dest: path.join(iconDirTypes, icon.dest)
  }));

  await downloadBatch(rarityTasks, 'Rarity Icons');
  await downloadBatch(typeTasks, 'Type Icons');

  // 2. Download Set Data (Cards, Logos, Pack Art)
  for (const setInfo of SETS_TO_DOWNLOAD) {
    console.log(`\n=== Set: ${setInfo.id} (${setInfo.slug}) ===`);
    
    const setDir = path.join(ASSETS_ROOT, 'sets', setInfo.id);
    const cardDir = path.join(ASSETS_ROOT, 'cards', setInfo.id);
    ensureDir(setDir);
    ensureDir(cardDir);

    // -- Set Assets (Logo, Icon, Packs) --
    const setAssets = [
      {
        url: `https://www.serebii.net/tcgpocket/logo/${setInfo.slug}.png`,
        dest: path.join(setDir, 'logo.png')
      },
      {
        url: `https://www.serebii.net/tcgpocket/logo/${setInfo.slug}-th.png`,
        dest: path.join(setDir, 'icon.png')
      }
    ];

    if (setInfo.packs) {
      setInfo.packs.forEach(variant => {
        setAssets.push({
          url: `https://www.serebii.net/tcgpocket/${setInfo.slug}/${variant}.jpg`,
          dest: path.join(setDir, `pack_${variant}.jpg`)
        });
      });
    }

    await downloadBatch(setAssets, `${setInfo.id} Branding & Packs`);

    // -- Cards --
    let successCount = 0;
    let failCount = 0;
    let consecutiveFails = 0;
    const isAuto = !setInfo.end;
    const end = setInfo.end || 300; // Safety cap

    console.log(`Downloading Cards for ${setInfo.id}...`);

    for (let i = setInfo.start; i <= end; i++) {
      if (isAuto && consecutiveFails >= 3) break;

      const paddedNum = padNumber(i);
      const fileName = `${paddedNum}.jpg`;
      const filePath = path.join(cardDir, fileName);
      const url = `https://www.serebii.net/tcgpocket/${setInfo.slug}/${i}.jpg`;

      if (fs.existsSync(filePath)) {
        consecutiveFails = 0;
        continue;
      }

      try {
        await new Promise(r => setTimeout(r, 20)); // Rate limit
        const success = await downloadFile(url, filePath);
        
        if (success) {
          process.stdout.write('.');
          successCount++;
          consecutiveFails = 0;
        } else {
          process.stdout.write('x');
          failCount++;
          consecutiveFails++;
        }
      } catch (error) {
        process.stdout.write('E');
        failCount++;
        consecutiveFails++;
      }
    }
    console.log(`\nCards Summary: +${successCount} new, ${failCount} failed.`);
  }

  console.log('\nAll operations completed.');
};

run().catch(console.error);