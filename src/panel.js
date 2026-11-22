'use strict';
// A side panel for an app: a small floating window at the right edge of the
// screen that shows one of the app's pages, plus an icon in the menu bar that
// opens and closes it. It never takes over: the app you were using stays the
// active one, and you can keep working with the panel open.
//
// On a Mac it's a little program in JavaScript for Automation (macOS's own
// scripting, nothing to install, no permissions, no administrator): a
// non-activating panel with Apple's frosted-glass background and a web view
// inside, kept running by a LaunchAgent. It also tries to claim a key combo
// for the whole Mac (Carbon hot keys need no permissions either).
//
// Elsewhere (or if that can't start) the page opens in a narrow app window
// on the right instead.
//
//   const P = require('./panel')({ app: 'magpie', home, title: 'magpie', width: 380, height: 600,
//                                  icon: { grid, ink }, hotkey: '^~v' })
//   P.setUp({ url })   P.show()   P.hide()   P.toggle()   P.status()   P.tearDown()

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const MAC = process.platform === 'darwin';

// ── a tiny PNG writer, for the menu bar icon ──
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A PNG of pixel art: rows of letters, a letter → colour map, `scale` pixels per letter, centred in a size×size square. */
function png(grid, ink, { scale = 2, size = 0 } = {}) {
  const gw = Math.max(...grid.map((r) => r.length)), gh = grid.length;
  const W = Math.max(size, gw * scale), H = Math.max(size, gh * scale);
  const ox = Math.floor((W - gw * scale) / 2), oy = Math.floor((H - gh * scale) / 2);
  const raw = Buffer.alloc((W * 4 + 1) * H);
  const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)] : null; };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const c = hex(ink[grid[y][x]]);
    if (!c) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const px = ox + x * scale + dx, py = oy + y * scale + dy;
      const i = py * (W * 4 + 1) + 1 + px * 4;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── key combos: "^~v" (ctrl+option+v) → Carbon key code and modifiers ──
const KEYCODES = { a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, 1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, 9: 25, 7: 26, 8: 28, 0: 29, o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46, space: 49 };
function carbonKey(equiv) {
  const m = /^([\^~$@]*)(.+)$/.exec(String(equiv || ''));
  if (!m || KEYCODES[m[2].toLowerCase()] == null) return null;
  let mods = 0;
  if (m[1].includes('@')) mods |= 256;  // cmdKey
  if (m[1].includes('$')) mods |= 512;  // shiftKey
  if (m[1].includes('~')) mods |= 2048; // optionKey
  if (m[1].includes('^')) mods |= 4096; // controlKey
  return { code: KEYCODES[m[2].toLowerCase()], mods };
}

