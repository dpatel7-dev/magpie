'use strict';
// magpie's background part (`magpie serve`, started at login): it watches the
// clipboard, and serves magpie's window and the little picker on this
// computer only (127.0.0.1, behind a secret address).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Store = require('./store');
const K = require('./kinds');
const W = require('./watch');
const Local = require('./local');
const Open = require('./open');
const pkg = require('../package.json');

const WEB = path.join(__dirname, '..', 'web');
const secret = () => Local.secretIn(path.join(Store.home(), 'secret'));
const portFile = () => path.join(Store.home(), 'port');
const runningPort = () => { try { return Number(fs.readFileSync(portFile(), 'utf8')) || 0; } catch { return 0; } };

let lastFront = null; // the app you were in when the picker opened, to go back to

/** What a clip looks like to the window (pictures as addresses, not bytes). */
function view(c, base) {
  const out = { ...c };
  if (c.kind === 'image') out.src = `${base}/img/${c.image}`;
  if (c.text && c.text.length > 4000) { out.text = c.text.slice(0, 4000); out.more = c.text.length - 4000; }
  return out;
}

/** Put a clip back on the clipboard (optionally changed first). */
function copy(c, how) {
  if (c.kind === 'image') return W.setImage(path.join(Store.imagesDir(), path.basename(c.image)));
  if (c.kind === 'files') return W.setFiles(c.files);
  return W.setText(how ? K.transform(c.text, how) : c.text);
}

