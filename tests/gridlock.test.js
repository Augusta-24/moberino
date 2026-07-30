const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js/games/gridlock.js'),
  'utf8'
);

test('a Grid Lock bolt cannot be online without a conduit arm connected to it', () => {
  const onlineSinkRule = source.match(
    /const onlineSinks = SINKS\.filter\(sink => \{([\s\S]*?)\n    \}\);/
  );

  assert.ok(onlineSinkRule, 'online bolt evaluation rule is present');
  assert.match(
    onlineSinkRule[1],
    /if \(!sinkTile \|\| !effConns\(sinkTile\)\.has\(sink\.side\)\) return false;/
  );
  assert.match(onlineSinkRule[1], /reaches\[sink\.system\]\.has\(node\)/);
});
