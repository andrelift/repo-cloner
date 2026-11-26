import { guard } from '../../../lib/http.js';
import { listDomains } from '../../../lib/vercel.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const g = guard(req); if (g.res) return g.res;
  try { return Response.json({ domains: await listDomains(g.env.vt, g.env.team) }); }
  catch (e) { return new Response(String(e.message), { status: 502 }); }
}
