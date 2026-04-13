// ===== DROP FROGS ENGINE =====
// 7-column × 12-row, column-major, 12 frog tiers, drag-and-drop, gravity + squish

"use strict";

const COLS = 7, ROWS = 12;

// 12 frog tiers — size increases, higher tiers get crowns, shimmer, rainbow, cosmic
const TIERS = [
  { fill:"#81c784", dk:"#2e7d32", belly:"#c8e6c9", eye:"#fff", sz:0.52 },
  { fill:"#64b5f6", dk:"#1565c0", belly:"#bbdefb", eye:"#fff", sz:0.56 },
  { fill:"#e57373", dk:"#c62828", belly:"#ffcdd2", eye:"#fff", sz:0.60 },
  { fill:"#ffb74d", dk:"#e65100", belly:"#ffe0b2", eye:"#fff", sz:0.64 },
  { fill:"#fff176", dk:"#f9a825", belly:"#fff9c4", eye:"#333", sz:0.67 },
  { fill:"#ce93d8", dk:"#6a1b9a", belly:"#e1bee7", eye:"#fff", sz:0.70 },
  { fill:"#f06292", dk:"#ad1457", belly:"#f8bbd0", eye:"#fff", sz:0.73, crown:1 },
  { fill:"#4db6ac", dk:"#00695c", belly:"#b2dfdb", eye:"#fff", sz:0.76, crown:1 },
  { fill:"#7986cb", dk:"#283593", belly:"#c5cae9", eye:"#fff", sz:0.79, crown:1, shimmer:1 },
  { fill:"#ffd54f", dk:"#ff6f00", belly:"#ffecb3", eye:"#333", sz:0.82, crown:1, shimmer:1 },
  { fill:"rainbow",dk:"#444",    belly:"#fff",    eye:"#fff", sz:0.86, crown:1, shimmer:1, rainbow:1 },
  { fill:"cosmic", dk:"#0d001a", belly:"#1a0033", eye:"#ff0", sz:0.90, crown:1, shimmer:1, cosmic:1 },
];

// ===== DRAWING HELPERS =====

