'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const blankEdit = () => ({ path: '', mode: 'text', find: '', replace: '' });

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

function useRun(pw) {
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

export default function Home() {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [data, setData] = useState({ count: null, repos: [], owner: '' });
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [filter, setFilter] = useState('');
  const [target, setTarget] = useState('');            // repo used by phases 2 & 3
  const [done, setDone] = useState({ 1: false, 2: false, 3: false });
  const [site, setSite] = useState(null);
  const [dup, setDup] = useState(null);                // {source, name, private} while modal is open
  const [domains, setDomains] = useState([]);
  const [paths, setPaths] = useState([]);
  const [p2, setP2] = useState({ projectName: '', domain: '', subdomain: '' });
  const [upPath, setUpPath] = useState('');
  const [edits, setEdits] = useState([blankEdit()]);
  const fileRef = useRef(null);
  const r1 = useRun(pw), r2 = useRun(pw), r3 = useRun(pw);

  const refresh = useCallback(async (password = pw) => {
    try {
      const res = await fetch('/api/repos', { headers: { 'x-app-password': password }, cache: 'no-store' });
      if (res.status === 401) { setAuthed(false); setLoginErr('Wrong password.'); return false; }
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json()); setLive(true); setUpdated(new Date()); return true;
    } catch (e) { setLive(false); return false; }
  }, [pw]);

  async function login(ev) {
    ev.preventDefault(); setLoginErr('');
    if (await refresh(pw)) {
      setAuthed(true);
      fetch('/api/domains', { headers: { 'x-app-password': pw } }).then((r) => r.ok ? r.json() : { domains: [] }).then((d) => setDomains(d.domains)).catch(() => {});
    }
  }

  // live counter: poll every 8s while the tab is visible
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 8000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  // load file paths of the target repo for autocomplete in phase 3
  useEffect(() => {
    if (!REPO_RE.test(target)) { setPaths([]); return; }
    fetch(`/api/tree?repo=${encodeURIComponent(target)}`, { headers: { 'x-app-password': pw } })
      .then((r) => r.ok ? r.json() : { paths: [] }).then((d) => setPaths(d.paths)).catch(() => setPaths([]));
  }, [target, pw, done[1]]);

  const chooseTarget = (full) => { setTarget(full); setDone({ 1: true, 2: false, 3: false }); setSite(null); setP2((p) => ({ ...p, projectName: full.split('/')[1] })); };

  async function doDuplicate() {
    const body = { source: dup.source, name: dup.name, private: dup.private };
    setDup(null);
    const res = await r1.run((log) => runStream('/api/phase1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, pw, log));
    if (res) { chooseTarget(res.repo); refresh(); }
  }
  async function doVercel() {
    const res = await r2.run((log) => runStream('/api/phase2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: target, ...p2 }) }, pw, log));
    if (res) { setSite(res); setDone((d) => ({ ...d, 2: true })); }
  }
  async function doEdit() {
    const fd = new FormData();
    fd.set('repo', target); fd.set('uploadPath', upPath); fd.set('edits', JSON.stringify(edits));
    const f = fileRef.current?.files?.[0]; if (f) fd.set('file', f);
    const res = await r3.run((log) => runStream('/api/phase3', { method: 'POST', body: fd }, pw, log));
    if (res) setDone((d) => ({ ...d, 3: true }));
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

  const shown = data.repos.filter((r) => r.full_name.toLowerCase().includes(filter.toLowerCase()));
  const stepCls = (n, active) => 'step ' + (done[n] ? 'done' : active ? 'active' : '');
  const busyAny = r1.busy || r2.busy || r3.busy;

  return (
    <main className="wrap">
      <div className="head">
        <h1>Repo Cloner</h1>
        <div className="badge" title={updated ? `Updated ${updated.toLocaleTimeString()}` : ''}>
          <span className={'dot' + (live ? '' : ' off')} />
          <b>{data.count ?? '…'}</b> repos · {live ? 'live' : 'offline'}
        </div>
      </div>

      <div className="steps">
        <div className={stepCls(1, !done[1])}>{done[1] ? '✓ ' : '1. '}GitHub repo</div>
        <div className={stepCls(2, done[1] && !done[2])}>{done[2] ? '✓ ' : '2. '}Vercel domain</div>
        <div className={stepCls(3, done[2] && !done[3])}>{done[3] ? '✓ ' : '3. '}Upload & edit</div>
      </div>

      {/* PHASE 1 */}
      <section className="card">
        <h2>1. GitHub — duplicate a repo</h2>
        <p className="sub">Pick a repo and press Duplicate to choose the new repo name. {data.owner && <>New repos are created under <b>{data.owner}</b>.</>}</p>
        <input type="text" placeholder="Filter your repos…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="list">
          {shown.map((r) => (
            <div className="row" key={r.full_name}>
              <span>{r.name}{r.private && <span className="pill">private</span>} <small>{r.full_name === target ? '← target' : new Date(r.updated_at).toLocaleDateString()}</small></span>
              <span className="btns">
                <button disabled={busyAny} onClick={() => chooseTarget(r.full_name)}>Use as target</button>
                <button className="primary" disabled={busyAny} onClick={() => setDup({ source: r.full_name, name: r.name + '-copy', private: true })}>Duplicate</button>
              </span>
            </div>
          ))}
          {!shown.length && <div className="row"><small>No repos match.</small></div>}
        </div>
        <button style={{ marginTop: 10 }} disabled={busyAny} onClick={() => setDup({ source: '', name: '', private: true })}>Duplicate a repo not in this list…</button>
        <Log r={r1} />
        {done[1] && target && <p className="okmsg">Target repo: <a href={`https://github.com/${target}`} target="_blank" rel="noreferrer">{target}</a></p>}
      </section>

      {/* PHASE 2 */}
      <section className={'card' + (done[1] ? '' : ' locked')}>
        <h2>2. Vercel — build the domain</h2>
        <p className="sub">Creates a Vercel project linked to <b>{target || 'the target repo'}</b>, attaches the domain and deploys.</p>
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
        {p2.domain && <p className="sub" style={{ marginTop: 8 }}>Will serve: <b>{(p2.subdomain ? p2.subdomain + '.' : '') + p2.domain}</b></p>}
        <button className="primary" style={{ marginTop: 12 }} disabled={busyAny || !p2.projectName} onClick={doVercel}>{r2.busy ? 'Working…' : 'Build on Vercel'}</button>
        <Log r={r2} />
        {site && <p className="okmsg">Live: <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a>{site.url !== site.vercelUrl && <> · <a href={site.vercelUrl} target="_blank" rel="noreferrer">vercel URL</a></>}</p>}
      </section>

      {/* PHASE 3 */}
      <section className={'card' + (done[2] ? '' : ' locked')}>
        <h2>3. Upload a file and change lines</h2>
        <p className="sub">Everything below goes into one commit on <b>{target}</b>; Vercel redeploys on its own.</p>
        <datalist id="paths">{paths.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="grid2">
          <div><label className="f">File to upload</label><input type="file" ref={fileRef} /></div>
          <div><label className="f">Destination path in repo</label><input type="text" list="paths" placeholder="public/logo.png" value={upPath} onChange={(e) => setUpPath(e.target.value)} /></div>
        </div>
        {edits.map((e, i) => (
          <div className="edit" key={i}>
            <div className="grid2">
              <div><label className="f">File to edit</label><input type="text" list="paths" value={e.path} onChange={(x) => setEdit(i, 'path', x.target.value)} placeholder="config/site.json" /></div>
              <div><label className="f">Mode</label>
                <select value={e.mode} onChange={(x) => setEdit(i, 'mode', x.target.value)}>
                  <option value="text">Text: replace every match</option>
                  <option value="json">JSON: set a key (a.b.c)</option>
                </select></div>
              <div><label className="f">{e.mode === 'json' ? 'Key path' : 'Find (the old line / text)'}</label><input type="text" value={e.find} onChange={(x) => setEdit(i, 'find', x.target.value)} /></div>
              <div><label className="f">{e.mode === 'json' ? 'New value' : 'Replace with'}</label><input type="text" value={e.replace} onChange={(x) => setEdit(i, 'replace', x.target.value)} /></div>
            </div>
            {edits.length > 1 && <button style={{ marginTop: 8 }} onClick={() => setEdits(edits.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => setEdits([...edits, blankEdit()])}>+ Add another edit</button>
          <button className="primary" disabled={busyAny} onClick={doEdit}>{r3.busy ? 'Working…' : 'Commit changes'}</button>
        </div>
        <Log r={r3} />
        {done[3] && <p className="okmsg">Committed. Vercel is redeploying{site ? <> — <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></> : ''}.</p>}
      </section>

      {dup && (
        <div className="modal-bg" onClick={() => setDup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Duplicate repo</h2>
            <label className="f">Source (owner/repo)</label>
            <input type="text" value={dup.source} readOnly={!!data.repos.find((r) => r.full_name === dup.source)} onChange={(e) => setDup({ ...dup, source: e.target.value })} placeholder="vercel/next.js" />
            <label className="f">New repo name</label>
            <input type="text" autoFocus value={dup.name} onChange={(e) => setDup({ ...dup, name: e.target.value })} />
            <label className="f" style={{ fontWeight: 400 }}><input type="checkbox" checked={dup.private} onChange={(e) => setDup({ ...dup, private: e.target.checked })} /> Private</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setDup(null)}>Cancel</button>
              <button className="primary" disabled={!REPO_RE.test(dup.source.trim()) || !dup.name.trim()} onClick={doDuplicate}>Create {data.owner}/{dup.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
