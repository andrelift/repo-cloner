import { guard, isRepo } from '../../../lib/http.js';
import { listTree } from '../../../lib/github.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const g = guard(req); if (g.res) return g.res;
  const repo = new URL(req.url).searchParams.get('repo') || '';
  if (!isRepo(repo)) return new Response('Bad repo', { status: 400 });
  try { return Response.json({ paths: await listTree(g.env.gt, repo) }); }
  catch (e) { return new Response(String(e.message), { status: 502 }); }
}
