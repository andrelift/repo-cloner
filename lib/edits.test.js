import test from 'node:test';
import assert from 'node:assert/strict';
import { addUpload, applyEdit, normalizePath } from './edits.js';

const mk = () => new Map([
  ['config.js', { mode: '100644', content: Buffer.from('const name = "old";\nconst x = "old";') }],
  ['package.json', { mode: '100644', content: Buffer.from('{\n  "name": "a",\n  "cfg": { "port": 1 }\n}\n') }],
]);

test('upload creates and overwrites', () => {
  const f = mk();
  addUpload(f, 'public/logo.png', Buffer.from([1, 2]));
  assert.equal(f.get('public/logo.png').content.length, 2);
  addUpload(f, 'config.js', Buffer.from('x'));
  assert.equal(f.get('config.js').content.toString(), 'x');
});
test('text edit replaces all', () => {
  const f = mk();
  applyEdit(f, { path: 'config.js', find: 'old', replace: 'new' });
  assert.equal(f.get('config.js').content.toString(), 'const name = "new";\nconst x = "new";');
});
test('multiline literal replacement and first-only option', () => {
  const f = new Map([['view.php', { mode: '100644', content: Buffer.from('<head>\n<script>old()</script>\n</head>\n<script>old()</script>') }]]);
  applyEdit(f, { path: 'view.php', find: '<head>\n<script>old()</script>', replace: '<head>\n<!-- replaced -->', match: 'first' });
  assert.equal(f.get('view.php').content.toString(), '<head>\n<!-- replaced -->\n</head>\n<script>old()</script>');
});

test('json edit nested + parses values', () => {
  const f = mk();
  applyEdit(f, { path: 'package.json', mode: 'json', find: 'cfg.port', replace: '3000' });
  assert.equal(JSON.parse(f.get('package.json').content.toString()).cfg.port, 3000);
  applyEdit(f, { path: 'package.json', mode: 'json', find: 'name', replace: 'b' });
  assert.equal(JSON.parse(f.get('package.json').content.toString()).name, 'b');
});
test('errors', () => {
  const f = mk();
  assert.throws(() => applyEdit(f, { path: 'nope', find: 'a', replace: 'b' }), /not found in repo/);
  assert.throws(() => applyEdit(f, { path: 'config.js', find: 'zzz', replace: 'b' }), /not found in/);
  assert.throws(() => normalizePath('../etc'), /Invalid/);
});
