'use strict';
// The `magpie` command.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const A = require('./ansi');
const Sprite = require('./sprite');
const Pica = require('./bird');
const Store = require('./store');
const K = require('./kinds');
const W = require('./watch');
const pkg = require('../package.json');

const out = (s = '') => process.stdout.write(s + '\n');
const blue = (s) => A.paint(s, { fg: '#6a9be6', bold: true });
const teal = (s) => A.paint(s, { fg: '#45bfae' });
const dim = (s) => A.paint(s, { fg: '#8a909c' });
const ok = (s) => A.paint(s, { fg: '#8fd4a0' });
const bad = (s) => A.paint(s, { fg: '#ff9a8a' });
const bold = (s) => A.paint(s, { bold: true });
const MAC = process.platform === 'darwin';

const HELP = `
  magpie: remembers everything you copy, so you can paste it again later.
  It skips passwords and keys, and nothing ever leaves this computer.

  magpie                 what you copied lately (type a number to copy it again)
  magpie on              start: keep what you copy from now on, and set up the key combo
  magpie pick            the side panel (what the key combo and the magpie in the menu bar open)
  magpie app             magpie's window: search, pins, pictures, quick changes
  magpie list [words]    everything you copied (or what matches)
  magpie copy <n|words>  put one back on the clipboard      --as lower|upper|title|trim|oneline|url…
  magpie pin <n>         keep it forever (it never falls off the end)   magpie unpin <n>
  magpie forget <n>      delete one      magpie forget all   (pinned ones stay)
  magpie pause [30m]     stop keeping things for a while    magpie resume
  magpie key <combo>     change the key combo (it starts as ctrl+option+v)
  magpie status          what magpie is doing     magpie doctor   check every part, if something doesn't work
  magpie off             stop keeping things (what's kept stays)
  magpie update · uninstall · help · --version
`;

function intro(lines) {
  const art = Sprite.picture(Pica.BIG, Pica.MINI, Pica.INK);
  const w = A.vwidth(art[0] || '');
  out('');
  for (let i = 0; i < Math.max(art.length, lines.length); i++) out('  ' + (art[i] || ' '.repeat(w)) + '   ' + (lines[i] || ''));
  out('');
}

function ask(q) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 50) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const ICON = { link: '↗', email: '@', color: '■', phone: '☎', number: '#', path: '/', code: '{}', text: '¶', image: '▣', files: '▤' };
function line(c, i, width = 64) {
  const label = c.name ? bold(c.name) + ' ' : '';
  let text = c.kind === 'image' ? `picture ${c.w || '?'}×${c.h || '?'}` : String(c.text || '').replace(/\s+/g, ' ').trim();
  if (text.length > width) text = text.slice(0, width - 1) + '…';
  const swatch = c.kind === 'color' && /^#[0-9a-f]{6}$/i.test(c.text.trim()) ? A.paint('  ', { bg: c.text.trim() }) + ' ' : '';
  return `  ${teal(String(i + 1).padStart(3))}  ${dim(ICON[c.kind] || '¶')}  ${c.pin ? blue('◆ ') : ''}${swatch}${label}${text}  ${dim(ago(c.at) + (c.app ? ' · ' + c.app : ''))}`;
}

function show(list, { max = 10 } = {}) {
  if (!list.length) { out(dim('  Nothing here yet. Copy something!')); return; }
  list.slice(0, max).forEach((c, i) => out(line(c, i)));
}

function status() {
  const s = Store.settings.load();
  const Mac = require('./mac');
  const st = Mac.agentState();
  const clips = new Store.Clips();
  let key = '';
  try { key = Mac.keyCombo(s.key).label; } catch { /* none */ }
  return { s, st, n: clips.list.length, pins: clips.list.filter((c) => c.pin).length, key, paused: s.pausedUntil > Date.now() ? s.pausedUntil : 0 };
}

/** Make sure the background part runs; returns true if it does. */
async function ensureRunning() {
  const Server = require('./server');
  const Local = require('./local');
  const port = Server.runningPort();
  if (port && (await Local.alive(port))) return true;
  if (MAC) {
    require('./mac').setUp(pkg.version);
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 200)); const p = Server.runningPort(); if (p && (await Local.alive(p))) return true; }
  }
  return false;
}

