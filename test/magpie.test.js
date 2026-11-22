'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'magpie-test-'));
process.env.MAGPIE_HOME = path.join(tmp, 'home');
process.env.MAGPIE_FAKE_CLIPBOARD = path.join(tmp, 'clipboard.txt');
process.env.APP_NO_WINDOW = '1';
fs.writeFileSync(process.env.MAGPIE_FAKE_CLIPBOARD, '');
const K = require('../src/kinds');
const Store = require('../src/store');
const W = require('../src/watch');
const Mac = require('../src/mac');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('what a copied thing is', () => {
  const cases = { 'https://example.com/a?b=1': 'link', 'www.example.org': 'link', 'me@example.com': 'email', '#2f62b8': 'color', 'rgb(10, 20, 30)': 'color',
    '(609) 555-0142': 'phone', '42': 'number', '3.14%': 'number', '/Users/dhruv/Desktop/notes.txt': 'path', 'const a = () => { return 1; };\nexport default a;': 'code',
    'git push -u origin main': 'code', 'Pigeons can find their way home.': 'text' };
  for (const [t, k] of Object.entries(cases)) assert.equal(K.kindOf(t), k, t);
});

test('passwords, keys and card numbers are not kept', () => {
  for (const t of ['sk-proj-abcdefghijklmnopqrstuvwx1234', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'AKIAABCDEFGHIJKLMNOP', 'Tr0ub4dor&3xyz!', '4111 1111 1111 1111',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----']) {
    assert.ok(K.secretWhy(t), t);
  }
  for (const t of ['hello world', 'https://github.com/dpatel7-dev/magpie', 'camelCaseVariableName', 'The quick brown fox', '4111 1111 1111 1112', 'dhruv@example.com', '2026-11-21', '0123456789abcdef0123456789abcdef01234567']) {
    assert.equal(K.secretWhy(t), null, t);
  }
});

test('quick changes', () => {
  assert.equal(K.transform('https://a.com/x?utm_source=tw&id=3&fbclid=9', 'url'), 'https://a.com/x?id=3');
  assert.equal(K.transform('hello  world  \n  again ', 'trim'), 'hello world\nagain');
  assert.equal(K.transform('the lord of the rings', 'title'), 'The Lord Of The Rings');
  assert.equal(K.transform('{"a":1}', 'json'), '{\n  "a": 1\n}');
  assert.equal(K.transform(K.transform('héllo ✓', 'b64'), 'unb64'), 'héllo ✓');
  assert.equal(K.transform('b\na\nb', 'unique'), 'b\na');
  assert.equal(K.transform('Crème Brûlée Recipe!', 'slug'), 'creme-brulee-recipe');
  assert.throws(() => K.transform('not json', 'json'), /Couldn't/);
  assert.ok(K.transformsFor('{"a":1}').some((w) => w.id === 'json'));
  assert.equal(K.transformsFor('https://x.com').map((w) => w.id)[0], 'url');
});

test('keeping clips: repeats move to the top, pins stay, the oldest go', () => {
  const c = new Store.Clips();
  c.add({ text: 'one', app: 'Notes' });
  c.add({ text: 'two', app: 'Notes' });
  c.add({ text: 'one', app: 'Safari' });
  assert.deepEqual(c.list.map((x) => x.text), ['one', 'two']);
  assert.equal(c.list[0].times, 2);
  assert.equal(c.list[0].app, 'Safari');
  assert.equal(c.add({ text: 'hunter2 is fine', bundle: 'com.1password.1password' }).skipped.includes('copied in'), true);
  assert.ok(c.add({ secret: true }).skipped);
  assert.ok(c.add({ text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }).skipped.startsWith('looked like'));
  c.pin(c.find('two').id);
  for (let i = 0; i < 30; i++) c.add({ text: `note ${i}` }, { ...Store.settings.load(), max: 20 });
  assert.equal(c.list.filter((x) => !x.pin).length, 20);
  assert.ok(c.find('two'), 'the pinned one stayed');
  assert.equal(c.search('note 2').length, 11, '"note 2" and "note 20".."note 29"');
  Store.settings.set({ pausedUntil: Date.now() + 60000 });
  assert.equal(c.add({ text: 'while paused' }).skipped, 'paused');
  Store.settings.set({ pausedUntil: 0 });
  assert.ok(Store.settings.load().skipped >= 2);
});

test('pictures are kept once, and go with their clip', () => {
  const c = new Store.Clips();
  // a 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const f1 = path.join(tmp, 'a.png'); fs.writeFileSync(f1, png);
  const r = c.add({ image: f1, app: 'Screenshot' });
  assert.equal(r.clip.kind, 'image');
  assert.equal(r.clip.w, 1);
  const f2 = path.join(tmp, 'b.png'); fs.writeFileSync(f2, png);
  c.add({ image: f2 });
  assert.equal(c.list.filter((x) => x.kind === 'image').length, 1, 'the same picture is kept once');
  const file = path.join(Store.imagesDir(), r.clip.image);
  assert.ok(fs.existsSync(file));
  c.remove([r.clip.id]);
  assert.ok(!fs.existsSync(file), 'its file went too');
});

test("the watcher's lines", () => {
  assert.deepEqual(W.parse('{"text":"hi","app":"Notes"}'), { text: 'hi', app: 'Notes' });
  assert.equal(W.parse('nonsense'), null);
  // the watcher program itself is plain JavaScript: it at least parses
  assert.doesNotThrow(() => new Function(W.WATCHER.replace(/^ObjC\.import.*$/gm, '')));
});

test('key combos', () => {
  assert.deepEqual(Mac.keyCombo('ctrl+option+v'), { equiv: '^~v', label: '⌃⌥V' });
  assert.deepEqual(Mac.keyCombo('cmd shift c'), { equiv: '$@c', label: '⇧⌘C' });
  assert.deepEqual(Mac.keyCombo('^~v'), { equiv: '^~v', label: '⌃⌥V' });
  assert.deepEqual(Mac.keyCombo('⌃⌥V'), { equiv: '^~v', label: '⌃⌥V' });
  assert.throws(() => Mac.keyCombo('shift+v'), /ctrl, option or cmd/);
  assert.throws(() => Mac.keyCombo('ctrl+banana'), /isn't a key/);
});

test('the service files are real property lists', () => {
  const f = Mac.workflowFiles('/usr/local/bin/node', "/Users/dhruv/.magpie/app/bin/magpie.js");
  for (const [name, xml] of Object.entries(f)) {
    const r = spawnSync('python3', ['-c', 'import plistlib,sys; d=plistlib.loads(sys.stdin.buffer.read()); print(type(d).__name__)'], { input: xml, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), 'dict', `${name}: ${r.stderr}`);
  }
  const r = spawnSync('python3', ['-c', `import plistlib,sys,json; d=plistlib.loads(sys.stdin.buffer.read()); print(json.dumps([d['actions'][0]['action']['ActionParameters']['COMMAND_STRING'], d['workflowMetaData']['workflowTypeIdentifier']]))`], { input: f.wflow, encoding: 'utf8' });
  const [cmd, kind] = JSON.parse(r.stdout);
  assert.match(cmd, /'\/usr\/local\/bin\/node' '\/Users\/dhruv\/\.magpie\/app\/bin\/magpie\.js' pick/);
  assert.equal(kind, 'com.apple.Automator.servicesMenu');
});

test('the background part: watches, serves its window, copies back', async () => {
  const Server = require('../src/server');
  const s = await Server.start({ port: 0, log: () => {} });
  try {
    const clip = process.env.MAGPIE_FAKE_CLIPBOARD;
    fs.writeFileSync(clip, 'first thing');
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(clip, 'https://example.com/?utm_source=a&q=1');
    await new Promise((r) => setTimeout(r, 300));
    const api = (what, body) => fetch(`${s.url}api/${what}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-magpie': s.secret }, body: JSON.stringify(body || {}) }).then((r) => r.json());
    const list = await api('list', {});
    assert.equal(list.clips[0].kind, 'link');
    assert.ok(list.clips.some((c) => c.text === 'first thing'));
    await api('use', { id: list.clips[0].id, how: 'url' });
    assert.equal(fs.readFileSync(clip, 'utf8'), 'https://example.com/?q=1');
    // no secret header: refused. Another name for the host: refused.
    assert.equal((await fetch(`${s.url}api/list`, { method: 'POST', body: '{}' })).status, 403);
    const wrongHost = await new Promise((resolve) => require('http').get({ host: '127.0.0.1', port: s.port, path: `/${s.secret}/`, headers: { host: 'evil.example:80' } }, (r) => resolve(r.statusCode)));
    assert.equal(wrongHost, 403);
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/list`, { method: 'POST' })).status, 404, 'nothing outside the secret address');
    // the pages come with their settings
    const page = await (await fetch(s.url)).text();
    assert.match(page, /"secret":"[a-f0-9]{32}"/);
    const pick = await (await fetch(s.url + 'pick')).text();
    assert.match(pick, /Find something you copied/);
    // several together
    const ids = (await api('list', {})).clips.slice(0, 2).map((c) => c.id);
    await api('merge', { ids, sep: 'comma' });
    assert.match(fs.readFileSync(clip, 'utf8'), /, /);
  } finally { await s.close(); }
});

test('the command line', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'magpie.js'), ...a], { encoding: 'utf8', env: process.env });
  assert.match(run('--version').stdout, /magpie \d+\.\d+\.\d+/);
  assert.match(run('help').stdout, /magpie pick/);
  assert.match(run('list').stdout, /first thing|note/);
  const r = run('copy', 'first thing');
  assert.match(r.stdout, /On the clipboard/);
  assert.equal(fs.readFileSync(process.env.MAGPIE_FAKE_CLIPBOARD, 'utf8'), 'first thing');
  assert.match(run('copy', 'first', '--as', 'upper').stdout, /UPPERCASE/);
  assert.equal(fs.readFileSync(process.env.MAGPIE_FAKE_CLIPBOARD, 'utf8'), 'FIRST THING');
  assert.match(run('nonsense').stderr, /isn't a magpie command/);
});

test('the side panel: its menu bar icon is a real PNG, and key combos become Carbon codes', () => {
  const Panel = require('../src/panel');
  const Pica = require('../src/bird');
  const png = Panel.png(Pica.MINI, Pica.INK, { scale: 2, size: 36 });
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 36);
  assert.deepEqual(Panel.carbonKey('^~v'), { code: 9, mods: 6144 });
  assert.equal(Panel.carbonKey('^~?'), null);
  assert.doesNotThrow(() => new Function(Panel.HOST));
});
