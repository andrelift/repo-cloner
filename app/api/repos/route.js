import { guard } from '../../../lib/http.js';
import { listRepos, getUser } from '../../../lib/github.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Only the live count is exposed to the browser — never the list of repos.
export async function GET(req) {
  const g = guard(req); if (g.res) return g.res;
  try {
    const [repos, user] = await Promise.all([listRepos(g.env.gt), getUser(g.env.gt)]);
    return Response.json({ count: repos.length, owner: g.env.owner || user.login, base: process.env.BASE_REPO || '' });
  } catch (e) { return new Response(String(e.message), { status: 502 }); }
}