/** No background magpie (not a Mac, or it couldn't start): run one right here until Ctrl+C. */
async function runHere(which) {
  const s = await require('./server').start({ log: () => {} });
  out(`\n  magpie is running in this window. ${dim('Keep it open while you use it (Ctrl+C stops it).')}`);
  if (which === 'pick') s.picker(); else require('./open').openWindow(s.url, { width: 1180, height: 820 });
  out(`  ${dim(s.url)}\n`);
  await new Promise(() => {});
}

/** After an update: restart the background part with the new code, and add anything new (like the side panel). */
function ensureCurrent() {
  if (!MAC || process.env.MAGPIE_FAKE_CLIPBOARD) return;
  const stamp = path.join(Store.home(), 'set-up-version');
  let was = '';
  try { was = fs.readFileSync(stamp, 'utf8').trim(); } catch { /* never */ }
  if (was === pkg.version) return;
  try {
    const Mac = require('./mac');
    if (!Mac.agentState().installed) return; // not turned on yet: magpie on does it all
    Mac.setUp(pkg.version, Store.settings.load().key);
    fs.writeFileSync(stamp, pkg.version);
  } catch { /* the next command tries again */ }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!['serve', 'uninstall', 'off', 'stop', '--version', '-v', 'version', 'help', '--help', '-h'].includes(cmd)) ensureCurrent();
  switch (cmd) {
    case undefined: return home();
    case '--version': case '-v': case 'version': out(`magpie ${pkg.version}`); return;
    case 'help': case '--help': case '-h': out(HELP); return;
    case 'serve': { await require('./server').start({}); await new Promise(() => {}); return; }
    case 'on': case 'setup': case 'start': return on();
    case 'off': case 'stop': {
      require('./mac').stopAgent();
      out(`  magpie stopped keeping what you copy. ${dim("What's kept stays: magpie on starts it again.")}`);
      return;
    }
    case 'app': case 'open': case 'window': {
      if (await require('./server').openWindow('app')) { out(`  ${ok('✓')} magpie's window is open.`); return; }
      if (await ensureRunning() && await require('./server').openWindow('app')) { out(`  ${ok('✓')} magpie's window is open.`); return; }
      return runHere('app');
    }
    case 'pick': case 'picker': case 'panel': case 'side': {
      if (MAC && (await require('./mac').panel.show())) return;
      if (await require('./server').openWindow('pick')) return;
      if (await ensureRunning() && await require('./server').openWindow('pick')) return;
      return runHere('pick');
    }
    case 'list': case 'ls': case 'search': {
      const clips = new Store.Clips();
      const list = clips.search(rest.join(' '));
      out('');
      show(list, { max: 50 });
      out(dim(`\n  ${list.length} of ${clips.list.length}. Copy one again: magpie copy <number>\n`));
      return;
    }
    case 'copy': case 'get': case 'paste': {
      const asIdx = rest.indexOf('--as');
      const how = asIdx >= 0 ? rest[asIdx + 1] : null;
      const what = (asIdx >= 0 ? rest.filter((_, i) => i !== asIdx && i !== asIdx + 1) : rest).join(' ');
      const clips = new Store.Clips();
      const c = clips.find(what || '1');
      if (!c) throw new Error(`Nothing matches "${what}". See: magpie list`);
      require('./server').copy(c, how);
      clips.used(c.id);
      out(`  ${ok('✓')} On the clipboard${how ? ` (${K.TRANSFORMS[how] ? K.TRANSFORMS[how].label : how})` : ''}: ${dim(String(c.text || 'a picture').replace(/\s+/g, ' ').slice(0, 60))}  ${dim('(⌘V to paste)')}`);
      return;
    }
    case 'pin': case 'unpin': {
      const clips = new Store.Clips();
      const c = clips.find(rest.join(' ') || '1');
      if (!c) throw new Error('Which one? magpie pin 3');
      clips.pin(c.id, cmd === 'pin');
      out(`  ${ok('✓')} ${cmd === 'pin' ? 'Pinned: it stays until you unpin it.' : 'Unpinned.'}`);
      return;
    }
    case 'forget': case 'rm': case 'delete': case 'clear': {
      const clips = new Store.Clips();
      if (rest[0] === 'all' || cmd === 'clear') {
        const a = await ask(`  Forget all ${clips.list.filter((c) => !c.pin).length} things you copied (pinned ones stay)? (y/n) `);
        if (!/^y/i.test(a) && process.stdin.isTTY) { out('  Kept everything.'); return; }
        out(`  ${ok('✓')} Forgot ${clips.clear()} things.`);
        return;
      }
      const c = clips.find(rest.join(' ') || '1');
      if (!c) throw new Error('Which one? magpie forget 3');
      clips.remove([c.id]);
      out(`  ${ok('✓')} Forgotten.`);
      return;
    }
    case 'pause': {
      const m = /^(\d+)\s*([mh]?)$/.exec(rest[0] || '30m');
      if (!m) throw new Error('Say how long, like 30m or 2h.');
      const mins = Number(m[1]) * (m[2] === 'h' ? 60 : 1);
      Store.settings.set({ pausedUntil: Date.now() + mins * 60000 });
      out(`  ${ok('✓')} Not keeping anything for ${mins >= 60 ? mins / 60 + ' h' : mins + ' min'}. ${dim('magpie resume starts again sooner.')}`);
      return;
    }
    case 'resume': Store.settings.set({ pausedUntil: 0 }); out(`  ${ok('✓')} Keeping what you copy again.`); return;
    case 'key': case 'shortcut': {
      if (!rest.length) { out(`  The key combo is ${blue(status().key || '⌃⌥V')}. Change it: magpie key ctrl+option+v`); return; }
      const Mac = require('./mac');
      const r = Mac.setKey(rest.join(' '));
      Store.settings.set({ key: Mac.keyCombo(rest.join(' ')).equiv });
      out(r.ok ? `  ${ok('✓')} The key combo is now ${blue(r.label)}. ${dim('(If it does nothing, log out and back in once.)')}` : `  ${bad('!')} ${r.why}`);
      return;
    }
    case 'status': {
      const t = status();
      out(`\n  ${t.st.running ? ok('●') + ' Keeping what you copy' : dim('○') + ' Not running (magpie on starts it)'}${t.paused ? dim(` · paused until ${new Date(t.paused).toLocaleTimeString()}`) : ''}`);
      out(`  ${t.n} kept · ${t.pins} pinned · up to ${t.s.max} · ${t.s.skipped || 0} passwords and keys skipped`);
      if (MAC) out(`  Key combo: ${blue(t.key)} ${dim('(or open "Magpie Picker" from Spotlight: ⌘Space, type picker)')}`);
      out('');
      return;
    }
    case 'doctor': case 'check': return doctor();
    case 'update': return update();
    case 'uninstall': return uninstall();
    default: throw new Error(`"${cmd}" isn't a magpie command. Try: magpie help`);
  }
}

