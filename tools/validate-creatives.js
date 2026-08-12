/* Validate producer/AI-authored creative data without runtime dependencies. */
'use strict';

const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
const targets = files.length ? files : [path.join(__dirname, '..', 'word', 'creative.json')];
let failures = 0;

function fail(file, message) {
  failures++;
  console.error(`✗ ${path.relative(process.cwd(), file)}: ${message}`);
}

function letterCounts(value) {
  return value.split('').reduce((counts, letter) => {
    counts[letter] = (counts[letter] || 0) + 1;
    return counts;
  }, {});
}

for (const file of targets) {
  let creative;
  try {
    creative = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    continue;
  }

  if (!creative.id || !creative.title || !creative.variants) {
    fail(file, 'id, title and variants are required');
    continue;
  }

  for (const [variantName, variant] of Object.entries(creative.variants)) {
    const label = `variant ${variantName}`;
    if (!Array.isArray(variant.letters) || variant.letters.length < 3) {
      fail(file, `${label} needs at least three wheel letters`);
      continue;
    }
    if (!Array.isArray(variant.words) || !variant.words.length) {
      fail(file, `${label} needs at least one word`);
      continue;
    }

    const available = letterCounts(variant.letters.join(''));
    const occupied = new Map();
    const seenWords = new Set();

    for (const word of variant.words) {
      if (!word.text || !/^[A-Z]+$/.test(word.text)) {
        fail(file, `${label} contains an invalid uppercase word`);
        continue;
      }
      if (seenWords.has(word.text)) fail(file, `${label} repeats ${word.text}`);
      seenWords.add(word.text);
      if (!Array.isArray(word.cells) || word.cells.length !== word.text.length) {
        fail(file, `${label} ${word.text} must have one cell per letter`);
        continue;
      }

      const needed = letterCounts(word.text);
      for (const [letter, count] of Object.entries(needed)) {
        if ((available[letter] || 0) < count) {
          fail(file, `${label} cannot spell ${word.text} from [${variant.letters.join(', ')}]`);
        }
      }

      word.cells.forEach((position, index) => {
        if (!Array.isArray(position) || position.length !== 2 ||
            !Number.isInteger(position[0]) || !Number.isInteger(position[1])) {
          fail(file, `${label} ${word.text} has an invalid cell at index ${index}`);
          return;
        }
        const [row, col] = position;
        if (row < 0 || row >= variant.rows || col < 0 || col >= variant.cols) {
          fail(file, `${label} ${word.text} cell ${row}:${col} is outside ${variant.rows}×${variant.cols}`);
          return;
        }
        const key = `${row}:${col}`;
        const letter = word.text[index];
        if (occupied.has(key) && occupied.get(key) !== letter) {
          fail(file, `${label} has conflicting letters at ${key}`);
        }
        occupied.set(key, letter);
      });
    }
  }

  if (!failures) console.log(`✓ ${path.relative(process.cwd(), file)} — ${Object.keys(creative.variants).length} variants valid`);
}

process.exit(failures ? 1 : 0);
