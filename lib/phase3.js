import { readFile, commitChanges } from './github.js';
import { addUpload, applyEdit, normalizePath } from './edits.js';
import { findCloaker } from './guard.js';

// Uploads are for assets only (logos, images, css, data). Executable files can't be added through this tool.
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|txt|json|xml|webmanifest|md)$/i;

// upload: {path, buffer} | null ; edits: [{path, find, replace, mode}]
export async function runPhase3(token, fullName, { upload, edits }, log) {
  if (upload && !ASSET_EXT.test(upload.path)) throw new Error('Uploads are limited to assets (png, jpg, svg, ico, css, txt, json, xml). Scripts such as .php or .js cannot be uploaded here.');
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
  const bad = findCloaker(changes);
  if (bad.length) throw new Error(`Refusing to commit: traffic-cloaking scripts found in ${bad.slice(0, 3).join(', ')}.`);
  if (!changes.size) throw new Error('Nothing to do: add a file to upload or at least one edit.');
  const r = await commitChanges(token, fullName, changes, `Update ${[...changes.keys()].join(', ')}`);
  log(`Committed ${r.sha.slice(0, 7)} on ${r.branch}. Vercel redeploys automatically.`);
  return r;
}