async function home() {
  const t = status();
  intro([
    '', `${blue('magpie')} ${dim('v' + pkg.version)}`, '',
    'Remembers everything you copy.', 'Press a key combo to paste', 'something from earlier.', '',
    dim(`${Pica.NAME} keeps the shiny things.`),
  ]);
  if (!t.st.running && MAC) out(`  ${dim('○')} Not keeping things yet. Start with: ${bold('magpie on')}\n`);
  if (!process.stdin.isTTY) { show(new Store.Clips().list, { max: 9 }); return; }
  return browse();
}

/** What you copied, right here in the terminal: type to find, arrows to choose, Enter copies it. */
function browse() {
  return new Promise((resolve) => {
    let q = '', at = 0, note = '', drawn = 0;
    const clips = new Store.Clips();
    const width = () => Math.max(30, Math.min(90, (process.stdout.columns || 80) - 26));
    const list = () => clips.reload().search(q).slice(0, 9);
    const draw = () => {
      const L = list();
      at = Math.max(0, Math.min(at, L.length - 1));
      process.stdout.write('\x1b[?25l' + (drawn ? `\x1b[${drawn}A` : '') + '\r\x1b[J');
      const lines = [`  ${teal('›')} ${q || dim('type to find something you copied')}`, ''];
      if (!L.length) lines.push(dim(q ? '  Nothing matches.' : '  Nothing copied yet. Copy something, then come back.'));
      L.forEach((c, i) => lines.push((i === at ? blue('▸') : ' ') + line(c, i, width()).slice(1)));
      lines.push('', dim('  ↑↓ choose · Enter copies it · Tab opens the side panel · Esc leaves') + (note ? '\n  ' + note : ''));
      const text = lines.join('\n') + '\n';
      drawn = text.split('\n').length - 1;
      process.stdout.write(text);
    };
    const finish = (msg) => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write((drawn ? `\x1b[${drawn}A` : '') + '\r\x1b[J\x1b[?25h');
      drawn = 0;
      if (msg) out(msg);
      resolve();
    };
    const onKey = async (str, k = {}) => {
      if (k.ctrl && k.name === 'c') return finish('');
      if (k.name === 'escape') return finish(dim('  Bye.'));
      if (k.name === 'up') at--;
      else if (k.name === 'down') at++;
      else if (k.name === 'backspace') q = q.slice(0, -1);
      else if (k.name === 'return' || k.name === 'enter') {
        const c = list()[at];
        if (!c) return draw();
        try { require('./server').copy(c); clips.used(c.id); } catch (e) { note = bad(e.message); return draw(); }
        return finish(`  ${ok('✓')} On the clipboard: ${dim(String(c.text || 'a picture').replace(/\s+/g, ' ').slice(0, 60))}  ${dim('(⌘V to paste)')}`);
      } else if (k.name === 'tab') {
        finish('');
        return main(['pick']).catch((e) => out(`  ${bad('!')} ${e.message}`));
      } else if (str && !k.ctrl && !k.meta && str.length === 1 && str >= ' ') { q += str; at = 0; }
      note = '';
      draw();
    };
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    draw();
  });
}

