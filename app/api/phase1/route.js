import { guard, ndjson, slug, isRepo } from '../../../lib/http.js';
import { downloadRepo, createRepo, commitFiles, getUser } from '../../../lib/github.js';
export const maxDuration = 300;
export const runtime = 'nodejs';

// Phase 1: duplicate a GitHub repo under a new name.
export async function POST(req) {
  const g = guard(req); if (g.res) return g.res;
  const b = await req.json();
  return ndjson(async (send) => {
    const log = (m) => send({ log: m });
    const source = String(b.source || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (!isRepo(source)) throw new Error('Source must look like owner/repo.');
    const name = slug(b.name || '');
    if (!name) throw new Error('Pick a name for the new repo.');
    const user = (await getUser(g.env.gt)).login;
    const owner = g.env.owner || user;
    log(`Downloading ${source}…`);
    const files = await downloadRepo(g.env.gt, source, '');
    log(`  ${files.size} files (.github/workflows skipped).`);
    log(`Creating ${owner}/${name}…`);
    const repo = await createRepo(g.env.gt, { owner, user, name, isPrivate: !!b.private, description: `Copy of ${source}` });
    const r = await commitFiles(g.env.gt, repo.full_name, files, `Copy of ${source}`, log);
    log(`Committed ${r.sha.slice(0, 7)} on ${r.branch}.`);
    send({ result: { repo: repo.full_name, url: repo.html_url } });
  });
}
