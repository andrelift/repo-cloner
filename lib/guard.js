// The base repo must be a clean template. Refuse to duplicate repos that ship traffic-cloaking scripts.
export function findCloaker(files) {
  const bad = [];
  for (const [path, f] of files) {
    if (f.content.length > 2_000_000) continue;
    if (/adspect/i.test(f.content.toString('latin1'))) bad.push(path);
  }
  return bad;
}