/** Check every part and say plainly what works and what doesn't. */
async function doctor() {
  const Server = require('./server');
  const Local = require('./local');
  const t = status();
  const yes = (s) => out(`  ${ok('✓')} ${s}`);
  const no = (s, fix) => out(`  ${bad('!')} ${s}${fix ? `\n      ${dim(fix)}` : ''}`);
  out(`\n  ${blue('magpie')} ${dim('v' + pkg.version)}: checking every part\n`);
  if (!MAC) { out('  On this computer magpie runs in a window: magpie app. (The menu bar, panel and key combo are for Macs.)\n'); return; }
  const Mac = require('./mac');
  const port = Server.runningPort();
  const alive = port && (await Local.alive(port));
  if (alive) yes(`The background part is running (port ${port}).`);
  else no('The background part isn\'t running.', t.st.installed ? 'It should start by itself. Try: magpie on' : 'Start it: magpie on');
  const clips = new Store.Clips();
  const last = clips.list[0];
  if (last) yes(`Last thing kept: ${ago(last.at)}${last.app ? ' from ' + last.app : ''} (${clips.list.length} kept, ${t.s.skipped || 0} passwords and keys skipped).`);
  else no('Nothing kept yet.', 'Copy something (⌘C), wait a second, then run magpie doctor again.');
  if (t.paused) no(`Paused until ${new Date(t.paused).toLocaleTimeString()}.`, 'magpie resume starts again now.');
  const p = Mac.panel.status();
  if (p.running) yes('The side panel is running: the magpie in the menu bar (top right of the screen) opens it.');
  else no('The side panel isn\'t running.', `${p.err ? 'It said: ' + p.err + '. ' : ''}magpie on starts it. Until then, magpie pick opens a window at the side instead.`);
  if (p.running && p.hotkey === 'carbon') yes(`The key combo ${t.key || '⌃⌥V'} belongs to magpie.`);
  else if (p.running) no(`The key combo isn't magpie's${p.hotkeyWhy ? ` (${p.hotkeyWhy})` : ''}.`, 'Clicking the magpie in the menu bar always works. Another key combo: magpie key ctrl+option+b');
  const svc = fs.existsSync(path.join(Mac.workflowDir(), 'Contents', 'document.wflow'));
  out(`  ${svc ? ok('✓') : dim('·')} The spare key combo (a macOS service) ${svc ? 'is set up' : 'isn\'t set up'}.`);
  out(`  ${require('./open').canWindow() ? ok('✓') : dim('·')} ${require('./open').canWindow() ? 'Chrome (or Edge/Brave) is here for magpie\'s window.' : 'No Chrome, Edge or Brave: windows open in your normal browser.'}`);
  for (const [name, f] of [['background part', 'magpie.log'], ['side panel', 'panel.log']]) {
    let text = '';
    try { text = fs.readFileSync(path.join(Store.home(), f), 'utf8'); } catch { continue; }
    const tail = text.trim().split('\n').slice(-4).filter(Boolean);
    if (tail.length) { out(dim(`\n  The ${name}'s last notes (${path.join(Store.home(), f)}):`)); tail.forEach((l) => out(dim('    ' + l.slice(0, 160)))); }
  }
  out('');
}

