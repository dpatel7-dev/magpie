'use strict';
// What magpie keeps, in ~/.magpie (readable by you only):
//   clips.json      everything you copied (the newest first), and what's pinned
//   images/         pictures you copied, as PNG files
//   settings.json   how many to keep, which apps to ignore, the key combo…
// Nothing ever leaves this computer.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const K = require('./kinds');

const home = () => process.env.MAGPIE_HOME || path.join(os.homedir(), '.magpie');
const imagesDir = () => path.join(home(), 'images');
const MAX_TEXT = 200 * 1024; // longer things are kept cut short (the full text still pastes while it's on the clipboard)

// apps whose copies are never kept: password managers and the like
const IGNORE = ['com.apple.keychainaccess', 'com.apple.Passwords', 'com.1password.1password', 'com.agilebits.onepassword7', 'com.agilebits.onepassword-osx',
  'com.bitwarden.desktop', 'com.lastpass.LastPass', 'com.dashlane.dashlanephonefinal', 'org.keepassxc.keepassxc', 'com.keepersecurity.passwordmanager',
  'in.sinew.Enpass-Desktop', 'com.nordpass.macos.NordPass', 'com.protonpass.mac', 'com.apple.systempreferences.passwords'];

const DEFAULTS = { max: 500, ignore: IGNORE, keepSecrets: false, key: '^~v', pausedUntil: 0, skipped: 0, port: 8691 };

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const settings = {
  load() { return { ...DEFAULTS, ...readJson(path.join(home(), 'settings.json'), {}) }; },
  save(s) { writeJson(path.join(home(), 'settings.json'), s); return s; },
  set(patch) { return settings.save({ ...settings.load(), ...patch }); },
};

const newId = () => crypto.randomBytes(5).toString('hex');
const sameKey = (c) => (c.kind === 'image' ? 'i:' + c.hash : c.kind === 'files' ? 'f:' + (c.files || []).join('\n') : 't:' + c.text);

class Clips {
  constructor() { this.file = path.join(home(), 'clips.json'); this.list = readJson(this.file, []); }
  reload() { this.list = readJson(this.file, []); return this; }
  save() { writeJson(this.file, this.list); }

  /**
   * Keep something that was just copied. c: { text } or { image: file } or
   * { files: [...] }, with { app, bundle, at }. Returns { clip } or { skipped: why }.
   */
  add(c, s = settings.load()) {
    if (s.pausedUntil && s.pausedUntil > Date.now()) return { skipped: 'paused' };
    if (c.bundle && (s.ignore || []).includes(c.bundle)) return { skipped: `copied in ${c.app || 'an app magpie ignores'}` };
    if (c.secret) { settings.set({ skipped: (s.skipped || 0) + 1 }); return { skipped: 'marked as a password by the app' }; }
    let clip;
    if (c.image) {
      const buf = fs.readFileSync(c.image);
      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
      fs.mkdirSync(imagesDir(), { recursive: true, mode: 0o700 });
      const name = `${hash}.png`;
      const dest = path.join(imagesDir(), name);
      if (path.resolve(c.image) !== dest) { if (!fs.existsSync(dest)) fs.copyFileSync(c.image, dest); try { fs.rmSync(c.image); } catch { /* fine */ } }
      clip = { kind: 'image', image: name, hash, size: buf.length, ...pngSize(buf) };
    } else if (c.files && c.files.length) {
      clip = { kind: 'files', files: c.files.slice(0, 50), text: c.files.map((f) => path.basename(f)).join(', ') };
    } else {
      let text = String(c.text || '');
      if (!text.trim()) return { skipped: 'empty' };
      const why = K.secretWhy(text);
      if (why && !s.keepSecrets) { settings.set({ skipped: (s.skipped || 0) + 1 }); return { skipped: `looked like ${why}` }; }
      const cut = text.length > MAX_TEXT;
      if (cut) text = text.slice(0, MAX_TEXT);
      clip = { kind: K.kindOf(text), text, cut: cut || undefined };
    }
    const at = c.at || Date.now();
    const key = sameKey(clip);
    const i = this.list.findIndex((x) => sameKey(x) === key);
    if (i >= 0) { // copied again: it moves to the top
      const old = this.list.splice(i, 1)[0];
      clip = { ...old, at, app: c.app || old.app, bundle: c.bundle || old.bundle, times: (old.times || 1) + 1 };
    } else clip = { id: newId(), ...clip, at, first: at, app: c.app || '', bundle: c.bundle || '', times: 1 };
    this.list.unshift(clip);
    this.trim(s.max);
    this.save();
    return { clip };
  }

  /** Keep at most `max` (pinned ones don't count and never go). */
  trim(max) {
    let n = 0;
    const keep = [];
    for (const c of this.list) {
      if (c.pin || n < max) { keep.push(c); if (!c.pin) n++; } else this.dropFiles(c);
    }
    this.list = keep;
  }
  dropFiles(c) {
    if (c.kind === 'image' && c.image && !this.list.some((x) => x !== c && x.image === c.image)) {
      try { fs.rmSync(path.join(imagesDir(), path.basename(c.image))); } catch { /* gone */ }
    }
  }

  get(id) { return this.list.find((c) => c.id === id) || null; }
  /** "3" (the third newest), an id, or some words from it. */
  find(what) {
    const w = String(what || '').trim();
    if (/^\d+$/.test(w)) return this.list[Number(w) - 1] || null;
    return this.get(w) || this.search(w)[0] || null;
  }

  search(q = '', { kind, app, pinned, limit = 0 } = {}) {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    let out = this.list.filter((c) => {
      if (pinned && !c.pin) return false;
      if (kind && kind !== 'all' && c.kind !== kind && !(kind === 'pinned' && c.pin)) return false;
      if (app && c.app !== app) return false;
      if (!words.length) return true;
      const hay = `${c.name || ''} ${c.text || ''} ${c.app || ''}`.toLowerCase();
      return words.every((x) => hay.includes(x));
    });
    if (limit) out = out.slice(0, limit);
    return out;
  }

  pin(id, on = true) { const c = this.get(id); if (!c) return null; c.pin = on || undefined; if (!on) delete c.name; this.save(); return c; }
  rename(id, name) { const c = this.get(id); if (!c) return null; c.name = String(name || '').trim().slice(0, 60) || undefined; if (c.name) c.pin = true; this.save(); return c; }
  used(id) { const c = this.get(id); if (c) { c.used = Date.now(); c.uses = (c.uses || 0) + 1; this.save(); } return c; }
  remove(ids) {
    const set = new Set(ids);
    for (const c of this.list) if (set.has(c.id)) this.dropFiles(c);
    this.list = this.list.filter((c) => !set.has(c.id));
    this.save();
  }
  clear({ keepPinned = true } = {}) {
    const gone = this.list.filter((c) => !(keepPinned && c.pin));
    this.list = this.list.filter((c) => keepPinned && c.pin);
    for (const c of gone) this.dropFiles(c);
    this.save();
    return gone.length;
  }
  /** The apps things were copied from, most used first. */
  apps() {
    const m = new Map();
    for (const c of this.list) if (c.app) m.set(c.app, { app: c.app, bundle: c.bundle, n: ((m.get(c.app) || {}).n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }
}

/** Width and height from a PNG's header. */
function pngSize(buf) {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  return {};
}

module.exports = { home, imagesDir, settings, Clips, IGNORE, DEFAULTS, pngSize, MAX_TEXT };
