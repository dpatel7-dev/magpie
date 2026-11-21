/* rooftops.js: city rooftops at the bottom of magpie's window.
 *
 *   always: three rows of roofs, chimneys with smoke, water towers, aerials,
 *   a washing line that swings in the wind, and Pica the magpie hopping
 *   along the roofs, now and then picking up something shiny and flying to
 *   another roof with it.
 *   day (light mode): pigeons flapping past, sunlight glinting off windows.
 *   night (dark mode): windows lighting up and going dark, string lights
 *   between two roofs, stars, the moon, a plane blinking across.
 * The page's own white or black shows through: no painted sky.
 *
 *   Rooftops.start(canvas, { night: () => bool, share: 0.4 })
 */
(function (root) {
  'use strict';
  var PS = root.PixelScene;

  var DAY = {
    far: '#e6e9ef', farWin: '#d5dae3', mid: '#c9cfd9', midWin: '#b2bac7', near: ['#8e98aa', '#9aa4b5', '#a5aebe'], edge: '#6c7588', roof: '#5f6779',
    win: '#6f7d93', glint: '#ffffff', frame: '#7e889a', brick: ['#c2715a', '#a95f4b'], tower: ['#9c6b45', '#7c5236', '#5b3b27'],
    smoke: 'rgba(160,168,182,', star: null, moon: null, string: '#5f6779', bulbs: ['#f2c14e', '#e8604c', '#4fb3a6', '#6a8fe0'],
    pigeon: '#7d8696', sheet: ['#ffffff', '#f2c14e', '#e88aa0', '#7fb2e5'], plant: ['#5b9a5a', '#78b367'], ac: '#b7bfcc', fan: '#8e98aa', shiny: ['#ffd34d', '#e3e9f2', '#7fd6ff'],
  };
  var NIGHT = {
    far: '#141823', farWin: '#2a2e3a', mid: '#1b2030', midWin: '#262c3d', near: ['#232a3b', '#273046', '#2c3550'], edge: '#3a4560', roof: '#151a26',
    win: '#1e2433', glint: null, frame: '#323b52', brick: ['#5a3a35', '#4a302c'], tower: ['#3d2c22', '#2f221a', '#22180f'],
    smoke: 'rgba(110,120,145,', star: ['#ffffff', '#dfe6ff', '#ffe8c2'], moon: ['#f1f0ea', '#d5d6d6', '#bfc3c9'], string: '#3a4560', bulbs: ['#ffd36b', '#ff7a5c', '#6fe3d1', '#8fb2ff'],
    pigeon: '#5a6478', sheet: ['#5b6378', '#6e6450', '#6e5562', '#4e6278'], plant: ['#1f3a2c', '#2a4a37'], ac: '#2f374a', fan: '#45506a', shiny: ['#ffd36b', '#c9d6ff', '#7fe3ff'],
    lit: ['#ffd27a', '#ffc35c', '#ffe7a8', '#ffb347'],
  };
  var PICA = { K: '#15171c', k: '#3a4150', W: '#f7f7f4', w: '#c9ced6', B: '#2f62b8', b: '#6a9be6', G: '#1f7f78', g: '#45bfae', E: '#ffffff', L: '#4a505c', Y: '#59606e' };
  var PICA_NIGHT = { K: '#1c2030', k: '#5a6684', W: '#e8eaf0', w: '#a9b0c0', B: '#3f78d8', b: '#7fb0ff', G: '#2a9a90', g: '#5fd6c4', E: '#ffffff', L: '#5a6684', Y: '#7a849a' };
  // Pica, small enough for the roofs: standing (two frames), hopping, flying (two frames)
  var STAND = [['.....kk.', '....KEKY', '....KKk.', '.kBBKWW.', 'GBBbBWw.', 'g.KKKw..', '...L.L..'],
    ['.....kk.', '....KEKY', '....KKk.', '.kBBKWW.', 'GBBbBWw.', 'g.KKKw..', '..L..L..']];
  var PECK = ['........', '........', '.....kk.', '.kBBKEKY', 'GBBbKKW.', 'g.KKKWw.', '...L.L..'];
  var FLY = [['.b......', '.Bb..kk.', '..BbKEKY', 'GGBBKKW.', 'g..KKw..', '........', '........'],
    ['........', '.....kk.', '..BBKEKY', 'GGBbKKW.', 'g.BbKw..', '.Bb.....', '........']];
  var PIGEON = [['X.X', '.X.'], ['...', 'XXX']];

  function start(cv, opts) {
    opts = opts || {};
    var share = opts.share || 0.4;
    var A = { pica: null, pigeons: [], plane: null, smoke: [], timers: { pigeon: 4, plane: 30 } };

    function build(o) {
      var W = o.W, H = o.H, rnd = o.rnd, P = o.night ? NIGHT : DAY;
      var top = Math.round(H * (1 - share));
      var span = H - top;
      // the far rows: one picture each
      var back = PS.canvas(W, H), g = back.getContext('2d');
      function row(base, minH, maxH, color, winColor, step, lit) {
        var x = -4, blocks = [];
        while (x < W + 4) {
          var w = 10 + Math.floor(rnd() * step), h = Math.round(span * (minH + rnd() * (maxH - minH)));
          g.fillStyle = color; g.fillRect(x, H - h, w, h);
          if (rnd() < 0.3) { var cw = 2 + Math.floor(rnd() * 3); g.fillRect(x + 2 + Math.floor(rnd() * (w - 6)), H - h - 3, cw, 3); }
          if (rnd() < 0.15) { g.fillRect(x + Math.floor(w / 2), H - h - 7, 1, 7); }
          for (var wy = H - h + 3; wy < H - 2; wy += 4) for (var wx = x + 2; wx < x + w - 2; wx += 3) {
            if (rnd() < 0.55) { g.fillStyle = lit && rnd() < 0.18 ? lit[Math.floor(rnd() * lit.length)] : winColor; g.fillRect(wx, wy, 1, 2); }
          }
          g.fillStyle = color;
          blocks.push({ x: x, w: w, h: h });
          x += w + (rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0);
        }
        return blocks;
      }
      row(H, 0.55, 0.95, P.far, P.farWin, 14, o.night ? NIGHT.lit.map(function (c) { return c + '88'; }) : null);
      row(H, 0.35, 0.7, P.mid, P.midWin, 18, o.night ? NIGHT.lit : null);
      // the near roofs: Pica walks on these
      var roofs = [], x = -2;
      while (x < W + 2) {
        var w = 26 + Math.floor(rnd() * 34), h = Math.round(span * (0.16 + rnd() * 0.22));
        roofs.push({ x: x, w: w, y: H - h, c: P.near[Math.floor(rnd() * P.near.length)] });
        x += w + (rnd() < 0.5 ? 2 + Math.floor(rnd() * 5) : 0);
      }
      // windows on the near walls (night: some light up and go dark)
      var wins = [];
      roofs.forEach(function (r) {
        for (var wy = r.y + 5; wy < H - 3; wy += 6) for (var wx = r.x + 3; wx < r.x + r.w - 4; wx += 6) {
          if (rnd() < 0.7) wins.push({ x: wx, y: wy, on: o.night && rnd() < 0.35, flip: 4 + rnd() * 40, c: o.night ? NIGHT.lit[Math.floor(rnd() * 4)] : P.win });
        }
      });
      // things on the roofs
      var things = [];
      roofs.forEach(function (r, i) {
        var t = rnd();
        if (t < 0.28 && r.w > 30) things.push({ k: 'tower', x: r.x + 6 + Math.floor(rnd() * (r.w - 22)), y: r.y });
        else if (t < 0.55) things.push({ k: 'chimney', x: r.x + 3 + Math.floor(rnd() * (r.w - 10)), y: r.y, h: 4 + Math.floor(rnd() * 4) });
        else if (t < 0.7) things.push({ k: 'ac', x: r.x + 4 + Math.floor(rnd() * (r.w - 14)), y: r.y });
        else if (t < 0.85) things.push({ k: 'plants', x: r.x + 3, y: r.y, w: Math.min(16, r.w - 6) });
        if (rnd() < 0.35) things.push({ k: 'aerial', x: r.x + r.w - 6, y: r.y });
        if (i > 0 && rnd() < 0.5 && !o.night) things.push({ k: 'line', a: roofs[i - 1], b: r });
        if (i > 0 && o.night && rnd() < 0.45) things.push({ k: 'lights', a: roofs[i - 1], b: r });
      });
      // shiny things to find
      var shiny = roofs.filter(function () { return rnd() < 0.5; }).map(function (r) { return { x: r.x + 4 + Math.floor(rnd() * Math.max(1, r.w - 8)), y: r.y - 1, c: P.shiny[Math.floor(rnd() * P.shiny.length)], got: false }; });
      var stars = [];
      if (o.night) for (var n = 0; n < W * top / 260; n++) stars.push({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * top * 0.9), c: P.star[Math.floor(rnd() * 3)], tw: rnd() * 6, big: rnd() < 0.06 });
      var smokes = things.filter(function (t) { return t.k === 'chimney'; });
      A = { pica: null, pigeons: [], plane: null, smoke: [], timers: { pigeon: 3 + rnd() * 5, plane: 12 + rnd() * 20 } };
      return { P: P, top: top, back: back, roofs: roofs, wins: wins, things: things, shiny: shiny, stars: stars, smokes: smokes, rnd: rnd, moon: { x: Math.round(W * 0.82), y: Math.round(top * 0.35) } };
    }

    function roofAt(S, x) { for (var i = 0; i < S.roofs.length; i++) { var r = S.roofs[i]; if (x >= r.x && x < r.x + r.w) return r; } return null; }

    function draw(g, S, t, dt) {
      var P = S.P, W = S.W, H = S.H;
      // the sky: stars and the moon at night (the page shows through)
      S.stars.forEach(function (s) {
        var a = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.8 + s.tw));
        g.globalAlpha = a; g.fillStyle = s.c; g.fillRect(s.x, s.y, 1, 1);
        if (s.big && a > 0.8) { g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3); }
      });
      g.globalAlpha = 1;
      if (S.night) {
        var mx = S.moon.x, my = S.moon.y;
        g.fillStyle = P.moon[0]; g.fillRect(mx - 2, my - 4, 5, 9); g.fillRect(mx - 4, my - 2, 9, 5); g.fillRect(mx - 3, my - 3, 7, 7);
        g.fillStyle = P.moon[1]; g.fillRect(mx + 1, my - 1, 2, 2); g.fillStyle = P.moon[2]; g.fillRect(mx - 2, my + 1, 1, 1);
      }
      // a plane at night, pigeons by day
      A.timers.plane -= dt;
      if (S.night && !A.plane && A.timers.plane < 0) { A.plane = { x: -4, y: 4 + S.rnd() * S.top * 0.5, v: 7 + S.rnd() * 5 }; A.timers.plane = 40 + S.rnd() * 60; }
      if (A.plane) {
        A.plane.x += A.plane.v * dt;
        g.fillStyle = '#9aa3b8'; g.fillRect(A.plane.x, A.plane.y, 2, 1);
        if (Math.floor(t * 2) % 2) { g.fillStyle = '#ff5f5f'; g.fillRect(A.plane.x + 2, A.plane.y, 1, 1); }
        if (A.plane.x > W + 4) A.plane = null;
      }
      A.timers.pigeon -= dt;
      if (!S.night && A.timers.pigeon < 0) {
        var dir = S.rnd() < 0.5 ? 1 : -1;
        for (var k = 0; k < 1 + Math.floor(S.rnd() * 3); k++) A.pigeons.push({ x: dir > 0 ? -6 - k * 5 : W + 6 + k * 5, y: S.top * (0.3 + S.rnd() * 0.5) + k * 2, v: dir * (14 + S.rnd() * 8), ph: S.rnd() * 6 });
        A.timers.pigeon = 6 + S.rnd() * 12;
      }
      A.pigeons = A.pigeons.filter(function (p) {
        p.x += p.v * dt; p.y += Math.sin(t * 3 + p.ph) * 0.05;
        PS.sprite(g, PIGEON[Math.floor(t * 6 + p.ph) % 2], p.x, p.y, { X: P.pigeon });
        return p.x > -10 && p.x < W + 10;
      });
      g.drawImage(S.back, 0, 0);
      // near roofs and walls
      S.roofs.forEach(function (r) {
        g.fillStyle = r.c; g.fillRect(r.x, r.y, r.w, H - r.y);
        g.fillStyle = P.edge; g.fillRect(r.x - 1, r.y, r.w + 2, 1);
        g.fillStyle = P.roof; g.fillRect(r.x - 1, r.y + 1, r.w + 2, 1);
      });
      S.wins.forEach(function (w) {
        if (S.night) { w.flip -= dt; if (w.flip < 0) { w.on = !w.on; w.flip = 8 + S.rnd() * 50; } }
        g.fillStyle = S.night ? (w.on ? w.c : P.win) : P.win;
        g.fillRect(w.x, w.y, 3, 3);
        g.fillStyle = P.frame; g.fillRect(w.x + 1, w.y, 1, 3);
        if (!S.night && ((t * 0.4 + w.x * 0.07) % 9) < 0.25) { g.fillStyle = P.glint; g.fillRect(w.x + 2, w.y, 1, 1); }
      });
      // things on the roofs
      var wind = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.3;
      S.things.forEach(function (o) {
        if (o.k === 'tower') {
          var c = P.tower;
          g.fillStyle = c[2]; g.fillRect(o.x + 1, o.y - 4, 1, 4); g.fillRect(o.x + 8, o.y - 4, 1, 4); g.fillRect(o.x + 1, o.y - 3, 8, 1);
          g.fillStyle = c[0]; g.fillRect(o.x, o.y - 12, 10, 8);
          g.fillStyle = c[1]; for (var b = 0; b < 3; b++) g.fillRect(o.x, o.y - 11 + b * 3, 10, 1);
          g.fillStyle = c[2]; g.fillRect(o.x + 1, o.y - 14, 8, 2); g.fillRect(o.x + 3, o.y - 15, 4, 1);
        } else if (o.k === 'chimney') {
          g.fillStyle = P.brick[0]; g.fillRect(o.x, o.y - o.h, 4, o.h);
          g.fillStyle = P.brick[1]; g.fillRect(o.x - 1, o.y - o.h, 6, 1); g.fillRect(o.x + 1, o.y - o.h + 2, 2, 1);
          if (S.rnd() < dt * 1.5) A.smoke.push({ x: o.x + 1.5, y: o.y - o.h - 1, life: 0, max: 3 + S.rnd() * 2 });
        } else if (o.k === 'ac') {
          g.fillStyle = P.ac; g.fillRect(o.x, o.y - 5, 8, 5);
          g.fillStyle = P.fan; var f = Math.floor(t * 12) % 2; g.fillRect(o.x + 2, o.y - 4 + f, 3, 1); g.fillRect(o.x + 3, o.y - 5 + 2 - f, 1, 3);
        } else if (o.k === 'plants') {
          for (var p = 0; p < o.w; p += 3) { g.fillStyle = P.plant[p % 2]; var ph = Math.round(Math.sin(t * 1.3 + p) * 0.6 + wind * 0.5); g.fillRect(o.x + p + ph, o.y - 3, 2, 2); g.fillRect(o.x + p, o.y - 1, 2, 1); }
        } else if (o.k === 'aerial') {
          g.fillStyle = P.edge; g.fillRect(o.x, o.y - 9, 1, 9); g.fillRect(o.x - 3, o.y - 8, 7, 1); g.fillRect(o.x - 2, o.y - 6, 5, 1);
          if (S.night && Math.floor(t) % 2) { g.fillStyle = '#ff5f5f'; g.fillRect(o.x, o.y - 10, 1, 1); }
        } else if (o.k === 'line' || o.k === 'lights') {
          var ax = o.a.x + o.a.w - 3, ay = o.a.y - 6, bx = o.b.x + 3, by = o.b.y - 6;
          g.fillStyle = P.edge; g.fillRect(ax, ay, 1, 6); g.fillRect(bx, by, 1, 6);
          var n = Math.max(2, Math.round(bx - ax));
          for (var i = 0; i <= n; i++) {
            var u = i / n, sag = Math.sin(Math.PI * u) * (3 + (o.k === 'line' ? wind : 0) * 0.8);
            var lx = ax + (bx - ax) * u, ly = ay + (by - ay) * u + sag;
            g.fillStyle = P.string; g.fillRect(lx, ly, 1, 1);
            if (o.k === 'lights' && i % 4 === 2) { var on = Math.sin(t * 1.5 + i) > -0.6; g.fillStyle = on ? P.bulbs[(i / 4 | 0) % 4] : P.string; g.fillRect(lx, ly + 1, 1, 1); if (on) { g.globalAlpha = 0.25; g.fillRect(lx - 1, ly, 3, 3); g.globalAlpha = 1; } }
            if (o.k === 'line' && i % 6 === 3 && i < n - 2) { var sw = Math.round(wind * 1.2); g.fillStyle = P.sheet[(i / 6 | 0) % 4]; g.fillRect(lx + sw * 0.5, ly + 1, 3, 4 + (i % 2)); }
          }
        }
      });
      // smoke drifting with the wind
      A.smoke = A.smoke.filter(function (s) {
        s.life += dt; s.y -= dt * 3; s.x += dt * (1.5 + wind);
        g.fillStyle = P.smoke + (0.5 * (1 - s.life / s.max)).toFixed(2) + ')';
        var r = 1 + Math.floor(s.life);
        g.fillRect(s.x, s.y, r, r);
        return s.life < s.max;
      });
      // shiny things
      S.shiny.forEach(function (s) {
        if (s.got) return;
        g.fillStyle = s.c; g.fillRect(s.x, s.y, 1, 1);
        if (((t * 0.9 + s.x * 0.13) % 3) < 0.35) { g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3); }
      });
      pica(g, S, t, dt);
    }

    // Pica: hops along a roof, pecks at shiny things, flies to another roof
    function pica(g, S, t, dt) {
      var ink = S.night ? PICA_NIGHT : PICA;
      if (!A.pica) {
        var r0 = S.roofs[Math.floor(S.roofs.length * 0.6)] || S.roofs[0];
        if (!r0) return;
        A.pica = { x: r0.x + r0.w / 2, y: r0.y - 7, dir: -1, mode: 'walk', wait: 2, frame: 0, hop: 0 };
      }
      var p = A.pica;
      var under = roofAt(S, p.x + 4);
      p.wait -= dt;
      if (p.mode === 'walk') {
        p.hop += dt;
        if (p.hop > 0.35) { p.hop = 0; p.x += p.dir * 2; p.frame ^= 1; }
        var want = S.shiny.filter(function (s) { return !s.got && under && s.x >= under.x && s.x < under.x + under.w; })[0];
        if (want && Math.abs(want.x - (p.x + 4)) < 2) { p.mode = 'peck'; p.wait = 1.2; p.target = want; }
        else if (want) p.dir = want.x > p.x + 4 ? 1 : -1;
        if (!under || p.x < under.x - 2 || p.x + 8 > under.x + under.w + 2 || (p.wait < 0 && S.rnd() < dt * 0.15)) {
          var dest = S.roofs[Math.floor(S.rnd() * S.roofs.length)];
          p.mode = 'fly'; p.from = { x: p.x, y: p.y }; p.to = { x: dest.x + 4 + S.rnd() * Math.max(1, dest.w - 16), y: dest.y - 7 }; p.u = 0; p.dir = p.to.x > p.x ? 1 : -1;
        }
        if (p.wait < 0) p.wait = 3 + S.rnd() * 5;
      } else if (p.mode === 'peck') {
        if (p.wait < 0) { if (p.target) p.target.got = true; p.target = null; p.mode = 'walk'; p.wait = 2; if (S.shiny.every(function (s) { return s.got; })) S.shiny.forEach(function (s) { s.got = false; }); }
      } else if (p.mode === 'fly') {
        var d = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) || 1;
        p.u = Math.min(1, p.u + dt * 28 / d);
        p.x = p.from.x + (p.to.x - p.from.x) * p.u;
        p.y = p.from.y + (p.to.y - p.from.y) * p.u - Math.sin(Math.PI * p.u) * Math.min(18, d * 0.4);
        if (p.u >= 1) { p.mode = 'walk'; p.wait = 3; }
      }
      var flip = p.dir < 0;
      var pic = p.mode === 'fly' ? FLY[Math.floor(t * 8) % 2] : p.mode === 'peck' ? (Math.floor(t * 5) % 2 ? PECK : STAND[0]) : STAND[p.frame];
      PS.sprite(g, pic, p.x, p.y, ink, flip);
    }

    return PS.start(cv, { night: opts.night, build: build, draw: draw, fps: opts.fps || 20 });
  }

  root.Rooftops = { start: start };
})(window);
