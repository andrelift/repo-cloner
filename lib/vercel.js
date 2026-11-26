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
  vc(t, team, '/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1', { method: 'POST', body: JSON.stringify({ name, target: 'production', gitSource: { type: 'github', repoId, ref } }) });

export const getDeployment = (t, team, id) => vc(t, team, `/v13/deployments/${id}`);

export async function listDomains(t, team) {
  const r = await vc(t, team, '/v5/domains?limit=100');
  return (r.domains || []).map((d) => d.name);
}

export const getProject = (t, team, id) => vc(t, team, `/v9/projects/${id}`);

// The stable production host: custom domain if one was attached, else the project's production alias (name.vercel.app).
export function pickProductionHost(project, deployment, customHost) {
  if (customHost) return customHost;
  const aliases = [...(project?.targets?.production?.alias || []), ...(deployment?.alias || [])].filter((a) => a.endsWith('.vercel.app'));
  const exact = aliases.find((a) => a === `${project.name}.vercel.app`);
  return exact || aliases.sort((a, b) => a.length - b.length)[0] || `${project.name}.vercel.app`;
}
