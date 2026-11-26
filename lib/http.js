export function authorized(req) {
  const pw = process.env.APP_PASSWORD;
  return !!pw && req.headers.get('x-app-password') === pw.trim();
}
export function envOrFail() {
  // Vercel reserves names starting with VERCEL_, so on Vercel use VC_API_TOKEN / VC_TEAM_ID (or VERCELTOKEN).
  const e = process.env;
  const vt = e.VC_API_TOKEN || e.VERCELTOKEN || e.VERCEL_TOKEN;
  const team = e.VC_TEAM_ID || e.VERCEL_TEAM_ID || undefined;
  if (!e.GITHUB_TOKEN || !vt || !e.APP_PASSWORD) {
    const missing = [!e.GITHUB_TOKEN && 'GITHUB_TOKEN', !vt && 'VC_API_TOKEN', !e.APP_PASSWORD && 'APP_PASSWORD'].filter(Boolean);
    return { error: `Server is missing: ${missing.join(', ')}.` };
  }
  return { gt: e.GITHUB_TOKEN, vt, team, owner: e.GITHUB_OWNER || undefined };
}
// Guard used by every route. Returns {env} or {res} (a ready error Response).
export function guard(req) {
  if (!authorized(req)) return { res: new Response('Wrong password.', { status: 401 }) };
  const env = envOrFail();
  if (env.error) return { res: new Response(env.error, { status: 500 }) };
  return { env };
}
// Streams newline-delimited JSON events to the browser.
export function ndjson(handler) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try { await handler(send); send({ done: true }); } catch (e) { send({ error: String(e.message || e) }); }
      controller.close();
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
export const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
// owner/repo, each part non-empty and not made only of dots ("." / ".." would alter the API path)
export const isRepo = (s) => /^[\w.-]+\/[\w.-]+$/.test(s || '') && s.split('/').every((p) => !/^\.+$/.test(p));
