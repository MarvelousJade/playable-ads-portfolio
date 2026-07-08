/*
 * build.js — packages each demo into a single self-contained HTML file
 * (dist/<name>.html) the way ad networks require: one file, zero external
 * requests — engine, shared modules, game code and art all inlined (PNGs as
 * base64 data URIs). mraid.js is not bundled by design: networks inject it
 * at serve time.
 *
 * Prints a size report against the common network caps (≤5 MB raw single
 * file; ≤2 MB zipped is the tightest usual budget, e.g. Meta).
 *
 * Usage: node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const GAMES = {
  slots:   { title: 'Lucky Vegas Slots (Phaser 3)',  assets: ['cherry', 'lemon', 'bell', 'star', 'gem', 'coin'] },
  wheel:   { title: 'Spin to Win (Pixi.js)',         assets: [] },   // fully procedural art
  scratch: { title: 'Lucky Scratch (vanilla Canvas)', assets: ['cherry', 'lemon', 'bell', 'star', 'gem', 'coin'] }
};

const RAW_CAP = 5 * 1024 * 1024;   // common max single-file size
const GZ_CAP = 2 * 1024 * 1024;    // tightest common zipped budget

function dataUri(file) {
  return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
}

function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

function build(name, cfg) {
  const dir = path.join(ROOT, name);
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

  // 1. inline every <script src> (vendor engine, shared modules, game code)
  html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>/g, (m, src) => {
    let js = fs.readFileSync(path.resolve(dir, src), 'utf8');
    // '</script' inside JS would close the tag early for the HTML parser
    js = js.replace(/<\/script/gi, '<\\/script');
    return '<script>/* inlined: ' + src + ' */\n' + js + '\n</script>';
  });

  // 2. inject the art as data URIs ahead of the game code
  if (cfg.assets.length) {
    const map = {};
    for (const k of cfg.assets) map[k] = dataUri(path.join(ROOT, 'assets', k + '.png'));
    html = html.replace('<script>', '<script>window.INLINE_ASSETS = ' + JSON.stringify(map) + ';</script>\n<script>');
  }

  const out = path.join(DIST, name + '.html');
  fs.writeFileSync(out, html);

  const raw = Buffer.byteLength(html);
  const gz = zlib.gzipSync(html, { level: 9 }).length;
  const ok = raw <= RAW_CAP && gz <= GZ_CAP;
  console.log(
    `${ok ? '✓' : '✗ OVER BUDGET'}  dist/${name}.html  ${kb(raw)} raw / ${kb(gz)} gzipped  — ${cfg.title}`
  );
  return ok;
}

fs.mkdirSync(DIST, { recursive: true });
console.log('Single-file network builds (caps: ≤' + kb(RAW_CAP) + ' raw, ≤' + kb(GZ_CAP) + ' gzipped):\n');
const allOk = Object.entries(GAMES).map(([n, c]) => build(n, c)).every(Boolean);
console.log('\n' + (allOk ? 'All builds within network size caps ✓' : 'SIZE CAP EXCEEDED ✗'));
process.exit(allOk ? 0 : 1);
