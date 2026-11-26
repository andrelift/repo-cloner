import { readFile, commitChanges } from './github.js';
import { addUpload, applyEdit, normalizePath } from './edits.js';

// upload: {path, buffer} | null ; edits: [{path, find, replace, mode}]
export async function runPhase3(token, fullName, { upload, edits }, log) {
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
