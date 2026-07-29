const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'consume.js'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'css', 'games', 'consume.css'),
  'utf8'
);

test('Tile Swap handles touch and pen taps immediately while retaining click fallback', () => {
  const fastTap = source.match(
    /function bindFastTileTap\(container, selector, readId, onTap\) \{([\s\S]*?)\n  \}/
  );

  assert.ok(fastTap);
  assert.match(fastTap[1], /addEventListener\('pointerdown'/);
  assert.match(fastTap[1], /event\.pointerType !== 'touch'/);
  assert.match(fastTap[1], /event\.pointerType !== 'pen'/);
  assert.match(fastTap[1], /onTap\(readId\(tile\)\)/);
  assert.match(fastTap[1], /addEventListener\('click'/);
});

test('Tile Swap suppresses the compatibility click after an immediate pointer tap', () => {
  assert.match(source, /ignoreClickUntil = Date\.now\(\) \+ 700/);
  assert.match(source, /if \(event\.detail && Date\.now\(\) < ignoreClickUntil\) return/);
});

test('Tile Swap uses fast tapping for both board and tray tiles', () => {
  assert.match(
    source,
    /bindFastTileTap\(\s*wrap\.querySelector\('#cw-board'\),\s*'\[data-board-tile\]'/
  );
  assert.match(
    source,
    /bindFastTileTap\(\s*wrap\.querySelector\('#cw-tray'\),\s*'\[data-tray-tile\]'/
  );
});

test('Tile Swap overlays feedback across the board without shifting the tray', () => {
  assert.match(
    source,
    /<div class="cw-board-shell">` \+\s*`<div class="cw-board"[^]*?<div class="cw-flash"/
  );
  assert.doesNotMatch(
    source,
    /<div class="cw-tray-shell">` \+\s*`<div class="cw-flash"/
  );
});

test('Tile Swap reserves cyan for unsubmitted selections', () => {
  assert.match(styles, /--cw-selection: #38d8ff/);
  assert.match(styles, /\.cw-tile\.selected \{[^}]*background: var\(--cw-selection\)/s);
  assert.match(styles, /\.cw-tile\.tray \{[^}]*background: var\(--cw-selection\)/s);

  const wordPalette = [...styles.matchAll(
    /\.cw-tile\.word-[1-6], \.cw-chip\.word-[1-6] \{([\s\S]*?)\n\}/g
  )].map(match => match[1]).join('\n');
  assert.ok(wordPalette);
  assert.doesNotMatch(wordPalette, /#38d8ff|56,\s*216,\s*255/i);
});

test('Tile Swap gives returned-word controls a larger wrapping tap area', () => {
  assert.match(styles, /\.cw-tableau \{[^}]*min-height: 124px[^}]*flex-wrap: wrap[^}]*padding: 14px 12px/s);
  assert.match(styles, /\.cw-chip \{[^}]*min-height: 52px/s);
});

test('Tile Swap gives Submit the rendered board width', () => {
  assert.match(source, /<button class="cw-spell" data-act="submit">SUBMIT<\/button>/);
  assert.doesNotMatch(source, />SPELL IT<\/button>/);
  assert.match(source, /querySelector\('#cw-board'\)\?\.getBoundingClientRect\(\)\.width/);
  assert.match(source, /btn\.style\.width = `\$\{boardWidth\}px`/);
});

test('Tile Swap gives Clear a compact shaded, right-aligned, always-white action area', () => {
  assert.match(styles, /\.cw-clear \{[^}]*right: 1px[^}]*width: 54px/s);
  assert.match(styles, /\.cw-clear \{[^}]*background: linear-gradient[^}]*color: #fff/s);
  assert.match(styles, /\.cw-clear \{[^}]*text-align: center/s);
  assert.match(styles, /\.cw-clear:disabled \{[^}]*opacity: 1[^}]*color: #fff/s);
  assert.match(styles, /\.cw-tray \{[^}]*padding: 6px 64px/s);
});

test('Tile Swap centers the active spelled word despite the right-side Clear control', () => {
  assert.match(styles, /\.cw-tray \{[^}]*justify-content: center[^}]*padding: 6px 64px/s);
});

test('Tile Swap spaces the tray, Submit, and returned words with one vertical rhythm', () => {
  assert.match(
    styles,
    /\.cw-tray-shell,\s*\.cw-tableau-shell \{[^}]*gap: 12px[^}]*margin-top: 4px/s
  );
});
