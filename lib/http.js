export function authorized(req) {
  const pw = process.env.APP_PASSWORD;
  return !!pw && req.headers.get('x-app-password') === pw;
}
export function envOrFail() {
  const { GITHUB_TOKEN, VERCEL_TOKEN, VERCEL_TEAM_ID, GITHUB_OWNER } = process.env;
  if (!GITHUB_TOKEN || !VERCEL_TOKEN || !process.env.APP_PASSWORD) return { error: 'Server is missing GITHUB_TOKEN, VERCEL_TOKEN or APP_PASSWORD.' };
  return { gt: GITHUB_TOKEN, vt: VERCEL_TOKEN, team: VERCEL_TEAM_ID || undefined, owner: GITHUB_OWNER || undefined };
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
