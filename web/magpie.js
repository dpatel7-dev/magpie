(function () {
  'use strict';
  var C = JSON.parse(document.getElementById('config').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var st = { clips: [], kind: 'all', q: '', app: '', sel: new Set(), open: null, sig: '', status: {} };
  var KINDS = [['all', 'Everything'], ['pinned', 'Pinned'], ['text', 'Text'], ['link', 'Links'], ['code', 'Code'], ['image', 'Pictures'], ['color', 'Colours'], ['files', 'Files']];
  var GLYPH = { link: '↗', email: '@', color: '●', phone: '☎', number: '#', path: '/', code: '{ }', text: 'Aa', image: '▣', files: '▤' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(t) { var s = (Date.now() - t) / 1000; if (s < 50) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; if (s < 86400 * 6) return Math.round(s / 86400) + ' d ago'; return new Date(t).toLocaleDateString(); }
  function api(what, body) {
    return fetch(C.base + '/api/' + what, { method: 'POST', headers: { 'content-type': 'application/json', 'x-magpie': C.secret }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'magpie had a problem.'); return j; }); });
  }
  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2200); }
  function fail(e) { toast(e.message || 'Something went wrong.'); }

  // ── Pica, and the rooftops ──
  var PICA = ['............', '........kkk.', '.......kKEKY', '.......KKKk.', '.....kBbKWW.', '..GkBBWBWWW.', 'gGGkKKKKww..', 'g......L.L..', '............'];
  var INK = { K: '#15171c', k: '#3a4150', W: '#f7f7f4', w: '#c9ced6', B: '#2f62b8', b: '#6a9be6', G: '#1f7f78', g: '#45bfae', E: '#ffffff', L: '#4a505c', Y: '#59606e' };
  function drawPica() {
    var g = $('pica').getContext('2d'); g.clearRect(0, 0, 12, 9);
    var ink = dark.matches ? Object.assign({}, INK, { K: '#2a3042', k: '#6a7694' }) : INK;
    PICA.forEach(function (row, y) { row.split('').forEach(function (ch, x) { if (ink[ch]) { g.fillStyle = ink[ch]; g.fillRect(x, y, 1, 1); } }); });
  }
  drawPica(); dark.addEventListener('change', drawPica);
  var scene = window.Rooftops.start($('scene'), { night: function () { return dark.matches; }, share: 0.42 });

  // ── showing the clips ──
  function chips() {
    var counts = {};
    st.clips.forEach(function (c) { counts[c.kind] = (counts[c.kind] || 0) + 1; if (c.pin) counts.pinned = (counts.pinned || 0) + 1; });
    $('chips').innerHTML = KINDS.filter(function (k) { return k[0] === 'all' || k[0] === st.kind || counts[k[0]]; }).map(function (k) {
      return '<button class="chip" data-kind="' + k[0] + '" aria-pressed="' + (st.kind === k[0]) + '">' + esc(k[1]) + (k[0] !== 'all' && counts[k[0]] ? ' <b>' + counts[k[0]] + '</b>' : '') + '</button>';
    }).join('');
  }
  function preview(c) {
    if (c.kind === 'image') return '<img class="shot" alt="A picture you copied" src="' + esc(c.src) + '" loading="lazy">';
    var t = c.text || '';
    if (c.kind === 'color') return '<p class="text"><span class="swatch" style="background:' + esc(t.trim()) + '"></span>' + esc(t) + '</p>';
    if (c.kind === 'link') {
      var m = /^(https?:\/\/)?([^/?#]+)(.*)$/i.exec(t.trim());
      return '<p class="text">' + (m ? '<span class="dom">' + esc(m[2]) + '</span>' + esc(m[3].slice(0, 200)) : esc(t)) + '</p>';
    }
    return '<p class="text' + (c.kind === 'code' ? ' code' : '') + '">' + esc(t.slice(0, 600)) + '</p>';
  }
  function row(c) {
    var on = st.sel.has(c.id);
    return '<li class="clip' + (on ? ' on' : '') + (st.open === c.id ? ' open' : '') + '" data-id="' + c.id + '" tabindex="0">' +
      '<span class="kind" style="--k:var(--k-' + esc(c.kind) + ')" title="' + esc(c.kind) + '">' + esc(GLYPH[c.kind] || 'Aa') + '</span>' +
      '<div class="body">' + (c.name ? '<span class="name">' + esc(c.name) + '</span>' : '') + preview(c) + '</div>' +
      '<div class="acts"><button class="icon" data-act="pin" title="' + (c.pin ? 'Unpin' : 'Pin: keep it forever') + '" aria-label="' + (c.pin ? 'Unpin' : 'Pin') + '"><svg viewBox="0 0 24 24"><path d="M12 3l3 6 6 1-4.5 4.2 1 6.3L12 17.6 6.5 20.5l1-6.3L3 10l6-1z" ' + (c.pin ? 'fill="currentColor"' : '') + '/></svg></button>' +
        (c.text && c.kind !== 'files' ? '<button class="icon" data-act="more" title="More: the whole thing, quick changes" aria-label="More"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></button>' : '') +
        '<button class="icon" data-act="forget" title="Forget it" aria-label="Forget it"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg></button>' +
        '<button class="copy" data-act="copy">Copy</button></div>' +
      '<div class="meta">' + (c.pin ? '<span class="gem" title="Pinned"></span>' : '') + '<span>' + ago(c.at) + '</span>' + (c.app ? '<span>' + esc(c.app) + '</span>' : '') + (c.times > 1 ? '<span>copied ' + c.times + ' times</span>' : '') + (c.kind === 'image' && c.w ? '<span>' + c.w + '×' + c.h + '</span>' : '') + (c.more ? '<span>+' + c.more.toLocaleString() + ' more characters</span>' : '') + '</div>' +
      (st.open === c.id ? '<div class="more" id="more"><div class="small">Loading…</div></div>' : '') +
      '</li>';
  }
  function render() {
    chips();
    var list = st.clips;
    $('list').innerHTML = list.map(row).join('');
    var e = $('empty');
    e.hidden = !!list.length;
    if (!list.length) e.innerHTML = st.q || st.kind !== 'all' || st.app ? '<b>Nothing matches</b>Try fewer words, or a different filter.' : '<b>Copy something</b>It shows up here. Press <kbd>' + esc(st.status.keyLabel || '⌃⌥V') + '</kbd> in any app to paste something from earlier.';
    var n = st.sel.size;
    $('bar').hidden = !n;
    $('barText').textContent = n + ' picked';
    if (st.open) fillMore(st.open);
  }
  function fillMore(id) {
    var c = st.clips.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    Promise.all([api('full', { id: id }), api('ways', { id: id })]).then(function (r) {
      var box = $('more');
      if (!box) return;
      var counts = r[1].counts;
      box.innerHTML = '<pre></pre><div class="ways"><span>' + counts.words + ' words · ' + counts.chars + ' characters · ' + counts.lines + ' lines</span></div>' +
        '<div class="ways" style="margin-top:8px"><span>Copy it as:</span>' + r[1].ways.map(function (w) { return '<button data-way="' + w.id + '">' + esc(w.label) + '</button>'; }).join('') + '</div>' +
        '<div class="ways" style="margin-top:8px"><span>Also:</span><button data-extra="name">' + (c.name ? 'Rename' : 'Give it a name') + '</button>' + (st.status.pigeon ? '<button data-extra="send">Send to my other devices (pigeon)</button>' : '') + '</div>';
      box.querySelector('pre').textContent = r[0].text;
    }, fail);
  }

  function load(force) {
    return api('list', { q: st.q, kind: st.kind === 'all' ? '' : st.kind, app: st.app }).then(function (r) {
      st.status = r.status;
      var sig = JSON.stringify(r.clips.map(function (c) { return [c.id, c.at, c.pin, c.name, c.times]; })) + st.kind + st.q + st.app;
      if (sig !== st.sig || force) { st.sig = sig; st.clips = r.clips; render(); }
      $('counts').textContent = r.total + ' kept · ' + r.pinned + ' pinned' + (r.status.skipped ? ' · ' + r.status.skipped + ' passwords and keys skipped' : '');
      var paused = r.status.pausedUntil > Date.now();
      $('state').classList.toggle('paused', paused);
      $('stateText').textContent = paused ? 'Paused until ' + new Date(r.status.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Keeping what you copy';
      $('pauseBtn').textContent = paused ? 'Start again now' : 'Pause for 30 min';
      $('keyCap').textContent = r.status.keyLabel || '⌃⌥V';
      $('hint').hidden = !r.status.mac;
      var apps = $('app'), want = st.app;
      var opts = '<option value="">From any app</option>' + r.apps.map(function (a) { return '<option' + (a.app === want ? ' selected' : '') + '>' + esc(a.app) + '</option>'; }).join('');
      if (apps.innerHTML !== opts) apps.innerHTML = opts;
    }).catch(function () {});
  }

  // ── doing things ──
  function byId(id) { return st.clips.filter(function (c) { return c.id === id; })[0]; }
  function copy(id, how) {
    return api('use', { id: id, how: how }).then(function () { toast(how ? 'Copied the changed version.' : 'Copied. Press ⌘V to paste.'); load(); }, fail);
  }
  $('list').addEventListener('click', function (e) {
    var li = e.target.closest('.clip');
    if (!li) return;
    var id = li.dataset.id, c = byId(id);
    var b = e.target.closest('[data-act],[data-way],[data-extra]');
    if (b && b.dataset.way) return copy(id, b.dataset.way);
    if (b && b.dataset.extra === 'name') {
      var n = prompt('A name for it (it gets pinned):', c.name || '');
      if (n !== null) api('name', { id: id, name: n }).then(function () { load(true); }, fail);
      return;
    }
    if (b && b.dataset.extra === 'send') return api('send', { id: id }).then(function () { toast('On its way to your other devices.'); }, fail);
    if (b && b.dataset.act === 'copy') return copy(id);
    if (b && b.dataset.act === 'pin') return api('pin', { id: id, on: !c.pin }).then(function () { toast(c.pin ? 'Unpinned.' : 'Pinned: it stays until you unpin it.'); load(true); }, fail);
    if (b && b.dataset.act === 'forget') return api('delete', { id: id }).then(function () { st.sel.delete(id); load(true); }, fail);
    if (b && b.dataset.act === 'more') { st.open = st.open === id ? null : id; return render(); }
    if (e.target.closest('.more')) return;
    if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
    render();
  });
  $('list').addEventListener('dblclick', function (e) { var li = e.target.closest('.clip'); if (li && !e.target.closest('.acts,.more')) copy(li.dataset.id); });
  $('list').addEventListener('keydown', function (e) {
    var li = e.target.closest('.clip');
    if (!li) return;
    if (e.key === 'Enter') { e.preventDefault(); copy(li.dataset.id); }
    else if (e.key === 'ArrowDown' && li.nextElementSibling) { e.preventDefault(); li.nextElementSibling.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (li.previousElementSibling) li.previousElementSibling.focus(); else $('q').focus(); }
    else if (e.key === ' ') { e.preventDefault(); var id = li.dataset.id; if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); render(); var again = document.querySelector('.clip[data-id="' + id + '"]'); if (again) again.focus(); }
  });
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('[data-kind]'); if (!b) return; st.kind = b.dataset.kind; st.open = null; load(true); });
  var qT = 0;
  $('q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(function () { st.q = $('q').value; st.open = null; load(true); }, 120); });
  $('q').addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { var f = document.querySelector('.clip'); if (f) { e.preventDefault(); f.focus(); } } if (e.key === 'Enter' && st.clips[0]) copy(st.clips[0].id); });
  $('app').onchange = function () { st.app = this.value; load(true); };
  $('mergeBtn').onclick = function () {
    var ids = st.clips.filter(function (c) { return st.sel.has(c.id); }).map(function (c) { return c.id; });
    api('merge', { ids: ids, sep: $('sep').value }).then(function (r) { toast('Copied ' + r.n + ' together. Press ⌘V to paste.'); }, fail);
  };
  $('pinSel').onclick = function () { Promise.all(Array.from(st.sel).map(function (id) { return api('pin', { id: id, on: true }); })).then(function () { st.sel.clear(); load(true); toast('Pinned.'); }, fail); };
  $('delSel').onclick = function () { api('delete', { ids: Array.from(st.sel) }).then(function () { st.sel.clear(); load(true); }, fail); };
  $('noneSel').onclick = function () { st.sel.clear(); render(); };
  $('pauseBtn').onclick = function () { api('pause', { minutes: st.status.pausedUntil > Date.now() ? 0 : 30 }).then(function () { load(true); }, fail); };
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); }
    if (e.key === 'Escape' && st.sel.size) { st.sel.clear(); render(); }
  });
  window.addEventListener('focus', function () { load(); });

  // ── settings ──
  function openSettings() {
    var s = st.status;
    $('max').value = s.max;
    $('key').value = (s.keyLabel || '').replace('⌃', 'ctrl+').replace('⌥', 'option+').replace('⇧', 'shift+').replace('⌘', 'cmd+').toLowerCase();
    $('keySet').hidden = !s.mac;
    $('keepSecrets').checked = !!s.keepSecrets;
    paintApps();
    $('settings').showModal();
  }
  function paintApps() {
    var s = st.status;
    api('list', { limit: 1 }).then(function (r) {
      $('ignored').innerHTML = (s.ignore || []).map(function (b) { return '<button class="off" data-un="' + esc(b) + '" title="Stop ignoring">' + esc(b.replace(/^com\.|^org\.|^in\.|^dev\./, '')) + '</button>'; }).join('') || '<span class="small">None.</span>';
      $('addApps').innerHTML = r.apps.filter(function (a) { return a.bundle && (s.ignore || []).indexOf(a.bundle) < 0; }).map(function (a) { return '<button data-ig="' + esc(a.bundle) + '" title="Ignore copies from it">+ ' + esc(a.app) + '</button>'; }).join('');
    });
  }
  function saveSettings(patch, note) { return api('settings', patch).then(function (r) { st.status = r.status; if (note) toast(note); paintApps(); load(true); return r; }, fail); }
  $('settingsBtn').onclick = openSettings;
  $('setClose').onclick = function () { $('settings').close(); };
  $('maxSave').onclick = function () { saveSettings({ max: Number($('max').value) }, 'Saved.'); };
  $('keySave').onclick = function () { saveSettings({ key: $('key').value }).then(function (r) { if (r) $('keyNote').textContent = r.settings.keyNote ? r.settings.keyNote : 'Saved. If it does nothing, log out and back in once.'; }); };
  $('keepSecrets').onchange = function () { saveSettings({ keepSecrets: this.checked }); };
  $('ignored').onclick = function (e) { var b = e.target.closest('[data-un]'); if (b) saveSettings({ ignore: st.status.ignore.filter(function (x) { return x !== b.dataset.un; }) }); };
  $('addApps').onclick = function (e) { var b = e.target.closest('[data-ig]'); if (b) saveSettings({ ignore: st.status.ignore.concat(b.dataset.ig) }); };
  $('clearAll').onclick = function () { if (confirm('Forget everything you copied? Pinned things stay.')) api('clear', {}).then(function (r) { toast('Forgot ' + r.gone + ' things.'); $('settings').close(); load(true); }, fail); };

  load(true);
  setInterval(function () { if (!document.hidden) load(); }, 2000);
})();