// ── the panel program (JavaScript for Automation) ──
const HOST = String.raw`
ObjC.import('Cocoa');
ObjC.import('WebKit');
var cfg, panel, web, fx, item, target, loaded = '', lastSeq = '', beat = 0, hotkey = 'none', hotkeyWhy = '', keepTarget, monitor;
function readText(p) { var s = $.NSString.stringWithContentsOfFileEncodingError($(p), $.NSUTF8StringEncoding, null); return s.isNil() ? '' : ObjC.unwrap(s); }
function writeText(p, t) { $(t).writeToFileAtomicallyEncodingError($(p), true, $.NSUTF8StringEncoding, null); }
function note(o) { try { o.pid = $.NSProcessInfo.processInfo.processIdentifier; o.at = Date.now(); o.hotkey = hotkey; o.hotkeyWhy = hotkeyWhy; o.visible = !!(panel && panel.isVisible); writeText(cfg.statusFile, JSON.stringify(o)); } catch (e) {} }
function pageUrl() { var u = readText(cfg.urlFile).trim(); return u || cfg.url || ''; }
function place() {
  var scr = $.NSScreen.mainScreen;
  if (scr.isNil()) return;
  var vf = scr.visibleFrame;
  var w = cfg.width, h = Math.min(cfg.height, vf.size.height - 20);
  var x = vf.origin.x + vf.size.width - w - 10;
  var y = vf.origin.y + Math.round((vf.size.height - h) / 2);
  panel.setFrameDisplay($.NSMakeRect(x, y, w, h), true);
  fx.setFrame($.NSMakeRect(0, 0, w, h));
  web.setFrame($.NSMakeRect(0, 0, w, h));
}
function js(code) { try { web.evaluateJavaScriptCompletionHandler($(code), null); } catch (e) {} }
function show() {
  place();
  var u = pageUrl();
  if (!u) return;
  if (u !== loaded) { web.loadRequest($.NSURLRequest.requestWithURL($.NSURL.URLWithString($(u)))); loaded = u; }
  else js('window.panelShown && window.panelShown()');
  panel.makeKeyAndOrderFront(null);
  panel.makeFirstResponder(web);
  note({ ok: true });
}
function hide() { if (panel.isVisible) { panel.orderOut(null); js('window.panelHidden && window.panelHidden()'); } note({ ok: true }); }
function toggle() { if (panel.isVisible) hide(); else show(); }
function tick() {
  try {
    var c = readText(cfg.cmdFile).trim();
    if (c && c !== lastSeq) {
      lastSeq = c;
      var what = c.split(' ')[1] || '';
      if (what === 'show') show(); else if (what === 'hide') hide(); else if (what === 'toggle') toggle(); else if (what === 'reload') { loaded = ''; if (panel.isVisible) show(); } else if (what === 'quit') { note({ ok: false, quit: true }); $.NSApplication.sharedApplication.terminate(null); }
    }
    if (++beat % 12 === 0) note({ ok: true });
  } catch (e) { note({ ok: false, err: String(e) }); }
}
function claimHotkey() {
  if (!cfg.hotkey) { hotkeyWhy = 'no key combo set'; return; }
  try {
    ObjC.import('Carbon');
    if (typeof $.RegisterEventHotKey !== 'function' && typeof $.RegisterEventHotKey !== 'object') { hotkeyWhy = 'RegisterEventHotKey is not reachable from here'; return; }
    var ref = Ref();
    var st = $.RegisterEventHotKey(cfg.hotkey.code, cfg.hotkey.mods, { signature: 0x44503750, id: 1 }, $.GetApplicationEventTarget(), 0, ref);
    if (st !== 0) { hotkeyWhy = 'macOS said ' + st + ' (another app may use that key combo)'; return; }
    // with no Carbon handler, a hot key arrives as a "system defined" event, subtype 6
    monitor = $.NSEvent.addLocalMonitorForEventsMatchingMaskHandler(1 << 14, function (ev) {
      try { if (ev.subtype === 6) { toggle(); return null; } } catch (e) {}
      return ev;
    });
    hotkey = 'carbon';
  } catch (e) { hotkeyWhy = String(e); }
}
function run(argv) {
  cfg = JSON.parse(readText(argv[0]));
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1); // an accessory: no Dock icon
  ObjC.registerSubclass({
    name: 'DPPanelTarget' + cfg.app.replace(/[^A-Za-z0-9]/g, ''),
    methods: {
      'toggle:': { types: ['void', ['id']], implementation: function (s) { try { toggle(); } catch (e) { note({ ok: false, err: String(e) }); } } },
      'tick:': { types: ['void', ['id']], implementation: function (t) { tick(); } },
    },
  });
  target = $['DPPanelTarget' + cfg.app.replace(/[^A-Za-z0-9]/g, '')].alloc.init;
  // the panel: titled (so it can take typing) but with no visible title bar; it doesn't make its app active
  var rect = $.NSMakeRect(0, 0, cfg.width, cfg.height);
  panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(rect, 1 | 128 | 32768, 2, false);
  panel.setTitlebarAppearsTransparent(true);
  panel.setTitleVisibility(1);
  panel.setTitle($(cfg.title || cfg.app));
  [0, 1, 2].forEach(function (b) { var x = panel.standardWindowButton(b); if (!x.isNil()) x.setHidden(true); });
  panel.setLevel(3);                      // floats over other windows
  panel.setCollectionBehavior(1 | 256);   // on every Space, and next to full-screen apps
  panel.setHidesOnDeactivate(false);
  panel.setFloatingPanel(true);
  panel.setBecomesKeyOnlyIfNeeded(false);
  panel.setReleasedWhenClosed(false);
  panel.setOpaque(false);
  panel.setBackgroundColor($.NSColor.clearColor);
  fx = $.NSVisualEffectView.alloc.initWithFrame(rect);
  fx.setMaterial(cfg.material || 6);       // the popover glass; light or dark with the Mac
  fx.setBlendingMode(0);
  fx.setState(1);
  fx.setAutoresizingMask(18);
  var conf = $.WKWebViewConfiguration.alloc.init;
  try { conf.preferences.setValueForKey(true, 'developerExtrasEnabled'); } catch (e) {}
  try { conf.setMediaTypesRequiringUserActionForPlayback(0); } catch (e) {}
  web = $.WKWebView.alloc.initWithFrameConfiguration(rect, conf);
  try { web.setValueForKey(false, 'drawsBackground'); } catch (e) {}
  web.setAutoresizingMask(18);
  fx.addSubview(web);
  panel.setContentView(fx);
  // the menu bar icon
  item = $.NSStatusBar.systemStatusBar.statusItemWithLength(-1);
  var img = $.NSImage.alloc.initWithContentsOfFile($(cfg.icon));
  if (!img.isNil()) { img.setSize($.NSMakeSize(18, 18)); item.button.setImage(img); } else item.button.setTitle($(cfg.title || cfg.app));
  item.button.setToolTip($(cfg.tooltip || cfg.title || cfg.app));
  item.button.setTarget(target);
  item.button.setAction('toggle:');
  claimHotkey();
  lastSeq = readText(cfg.cmdFile).trim(); // don't replay an old request
  keepTarget = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.15, target, 'tick:', null, true);
  note({ ok: true, started: true });
  if (cfg.showAtStart) show();
  app.run;
}
`;