function drawStar(ctx, x, y, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawFrog(ctx, cx, cy, cell, tier, time, scaleX, scaleY, alpha) {
  const t = TIERS[tier - 1];
  if (!t) return;
  scaleX = scaleX || 1;
  scaleY = scaleY || 1;
  alpha = alpha != null ? alpha : 1;
  const r = cell * 0.45 * t.sz;
  time = time || 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);

  // --- Determine body fill ---
  let bodyFill;
  if (t.rainbow) {
    bodyFill = "hsl(" + ((time * 0.08) % 360) + ",80%,60%)";
  } else if (t.cosmic) {
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, "#2a0845");
    grd.addColorStop(0.7, "#0d001a");
    grd.addColorStop(1, "#000010");
    bodyFill = grd;
  } else {
    bodyFill = t.fill;
  }

  // --- Shadow ---
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.88, r * 0.65, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Legs (4 little limbs) ---
  ctx.fillStyle = t.dk;
  const legData = [[-0.6, 0.65], [0.6, 0.65], [-0.55, -0.35], [0.55, -0.35]];
  for (const [lx, ly] of legData) {
    ctx.beginPath();
    ctx.ellipse(lx * r, ly * r, r * 0.2, r * 0.12, lx * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Body ---
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyFill;
  ctx.fill();
  ctx.strokeStyle = t.dk;
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.stroke();

  // --- Cosmic stars inside body ---
  if (t.cosmic) {
    for (let i = 0; i < 12; i++) {
      const sx = Math.sin(i * 7.3 + time * 0.001) * r * 0.75;
      const sy = Math.cos(i * 5.7 + time * 0.0015) * r * 0.75;
      const b = 0.3 + Math.sin(time * 0.004 + i * 2.5) * 0.7;
      if (b > 0 && sx * sx + sy * sy < r * r * 0.85) {
        ctx.fillStyle = "rgba(255,255,255," + Math.max(0, b) + ")";
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Belly ---
  ctx.beginPath();
  ctx.ellipse(0, r * 0.13, r * 0.58, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fillStyle = t.belly;
  ctx.globalAlpha = alpha * 0.65;
  ctx.fill();
  ctx.globalAlpha = alpha;

  // --- Number on belly ---
  ctx.fillStyle = t.dk;
  ctx.font = "bold " + Math.round(r * 0.65) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tier, 0, r * 0.18);

  // --- Eyes ---
  const ey = -r * 0.28, exOff = r * 0.3, er = r * 0.19;
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(dx * exOff, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = t.eye;
    ctx.fill();
    ctx.strokeStyle = t.dk;
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.stroke();
    // pupil
    ctx.beginPath();
    ctx.arc(dx * exOff, ey, er * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    // highlight
    ctx.beginPath();
    ctx.arc(dx * exOff - er * 0.22, ey - er * 0.22, er * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }

  // --- Mouth ---
  ctx.beginPath();
  ctx.arc(0, -r * 0.02, r * 0.22, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.strokeStyle = t.dk;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();

  // --- Crown (tier 7+) ---
  if (t.crown) {
    const ch = r * 0.38, cw = r * 0.65, cy2 = -r - r * 0.08;
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(-cw, cy2);
    ctx.lineTo(-cw * 0.55, cy2 - ch);
    ctx.lineTo(-cw * 0.15, cy2 - ch * 0.3);
    ctx.lineTo(0, cy2 - ch * 1.15);
    ctx.lineTo(cw * 0.15, cy2 - ch * 0.3);
    ctx.lineTo(cw * 0.55, cy2 - ch);
    ctx.lineTo(cw, cy2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = Math.max(0.5, r * 0.035);
    ctx.stroke();
    // gem
    ctx.fillStyle = "#e91e63";
    ctx.beginPath();
    ctx.arc(0, cy2 - ch * 0.75, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Shimmer particles (tier 9+) ---
  if (t.shimmer) {
    for (let i = 0; i < 7; i++) {
      const ang = (time * 0.0018 + i * Math.PI * 2 / 7) % (Math.PI * 2);
      const dist = r * 1.15 + Math.sin(time * 0.003 + i * 1.7) * r * 0.18;
      const sx = Math.cos(ang) * dist, sy = Math.sin(ang) * dist;
      const bright = 0.4 + Math.sin(time * 0.005 + i * 2.3) * 0.4;
      ctx.fillStyle = "rgba(255,255,200," + Math.max(0, bright) + ")";
      drawStar(ctx, sx, sy, r * 0.09 * (0.5 + bright * 0.5), 4);
    }
  }

  ctx.restore();
}

// ===== GAME ENGINE CLASS =====

function FrogEngine(canvas, onScoreChange) {
  const self = this;
  const ctx = canvas.getContext("2d");

  // Responsive sizing
  const maxW = Math.min(380, window.innerWidth - 20);
  const CELL = Math.floor(maxW / COLS);
  const PREVIEW_H = Math.round(CELL * 1.4);
  const W = COLS * CELL;
  const H = PREVIEW_H + ROWS * CELL;
  canvas.width = W;
  canvas.height = H;

  // State
  let grid; // column-major: grid[col][row]
  self.score = 0;
  self.active = false;
  let nextTier = 0;
  let isDragging = false, dragX = 0, dragY = 0, dragCol = -1;
  let dropping = null; // { col, tier, y, targetY, vy }
  let resolving = false;
  let cellAnims = {}; // "c,r" -> { type, start, dur }
  let rafId = null;
  let spawnMax = 4; // max tier to spawn (increases later)

  function mkGrid() {
    const g = [];
    for (let c = 0; c < COLS; c++) { g[c] = []; for (let r = 0; r < ROWS; r++) g[c][r] = 0; }
    return g;
  }

  function randTier() { return Math.floor(Math.random() * spawnMax) + 1; }

  function colToX(c) { return c * CELL + CELL / 2; }
  function rowToY(r) { return PREVIEW_H + r * CELL + CELL / 2; }
  function xToCol(x) { const c = Math.floor(x / CELL); return c >= 0 && c < COLS ? c : -1; }

  function findLanding(col) {
    for (let r = ROWS - 1; r >= 0; r--) { if (grid[col][r] === 0) return r; }
    return -1; // column full
  }

  // ===== ANIMATION HELPERS =====
  function addAnim(c, r, type, dur) {
    cellAnims[c + "," + r] = { type: type, start: performance.now(), dur: dur };
  }

  function getAnim(c, r, now) {
    const key = c + "," + r;
    const a = cellAnims[key];
    if (!a) return null;
    const p = (now - a.start) / a.dur;
    if (p >= 1) { delete cellAnims[key]; return null; }
    return { type: a.type, progress: p };
  }

  // ===== DRAWING =====
  function render(time) {
    if (!self.active && !dropping && !resolving) return;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.fillStyle = "#080d18";
    ctx.fillRect(0, PREVIEW_H, W, ROWS * CELL);
    ctx.strokeStyle = "rgba(60,120,100,0.1)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, PREVIEW_H + r * CELL); ctx.lineTo(W, PREVIEW_H + r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, PREVIEW_H); ctx.lineTo(c * CELL, H); ctx.stroke();
    }

    // Column highlight while dragging
    if (isDragging && dragCol >= 0) {
      ctx.fillStyle = "rgba(124,255,124,0.1)";
      ctx.fillRect(dragCol * CELL, PREVIEW_H, CELL, ROWS * CELL);
      // Ghost at landing
      const lr = findLanding(dragCol);
      if (lr >= 0) drawFrog(ctx, colToX(dragCol), rowToY(lr), CELL, nextTier, time, 1, 1, 0.25);
    }

    // Grid frogs
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = grid[c][r];
        if (v <= 0) continue;
        const an = getAnim(c, r, time);
        let sx = 1, sy = 1, al = 1;
        if (an) {
          if (an.type === "squish") {
            const t2 = an.progress;
            sx = 1 + 0.3 * Math.sin(t2 * Math.PI * 3) * (1 - t2);
            sy = 1 - 0.25 * Math.sin(t2 * Math.PI * 3) * (1 - t2);
          } else if (an.type === "pop") {
            const t2 = an.progress;
            const s = t2 < 0.3 ? 0.5 + t2 / 0.3 * 0.8 : 1.3 - (t2 - 0.3) / 0.7 * 0.3;
            sx = sy = s;
          } else if (an.type === "flash") {
            al = 0.3 + 0.7 * Math.abs(Math.sin(an.progress * Math.PI * 4));
          }
        }
        drawFrog(ctx, colToX(c), rowToY(r), CELL, v, time, sx, sy, al);
      }
    }

    // Dropping frog
    if (dropping) {
      drawFrog(ctx, colToX(dropping.col), dropping.y, CELL, dropping.tier, time);
    }

    // Dragged frog follows finger
    if (isDragging) {
      drawFrog(ctx, dragX, dragY, CELL, nextTier, time, 1.1, 1.1, 0.85);
    }

    // Preview next frog (only when idle)
    if (!isDragging && !dropping && !resolving && self.active) {
      drawFrog(ctx, W / 2, PREVIEW_H / 2, CELL, nextTier, time);
      // hint text
      ctx.fillStyle = "rgba(124,255,124,0.4)";
      ctx.font = "bold " + Math.round(CELL * 0.28) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("drag or tap a column", W / 2, PREVIEW_H - 4);
    }

    rafId = requestAnimationFrame(render);
  }

  // ===== INPUT =====
  function ptrDown(px, py) {
    if (!self.active || dropping || resolving) return;
    const rect = canvas.getBoundingClientRect();
    const x = (px - rect.left) * (W / rect.width);
    const y = (py - rect.top) * (H / rect.height);

    // If tapping on the board area directly → quick drop to that column
    if (y >= PREVIEW_H) {
      const col = xToCol(x);
      if (col >= 0) { doDrop(col); return; }
    }

    // Start drag from preview area
    isDragging = true;
    dragX = x;
    dragY = y;
    dragCol = xToCol(x);
  }

  function ptrMove(px, py) {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    dragX = (px - rect.left) * (W / rect.width);
    dragY = (py - rect.top) * (H / rect.height);
    dragCol = xToCol(dragX);
  }

  function ptrUp() {
    if (!isDragging) return;
    isDragging = false;
    if (dragCol >= 0) doDrop(dragCol);
    dragCol = -1;
  }

  canvas.addEventListener("mousedown", function(e) { e.preventDefault(); ptrDown(e.clientX, e.clientY); });
  canvas.addEventListener("mousemove", function(e) { e.preventDefault(); ptrMove(e.clientX, e.clientY); });
  canvas.addEventListener("mouseup", function(e) { e.preventDefault(); ptrUp(); });
  canvas.addEventListener("touchstart", function(e) { e.preventDefault(); const t = e.touches[0]; ptrDown(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener("touchmove", function(e) { e.preventDefault(); const t = e.touches[0]; ptrMove(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener("touchend", function(e) { e.preventDefault(); ptrUp(); }, { passive: false });

  // ===== DROP LOGIC =====
  function doDrop(col) {
    if (dropping || resolving || !self.active) return;
    const lr = findLanding(col);
    if (lr < 0) return; // column full, ignore

    dropping = {
      col: col,
      tier: nextTier,
      y: PREVIEW_H / 2,
      targetY: rowToY(lr),
      vy: 0,
      row: lr,
    };
    nextTier = randTier();
    animateDrop();
  }

  function animateDrop() {
    if (!dropping) return;
    const gravity = 1.8;
    dropping.vy += gravity;
    dropping.y += dropping.vy;

    if (dropping.y >= dropping.targetY) {
      // Land!
      dropping.y = dropping.targetY;
      grid[dropping.col][dropping.row] = dropping.tier;
      addAnim(dropping.col, dropping.row, "squish", 350);
      const doneDrop = dropping;
      dropping = null;
      // resolve after brief pause
      setTimeout(function() { startResolve(); }, 80);
    } else {
      requestAnimationFrame(animateDrop);
    }
  }

  // ===== GRAVITY =====
  function applyGravity() {
    let moved = false;
    for (let c = 0; c < COLS; c++) {
      // Compact downward
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[c][r] > 0) {
          if (r !== write) {
            grid[c][write] = grid[c][r];
            grid[c][r] = 0;
            addAnim(c, write, "squish", 200);
            moved = true;
          }
          write--;
        }
      }
    }
    return moved;
  }

  // ===== MERGE LOGIC =====
  function findGroups() {
    const visited = mkGrid();
    const groups = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (grid[c][r] > 0 && !visited[c][r]) {
          const tier = grid[c][r];
          const group = [];
          const stack = [[c, r]];
          while (stack.length) {
            const [sc, sr] = stack.pop();
            if (sc < 0 || sc >= COLS || sr < 0 || sr >= ROWS) continue;
            if (visited[sc][sr] || grid[sc][sr] !== tier) continue;
            visited[sc][sr] = 1;
            group.push([sc, sr]);
            stack.push([sc - 1, sr], [sc + 1, sr], [sc, sr - 1], [sc, sr + 1]);
          }
          if (group.length >= 2) groups.push({ tier: tier, cells: group });
        }
      }
    }
    return groups;
  }

  function mergeGroups(groups) {
    let points = 0;
    for (const g of groups) {
      // Find bottom-most, left-most cell for the merged frog
      let bestC = g.cells[0][0], bestR = g.cells[0][1];
      for (const [c, r] of g.cells) {
        if (r > bestR || (r === bestR && c < bestC)) { bestC = c; bestR = r; }
      }
      // Clear all cells
      for (const [c, r] of g.cells) grid[c][r] = 0;
      // Place upgraded frog (tier+1), or clear if tier 12
      const newTier = g.tier < 12 ? g.tier + 1 : 0;
      if (newTier > 0) {
        grid[bestC][bestR] = newTier;
        addAnim(bestC, bestR, "pop", 400);
      }
      // Score: tier * cells * 10
      points += g.tier * g.cells.length * 10;
      // Increase spawn range at higher merges
      if (newTier >= 5 && spawnMax < 5) spawnMax = 5;
    }
    return points;
  }

  // ===== CASCADE RESOLVE =====
  function startResolve() {
    resolving = true;
    let chain = 0;

    function step() {
      applyGravity();
      const groups = findGroups();
      if (groups.length > 0) {
        chain++;
        // Flash matched cells briefly
        for (const g of groups) {
          for (const [c, r] of g.cells) addAnim(c, r, "flash", 300);
        }
        setTimeout(function() {
          const pts = mergeGroups(groups);
          self.score += pts * chain;
          if (onScoreChange) onScoreChange();
          setTimeout(step, 120);
        }, 320);
      } else {
        resolving = false;
        // Check game over: top row of any column occupied
        for (let c = 0; c < COLS; c++) {
          if (grid[c][0] > 0) { self.active = false; if (onScoreChange) onScoreChange(); return; }
        }
      }
    }
    setTimeout(step, 50);
  }

  // ===== PUBLIC API =====
  self.start = function() {
    grid = mkGrid();
    self.score = 0;
    self.active = true;
    resolving = false;
    dropping = null;
    isDragging = false;
    cellAnims = {};
    spawnMax = 4;
    nextTier = randTier();
    rafId = requestAnimationFrame(render);
  };

  self.stop = function() {
    self.active = false;
  };

  self.getBoard = function() { return grid; };
}
