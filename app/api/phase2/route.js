import { guard, ndjson, slug, isRepo } from '../../../lib/http.js';
import { getRepo } from '../../../lib/github.js';
import { createProject, addDomain, deploy, getDeployment, getProject, pickProductionHost } from '../../../lib/vercel.js';
export const maxDuration = 300;
export const runtime = 'nodejs';

// Phase 2: Vercel project + domain + first production deploy.
export async function POST(req) {
  const g = guard(req); if (g.res) return g.res;
  const b = await req.json();
  return ndjson(async (send) => {
    const log = (m) => send({ log: m });
    const { vt, team, gt } = g.env;
    if (!isRepo(b.repo)) throw new Error('Pick a target repo first.');
    const repo = await getRepo(gt, b.repo);
    const pname = slug(b.projectName || repo.name);
    log(`Creating Vercel project ${pname}…`);
    const project = await createProject(vt, team, pname, repo.full_name);
    let customHost = null;
    if (b.domain) {
      const host = (b.subdomain ? `${slug(b.subdomain)}.` : '') + String(b.domain).trim().toLowerCase();
      log(`Adding domain ${host}…`);
      const d = await addDomain(vt, team, project.id, host);
      log(d.verified ? '  verified.' : '  added, not verified yet — finish the DNS records in Vercel.');
      customHost = host;
    }
    log('Deploying to production…');
    const dep = await deploy(vt, team, project.name, repo.id, repo.default_branch);
    for (let i = 0; i < 50; i++) {
      const s = await getDeployment(vt, team, dep.id);
      if (s.readyState === 'READY') {
        const proj = await getProject(vt, team, project.id).catch(() => project);
        send({ result: { project: project.name, url: `https://${pickProductionHost(proj, s, customHost)}` } });
        return;
      }
      if (s.readyState === 'ERROR' || s.readyState === 'CANCELED') throw new Error(`Deployment ${s.readyState}. Check the Vercel logs for ${project.name}.`);
      if (i % 3 === 0) log(`  ${s.readyState.toLowerCase()}…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('Deployment is taking longer than expected — check Vercel.');
  });
}
