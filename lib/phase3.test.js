import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal fake GitHub: one repo with config.json + index.js
const store = { 'config.json': '{\n  "site": { "title": "Old" }\n}\n', 'index.js': 'const url = "old.com";\n' };
const blobs = {}; let posted = null; let patched = null;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const p = u.pathname; const m = init.method || 'GET';
  const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (p === '/repos/me/copy' && m === 'GET') return ok({ default_branch: 'main', id: 7 });
  if (p.startsWith('/repos/me/copy/contents/')) { const f = decodeURIComponent(p.split('/contents/')[1]); return store[f] ? ok({ sha: 'sha-' + f }) : new Response('nf', { status: 404 }); }
  if (p.startsWith('/repos/me/copy/git/blobs/sha-')) return ok({ content: Buffer.from(store[p.split('sha-')[1]]).toString('base64') });
  if (p === '/repos/me/copy/git/ref/heads/main') return ok({ object: { sha: 'H' } });
  if (p === '/repos/me/copy/git/commits/H') return ok({ tree: { sha: 'T0' } });
  if (p === '/repos/me/copy/git/blobs' && m === 'POST') { const id = 'b' + Object.keys(blobs).length; blobs[id] = JSON.parse(init.body); return ok({ sha: id }); }
  if (p === '/repos/me/copy/git/trees') { posted = JSON.parse(init.body); return ok({ sha: 'T1' }); }
  if (p === '/repos/me/copy/git/commits' && m === 'POST') return ok({ sha: 'abcdef123' });
  if (p === '/repos/me/copy/git/refs/heads/main') { patched = JSON.parse(init.body); return ok({}); }
  return new Response('unexpected ' + m + ' ' + p, { status: 500 });
};
const { runPhase3 } = await import('./phase3.js');

test('upload + two edits become one commit on top of base_tree', async () => {
  const logs = [];
  await runPhase3('tok', 'me/copy', {
    upload: { path: 'public/logo.png', buffer: Buffer.from([1, 2, 3]) },
    edits: [
      { path: 'config.json', mode: 'json', find: 'site.title', replace: 'New' },
      { path: 'index.js', mode: 'text', find: 'old.com', replace: 'new.com' },
    ],
  }, (m) => logs.push(m));
  assert.equal(posted.base_tree, 'T0');
  assert.deepEqual(posted.tree.map((t) => t.path).sort(), ['config.json', 'index.js', 'public/logo.png']);
  const decoded = Object.values(blobs).map((b) => Buffer.from(b.content, 'base64').toString());
  assert.ok(decoded.includes('const url = "new.com";\n'));
  assert.ok(decoded.some((d) => JSON.parse(d.toString().startsWith('{') ? d : '{}').site?.title === 'New'));
  assert.deepEqual(patched, { sha: 'abcdef123' }); // no force push
});
test('nothing to do is an error; missing file is an error', async () => {
  await assert.rejects(runPhase3('t', 'me/copy', { upload: null, edits: [] }, () => {}), /Nothing to do/);
  await assert.rejects(runPhase3('t', 'me/copy', { upload: null, edits: [{ path: 'nope.txt', find: 'a', replace: 'b' }] }, () => {}), /404/);
});