async function on() {
  intro(['', `${blue('magpie')} ${dim('v' + pkg.version)}`, '', 'Setting up…']);
  if (!MAC) {
    out('  On this computer magpie runs in a window: keep it open while you use it.');
    return runHere('app');
  }
  const Mac = require('./mac');
  const key = Store.settings.load().key;
  const r = Mac.setUp(pkg.version, key);
  if (!r.ok) throw new Error(`macOS didn't start magpie (${r.why}). You can still run it in a window: magpie serve`);
  fs.writeFileSync(path.join(Store.home(), 'set-up-version'), pkg.version);
  const k = Mac.setKey(key);
  out(`  ${ok('✓')} magpie keeps what you copy from now on, and every time you log in.`);
  let p = Mac.panel.status();
  for (let i = 0; i < 15 && !p.running; i++) { await new Promise((res) => setTimeout(res, 300)); p = Mac.panel.status(); }
  if (p.running) out(`  ${ok('✓')} There's a magpie in your menu bar (top right of the screen): click it for the side panel.`);
  else out(`  ${dim('·')} The menu bar magpie is starting. If it doesn't appear, run: magpie doctor`);
  if (p.hotkey === 'carbon') out(`  ${ok('✓')} Or press ${blue(k.label)} ${dim('(control + option + V)')} in any app.`);
  else out(`  ${dim('·')} The key combo ${blue(k.label)} may need you to log out and back in once. The menu bar magpie always works.`);
  out(`  ${ok('✓')} Passwords and keys are skipped. Nothing leaves this computer.`);
  out(`\n  ${dim('Its window: magpie app · what you copied: magpie')}\n`);
}

function installUrl(kind) {
  let hub = '';
  try { hub = fs.readFileSync(path.join(Store.home(), 'hub'), 'utf8').trim(); } catch { /* from GitHub */ }
  if (/^https?:\/\//.test(hub)) return `${hub.replace(/\/+$/, '')}/install.${kind}`;
  return `https://raw.githubusercontent.com/dpatel7-dev/magpie/main/install.${kind}`;
}

function update() {
  const { spawnSync } = require('child_process');
  const win = process.platform === 'win32';
  const url = installUrl(win ? 'ps1' : 'sh');
  out(`  Updating from ${url}`);
  const r = win
    ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${url} | iex`], { stdio: 'inherit' })
    : spawnSync('sh', ['-c', `curl -fsSL "${url}" | sh`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('The update did not finish. Your current version still works.');
  if (MAC && require('./mac').agentState().installed) require('./mac').setUp(pkg.version);
}

async function uninstall() {
  require('./mac').tearDown();
  const root = Store.home();
  let launcher = '';
  try { launcher = fs.readFileSync(path.join(root, 'launcher'), 'utf8').trim(); } catch { /* not from the installer */ }
  const keep = await ask('  Keep what you copied, in case you install magpie again? (y/n) ');
  if (/^n/i.test(keep)) fs.rmSync(root, { recursive: true, force: true });
  else fs.rmSync(path.join(root, 'app'), { recursive: true, force: true });
  if (launcher && /magpie(\.cmd)?$/.test(launcher)) fs.rmSync(launcher, { force: true });
  out('  magpie is uninstalled from this computer.');
}

module.exports = { main, HELP, line };
