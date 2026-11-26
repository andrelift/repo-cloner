import test from 'node:test';
import assert from 'node:assert/strict';
import { findCloaker } from './guard.js';

const file = (s) => ({ mode: '100644', content: Buffer.from(s) });
test('clean template passes', () => {
  assert.deepEqual(findCloaker(new Map([['index.php', file('<?php echo "hi";')], ['a.png', file('\x89PNG')]])), []);
});
test('adspect scripts are found', () => {
  const m = new Map([['index.php', file('ok')], ['api/x.php', file("<?php adspect('sid');")], ['api/y.php', file('https://rpc.adspect.net/v2/')]]);
  assert.deepEqual(findCloaker(m), ['api/x.php', 'api/y.php']);
});
