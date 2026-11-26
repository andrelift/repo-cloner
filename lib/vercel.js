const API = 'https://api.vercel.com';

async function vc(token, team, path, init = {}) {
  const url = new URL(API + path);
  if (team) url.searchParams.set('teamId', team);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`Vercel ${init.method || 'GET'} ${path} → ${res.status}: ${(body?.error?.message || text).slice(0, 300)}`);
  return body;
}

export const createProject = (t, team, name, fullName) =>
  vc(t, team, '/v10/projects', { method: 'POST', body: JSON.stringify({ name, gitRepository: { type: 'github', repo: fullName } }) });

export const addDomain = (t, team, projectId, domain) =>
  vc(t, team, `/v10/projects/${projectId}/domains`, { method: 'POST', body: JSON.stringify({ name: domain }) });

export const deploy = (t, team, name, repoId, ref) =>
  vc(t, team, '/v13/deployments?forceNew=1', { method: 'POST', body: JSON.stringify({ name, target: 'production', gitSource: { type: 'github', repoId, ref } }) });

export const getDeployment = (t, team, id) => vc(t, team, `/v13/deployments/${id}`);

export async function listDomains(t, team) {
  const r = await vc(t, team, '/v5/domains?limit=100');
  return (r.domains || []).map((d) => d.name);
}
