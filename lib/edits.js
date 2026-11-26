// Pure helpers: apply uploaded file + find/replace settings edits to an in-memory file map.
// files: Map<path, {mode:string, content:Buffer}>

export function normalizePath(p) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean || clean.split('/').some((s) => s === '..' || s === '')) {
    throw new Error(`Invalid path: "${p}"`);
  }
  return clean;
}

export function addUpload(files, destPath, buffer) {
  const path = normalizePath(destPath);
  const existing = files.get(path);
  files.set(path, { mode: existing?.mode || '100644', content: buffer });
  return path;
}

// edit: {path, find, replace, mode?: 'text'|'json'}
// text: replaces every occurrence of `find` (must occur at least once)
// json: `find` is a dotted key path (a.b.c), `replace` is parsed as JSON, falling back to string
export function applyEdit(files, edit) {
  const path = normalizePath(edit.path);
  const file = files.get(path);
  if (!file) throw new Error(`Edit target not found in repo: ${path}`);
  const text = file.content.toString('utf8');
  let out;
  if (edit.mode === 'json') {
    const obj = JSON.parse(text);
    const keys = String(edit.find).split('.');
    let cur = obj;
    for (const k of keys.slice(0, -1)) {
      if (cur[k] === undefined || typeof cur[k] !== 'object') throw new Error(`Key path not found in ${path}: ${edit.find}`);
      cur = cur[k];
    }
    let val;
    try { val = JSON.parse(edit.replace); } catch { val = edit.replace; }
    cur[keys[keys.length - 1]] = val;
    const indent = /^\{\n( +)"/.exec(text)?.[1]?.length || 2;
    out = JSON.stringify(obj, null, indent) + (text.endsWith('\n') ? '\n' : '');
  } else {
    if (!edit.find) throw new Error(`Empty "find" for ${path}`);
    if (!text.includes(edit.find)) throw new Error(`Text "${edit.find}" not found in ${path}`);
    out = text.split(edit.find).join(edit.replace ?? '');
  }
  files.set(path, { mode: file.mode, content: Buffer.from(out, 'utf8') });
  return path;
}