module.exports = function Panel({ app, home, title = app, width = 380, height = 600, icon = null, hotkey = null, tooltip = '', material = 6 }) {
  const Mac = require('./macos')({ app, label: `dev.dpatel7.${app}.panel`, home });
  const dir = () => (typeof home === 'function' ? home() : home);
  const files = () => ({
    host: path.join(dir(), 'panel-host.js'), conf: path.join(dir(), 'panel.json'), icon: path.join(dir(), 'panel-icon.png'),
    url: path.join(dir(), 'panel-url'), cmd: path.join(dir(), 'panel-cmd'), status: path.join(dir(), 'panel-status.json'),
  });

  /** Tell the panel which page to show (call when the app's server starts: its port can change). */
  function setUrl(url) { const f = files(); fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(f.url, url); }

  /** Write the panel program and start it at login. Returns { ok, why }. */
  function setUp({ url, combo = hotkey, showAtStart = false } = {}) {
    if (!MAC) return { ok: false, why: 'The side panel is for Macs.' };
    const f = files();
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(f.host, HOST);
    if (icon) fs.writeFileSync(f.icon, png(icon.grid, icon.ink, { scale: 2, size: 36 }));
    if (url) setUrl(url);
    const key = combo ? carbonKey(combo) : null;
    fs.writeFileSync(f.conf, JSON.stringify({ app, title, width, height, material, tooltip: tooltip || title, icon: f.icon, urlFile: f.url, cmdFile: f.cmd, statusFile: f.status, hotkey: key, showAtStart }, null, 1));
    return Mac.startAgent({ program: ['/usr/bin/osascript', '-l', 'JavaScript', f.host, f.conf], keepAlive: true, interactive: true });
  }

  /** Is the panel program running? → { running, hotkey, hotkeyWhy, visible, err } */
  function status() {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(files().status, 'utf8')); } catch { return { running: false }; }
    return { ...s, running: !!s.at && Date.now() - s.at < 6000 && !s.quit };
  }

  let seq = 0;
  function send(what) { const f = files(); fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(f.cmd, `${Date.now()}-${process.pid}-${++seq} ${what}`); }

  /** Show the panel; resolves true if the panel program did (false: use the window instead). */
  async function show() {
    if (!MAC || !status().running) return false;
    send('show');
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 120)); if (status().visible) return true; }
    return status().running;
  }
  const hide = () => send('hide');
  const toggle = () => send('toggle');
  const reload = () => send('reload');

  /** The fallback: the same page in a narrow app window at the right of the screen. */
  function openSide(url) {
    let x = null, y = 40;
    if (MAC) {
      const r = Mac.jxa("ObjC.import('AppKit'); var f = $.NSScreen.mainScreen.visibleFrame; JSON.stringify({ w: f.size.width, h: f.size.height })", [], 4000);
      try { const s = JSON.parse(r.out); x = Math.round(s.w - width - 12); y = Math.max(30, Math.round((s.h - height) / 2)); } catch { /* the browser decides */ }
    }
    return require('./open').openWindow(url, { width, height, x, y });
  }

  function tearDown() {
    if (!MAC) return;
    send('quit');
    Mac.stopAgent();
    const f = files();
    for (const k of ['host', 'conf', 'icon', 'status', 'cmd']) fs.rmSync(f[k], { force: true });
  }

  return { setUp, setUrl, status, show, hide, toggle, reload, openSide, tearDown, files, HOST };
};
module.exports.png = png;
module.exports.carbonKey = carbonKey;
module.exports.HOST = HOST;
