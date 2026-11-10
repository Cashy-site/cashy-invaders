/* Cashy Invaders
 * Cashy throws cash at the rival coins. Plain canvas, no libraries, no build step.
 * Game area is 706 x 720 so it drops straight into the same frame as Cashy Tower.
 */
(() => {
  "use strict";

  // ───────────────────────── setup ─────────────────────────
  const W = 706;
  const H = 720;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COL = {
    ink: "#05070d",
    night: "#0b1330",
    dusk: "#141f52",
    blue: "#024ff6",
    blueLit: "#3b7bff",
    cyan: "#27e7ff",
    paper: "#f2f4f8",
    mist: "#aab4d4",
    note: "#a9dd8c",
    noteDark: "#2f6b3a",
  };
  const HEAD = "Cynatar, system-ui, sans-serif";
  const BODY = '"Noto Sans", system-ui, sans-serif';

  // Layout numbers
  const GROUND_Y = 690; // Cashy's feet
  const PLAYER_H = 100;
  const PLAYER_TOP = GROUND_Y - PLAYER_H;
  const SHIELD_Y = 506;
  const CELL = 4;

  // Tuning
  const START_LIVES = 3;
  const MAX_LIVES = 5;
  const PLAYER_SPEED = 340;
  const THROW_COOLDOWN = 0.3;
  const MAX_CASH = 3;
  const EXTRA_LIFE_EVERY = 2500;
  const COLS = 9;
  const ROWS = 5;
  const GAP_X = 56;
  const GAP_Y = 46;
  const COIN_R = 17;

  // ───────────────────────── storage (always wrapped, it can throw) ─────────────────────────
  const store = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch {
        /* private window or blocked storage: carry on without it */
      }
    },
  };

  // ───────────────────────── images ─────────────────────────
  const img = {};
  function loadImage(name, src) {
    return new Promise((resolve) => {
      const i = new Image();
      i.onload = () => {
        img[name] = i;
        resolve();
      };
      i.onerror = () => resolve(); // game still runs without the art
      i.src = src;
    });
  }

  // ───────────────────────── sound ─────────────────────────
  let actx = null;
  let muted = store.get("cashy-invaders-muted", "0") === "1";
  function audio() {
    if (!actx) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (Ctor) actx = new Ctor();
      } catch {
        actx = null;
      }
    }
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }
  function tone(freq, dur, type = "square", vol = 0.05, slideTo = null, delay = 0) {
    if (muted || !actx) return;
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  const sfx = {
    start() {
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.11, "square", 0.04, null, i * 0.08));
    },
    throw() {
      tone(480, 0.1, "triangle", 0.05, 900);
    },
    pop() {
      tone(320, 0.13, "square", 0.045, 80);
    },
    ufo() {
      tone(900, 0.08, "sine", 0.05, 1400);
      tone(1400, 0.12, "sine", 0.05, 700, 0.08);
    },
    hurt() {
      tone(170, 0.45, "sawtooth", 0.07, 40);
    },
    shield() {
      tone(140, 0.07, "square", 0.03, 70);
    },
    wave() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.13, "square", 0.04, null, i * 0.1));
    },
    life() {
      [659, 880, 1175].forEach((f, i) => tone(f, 0.1, "triangle", 0.05, null, i * 0.07));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "sawtooth", 0.05, null, i * 0.2));
    },
  };

  const muteBtn = document.getElementById("mute");
  function syncMuteButton() {
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Sound off" : "Sound on");
  }
  function toggleMute() {
    muted = !muted;
    store.set("cashy-invaders-muted", muted ? "1" : "0");
    syncMuteButton();
    if (!muted) {
      audio();
      tone(660, 0.08, "triangle", 0.05);
    }
  }
  muteBtn.addEventListener("click", () => {
    toggleMute();
    muteBtn.blur();
  });
  syncMuteButton();

  // ───────────────────────── random ─────────────────────────
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  // ───────────────────────── background ─────────────────────────
  // The sky and skyline never change, so they are painted once.
  const bg = document.createElement("canvas");
  bg.width = W * DPR;
  bg.height = H * DPR;
  (function paintBackground() {
    const c = bg.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COL.ink);
    g.addColorStop(0.62, COL.night);
    g.addColorStop(1, COL.dusk);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    const r = mulberry32(8453);
    let x = -10;
    while (x < W + 10) {
      const bw = 34 + Math.floor(r() * 46);
      const bh = 70 + Math.floor(r() * 150);
      const top = GROUND_Y + 2 - bh;
      c.fillStyle = r() < 0.5 ? "#0b1330" : "#0e1840";
      c.fillRect(x, top, bw, bh);
      for (let wy = top + 10; wy < GROUND_Y - 8; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          const roll = r();
          if (roll < 0.16) {
            c.fillStyle = "#1c2f7a";
            c.fillRect(wx, wy, 5, 7);
          } else if (roll < 0.19) {
            c.fillStyle = "#27e7ff";
            c.globalAlpha = 0.45;
            c.fillRect(wx, wy, 5, 7);
            c.globalAlpha = 1;
          }
        }
      }
      x += bw + 3 + Math.floor(r() * 8);
    }
    // darken the bottom so the street reads as the stage
    const fade = c.createLinearGradient(0, GROUND_Y - 120, 0, H);
    fade.addColorStop(0, "rgba(5,7,13,0)");
    fade.addColorStop(1, "rgba(5,7,13,0.78)");
    c.fillStyle = fade;
    c.fillRect(0, GROUND_Y - 120, W, H - (GROUND_Y - 120));
  })();

  const stars = Array.from({ length: 70 }, (_, i) => {
    const r = mulberry32(i * 97 + 3);
    return { x: r() * W, y: r() * (GROUND_Y - 220), s: 0.6 + r() * 1.4, p: r() * 6.28, sp: 0.6 + r() * 1.6 };
  });

  // ───────────────────────── game state ─────────────────────────
  const G = {
    state: "title", // title | play | pause | over
    t: 0,
    score: 0,
    best: Number(store.get("cashy-invaders-best", "0")) || 0,
    newBest: false,
    lives: START_LIVES,
    wave: 1,
    nextLife: EXTRA_LIFE_EVERY,
    freeze: 0, // short pause after Cashy is hit
    intro: 0, // "WAVE n" card at the start of each wave
    banner: 0, // wave cleared card
    shake: 0,
    overT: 0,
    overReason: "",
  };

  const player = { x: W / 2, cool: 0, throwT: 0, invuln: 0, buffer: 0 };
  let enemies = [];
  let fleet = { dir: 1, stepT: 0, frame: 0, fireT: 1.2 };
  let cash = [];
  let bolts = [];
  let shields = [];
  let particles = [];
  let popups = [];
  const ufo = { active: false, x: 0, dir: 1, nextIn: rand(12, 20), seed: 0 };

  // ───────────────────────── shields ─────────────────────────
  function makeShield(cx) {
    const cols = 16;
    const rows = 12;
    const cells = new Uint8Array(cols * rows);
    const off = document.createElement("canvas");
    off.width = cols * CELL;
    off.height = rows * CELL;
    const c = off.getContext("2d");
    const shades = [COL.blue, "#0a5cff", "#1a66ff"];
    const r = mulberry32(Math.floor(cx) + 11);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const trim = [3, 2, 1, 0][y];
        if (y < 4 && (x < trim || x >= cols - trim)) continue;
        if (y >= 9 && x >= 5 && x <= 10) continue;
        cells[y * cols + x] = 1;
        c.fillStyle = shades[Math.floor(r() * shades.length)];
        c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    return { x: cx - (cols * CELL) / 2, y: SHIELD_Y, w: cols * CELL, h: rows * CELL, cols, rows, cells, off, c };
  }
  function buildShields() {
    shields = [1, 3, 5, 7].map((n) => makeShield((W * n) / 8));
  }
  function carve(s, px, py, radius) {
    // Remove cells around a point, a little ragged at the edge.
    const cx = (px - s.x) / CELL;
    const cy = (py - s.y) / CELL;
    const rc = radius / CELL;
    for (let y = Math.max(0, Math.floor(cy - rc)); y <= Math.min(s.rows - 1, Math.ceil(cy + rc)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rc)); x <= Math.min(s.cols - 1, Math.ceil(cx + rc)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < rc - 0.6 || (d < rc && Math.random() < 0.6)) {
          if (s.cells[y * s.cols + x]) {
            s.cells[y * s.cols + x] = 0;
            s.c.clearRect(x * CELL, y * CELL, CELL, CELL);
          }
        }
      }
    }
  }
  function solidAt(s, px, py) {
    if (px < s.x || py < s.y || px >= s.x + s.w || py >= s.y + s.h) return false;
    const x = Math.floor((px - s.x) / CELL);
    const y = Math.floor((py - s.y) / CELL);
    return s.cells[y * s.cols + x] === 1;
  }
  // Walk the path a thing took this frame so quick shots can't skip through a thin wall.
  function shieldHit(x, y0, y1, radius) {
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 3));
    for (let i = 0; i <= steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      for (const s of shields) {
        if (solidAt(s, x, y)) {
          carve(s, x, y, radius);
          return true;
        }
      }
    }
    return false;
  }
  function crushShieldsUnder(e) {
    for (const s of shields) {
      if (e.x + COIN_R < s.x || e.x - COIN_R > s.x + s.w || e.y + COIN_R < s.y || e.y - COIN_R > s.y + s.h) continue;
      carve(s, e.x, e.y, COIN_R + 6);
    }
  }

  // ───────────────────────── waves ─────────────────────────
  function spawnWave() {
    enemies = [];
    const startY = 128 + Math.min(G.wave - 1, 5) * 16;
    const startX = (W - (COLS - 1) * GAP_X) / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        enemies.push({
          x: startX + c * GAP_X,
          y: startY + r * GAP_Y,
          col: c,
          row: r,
          type: r === 0 ? 0 : r < 3 ? 1 : 2,
          points: r === 0 ? 30 : r < 3 ? 20 : 10,
          alive: true,
        });
      }
    }
    fleet = { dir: 1, stepT: 0, frame: 0, fireT: 1.4 };
    cash = [];
    bolts = [];
    buildShields();
    G.intro = 1.4;
  }

  function startGame() {
    G.score = 0;
    G.newBest = false;
    G.lives = START_LIVES;
    G.wave = 1;
    G.nextLife = EXTRA_LIFE_EVERY;
    G.freeze = 0;
    G.banner = 0;
    G.shake = 0;
    player.x = W / 2;
    player.cool = 0;
    player.invuln = 0;
    player.buffer = 0;
    particles = [];
    popups = [];
    ufo.active = false;
    ufo.nextIn = rand(12, 20);
    spawnWave();
    G.state = "play";
    sfx.start();
  }

  function gameOver(reason) {
    G.state = "over";
    G.overT = 0;
    G.overReason = reason;
    if (G.score > G.best) {
      G.best = G.score;
      G.newBest = true;
      store.set("cashy-invaders-best", G.best);
    }
    sfx.over();
  }

  // ───────────────────────── input ─────────────────────────
  const keys = new Set();
  const touch = { left: false, right: false, fire: false };
  const normKey = (k) => (k === " " || k === "Spacebar" ? "space" : k.toLowerCase());

  function primary() {
    // Space / Enter / tap
    audio();
    if (G.state === "title") startGame();
    else if (G.state === "over" && G.overT > 0.8) startGame();
    else if (G.state === "pause") G.state = "play";
  }
  function togglePause() {
    if (G.state === "play") G.state = "pause";
    else if (G.state === "pause") G.state = "play";
  }

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = normKey(e.key);
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "space"].includes(k)) e.preventDefault();
    const fresh = !keys.has(k);
    keys.add(k);
    if (!fresh) return;
    // Buffer a throw only if we're already playing, so starting or unpausing never throws.
    if (G.state === "play" && (k === "space" || k === "arrowup" || k === "w")) player.buffer = 0.14;
    if (k === "space" || k === "enter") primary();
    else if (k === "p" || k === "escape") togglePause();
    else if (k === "m") toggleMute();
    else audio();
  });
  window.addEventListener("keyup", (e) => keys.delete(normKey(e.key)));

  function releaseAll() {
    keys.clear();
    touch.left = touch.right = touch.fire = false;
    document.querySelectorAll("#touch button.down").forEach((b) => b.classList.remove("down"));
  }
  window.addEventListener("blur", () => {
    releaseAll();
    if (G.state === "play") G.state = "pause";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseAll();
      if (G.state === "play") G.state = "pause";
    }
  });

  canvas.addEventListener("pointerdown", () => {
    audio();
    if (G.state === "title" || G.state === "over" || G.state === "pause") primary();
  });

  document.querySelectorAll("#touch button").forEach((btn) => {
    const key = btn.dataset.key;
    const down = (e) => {
      e.preventDefault();
      audio();
      touch[key] = true;
      if (key === "fire" && G.state === "play") player.buffer = 0.14;
      btn.classList.add("down");
      if (G.state !== "play") primary();
    };
    const up = (e) => {
      e.preventDefault();
      touch[key] = false;
      btn.classList.remove("down");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  const wantsLeft = () => keys.has("arrowleft") || keys.has("a") || touch.left;
  const wantsRight = () => keys.has("arrowright") || keys.has("d") || touch.right;
  const wantsFire = () => keys.has("space") || keys.has("arrowup") || keys.has("w") || touch.fire;

  // ───────────────────────── effects ─────────────────────────
  function burst(x, y, colour, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 220);
      const money = i % 3 === 0;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: rand(0.45, 0.9),
        max: 0.9,
        col: money ? COL.note : colour,
        w: money ? 9 : rand(3, 5),
        h: money ? 5 : rand(3, 5),
        rot: Math.random() * 6.28,
        vr: rand(-9, 9),
      });
    }
  }
  function popup(x, y, text, colour = COL.paper) {
    popups.push({ x, y, text, life: 1.1, col: colour });
  }
  function addScore(n) {
    G.score += n;
    if (G.score >= G.nextLife) {
      G.nextLife += EXTRA_LIFE_EVERY;
      if (G.lives < MAX_LIVES) {
        G.lives++;
        popup(player.x, PLAYER_TOP - 10, "EXTRA LIFE", COL.cyan);
        sfx.life();
      }
    }
  }

  // ───────────────────────── update ─────────────────────────
  function aliveEnemies() {
    let n = 0;
    for (const e of enemies) if (e.alive) n++;
    return n;
  }

  function stepFleet() {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x);
    }
    const dx = 9 + Math.min(G.wave, 6);
    const nextMin = minX + fleet.dir * dx - COIN_R;
    const nextMax = maxX + fleet.dir * dx + COIN_R;
    if (nextMin < 12 || nextMax > W - 12) {
      for (const e of enemies) if (e.alive) e.y += 20;
      fleet.dir *= -1;
    } else {
      for (const e of enemies) if (e.alive) e.x += fleet.dir * dx;
    }
    fleet.frame = 1 - fleet.frame;
    for (const e of enemies) {
      if (!e.alive) continue;
      crushShieldsUnder(e);
      if (e.y + COIN_R + 8 >= PLAYER_TOP + 10) {
        gameOver("The rival coins reached the street.");
        return;
      }
    }
    tone(110 + (fleet.frame ? 0 : 18), 0.05, "square", 0.018);
  }

  function fireBolt() {
    const cols = new Map();
    for (const e of enemies) {
      if (!e.alive) continue;
      const cur = cols.get(e.col);
      if (!cur || e.y > cur.y) cols.set(e.col, e);
    }
    if (!cols.size) return;
    const shooters = [...cols.values()];
    let pick;
    if (Math.random() < 0.4) {
      pick = shooters.reduce((a, b) => (Math.abs(a.x - player.x) < Math.abs(b.x - player.x) ? a : b));
    } else {
      pick = shooters[Math.floor(Math.random() * shooters.length)];
    }
    bolts.push({ x: pick.x, y: pick.y + COIN_R, vy: 215 + G.wave * 14, ph: Math.random() * 6.28 });
  }

  function hurtPlayer() {
    if (player.invuln > 0 || G.freeze > 0) return;
    G.lives--;
    burst(player.x, GROUND_Y - 40, COL.paper, 26);
    if (!reduceMotion) G.shake = 14;
    sfx.hurt();
    bolts = [];
    if (G.lives <= 0) {
      gameOver("Out of lives.");
    } else {
      player.invuln = 2;
      G.freeze = 0.55;
    }
  }

  function updateWorld(dt) {
    // particles and popups always move
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
      p.rot += p.vr * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) {
      p.life -= dt;
      p.y -= 28 * dt;
    }
    popups = popups.filter((p) => p.life > 0);
    G.shake = Math.max(0, G.shake - 40 * dt);
  }

  function updatePlay(dt) {
    if (G.freeze > 0) {
      G.freeze -= dt;
      return;
    }

    // Cashy
    const dir = (wantsRight() ? 1 : 0) - (wantsLeft() ? 1 : 0);
    player.x = Math.min(W - 34, Math.max(34, player.x + dir * PLAYER_SPEED * dt));
    player.cool -= dt;
    player.throwT -= dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.buffer = Math.max(0, player.buffer - dt);
    if ((wantsFire() || player.buffer > 0) && player.cool <= 0 && cash.length < MAX_CASH && G.banner <= 0) {
      player.buffer = 0;
      cash.push({ x: player.x + 6, y: GROUND_Y - 74, vy: -580, rot: 0, vr: (Math.random() < 0.5 ? -1 : 1) * rand(6, 10) });
      player.cool = THROW_COOLDOWN;
      player.throwT = 0.14;
      sfx.throw();
    }

    // Wave cleared card
    if (G.banner > 0) {
      G.banner -= dt;
      if (G.banner <= 0) {
        G.wave++;
        spawnWave();
      }
    }

    // Cash in the air
    for (const b of cash) {
      const prevTip = b.y - 8;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.dead = false;

      if (shieldHit(b.x, prevTip, b.y - 8, 9)) {
        b.dead = true;
        sfx.shield();
        continue;
      }
      if (ufo.active && Math.abs(b.x - ufo.x) < 34 && Math.abs(b.y - 78) < 18) {
        const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
        addScore(pts);
        popup(ufo.x, 70, "+" + pts, COL.cyan);
        burst(ufo.x, 78, COL.cyan, 22);
        ufo.active = false;
        ufo.nextIn = rand(14, 26);
        b.dead = true;
        sfx.ufo();
        continue;
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < COIN_R + 7) {
          e.alive = false;
          b.dead = true;
          addScore(e.points);
          burst(e.x, e.y, e.type === 0 ? COL.paper : e.type === 1 ? COL.cyan : COL.blueLit);
          sfx.pop();
          break;
        }
      }
      if (b.y < -20) b.dead = true;
    }
    cash = cash.filter((b) => !b.dead);

    // Wave over?
    const left = aliveEnemies();
    if (left === 0 && G.banner <= 0 && G.state === "play") {
      G.banner = 1.7;
      sfx.wave();
    }

    // Rival coins
    if (G.intro > 0) {
      G.intro -= dt;
    } else if (left > 0 && G.banner <= 0) {
      const k = left / (COLS * ROWS);
      const interval = Math.max(0.03, (0.04 + 0.56 * k) / (1 + 0.1 * (G.wave - 1)));
      fleet.stepT += dt;
      if (fleet.stepT >= interval) {
        fleet.stepT = 0;
        stepFleet();
        if (G.state !== "play") return;
      }
      fleet.fireT -= dt;
      const cap = 3 + Math.min(G.wave, 4);
      if (fleet.fireT <= 0 && bolts.length < cap) {
        fireBolt();
        fleet.fireT = Math.max(0.3, 1.05 - G.wave * 0.06) * (0.6 + Math.random() * 0.8);
      }
    }

    // Rival bolts
    for (const b of bolts) {
      const prev = b.y;
      b.y += b.vy * dt;
      b.dead = false;
      if (shieldHit(b.x, prev + 8, b.y + 8, 12)) {
        b.dead = true;
        sfx.shield();
        continue;
      }
      if (Math.abs(b.x - player.x) < 18 && b.y + 8 > PLAYER_TOP + 18 && b.y - 8 < GROUND_Y - 2) {
        b.dead = true;
        hurtPlayer();
        if (G.state !== "play") return;
        continue;
      }
      if (b.y > H) b.dead = true;
    }
    bolts = bolts.filter((b) => !b.dead);

    // Bonus MSTR saucer
    if (ufo.active) {
      ufo.x += ufo.dir * 130 * dt;
      if (ufo.x < -50 || ufo.x > W + 50) {
        ufo.active = false;
        ufo.nextIn = rand(14, 26);
      }
    } else if (G.intro <= 0 && G.banner <= 0 && left > 8) {
      ufo.nextIn -= dt;
      if (ufo.nextIn <= 0) {
        ufo.active = true;
        ufo.dir = Math.random() < 0.5 ? 1 : -1;
        ufo.x = ufo.dir === 1 ? -40 : W + 40;
      }
    }
  }

  function update(dt) {
    G.t += dt;
    if (G.state === "pause") return;
    updateWorld(dt);
    if (G.state === "play") updatePlay(dt);
    else if (G.state === "over") G.overT += dt;
  }

  // ───────────────────────── drawing helpers ─────────────────────────
  function text(str, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ""} ${o.size || 16}px ${o.font || BODY}`.trim();
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "alphabetic";
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.blur || 18;
    }
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || 6;
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = "round";
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || COL.paper;
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function drawCoin(e, frame, playerX) {
    const { x, y, type } = e;
    const palettes = [
      { rim: COL.paper, mid: "#26356f", edge: "#0b1330" },
      { rim: COL.cyan, mid: "#123a7a", edge: "#0b1330" },
      { rim: COL.blueLit, mid: "#10286e", edge: "#0b1330" },
    ];
    const p = palettes[type];
    const bob = frame ? 1 : -1;
    const cy = y + bob * 0.8;
    ctx.save();

    // little legs, they shuffle with each step
    ctx.strokeStyle = p.rim;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 7, cy + COIN_R - 2);
    ctx.lineTo(x - 10 + (frame ? 3 : 0), cy + COIN_R + 6);
    ctx.moveTo(x + 7, cy + COIN_R - 2);
    ctx.lineTo(x + 10 - (frame ? 3 : 0), cy + COIN_R + 6);
    ctx.stroke();

    // top bits: horns, antenna or ears
    ctx.fillStyle = p.rim;
    ctx.strokeStyle = p.rim;
    if (type === 0) {
      ctx.beginPath();
      ctx.moveTo(x - 12, cy - 10);
      ctx.lineTo(x - 15, cy - 23 + bob);
      ctx.lineTo(x - 5, cy - 15);
      ctx.moveTo(x + 12, cy - 10);
      ctx.lineTo(x + 15, cy - 23 + bob);
      ctx.lineTo(x + 5, cy - 15);
      ctx.fill();
    } else if (type === 1) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, cy - COIN_R + 1);
      ctx.lineTo(x + 2 * bob, cy - COIN_R - 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 2 * bob, cy - COIN_R - 9, 2.6, 0, 6.28);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x - COIN_R + 1, cy - 4, 4, 0, 6.28);
      ctx.arc(x + COIN_R - 1, cy - 4, 4, 0, 6.28);
      ctx.fill();
    }

    // the coin
    const g = ctx.createRadialGradient(x - 5, cy - 6, 2, x, cy, COIN_R + 1);
    g.addColorStop(0, p.mid);
    g.addColorStop(1, p.edge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy, COIN_R, 0, 6.28);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = p.rim;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, cy, COIN_R - 4.5, 0, 6.28);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // angry face, pupils follow Cashy
    const look = Math.max(-1.6, Math.min(1.6, (playerX - x) / 90));
    ctx.fillStyle = COL.paper;
    ctx.beginPath();
    ctx.ellipse(x - 6, cy - 2, 4, 4.8, 0, 0, 6.28);
    ctx.ellipse(x + 6, cy - 2, 4, 4.8, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = COL.ink;
    ctx.beginPath();
    ctx.arc(x - 6 + look, cy - 1, 2.1, 0, 6.28);
    ctx.arc(x + 6 + look, cy - 1, 2.1, 0, 6.28);
    ctx.fill();
    ctx.strokeStyle = COL.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 11, cy - 9);
    ctx.lineTo(x - 3, cy - 5.5);
    ctx.moveTo(x + 11, cy - 9);
    ctx.lineTo(x + 3, cy - 5.5);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (frame) {
      ctx.moveTo(x - 6, cy + 8);
      ctx.lineTo(x - 3, cy + 6);
      ctx.lineTo(x, cy + 8);
      ctx.lineTo(x + 3, cy + 6);
      ctx.lineTo(x + 6, cy + 8);
    } else {
      ctx.moveTo(x - 5, cy + 7);
      ctx.quadraticCurveTo(x, cy + 11, x + 5, cy + 7);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBill(x, y, rot, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.fillStyle = COL.note;
    ctx.strokeStyle = "#1b3a1f";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-13, -7, 26, 14, 2);
    else ctx.rect(-13, -7, 26, 14);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = COL.noteDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(-10.5, -4.5, 21, 9);
    ctx.fillStyle = COL.noteDark;
    ctx.beginPath();
    ctx.arc(0, 0, 3.8, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = COL.note;
    ctx.font = `700 6px ${BODY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 0.4);
    ctx.restore();
  }

  function drawBolt(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineWidth = 3.4;
    ctx.lineJoin = "miter";
    ctx.strokeStyle = COL.cyan;
    ctx.shadowColor = COL.cyan;
    ctx.shadowBlur = 8;
    const w = Math.sin(G.t * 28 + b.ph) > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(w * -3, -10);
    ctx.lineTo(w * 3, -4);
    ctx.lineTo(w * -3, 2);
    ctx.lineTo(w * 3, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawUfo() {
    const x = ufo.x;
    const y = 78;
    ctx.save();
    ctx.translate(x, y);
    // glass dome
    ctx.fillStyle = "rgba(39,231,255,0.4)";
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -6, 15, 13, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    // body
    ctx.fillStyle = COL.mist;
    ctx.strokeStyle = COL.blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 2, 32, 11, 0, 0, 6.28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COL.ink;
    ctx.font = `700 10px ${BODY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MSTR", 0, 3);
    // blinking lights
    for (let i = -1; i <= 1; i += 2) {
      ctx.fillStyle = Math.floor(G.t * 6) % 2 === (i > 0 ? 0 : 1) ? COL.cyan : COL.blue;
      ctx.beginPath();
      ctx.arc(i * 25, 4, 2.2, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) return;
    const throwing = player.throwT > 0 && img.crouch;
    if (throwing) {
      const s = 112;
      ctx.drawImage(img.crouch, player.x - s / 2 + 6, GROUND_Y + 5 - s, s, s);
    } else if (img.cashy) {
      const h = PLAYER_H;
      const w = (h * img.cashy.width) / img.cashy.height;
      ctx.drawImage(img.cashy, player.x - w / 2, GROUND_Y - h, w, h);
    } else {
      ctx.fillStyle = COL.note;
      ctx.fillRect(player.x - 14, GROUND_Y - 60, 28, 60);
    }
  }

  function drawHud() {
    text("SCORE", 22, 26, { size: 11, weight: 700, color: COL.mist });
    text(String(G.score).padStart(5, "0"), 22, 54, { size: 30, weight: 700, color: COL.paper });
    text("BEST " + String(G.best).padStart(5, "0"), 22, 74, { size: 11, weight: 700, color: COL.mist });

    text("WAVE", W / 2, 26, { size: 11, weight: 700, color: COL.mist, align: "center" });
    text(String(G.wave), W / 2, 54, { size: 30, weight: 700, color: COL.cyan, align: "center" });

    // lives, drawn as little Cashys (right margin leaves room for the sound button)
    const right = W - 96;
    for (let i = 0; i < G.lives; i++) {
      if (img.cashy) {
        const h = 32;
        const w = (h * img.cashy.width) / img.cashy.height;
        ctx.drawImage(img.cashy, right - (i + 1) * (w + 2), 18, w, h);
      }
    }
  }

  function overlay(alpha = 0.72) {
    ctx.fillStyle = `rgba(5,7,13,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function titleScreen() {
    overlay(0.8);
    text("CASHY", W / 2, 158, { size: 104, font: HEAD, align: "center", stroke: COL.ink, strokeW: 14, glow: COL.blue, blur: 30 });
    text("INVADERS", W / 2, 232, { size: 62, font: HEAD, color: COL.cyan, align: "center", stroke: COL.ink, strokeW: 10, glow: COL.cyan, blur: 20 });
    if (img.cashy) {
      const h = 330;
      const w = (h * img.cashy.width) / img.cashy.height;
      const bob = reduceMotion ? 0 : Math.sin(G.t * 2) * 4;
      ctx.drawImage(img.cashy, W / 2 - w / 2, 268 + bob, w, h);
    }
    text("Throw cash at the rival coins.", W / 2, 626, { size: 20, weight: 700, align: "center" });
    const blink = reduceMotion || Math.floor(G.t * 2) % 2 === 0;
    text("PRESS SPACE OR TAP TO START", W / 2, 662, { size: 16, weight: 700, color: blink ? COL.cyan : COL.mist, align: "center" });
    text("← → or A D to move  ·  Space to throw  ·  P to pause", W / 2, 690, { size: 13, color: COL.mist, align: "center" });
  }

  function pauseScreen() {
    overlay(0.7);
    text("PAUSED", W / 2, H / 2 - 6, { size: 72, font: HEAD, align: "center", stroke: COL.ink, strokeW: 12, glow: COL.blue });
    text("Press P, Space or tap to carry on", W / 2, H / 2 + 38, { size: 17, weight: 700, color: COL.cyan, align: "center" });
  }

  function overScreen() {
    overlay(0.78);
    text("GAME OVER", W / 2, 268, { size: 84, font: HEAD, align: "center", stroke: COL.ink, strokeW: 12, glow: COL.blue, blur: 28 });
    text(G.overReason, W / 2, 308, { size: 17, color: COL.mist, align: "center" });
    text("SCORE", W / 2, 372, { size: 13, weight: 700, color: COL.mist, align: "center" });
    text(String(G.score), W / 2, 424, { size: 58, weight: 700, color: COL.paper, align: "center" });
    text(G.newBest ? "NEW BEST!" : "BEST " + G.best, W / 2, 458, { size: 18, weight: 700, color: G.newBest ? COL.cyan : COL.mist, align: "center" });
    text("Reached wave " + G.wave, W / 2, 486, { size: 16, color: COL.mist, align: "center" });
    if (G.overT > 0.8) {
      const blink = reduceMotion || Math.floor(G.t * 2) % 2 === 0;
      text("PRESS SPACE OR TAP TO PLAY AGAIN", W / 2, 560, { size: 16, weight: 700, color: blink ? COL.cyan : COL.mist, align: "center" });
    }
  }

  function banners() {
    if (G.state !== "play") return;
    if (G.banner > 0) {
      text("WAVE CLEARED", W / 2, 330, { size: 58, font: HEAD, align: "center", stroke: COL.ink, strokeW: 10, glow: COL.cyan, blur: 22 });
      text("Next up: wave " + (G.wave + 1), W / 2, 370, { size: 20, weight: 700, color: COL.cyan, align: "center" });
    } else if (G.intro > 0 && G.wave > 1) {
      const a = Math.min(1, G.intro * 1.6);
      text("GET READY", W / 2, 330, { size: 58, font: HEAD, align: "center", color: COL.paper, stroke: COL.ink, strokeW: 10, glow: COL.blue, blur: 22, alpha: a });
      text("Wave " + G.wave, W / 2, 370, { size: 20, weight: 700, color: COL.cyan, align: "center", alpha: a });
    }
  }

  // ───────────────────────── draw ─────────────────────────
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);

    // twinkling stars
    ctx.fillStyle = COL.paper;
    for (const s of stars) {
      ctx.globalAlpha = reduceMotion ? 0.5 : 0.3 + 0.5 * Math.abs(Math.sin(G.t * s.sp + s.p));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-1, 1) * G.shake * 0.5, rand(-1, 1) * G.shake * 0.5);

    if (ufo.active) drawUfo();
    for (const s of shields) ctx.drawImage(s.off, s.x, s.y);
    for (const e of enemies) if (e.alive) drawCoin(e, fleet.frame, player.x);
    for (const b of bolts) drawBolt(b);
    for (const b of cash) drawBill(b.x, b.y, b.rot, 1.25);
    if (G.state !== "title" && !(G.state === "over" && G.lives <= 0)) drawPlayer();

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    for (const p of popups) {
      text(p.text, p.x, p.y, { size: 22, weight: 700, color: p.col, align: "center", stroke: COL.ink, strokeW: 5, alpha: Math.min(1, p.life * 2) });
    }

    // the street
    ctx.save();
    ctx.strokeStyle = COL.blue;
    ctx.lineWidth = 3;
    ctx.shadowColor = COL.blue;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 3);
    ctx.lineTo(W, GROUND_Y + 3);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    if (G.state !== "title") drawHud();
    banners();
    if (G.state === "title") titleScreen();
    else if (G.state === "pause") pauseScreen();
    else if (G.state === "over") overScreen();
  }

  // ───────────────────────── boot ─────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  // A tiny hook for testing, only when the URL has ?debug
  if (/[?&]debug\b/.test(window.location.search)) {
    window.__invaders = { G, player, get enemies() { return enemies; }, get cash() { return cash; }, get bolts() { return bolts; }, get shields() { return shields; }, ufo, startGame, hurtPlayer };
  }

  spawnWave(); // so the title screen has a backdrop
  G.intro = 0;
  Promise.all([
    loadImage("cashy", "assets/cashy.webp"),
    loadImage("crouch", "assets/cashy-crouch.webp"),
    document.fonts ? Promise.all([document.fonts.load("40px Cynatar"), document.fonts.load('700 16px "Noto Sans"'), document.fonts.load('400 16px "Noto Sans"')]).catch(() => {}) : null,
  ]).then(() => {
    last = performance.now();
    window.requestAnimationFrame(frame);
  });
})();
