import { guard, ndjson, slug, isRepo } from '../../../lib/http.js';
import { downloadRepo, createRepo, commitFiles, getUser } from '../../../lib/github.js';
import { findCloaker } from '../../../lib/guard.js';
export const maxDuration = 300;
export const runtime = 'nodejs';

// Phase 1: duplicate the ONE configured base repo (BASE_REPO) under a new name. The client cannot choose the source.
export async function POST(req) {
  const g = guard(req); if (g.res) return g.res;
  const b = await req.json();
  return ndjson(async (send) => {
    const log = (m) => send({ log: m });
    const base = process.env.BASE_REPO;
    if (!isRepo(base)) throw new Error('BASE_REPO is not set (expected owner/repo).');
    const name = slug(b.name || '');
    if (!name) throw new Error('Pick a name for the new repo.');
    const user = (await getUser(g.env.gt)).login;
    const owner = g.env.owner || user;
    log(`Downloading base repo ${base}…`);
    const files = await downloadRepo(g.env.gt, base, '');
    log(`  ${files.size} files (.github/workflows skipped).`);
    const bad = findCloaker(files);
    if (bad.length) throw new Error(`The base repo contains traffic-cloaking scripts (${bad.slice(0, 3).join(', ')}). This tool only duplicates clean templates. Remove them from the base repo and try again.`);
    log(`Creating ${owner}/${name}…`);
    const repo = await createRepo(g.env.gt, { owner, user, name, isPrivate: !!b.private, description: `Copy of ${base}` });
    const r = await commitFiles(g.env.gt, repo.full_name, files, `Copy of ${base}`, log);
    log(`Committed ${r.sha.slice(0, 7)} on ${r.branch}.`);
    send({ result: { repo: repo.full_name, url: repo.html_url } });
  });
}
