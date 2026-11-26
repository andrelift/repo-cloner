import tar from 'tar-stream';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const API = 'https://api.github.com';
const hdr = (t) => ({
  Authorization: `Bearer ${t}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'repo-cloner',
});

async function gh(token, path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...hdr(token), 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

export const getUser = (t) => gh(t, '/user');

export async function downloadRepo(token, source, ref) {
  const res = await fetch(`${API}/repos/${source}/tarball${ref ? '/' + encodeURIComponent(ref) : ''}`, { headers: hdr(token), redirect: 'follow' });
  if (!res.ok) throw new Error(`Cannot download ${source}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const files = new Map();
  const extract = tar.extract();
  extract.on('entry', (h, stream, next) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      // strip the leading "<owner>-<repo>-<sha>/" folder
      const rel = h.name.split('/').slice(1).join('/');
      if (rel && (h.type === 'file' || h.type === 'symlink') && !rel.startsWith('.github/workflows/') ) {
        if (h.type === 'file') files.set(rel, { mode: h.mode & 0o111 ? '100755' : '100644', content: Buffer.concat(chunks) });
        else files.set(rel, { mode: '120000', content: Buffer.from(h.linkname) });
      }
      next();
    });
    stream.resume();
  });
  await new Promise((resolve, reject) => {
    extract.on('finish', resolve).on('error', reject);
    Readable.fromWeb(res.body).pipe(createGunzip()).on('error', reject).pipe(extract);
  });
  return files;
}

export async function createRepo(token, { owner, user, name, isPrivate, description }) {
  const path = owner && owner !== user ? `/orgs/${owner}/repos` : '/user/repos';
  return gh(token, path, { method: 'POST', body: JSON.stringify({ name, private: !!isPrivate, description: description || '', auto_init: true }) });
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export async function commitFiles(token, fullName, files, message, log) {
  const repo = await gh(token, `/repos/${fullName}`);
  const branch = repo.default_branch;
  const head = await gh(token, `/repos/${fullName}/git/ref/heads/${branch}`);
  const entries = [...files.entries()];
  let done = 0;
  const tree = await pool(entries, 8, async ([path, f]) => {
    const blob = await gh(token, `/repos/${fullName}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content.toString('base64'), encoding: 'base64' }) });
    if (++done % 50 === 0) log(`  uploaded ${done}/${entries.length} files`);
    return { path, mode: f.mode, type: 'blob', sha: blob.sha };
  });
  const t = await gh(token, `/repos/${fullName}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) });
  const c = await gh(token, `/repos/${fullName}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [head.object.sha] }) });
  await gh(token, `/repos/${fullName}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha, force: true }) });
  return { branch, sha: c.sha, repoId: repo.id };
}

export async function listRepos(token) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(token, `/user/repos?per_page=100&page=${page}&sort=updated`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.map((r) => ({ full_name: r.full_name, name: r.name, private: r.private, updated_at: r.updated_at, html_url: r.html_url, default_branch: r.default_branch }));
}

export const getRepo = (token, fullName) => gh(token, `/repos/${fullName}`);

export async function listTree(token, fullName) {
  const repo = await getRepo(token, fullName);
  const t = await gh(token, `/repos/${fullName}/git/trees/${repo.default_branch}?recursive=1`);
  return t.tree.filter((x) => x.type === 'blob').map((x) => x.path);
}

export async function readFile(token, fullName, path) {
  const meta = await gh(token, `/repos/${fullName}/contents/${path.split('/').map(encodeURIComponent).join('/')}`);
  if (Array.isArray(meta)) throw new Error(`${path} is a folder, not a file`);
  const blob = await gh(token, `/repos/${fullName}/git/blobs/${meta.sha}`);
  return { mode: '100644', content: Buffer.from(blob.content, 'base64') };
}

// Adds ONE commit on top of the default branch containing only `changes` (Map<path,{mode,content}>).
export async function commitChanges(token, fullName, changes, message) {
  const repo = await getRepo(token, fullName);
  const branch = repo.default_branch;
  const head = await gh(token, `/repos/${fullName}/git/ref/heads/${branch}`);
  const parent = await gh(token, `/repos/${fullName}/git/commits/${head.object.sha}`);
  const tree = [];
  for (const [path, f] of changes) {
    const blob = await gh(token, `/repos/${fullName}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content.toString('base64'), encoding: 'base64' }) });
    tree.push({ path, mode: f.mode, type: 'blob', sha: blob.sha });
  }
  const t = await gh(token, `/repos/${fullName}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
  const c = await gh(token, `/repos/${fullName}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [head.object.sha] }) });
  await gh(token, `/repos/${fullName}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  return { branch, sha: c.sha, repoId: repo.id };
}