/** pigeon, if it's installed: send text to your other devices. */
function pigeonBin() {
  const home = process.env.PIGEON_HOME || path.join(require('os').homedir(), '.pigeon');
  const js = path.join(home, 'app', 'bin', 'pigeon.js');
  if (fs.existsSync(js)) return [process.execPath, [js]];
  const r = spawnSync('sh', ['-c', 'command -v pigeon'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? [r.stdout.trim(), []] : null;
}

async function start({ port, watch = true, log = (s) => process.stdout.write(`${new Date().toLocaleTimeString()}  ${s}\n`) } = {}) {
  const clips = new Store.Clips();
  let watcher = null;
  const sec = secret();
  const s0 = Store.settings.load();
  let server;
  const tryPorts = port ? [port] : [s0.port, s0.port + 10, s0.port + 20, 0];
  for (const p of tryPorts) {
    try {
      server = await Local.serve({
        port: p, secret: sec, web: WEB, header: 'x-magpie',
        config: (req, url) => ({ version: pkg.version, mac: process.platform === 'darwin', picker: url.pathname.endsWith('/pick') || url.pathname.endsWith('/pick.html') }),
        api: (what, body) => api(what, body),
        raw: (req, res, rest, url, send) => {
          const m = /^\/img\/([a-f0-9]{16}\.png)$/.exec(rest);
          if (!m) return false;
          const f = path.join(Store.imagesDir(), m[1]);
          if (!fs.existsSync(f)) { send(404, { error: 'gone' }); return true; }
          send(200, fs.readFileSync(f), 'image/png');
          return true;
        },
      });
      break;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (!server) throw new Error("magpie couldn't find a free port.");
  fs.writeFileSync(portFile(), String(server.port));
  const base = `/${sec}`;

  async function api(what, b) {
    clips.reload();
    const s = Store.settings.load();
    const need = () => { const c = clips.get(b.id); if (!c) throw Object.assign(new Error("That one isn't kept any more."), { status: 404 }); return c; };
    switch (what) {
      case 'list': {
        const list = clips.search(b.q || '', { kind: b.kind, app: b.app, limit: b.limit || 300 });
        return { clips: list.map((c) => view(c, base)), total: clips.list.length, pinned: clips.list.filter((c) => c.pin).length, apps: clips.apps().slice(0, 12), status: status(s) };
      }
      case 'use': {
        const c = need();
        if (!copy(c, b.how)) throw new Error("Couldn't put that on the clipboard.");
        clips.used(c.id);
        if (b.back && lastFront) { require('./mac').activate(lastFront.bundle); }
        return { ok: true, kind: c.kind };
      }
      case 'merge': {
        const list = (b.ids || []).map((id) => clips.get(id)).filter((c) => c && c.text && c.kind !== 'image');
        if (!list.length) throw new Error('Pick some text clips first.');
        const sep = b.sep === 'space' ? ' ' : b.sep === 'comma' ? ', ' : b.sep === 'blank' ? '\n\n' : '\n';
        const text = list.map((c) => c.text).join(sep);
        W.setText(text);
        return { ok: true, n: list.length, chars: text.length };
      }
      case 'transform': {
        const c = need();
        const text = K.transform(c.text || '', b.how);
        if (b.copy) W.setText(text);
        if (b.keep) { clips.add({ text, app: 'magpie', bundle: 'dev.dpatel7.magpie', at: Date.now() }, { ...s, pausedUntil: 0 }); }
        return { text, counts: K.counts(text) };
      }
      case 'ways': { const c = need(); return { ways: c.text ? K.transformsFor(c.text, c.kind) : [], counts: K.counts(c.text) }; }
      case 'full': { const c = need(); return { text: c.text || '' }; }
      case 'pin': { const c = need(); return { clip: view(clips.pin(c.id, b.on !== false), base) }; }
      case 'name': { const c = need(); return { clip: view(clips.rename(c.id, b.name), base) }; }
      case 'delete': clips.remove(b.ids || [b.id]); return { ok: true };
      case 'clear': return { gone: clips.clear({ keepPinned: b.keepPinned !== false }) };
      case 'pause': {
        const mins = Number(b.minutes);
        Store.settings.set({ pausedUntil: mins > 0 ? Date.now() + mins * 60000 : 0 });
        return { status: status(Store.settings.load()) };
      }
      case 'settings': {
        const patch = {};
        if (Number.isFinite(b.max) && b.max >= 20 && b.max <= 5000) patch.max = Math.round(b.max);
        if (Array.isArray(b.ignore)) patch.ignore = b.ignore.filter((x) => typeof x === 'string').slice(0, 100);
        if (typeof b.keepSecrets === 'boolean') patch.keepSecrets = b.keepSecrets;
        if (b.key) { const r = require('./mac').setKey(b.key); patch.key = require('./mac').keyCombo(b.key).equiv; if (!r.ok) patch.keyNote = r.why; }
        const next = Store.settings.set(patch);
        if (patch.max) { clips.trim(next.max); clips.save(); }
        return { settings: next, status: status(next) };
      }
      case 'send': {
        const c = need();
        const bin = pigeonBin();
        if (!bin) throw new Error('This needs pigeon (from the same family): get it with pca, then sign in once.');
        if (!c.text) throw new Error('Only text can go to your other devices this way.');
        const r = spawnSync(bin[0], [...bin[1], 'text', c.text, '--to', b.to || 'all'], { encoding: 'utf8', timeout: 60000 });
        if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'pigeon said no').trim().split('\n').pop());
        return { ok: true, said: (r.stdout || '').trim() };
      }
      case 'status': return status(s);
      case 'picker': return { ok: openPicker() };
      case 'close': return { ok: true };
      default: throw Object.assign(new Error(`magpie doesn't know "${what}".`), { status: 404 });
    }
  }

  function status(s) {
    return {
      version: pkg.version, watching: !!watcher, pausedUntil: s.pausedUntil > Date.now() ? s.pausedUntil : 0, skipped: s.skipped || 0,
      max: s.max, ignore: s.ignore, keepSecrets: !!s.keepSecrets, key: s.key, keyLabel: (() => { try { return require('./mac').keyCombo(s.key).label; } catch { return ''; } })(),
      mac: process.platform === 'darwin', pigeon: !!pigeonBin(),
    };
  }

  /** The little picker: small, in the middle of the screen, over whatever you were doing. */
  function openPicker() {
    const Mac = require('./mac');
    lastFront = Mac.frontmost();
    const scr = Mac.screen() || { w: 1440, h: 900 };
    const w = 460, h = 560;
    if (!Open.canWindow() && Mac.MAC) return chooseNatively(clips.reload(), lastFront);
    return Open.openWindow(`${server.url}pick`, { width: w, height: h, x: (scr.w - w) / 2, y: Math.max(60, (scr.h - h) / 3) });
  }

  if (watch) {
    watcher = W.start((o) => {
      const r = clips.reload().add(o);
      if (r.skipped) log(`not kept (${r.skipped})`);
      else log(`kept ${r.clip.kind}${r.clip.app ? ' from ' + r.clip.app : ''}`);
    }, { imagesDir: path.join(Store.imagesDir(), 'incoming'), onError: (e) => log(e.message) });
  }
  log(`magpie ${pkg.version} is watching the clipboard. Its window: ${server.url}`);
  return {
    url: server.url, port: server.port, secret: sec,
    picker: openPicker,
    close: async () => { if (watcher) watcher.stop(); await server.close(); try { fs.rmSync(portFile()); } catch { /* fine */ } },
  };
}

/**
 * No Chrome, Edge or Brave? macOS's own list instead: type to jump, Enter to copy.
 */
function chooseNatively(clips, front) {
  const list = clips.list.filter((c) => c.text).slice(0, 40);
  if (!list.length) return false;
  const label = (c, i) => `${i + 1}. ${c.text.replace(/\s+/g, ' ').slice(0, 70)}`;
  const items = list.map(label);
  const r = spawnSync('osascript', ['-e', 'on run argv', '-e', 'set r to choose from list argv with title "magpie" with prompt "Copy which one? (then press ⌘V)" OK button name "Copy"', '-e', 'if r is false then return ""', '-e', 'return item 1 of r', '-e', 'end run', ...items], { encoding: 'utf8', timeout: 600000 });
  const picked = String(r.stdout || '').trim();
  const i = items.indexOf(picked);
  if (i < 0) return true;
  copy(list[i]);
  clips.used(list[i].id);
  if (front) require('./mac').activate(front.bundle);
  return true;
}

/** Open magpie's window, or the picker, through the magpie that's running. Returns false if none is. */
async function openWindow(which = 'app') {
  const port = runningPort();
  if (!port || !(await Local.alive(port))) return false;
  const sec = secret();
  if (which === 'pick') { await Local.ask(port, sec, 'picker', {}, 'x-magpie'); return true; }
  Open.openWindow(`http://127.0.0.1:${port}/${sec}/`, { width: 1180, height: 820 });
  return true;
}

module.exports = { start, openWindow, copy, view, runningPort, secret, pigeonBin };
