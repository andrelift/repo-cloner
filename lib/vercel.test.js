import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProductionHost } from './vercel.js';

test('custom domain wins', () => assert.equal(pickProductionHost({ name: 'x' }, {}, 'app.example.com'), 'app.example.com'));
test('uses the stable project alias, not the per-deployment url', () => {
  const proj = { name: 'mysite', targets: { production: { alias: ['mysite-git-main-lift-win.vercel.app', 'mysite.vercel.app'] } } };
  assert.equal(pickProductionHost(proj, { alias: [], url: 'mysite-b9apy2s48-lift-win.vercel.app' }), 'mysite.vercel.app');
});
test('falls back to name.vercel.app', () => assert.equal(pickProductionHost({ name: 'abc' }, {}), 'abc.vercel.app'));
test('picks shortest alias when exact name is taken', () => {
  const proj = { name: 'abc', targets: { production: { alias: ['abc-lift-win.vercel.app', 'abc-xyz-lift-win.vercel.app'] } } };
  assert.equal(pickProductionHost(proj, {}), 'abc-lift-win.vercel.app');
});
