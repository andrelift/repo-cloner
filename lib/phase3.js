import { readFile, commitChanges } from './github.js';
import { addUpload, applyEdit, normalizePath } from './edits.js';

// Explicit upload allowlist. PHP files can be stored in the repository; Vercel
// does not execute arbitrary PHP files as part of a standard Next.js deployment.
const UPLOAD_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|txt|json|xml|webmanifest|md|php)$/i;

// Upload destination is fixed to api/; only the original basename is accepted.
export function uploadDestPath(filename) {
  const name = String(filename || '').replace(/\\/g, '/').split('/').pop();
  if (!name || name === '.' || name === '..' || name.includes('\0')) throw new Error('Invalid upload filename.');
  return normalizePath(`api/${name}`);
}

// upload: {path, buffer} | null ; edits: [{path, find, replace, mode}]
export async function runPhase3(token, fullName, { upload, edits }, log) {
  if (upload) upload = { ...upload, path: uploadDestPath(upload.filename || upload.path) };
  if (upload && !UPLOAD_EXT.test(upload.path)) throw new Error('Unsupported upload type. Allowed: images, css, txt, json, xml, webmanifest, md and php.');
  const changes = new Map();
  const edited = edits.filter((e) => e.path);
  // load every file we need to edit (once), then apply edits in order
  for (const p of new Set(edited.map((e) => normalizePath(e.path)))) {
    if (upload && normalizePath(upload.path) === p) continue; // edits apply on top of the upload below
    log(`Reading ${p}…`);
    changes.set(p, await readFile(token, fullName, p));
  }
  if (upload) log(`Adding upload → ${addUpload(changes, upload.path, upload.buffer)}`);
  for (const e of edited) log(`Edited ${applyEdit(changes, e)} (${e.mode === 'json' ? 'set ' + e.find : '"' + e.find + '" → "' + (e.replace ?? '') + '"'})`);
  if (!changes.size) throw new Error('Nothing to do: add a file to upload or at least one edit.');
  const r = await commitChanges(token, fullName, changes, `Update ${[...changes.keys()].join(', ')}`);
  log(`Committed ${r.sha.slice(0, 7)} on ${r.branch}. Vercel redeploys automatically.`);
  return r;
}