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

test('carousel queues a follow-up swipe while a transition is still active', () => {
  assert.match(source, /let pendingDir = 0/);
  assert.match(source, /if \(animating\) \{[\s\S]*pendingDir = dir;/);
  assert.match(source, /if \(pendingDir !== 0\) \{/);
  assert.match(source, /beginTransition\(nextDir\)/);
});

test('carousel uses a more forgiving touch swipe threshold', () => {
  assert.match(source, /step \* 0\.14/);
  assert.match(source, /pointerType === 'touch'/);
  assert.match(source, /Math\.abs\(velocity\) > 0\.4/);
});

test('carousel cancels an in-flight transition when a new drag begins', () => {
  assert.match(source, /if \(animating\) \{[\s\S]*clearTimeout\(transitionSafetyTimer\);[\s\S]*animating = false/);
  assert.match(source, /dragBaseVIdx = visualIdx/);
});

test('carousel listens for touch drags on mobile', () => {
  const touchStartBlock = source.match(/track\.addEventListener\('touchstart'[^]*?\}, \{ passive: true \}\);/);
  assert.ok(touchStartBlock);
  assert.match(source, /window\.addEventListener\('touchmove'/);
  assert.match(source, /window\.addEventListener\('touchend'/);
  assert.doesNotMatch(touchStartBlock[0], /preventDefault\(\)/);
});

test('carousel trackpad swipes do not advance twice during a drag gesture', () => {
  assert.match(source, /carousel\.addEventListener\('wheel'[^]*?if \(dragging \|\| animating\) return;/);
});

test('carousel re-entry refreshes the current slide instead of only restoring ready state', () => {
  assert.match(source, /if \(carousel\.dataset\.carouselReady === '1'\) \{[\s\S]*carousel\._refreshCarouselLayout/);
  assert.match(source, /function syncToCurrentIndex\(\)/);
  assert.match(source, /logIdx = \(\(_carouselIdx % N\) \+ N\) % N/);
  assert.match(source, /carousel\._refreshCarouselLayout = syncToCurrentIndex/);
});
