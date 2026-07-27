const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'arcade.js'), 'utf8');

test('carousel centering uses untransformed layout measurements', () => {
  const initCarousel = source.match(/function initCarousel\(\) \{([\s\S]*?)\n\}\n\nfunction updateCarouselDots/);
  assert.ok(initCarousel);
  assert.match(initCarousel[1], /const cw = originals\[0\]\.offsetWidth/);
  assert.match(initCarousel[1], /cardW = items\[0\]\.offsetWidth/);
  assert.doesNotMatch(initCarousel[1], /= (?:originals|items)\[[^\]]+\]\.getBoundingClientRect\(\)\.width/);
});

test('carousel release suppresses clicks when a fast swipe skips pointermove', () => {
  const endDrag = source.match(/function endDrag\(e\) \{([\s\S]*?)\n  \}\n  window\.addEventListener\('pointerup'/);
  assert.ok(endDrag);
  assert.match(endDrag[1], /if \(Math\.abs\(dx\) > 10 \|\| advance\)/);
  assert.match(endDrag[1], /dragMoved = true/);
  assert.match(endDrag[1], /suppressClickUntil = performance\.now\(\) \+ 500/);
  assert.match(endDrag[1], /e\.preventDefault\(\)/);
});

test('carousel quarantines delayed synthetic clicks after a swipe', () => {
  assert.match(source, /if \(dragMoved \|\| performance\.now\(\) < suppressClickUntil\)/);
  assert.match(source, /e\.stopImmediatePropagation\(\)/);
});
