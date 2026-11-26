import { guard, ndjson, isRepo } from '../../../lib/http.js';
import { runPhase3 } from '../../../lib/phase3.js';
export const maxDuration = 120;
export const runtime = 'nodejs';

// Phase 3: upload an asset + edit lines/settings → one commit → Vercel redeploys.
export async function POST(req) {
  const g = guard(req); if (g.res) return g.res;
  const form = await req.formData();
  return ndjson(async (send) => {
    const repo = String(form.get('repo') || '');
    if (!isRepo(repo)) throw new Error('Pick a target repo first.');
    const file = form.get('file');
    const uploadPath = String(form.get('uploadPath') || '');
    const hasUpload = file && typeof file === 'object' && file.size > 0;
    if (hasUpload && !uploadPath) throw new Error('Set a destination path for the uploaded file.');
    const edits = JSON.parse(form.get('edits') || '[]');
    const upload = hasUpload ? { path: uploadPath, buffer: Buffer.from(await file.arrayBuffer()) } : null;
    const r = await runPhase3(g.env.gt, repo, { upload, edits }, (m) => send({ log: m }));
    send({ result: { sha: r.sha, url: `https://github.com/${repo}/commit/${r.sha}` } });
  });
}
