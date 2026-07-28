const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'space.js'), 'utf8');
const hud = source.slice(source.indexOf('function drawHUD()'), source.indexOf('function drawRescueBanner()'));

test('live HUD is a pilot portrait with a circular green health ring', () => {
  assert.match(hud, /medallionX/);
  assert.match(hud, /ctx\.arc\(medallionX, medallionY, ringR/);
  assert.match(hud, /ctx\.strokeStyle = '#33ff66'/);
  assert.doesNotMatch(hud, /fillRect\(barX, barY/);
});

test('pilot expression follows the requested health thresholds', () => {
  assert.match(hud, /health > 80 \? 'happy' : health >= 40 \? 'normal' : 'sad'/);
  assert.match(hud, /pilot\.imgHappy/);
  assert.match(hud, /pilot\.imgSad/);
});

test('live HUD omits score and rescued count', () => {
  assert.doesNotMatch(hud, /SCORE/);
  assert.doesNotMatch(hud, /RESCUED/);
});

test('temporary status banner hangs below the pilot medallion', () => {
  const banner = source.slice(source.indexOf('function drawTopBanner()'), source.indexOf('function drawSockets()'));
  assert.match(banner, /const bannerY = 84/);
  assert.match(banner, /ctx\.moveTo\(43, 77\); ctx\.lineTo\(43, bannerY\)/);
  assert.doesNotMatch(banner, /fillRect\(0, 0, W, 54\)/);
});

test('campaign results use one full-width content column', () => {
  const results = source.slice(source.indexOf('function completeSpaceCampaign()'), source.indexOf('function showSpaceOverlay(mode)'));
  assert.match(results, /style="display:block;/);
  assert.doesNotMatch(results, /ALL \$\{SPACE_CAMPAIGN_FINAL_WAVE\} WAVES PLAYED/);
  assert.doesNotMatch(results, /WAVE\$\{wavesFailed === 1/);
});
