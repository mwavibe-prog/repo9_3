// ===== DROP FROGS ENGINE =====
// 7-col × 12-row column-major, 12 tiers, drag-drop, gravity+squish,
// same-column merge, chain cascade, particles, undo, legend, best score

"use strict";

var COLS = 7, ROWS = 12;

var TIERS = [
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
function drawStar(ctx, x, y, r, pts) {
  ctx.beginPath();
  for (var i = 0; i < pts * 2; i++) {
    var a = (i * Math.PI) / pts - Math.PI / 2;
    var d = i % 2 === 0 ? r : r * 0.4;
    i === 0 ? ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath(); ctx.fill();
}

function drawFrog(ctx, cx, cy, cell, tier, time, scX, scY, alpha) {
  var t = TIERS[tier - 1]; if (!t) return;
  scX = scX || 1; scY = scY || 1; alpha = alpha != null ? alpha : 1;
  var r = cell * 0.45 * t.sz; time = time || 0;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.scale(scX, scY);

  var bodyFill;
  if (t.rainbow) bodyFill = "hsl(" + ((time * 0.08) % 360) + ",80%,60%)";
  else if (t.cosmic) { var grd = ctx.createRadialGradient(0,0,0,0,0,r); grd.addColorStop(0,"#2a0845"); grd.addColorStop(0.7,"#0d001a"); grd.addColorStop(1,"#000010"); bodyFill = grd; }
  else bodyFill = t.fill;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.beginPath(); ctx.ellipse(0, r*0.88, r*0.65, r*0.13, 0, 0, Math.PI*2); ctx.fill();
  // legs
  ctx.fillStyle = t.dk;
  var legs = [[-0.6,0.65],[0.6,0.65],[-0.55,-0.35],[0.55,-0.35]];
  for (var li = 0; li < legs.length; li++) { ctx.beginPath(); ctx.ellipse(legs[li][0]*r, legs[li][1]*r, r*0.2, r*0.12, legs[li][0]*0.3, 0, Math.PI*2); ctx.fill(); }
  // body
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle = bodyFill; ctx.fill(); ctx.strokeStyle = t.dk; ctx.lineWidth = Math.max(1.5, r*0.07); ctx.stroke();
  // cosmic stars
  if (t.cosmic) { for (var ci=0;ci<12;ci++){var sx=Math.sin(ci*7.3+time*0.001)*r*0.75,sy=Math.cos(ci*5.7+time*0.0015)*r*0.75,b=0.3+Math.sin(time*0.004+ci*2.5)*0.7;if(b>0&&sx*sx+sy*sy<r*r*0.85){ctx.fillStyle="rgba(255,255,255,"+Math.max(0,b)+")";ctx.beginPath();ctx.arc(sx,sy,r*0.04,0,Math.PI*2);ctx.fill();}}}
  // belly
  ctx.beginPath(); ctx.ellipse(0,r*0.13,r*0.58,r*0.48,0,0,Math.PI*2); ctx.fillStyle=t.belly; ctx.globalAlpha=alpha*0.65; ctx.fill(); ctx.globalAlpha=alpha;
  // number
  ctx.fillStyle=t.dk; ctx.font="bold "+Math.round(r*0.65)+"px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(tier,0,r*0.18);
  // eyes
  var ey=-r*0.28,exO=r*0.3,er=r*0.19;
  for (var di=0;di<2;di++){var dx=di===0?-1:1; ctx.beginPath();ctx.arc(dx*exO,ey,er,0,Math.PI*2);ctx.fillStyle=t.eye;ctx.fill();ctx.strokeStyle=t.dk;ctx.lineWidth=Math.max(0.5,r*0.04);ctx.stroke(); ctx.beginPath();ctx.arc(dx*exO,ey,er*0.48,0,Math.PI*2);ctx.fillStyle="#111";ctx.fill(); ctx.beginPath();ctx.arc(dx*exO-er*0.22,ey-er*0.22,er*0.22,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.7)";ctx.fill();}
  // mouth
  ctx.beginPath(); ctx.arc(0,-r*0.02,r*0.22,0.12*Math.PI,0.88*Math.PI); ctx.strokeStyle=t.dk; ctx.lineWidth=Math.max(1,r*0.05); ctx.stroke();
  // crown
  if(t.crown){var ch=r*0.38,cw=r*0.65,cy2=-r-r*0.08;ctx.fillStyle="#ffd700";ctx.beginPath();ctx.moveTo(-cw,cy2);ctx.lineTo(-cw*0.55,cy2-ch);ctx.lineTo(-cw*0.15,cy2-ch*0.3);ctx.lineTo(0,cy2-ch*1.15);ctx.lineTo(cw*0.15,cy2-ch*0.3);ctx.lineTo(cw*0.55,cy2-ch);ctx.lineTo(cw,cy2);ctx.closePath();ctx.fill();ctx.strokeStyle="#b8860b";ctx.lineWidth=Math.max(0.5,r*0.035);ctx.stroke();ctx.fillStyle="#e91e63";ctx.beginPath();ctx.arc(0,cy2-ch*0.75,r*0.07,0,Math.PI*2);ctx.fill();}
  // shimmer
  if(t.shimmer){for(var si=0;si<7;si++){var ang=(time*0.0018+si*Math.PI*2/7)%(Math.PI*2),dist=r*1.15+Math.sin(time*0.003+si*1.7)*r*0.18,ssx=Math.cos(ang)*dist,ssy=Math.sin(ang)*dist,bright=0.4+Math.sin(time*0.005+si*2.3)*0.4;ctx.fillStyle="rgba(255,255,200,"+Math.max(0,bright)+")";drawStar(ctx,ssx,ssy,r*0.09*(0.5+bright*0.5),4);}}
  ctx.restore();
}

// ===== ENGINE =====
function FrogEngine(canvas, onScoreChange) {
  var self = this;
  var ctx = canvas.getContext("2d");

  // --- Responsive sizing ---
  var CELL, PREVIEW_H, W, H, LEGEND_H;
  function recalcSizes() {
    var maxW = Math.min(400, window.innerWidth - 16);
    CELL = Math.floor(maxW / COLS);
    PREVIEW_H = Math.round(CELL * 1.4);
    LEGEND_H = Math.round(CELL * 1.1);
    W = COLS * CELL;
    H = PREVIEW_H + ROWS * CELL + LEGEND_H;
    canvas.width = W;
    canvas.height = H;
  }
  recalcSizes();
  window.addEventListener("resize", function() {
    recalcSizes();
  });

  // --- State ---
  var grid;
  self.score = 0;
  self.bestScore = parseInt(localStorage.getItem("dropFrogsBest") || "0", 10);
  self.active = false;
  var nextTier = 0;
  var isDragging = false, dragX = 0, dragY = 0, dragCol = -1;
  var dropping = null;
  var resolving = false;
  var cellAnims = {};
  var particles = [];
  var floatingTexts = [];
  var spawnMax = 4;
  var discovered = {}; // tier -> true
  var undoStack = []; // snapshots
  var MAX_UNDO = 10;

  function mkGrid() { var g=[]; for(var c=0;c<COLS;c++){g[c]=[];for(var r=0;r<ROWS;r++)g[c][r]=0;} return g; }
  function cloneGrid(g) { var n=[]; for(var c=0;c<COLS;c++){n[c]=g[c].slice();} return n; }
  function randTier() { return Math.floor(Math.random() * spawnMax) + 1; }
  function colToX(c) { return c * CELL + CELL / 2; }
  function rowToY(r) { return PREVIEW_H + r * CELL + CELL / 2; }
  function xToCol(x) { var c = Math.floor(x / CELL); return c >= 0 && c < COLS ? c : -1; }
  function findLanding(col) { for(var r=ROWS-1;r>=0;r--){if(grid[col][r]===0)return r;} return -1; }

  // --- Discovered tiers persistence ---
  function loadDiscovered() {
    try { var d = JSON.parse(localStorage.getItem("dropFrogsDiscovered")||"{}"); discovered = d; } catch(e) { discovered = {}; }
  }
  function saveDiscovered() {
    localStorage.setItem("dropFrogsDiscovered", JSON.stringify(discovered));
  }
  function discover(tier) {
    if (!discovered[tier]) { discovered[tier] = true; saveDiscovered(); }
  }

  // --- Undo ---
  function pushUndo() {
    undoStack.push({ grid: cloneGrid(grid), score: self.score, next: nextTier });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    if (self.onUndoChange) self.onUndoChange(undoStack.length);
  }
  self.undo = function() {
    if (undoStack.length === 0 || dropping || resolving || !self.active) return;
    var snap = undoStack.pop();
    grid = snap.grid;
    self.score = snap.score;
    nextTier = snap.next;
    cellAnims = {};
    if (self.onUndoChange) self.onUndoChange(undoStack.length);
    if (onScoreChange) onScoreChange();
    ensureRaf();
  };
  self.getUndoCount = function() { return undoStack.length; };

  // --- Animations ---
  function addAnim(c, r, type, dur) { cellAnims[c+","+r] = {type:type,start:performance.now(),dur:dur}; }
  function getAnim(c, r, now) { var k=c+","+r,a=cellAnims[k]; if(!a)return null; var p=(now-a.start)/a.dur; if(p>=1){delete cellAnims[k];return null;} return {type:a.type,progress:p}; }

  // --- Particles ---
  function spawnParticles(cx, cy, tier, count) {
    var t = TIERS[tier - 1]; if (!t) return;
    var col = t.rainbow ? "#fff" : (t.cosmic ? "#a855f7" : t.fill);
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1.5,
        life: 1,
        decay: 0.015 + Math.random() * 0.015,
        size: 2 + Math.random() * 3,
        color: col,
      });
    }
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles(ctx2) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx2.globalAlpha = Math.max(0, p.life);
      ctx2.fillStyle = p.color;
      ctx2.beginPath(); ctx2.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx2.fill();
    }
    ctx2.globalAlpha = 1;
  }

  // --- Floating score popups ---
  function spawnFloatText(cx, cy, text, color) {
    floatingTexts.push({ x: cx, y: cy, text: text, color: color || "#7cff7c", start: performance.now(), dur: 900 });
  }

  function drawFloatingTexts(ctx2, now) {
    for (var i = floatingTexts.length - 1; i >= 0; i--) {
      var ft = floatingTexts[i];
      var p = (now - ft.start) / ft.dur;
      if (p >= 1) { floatingTexts.splice(i, 1); continue; }
      ctx2.globalAlpha = 1 - p;
      ctx2.fillStyle = ft.color;
      ctx2.font = "bold " + Math.round(CELL * 0.38) + "px sans-serif";
      ctx2.textAlign = "center";
      ctx2.fillText(ft.text, ft.x, ft.y - p * CELL * 0.8);
    }
    ctx2.globalAlpha = 1;
  }

  // --- Legend ---
  function drawLegend(ctx2, time) {
    var legendY = PREVIEW_H + ROWS * CELL;
    ctx2.fillStyle = "rgba(10,15,26,0.85)";
    ctx2.fillRect(0, legendY, W, LEGEND_H);
    ctx2.strokeStyle = "rgba(60,120,100,0.2)";
    ctx2.lineWidth = 1;
    ctx2.beginPath(); ctx2.moveTo(0, legendY); ctx2.lineTo(W, legendY); ctx2.stroke();

    var slotW = W / 12;
    var frogSize = Math.min(slotW * 0.85, LEGEND_H * 0.7);
    for (var i = 1; i <= 12; i++) {
      var sx = (i - 1) * slotW + slotW / 2;
      var sy = legendY + LEGEND_H / 2;
      if (discovered[i]) {
        drawFrog(ctx2, sx, sy, frogSize, i, time, 1, 1, 1);
      } else {
        // locked: grey silhouette with ?
        ctx2.fillStyle = "rgba(255,255,255,0.08)";
        ctx2.beginPath(); ctx2.arc(sx, sy, frogSize * 0.3, 0, Math.PI * 2); ctx2.fill();
        ctx2.fillStyle = "rgba(255,255,255,0.2)";
        ctx2.font = "bold " + Math.round(frogSize * 0.35) + "px sans-serif";
        ctx2.textAlign = "center"; ctx2.textBaseline = "middle";
        ctx2.fillText("?", sx, sy);
      }
    }
  }

  // ===== RENDER =====
  var _rafRunning = false;
  function ensureRaf() {
    if (!_rafRunning) { _rafRunning = true; requestAnimationFrame(render); }
  }
  function render(time) {
    _rafRunning = false;
    if (!self.active && !dropping && !resolving && particles.length === 0 && floatingTexts.length === 0) return;
    ctx.clearRect(0, 0, W, H);

    // Preview background
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, W, PREVIEW_H);

    // Grid background
    ctx.fillStyle = "#080d18";
    ctx.fillRect(0, PREVIEW_H, W, ROWS * CELL);
    ctx.strokeStyle = "rgba(60,120,100,0.1)"; ctx.lineWidth = 1;
    for (var r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, PREVIEW_H+r*CELL); ctx.lineTo(W, PREVIEW_H+r*CELL); ctx.stroke(); }
    for (var c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL, PREVIEW_H); ctx.lineTo(c*CELL, PREVIEW_H+ROWS*CELL); ctx.stroke(); }

    // Column highlight
    if (isDragging && dragCol >= 0) {
      ctx.fillStyle = "rgba(124,255,124,0.1)";
      ctx.fillRect(dragCol * CELL, PREVIEW_H, CELL, ROWS * CELL);
      var lr = findLanding(dragCol);
      if (lr >= 0) drawFrog(ctx, colToX(dragCol), rowToY(lr), CELL, nextTier, time, 1, 1, 0.25);
    }

    // Grid frogs
    for (c = 0; c < COLS; c++) {
      for (r = 0; r < ROWS; r++) {
        var v = grid[c][r]; if (v <= 0) continue;
        var an = getAnim(c, r, time);
        var sx2 = 1, sy2 = 1, al = 1;
        if (an) {
          if (an.type === "squish") { var t2=an.progress; sx2=1+0.3*Math.sin(t2*Math.PI*3)*(1-t2); sy2=1-0.25*Math.sin(t2*Math.PI*3)*(1-t2); }
          else if (an.type === "pop") { var t3=an.progress; var s2=t3<0.3?0.5+t3/0.3*0.8:1.3-(t3-0.3)/0.7*0.3; sx2=sy2=s2; }
          else if (an.type === "flash") { al=0.3+0.7*Math.abs(Math.sin(an.progress*Math.PI*4)); }
        }
        drawFrog(ctx, colToX(c), rowToY(r), CELL, v, time, sx2, sy2, al);
      }
    }

    // Dropping frog
    if (dropping) drawFrog(ctx, colToX(dropping.col), dropping.y, CELL, dropping.tier, time);

    // Dragged frog
    if (isDragging) drawFrog(ctx, dragX, dragY, CELL, nextTier, time, 1.1, 1.1, 0.85);

    // Preview frog
    if (!isDragging && !dropping && !resolving && self.active) {
      drawFrog(ctx, W/2, PREVIEW_H/2, CELL, nextTier, time);
      ctx.fillStyle = "rgba(124,255,124,0.35)"; ctx.font = "bold "+Math.round(CELL*0.26)+"px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("drag or tap a column", W/2, PREVIEW_H - 3);
    }

    // Particles & floating texts
    updateParticles();
    drawParticles(ctx);
    drawFloatingTexts(ctx, time);

    // Legend
    drawLegend(ctx, time);

    _rafRunning = true;
    requestAnimationFrame(render);
  }

  // ===== INPUT =====
  function ptrDown(px, py) {
    if (!self.active || dropping || resolving) return;
    var rect = canvas.getBoundingClientRect();
    var x = (px - rect.left) * (W / rect.width);
    var y = (py - rect.top) * (H / rect.height);
    if (y >= PREVIEW_H && y < PREVIEW_H + ROWS * CELL) { var col = xToCol(x); if (col >= 0) { doDrop(col); return; } }
    isDragging = true; dragX = x; dragY = y; dragCol = xToCol(x);
  }
  function ptrMove(px, py) {
    if (!isDragging) return;
    var rect = canvas.getBoundingClientRect();
    dragX = (px - rect.left) * (W / rect.width);
    dragY = (py - rect.top) * (H / rect.height);
    dragCol = xToCol(dragX);
  }
  function ptrUp() { if (!isDragging) return; isDragging = false; if (dragCol >= 0) doDrop(dragCol); dragCol = -1; }

  canvas.addEventListener("mousedown", function(e){e.preventDefault();ptrDown(e.clientX,e.clientY)});
  canvas.addEventListener("mousemove", function(e){e.preventDefault();ptrMove(e.clientX,e.clientY)});
  canvas.addEventListener("mouseup", function(e){e.preventDefault();ptrUp()});
  canvas.addEventListener("touchstart", function(e){e.preventDefault();var t=e.touches[0];ptrDown(t.clientX,t.clientY)},{passive:false});
  canvas.addEventListener("touchmove", function(e){e.preventDefault();var t=e.touches[0];ptrMove(t.clientX,t.clientY)},{passive:false});
  canvas.addEventListener("touchend", function(e){e.preventDefault();ptrUp()},{passive:false});

  // ===== DROP =====
  function doDrop(col) {
    if (dropping || resolving || !self.active) return;
    var lr = findLanding(col);
    if (lr < 0) return;
    pushUndo();
    discover(nextTier);
    dropping = { col:col, tier:nextTier, y:PREVIEW_H/2, targetY:rowToY(lr), vy:0, row:lr };
    nextTier = randTier();
    ensureRaf();
    animateDrop();
  }

  function animateDrop() {
    if (!dropping) return;
    dropping.vy += 1.8;
    dropping.y += dropping.vy;
    if (dropping.y >= dropping.targetY) {
      dropping.y = dropping.targetY;
      grid[dropping.col][dropping.row] = dropping.tier;
      discover(dropping.tier);
      addAnim(dropping.col, dropping.row, "squish", 350);
      dropping = null;
      setTimeout(function(){ startResolve(); }, 80);
    } else { requestAnimationFrame(animateDrop); }
  }

  // ===== GRAVITY =====
  function applyGravity() {
    var moved = false;
    for (var c = 0; c < COLS; c++) {
      var write = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (grid[c][r] > 0) {
          if (r !== write) { grid[c][write] = grid[c][r]; grid[c][r] = 0; addAnim(c, write, "squish", 200); moved = true; }
          write--;
        }
      }
    }
    return moved;
  }

  // ===== SAME-COLUMN MERGE =====
  // Scan each column bottom-up: if two adjacent same-tier frogs exist, merge them
  function findColumnMerges() {
    var merges = []; // { col, row1 (lower), row2 (upper), tier }
    for (var c = 0; c < COLS; c++) {
      for (var r = ROWS - 1; r >= 1; r--) {
        if (grid[c][r] > 0 && grid[c][r] === grid[c][r-1]) {
          merges.push({ col: c, row1: r, row2: r-1, tier: grid[c][r] });
          r--; // skip the upper one so it isn't double-matched
        }
      }
    }
    return merges;
  }

  function executeMerges(merges) {
    var totalPts = 0;
    for (var i = 0; i < merges.length; i++) {
      var m = merges[i];
      var newTier = m.tier < 12 ? m.tier + 1 : 0;
      var pts = m.tier * 20;
      // Clear both cells
      grid[m.col][m.row1] = 0;
      grid[m.col][m.row2] = 0;
      // Particles at both positions
      spawnParticles(colToX(m.col), rowToY(m.row1), m.tier, 12);
      spawnParticles(colToX(m.col), rowToY(m.row2), m.tier, 8);
      // Place merged frog at lower position
      if (newTier > 0) {
        grid[m.col][m.row1] = newTier;
        addAnim(m.col, m.row1, "pop", 400);
        discover(newTier);
        if (newTier >= 5 && spawnMax < 5) spawnMax = 5;
      } else {
        pts += 500; // bonus for clearing tier 12
      }
      // Floating score popup
      spawnFloatText(colToX(m.col), rowToY(m.row2), "+" + pts, newTier > 0 ? TIERS[newTier-1].fill : "#ffd700");
      totalPts += pts;
    }
    return totalPts;
  }

  // ===== CASCADE RESOLVE (80ms chain delay) =====
  function startResolve() {
    resolving = true;
    var chain = 0;
    function step() {
      applyGravity();
      var merges = findColumnMerges();
      if (merges.length > 0) {
        chain++;
        // Flash matched cells
        for (var i = 0; i < merges.length; i++) {
          addAnim(merges[i].col, merges[i].row1, "flash", 250);
          addAnim(merges[i].col, merges[i].row2, "flash", 250);
        }
        setTimeout(function() {
          var pts = executeMerges(merges);
          self.score += pts * chain;
          updateBest();
          if (onScoreChange) onScoreChange();
          setTimeout(step, 80); // 80ms chain delay
        }, 270);
      } else {
        resolving = false;
        ensureRaf();
        // Game over: ALL columns full
        var allFull = true;
        for (var c2 = 0; c2 < COLS; c2++) { if (grid[c2][0] === 0) { allFull = false; break; } }
        if (allFull) {
          self.active = false;
          updateBest();
          if (onScoreChange) onScoreChange();
          if (self.onGameOver) self.onGameOver();
        }
      }
    }
    setTimeout(step, 50);
  }

  // --- Best score ---
  function updateBest() {
    if (self.score > self.bestScore) {
      self.bestScore = self.score;
      localStorage.setItem("dropFrogsBest", String(self.bestScore));
    }
  }

  // ===== PUBLIC API =====
  self.onUndoChange = null; // callback(count)
  self.onGameOver = null;   // callback()

  self.start = function() {
    grid = mkGrid(); self.score = 0; self.active = true; resolving = false; dropping = null;
    isDragging = false; cellAnims = {}; particles = []; floatingTexts = []; spawnMax = 4; undoStack = [];
    self.bestScore = parseInt(localStorage.getItem("dropFrogsBest") || "0", 10);
    loadDiscovered();
    nextTier = randTier();
    if (self.onUndoChange) self.onUndoChange(0);
    ensureRaf();
  };
  self.stop = function() { self.active = false; updateBest(); };
  self.getBoard = function() { return grid; };
}
