'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Runs a streaming (NDJSON) endpoint. Returns the last `result` event; throws on `error`.
async function runStream(url, init, pw, onLog) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), 'x-app-password': pw } });
  if (!res.ok || !res.body) throw new Error(await res.text());
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', result = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1);
      if (m.log) onLog(m.log);
      if (m.result) result = m.result;
      if (m.error) throw new Error(m.error);
    }
  }
  return result;
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true); setLog([]); setError('');
    try { return await fn((l) => setLog((x) => [...x, l])); }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  };
  return { busy, log, error, run };
}

function Log({ r }) {
  return (<>
    {r.log.length > 0 && <div className="log">{r.log.join('\n')}</div>}
    {r.error && <p className="err">Error: {r.error}</p>}
  </>);
}

const makeEdit = ({ path = '', find = '', replace = '', mode = 'text', match = 'all' } = {}) => ({
  path,
  mode,
  match,
  find,
  replace,
});
const cleanName = (s) => s.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

export default function Home() {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [info, setInfo] = useState({ count: null, owner: '', base: '' });
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [target, setTarget] = useState('');
  const [site, setSite] = useState(null);
  const [dup, setDup] = useState(null);                 // {name, private} while the modal is open
  const [domains, setDomains] = useState([]);
  const [p2, setP2] = useState({ projectName: '', domain: '', subdomain: '' });
  const [paths, setPaths] = useState([]);
  const [edits, setEdits] = useState([
    makeEdit({ path: 'vercel.json', find: 'example.php' }),
    makeEdit({ path: 'views/layout.php', find: '<script> //example.com </script>' }),
  ]);
  const [committed, setCommitted] = useState(null);
  const fileRef = useRef(null);
  const r1 = useRun(), r2 = useRun(), r3 = useRun();

  const refresh = useCallback(async (password) => {
    try {
      const res = await fetch('/api/repos', { headers: { 'x-app-password': password }, cache: 'no-store' });
      if (res.status === 401) { setAuthed(false); return false; }
      if (!res.ok) throw new Error(await res.text());
      setInfo(await res.json()); setLive(true); setUpdated(new Date()); return true;
    } catch (e) { setLive(false); return String(e.message || e); }
  }, []);

  async function login(ev) {
    ev.preventDefault(); setLoginErr('');
    const ok = await refresh(pw);
    if (ok !== true) { setLoginErr(typeof ok === 'string' ? `Password OK? Server error: ${ok}` : 'Wrong password.'); return; }
    setAuthed(true);
    fetch('/api/domains', { headers: { 'x-app-password': pw } }).then((r) => r.ok ? r.json() : { domains: [] }).then((d) => setDomains(d.domains)).catch(() => {});
  }

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(pw); }, 8000);
    return () => clearInterval(t);
  }, [authed, refresh, pw]);

  useEffect(() => {
    if (!site || !target) { setPaths([]); return; }
    fetch(`/api/tree?repo=${encodeURIComponent(target)}`, { headers: { 'x-app-password': pw } })
      .then((r) => r.ok ? r.json() : { paths: [] }).then((d) => setPaths(d.paths)).catch(() => setPaths([]));
  }, [site, target, pw]);

  async function doDuplicate() {
    const body = { name: dup.name, private: dup.private };
    setDup(null);
    const res = await r1.run((log) => runStream('/api/phase1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, pw, log));
    if (res) { setTarget(res.repo); setSite(null); setCommitted(null); setP2((p) => ({ ...p, projectName: res.repo.split('/')[1] })); refresh(pw); }
  }
  async function doVercel() {
    const res = await r2.run((log) => runStream('/api/phase2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: target, ...p2 }) }, pw, log));
    if (res) setSite(res);
  }
  async function doEdit() {
    const fd = new FormData();
    fd.set('repo', target); fd.set('edits', JSON.stringify(edits));
    const f = fileRef.current?.files?.[0]; if (f) fd.set('file', f);
    const res = await r3.run((log) => runStream('/api/phase3', { method: 'POST', body: fd }, pw, log));
    if (res) setCommitted(res);
  }
  const setEdit = (i, k, v) => setEdits(edits.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  if (!authed) {
    return (
      <main className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
        <form className="card" onSubmit={login}>
          <h1>Repo Cloner</h1><p className="sub">Enter the app password.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button className="primary" style={{ marginTop: 14 }}>Continue</button>
          {loginErr && <p className="err">{loginErr}</p>}
        </form>
      </main>
    );
  }

  const busyAny = r1.busy || r2.busy || r3.busy;
  const host = (p2.subdomain ? cleanName(p2.subdomain) + '.' : '') + p2.domain;

  return (
    <main className="wrap">
      <div className="head">
        <h1>Repo Cloner</h1>
        <div className="badge" title={updated ? `Updated ${updated.toLocaleTimeString()}` : ''}>
          <span className={'dot' + (live ? '' : ' off')} />
          <b>{info.count ?? '…'}</b> repos · {live ? 'live' : 'offline'}
        </div>
      </div>

      <div className="steps">
        <div className={'step ' + (target ? 'done' : 'active')}>{target ? '✓ ' : '1. '}Duplicate the base repo</div>
        <div className={'step ' + (site ? 'done' : target ? 'active' : '')}>{site ? '✓ ' : '2. '}Build on Vercel</div>
        <div className={'step ' + (committed ? 'done' : site ? 'active' : '')}>{committed ? '✓ ' : '3. '}Edit files</div>
      </div>

      <section className="card">
        <h2>1. GitHub — duplicate the base repo</h2>
        {info.base
          ? <p className="sub">Base repo: <b>{info.base}</b>. Press Duplicate and choose the name of the new repo{info.owner && <> (created under <b>{info.owner}</b>)</>}.</p>
          : <p className="err">BASE_REPO is not set on the server. Add it in Vercel → Settings → Environment Variables (format owner/repo) and redeploy.</p>}
        <button className="primary" disabled={busyAny || !info.base} onClick={() => setDup({ name: '', private: true })}>Duplicate</button>
        <Log r={r1} />
        {target && <p className="okmsg">New repo: <a href={`https://github.com/${target}`} target="_blank" rel="noreferrer">{target}</a></p>}
      </section>

      <section className={'card' + (target ? '' : ' locked')}>
        <h2>2. Vercel — build and set the domain</h2>
        <p className="sub">Creates a Vercel project linked to <b>{target || 'the new repo'}</b>, attaches the domain and deploys.</p>
        <label className="f">Project name (gives you name.vercel.app)</label>
        <input type="text" value={p2.projectName} onChange={(e) => setP2({ ...p2, projectName: e.target.value })} />
        <div className="grid2">
          <div>
            <label className="f">Domain (from your Vercel account)</label>
            <select value={p2.domain} onChange={(e) => setP2({ ...p2, domain: e.target.value })}>
              <option value="">None — use the vercel.app URL</option>
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="f">Subdomain (optional)</label>
            <input type="text" placeholder="app" disabled={!p2.domain} value={p2.subdomain} onChange={(e) => setP2({ ...p2, subdomain: e.target.value })} />
          </div>
        </div>
        {p2.domain && <p className="sub" style={{ marginTop: 8 }}>Will serve: <b>{host}</b></p>}
        <button className="primary" style={{ marginTop: 12 }} disabled={busyAny || !p2.projectName} onClick={doVercel}>{r2.busy ? 'Working…' : 'Build on Vercel'}</button>
        <Log r={r2} />
        {site && <p className="okmsg">Production: <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></p>}
      </section>

      <section className={'card' + (site ? '' : ' locked')}>
        <h2>3. Edit files</h2>
        <p className="sub">Changes go into one commit on <b>{target || 'the new repo'}</b>; Vercel redeploys the production domain by itself.</p>
        <datalist id="paths">{paths.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="grid2">
          <div><label className="f">File to upload (images, CSS, TXT, JSON, XML, PHP…)</label><input type="file" ref={fileRef} /></div>
          <div>
            <label className="f">Upload destination</label>
            <div className="target">api/ — fixed destination</div>
            <p className="sub" style={{ marginTop: 5 }}>The uploaded file keeps its original filename and is saved directly inside the repository's api/ folder.</p>
          </div>
        </div>
        {edits.map((e, i) => (
          <div className="edit" key={i}>
            <div className="grid2">
              <div><label className="f">File to edit</label><input type="text" list="paths" value={e.path} onChange={(x) => setEdit(i, 'path', x.target.value)} placeholder="config.php" /></div>
              <div><label className="f">Mode</label>
                <select value={e.mode} onChange={(x) => setEdit(i, 'mode', x.target.value)}>
                  <option value="text">Text: literal find &amp; replace</option>
                  <option value="json">JSON: set a key (a.b.c)</option>
                </select>{e.mode === 'text' && <select style={{ marginTop: 7 }} value={e.match || 'all'} onChange={(x) => setEdit(i, 'match', x.target.value)}><option value="all">Replace every match</option><option value="first">Replace first match only</option></select>}</div>
              <div><label className="f">{e.mode === 'json' ? 'Key path' : 'Find (text or multiline code)'}</label>{e.mode === 'json' ? <input type="text" value={e.find} onChange={(x) => setEdit(i, 'find', x.target.value)} /> : <textarea rows={5} value={e.find} onChange={(x) => setEdit(i, 'find', x.target.value)} placeholder="Paste the complete original code, including line breaks" />}</div>
              <div><label className="f">{e.mode === 'json' ? 'New value' : 'Replace with'}</label>{e.mode === 'json' ? <input type="text" value={e.replace} onChange={(x) => setEdit(i, 'replace', x.target.value)} /> : <textarea rows={5} value={e.replace} onChange={(x) => setEdit(i, 'replace', x.target.value)} placeholder="Paste the replacement code" />}</div>
            </div>
            {edits.length > 1 && <button style={{ marginTop: 8 }} onClick={() => setEdits(edits.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => setEdits([...edits, makeEdit()])}>+ Add another edit</button>
          <button className="primary" disabled={busyAny} onClick={doEdit}>{r3.busy ? 'Working…' : 'Commit changes'}</button>
        </div>
        <Log r={r3} />
        {committed && <p className="okmsg">Committed. Redeploying <a href={site?.url} target="_blank" rel="noreferrer">{site?.url}</a> — <a href={committed.url} target="_blank" rel="noreferrer">view commit</a>.</p>}
      </section>

      {dup && (
        <div className="modal-bg" onClick={() => setDup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Duplicate {info.base}</h2>
            <label className="f">New repo name</label>
            <input type="text" autoFocus value={dup.name} onChange={(e) => setDup({ ...dup, name: e.target.value })} placeholder="my-new-site" />
            <label className="f" style={{ fontWeight: 400 }}><input type="checkbox" checked={dup.private} onChange={(e) => setDup({ ...dup, private: e.target.checked })} /> Private</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setDup(null)}>Cancel</button>
              <button className="primary" disabled={!cleanName(dup.name)} onClick={doDuplicate}>Create {info.owner}/{cleanName(dup.name)}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}