import { guard } from '../../../lib/http.js';
import { listRepos, getUser } from '../../../lib/github.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const g = guard(req); if (g.res) return g.res;
  try {
    const [repos, user] = await Promise.all([listRepos(g.env.gt), getUser(g.env.gt)]);
    return Response.json({ count: repos.length, user: user.login, owner: g.env.owner || user.login, repos });
  } catch (e) { return new Response(String(e.message), { status: 502 }); }
}
