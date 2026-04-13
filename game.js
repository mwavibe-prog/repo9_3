// ===== DROP FROGS PUZZLE GAME =====
// Puyo-Puyo style: pairs of colored frogs drop, match 4+ adjacent same-color to clear

(function () {
  "use strict";

  // --- Constants ---
  const COLS = 6;
  const ROWS = 13; // row 0 is hidden
  const VISIBLE_ROWS = 12;
  const CELL = 40;
  const MATCH_MIN = 4;

  const FROG_COLORS = [
    { fill: "#4caf50", dark: "#2e7d32", eye: "#fff", num: 1, label: "Green" },
    { fill: "#f44336", dark: "#c62828", eye: "#fff", num: 2, label: "Red" },
    { fill: "#2196f3", dark: "#1565c0", eye: "#fff", num: 3, label: "Blue" },
    { fill: "#ffeb3b", dark: "#f9a825", eye: "#333", num: 4, label: "Yellow" },
    { fill: "#9c27b0", dark: "#6a1b9a", eye: "#fff", num: 5, label: "Purple" },
  ];

  // --- Canvas Setup ---
  const canvas = document.getElementById("game-board");
  const ctx = canvas.getContext("2d");
  canvas.width = COLS * CELL;
  canvas.height = VISIBLE_ROWS * CELL;

  const previewCanvas = document.getElementById("next-preview");
  const pctx = previewCanvas.getContext("2d");
  previewCanvas.width = 90;
  previewCanvas.height = 90;

  // --- DOM ---
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const chainEl = document.getElementById("chain");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMsg = document.getElementById("overlay-msg");
  const startBtn = document.getElementById("start-btn");

  // --- Game State ---
  let grid = [];
  let score = 0;
  let level = 1;
  let linesCleared = 0;
  let maxChain = 0;
  let gameOver = false;
  let paused = false;
  let dropInterval = 800;
  let lastDrop = 0;
  let currentPair = null;
  let nextPair = null;
  let animating = false;

  // Number of frog colors active (increases with level)
  function activeColors() {
    return Math.min(FROG_COLORS.length, 3 + Math.floor(level / 3));
  }

  // --- Grid Helpers ---
  function createGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      g[r] = [];
      for (let c = 0; c < COLS; c++) {
        g[r][c] = 0; // 0 = empty, 1-5 = frog color index+1
      }
    }
    return g;
  }

  function isInBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function isEmpty(r, c) {
    return isInBounds(r, c) && grid[r][c] === 0;
  }

  // --- Frog Pair ---
  // A pair: pivot frog + companion, companion position relative to pivot
  // Rotations: 0=up, 1=right, 2=down, 3=left
  const OFFSETS = [
    [-1, 0], // up
    [0, 1],  // right
    [1, 0],  // down
    [0, -1], // left
  ];

  function randomColor() {
    return Math.floor(Math.random() * activeColors()) + 1;
  }

  function createPair() {
    return {
      pivot: { r: 0, c: 2 },
      rotation: 0,
      colors: [randomColor(), randomColor()],
    };
  }

  function getCompanionPos(pair) {
    const off = OFFSETS[pair.rotation];
    return { r: pair.pivot.r + off[0], c: pair.pivot.c + off[1] };
  }

  function getPairCells(pair) {
    const comp = getCompanionPos(pair);
    return [
      { r: pair.pivot.r, c: pair.pivot.c, color: pair.colors[0] },
      { r: comp.r, c: comp.c, color: pair.colors[1] },
    ];
  }

  function canPlacePair(pair) {
    const cells = getPairCells(pair);
    return cells.every(
      (cell) => isInBounds(cell.r, cell.c) && grid[cell.r][cell.c] === 0
    );
  }

  // --- Drawing ---
  function drawFrog(context, x, y, size, colorIdx, ghost) {
    const frog = FROG_COLORS[colorIdx - 1];
    const alpha = ghost ? 0.3 : 1;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const bodyR = size * 0.38;

    context.save();
    context.globalAlpha = alpha;

    // Body (round)
    context.beginPath();
    context.arc(cx, cy, bodyR, 0, Math.PI * 2);
    context.fillStyle = frog.fill;
    context.fill();
    context.strokeStyle = frog.dark;
    context.lineWidth = 2;
    context.stroke();

    // Eyes
    const eyeOffX = bodyR * 0.38;
    const eyeOffY = -bodyR * 0.35;
    const eyeR = bodyR * 0.22;
    // Left eye
    context.beginPath();
    context.arc(cx - eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
    context.fillStyle = frog.eye;
    context.fill();
    context.strokeStyle = frog.dark;
    context.lineWidth = 1;
    context.stroke();
    // Left pupil
    context.beginPath();
    context.arc(cx - eyeOffX, cy + eyeOffY, eyeR * 0.5, 0, Math.PI * 2);
    context.fillStyle = "#111";
    context.fill();
    // Right eye
    context.beginPath();
    context.arc(cx + eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
    context.fillStyle = frog.eye;
    context.fill();
    context.strokeStyle = frog.dark;
    context.lineWidth = 1;
    context.stroke();
    // Right pupil
    context.beginPath();
    context.arc(cx + eyeOffX, cy + eyeOffY, eyeR * 0.5, 0, Math.PI * 2);
    context.fillStyle = "#111";
    context.fill();

    // Mouth (smile)
    context.beginPath();
    context.arc(cx, cy + bodyR * 0.05, bodyR * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
    context.strokeStyle = frog.dark;
    context.lineWidth = 1.5;
    context.stroke();

    // Number on tummy
    context.fillStyle = frog.dark;
    context.font = "bold " + Math.round(size * 0.3) + "px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(frog.num, cx, cy + bodyR * 0.35);

    // Feet (two little bumps at bottom)
    const footY = cy + bodyR * 0.82;
    context.beginPath();
    context.ellipse(cx - bodyR * 0.35, footY, bodyR * 0.18, bodyR * 0.1, 0, 0, Math.PI * 2);
    context.fillStyle = frog.dark;
    context.fill();
    context.beginPath();
    context.ellipse(cx + bodyR * 0.35, footY, bodyR * 0.18, bodyR * 0.1, 0, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = "rgba(60, 120, 100, 0.15)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= VISIBLE_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, VISIBLE_ROWS * CELL);
      ctx.stroke();
    }

    // Landed frogs
    for (let r = 1; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== 0) {
          drawFrog(ctx, c * CELL, (r - 1) * CELL, CELL, grid[r][c], false);
        }
      }
    }

    // Current pair + ghost
    if (currentPair && !animating) {
      // Ghost (drop preview)
      const ghost = ghostPosition();
      if (ghost) {
        const ghostCells = getPairCells(ghost);
        ghostCells.forEach((cell) => {
          if (cell.r >= 1) {
            drawFrog(ctx, cell.c * CELL, (cell.r - 1) * CELL, CELL, cell.color, true);
          }
        });
      }

      // Active pair
      const cells = getPairCells(currentPair);
      cells.forEach((cell) => {
        if (cell.r >= 1) {
          drawFrog(ctx, cell.c * CELL, (cell.r - 1) * CELL, CELL, cell.color, false);
        }
      });
    }
  }

  function drawNextPreview() {
    pctx.clearRect(0, 0, 90, 90);
    if (!nextPair) return;
    const s = 38;
    // Draw the two frogs vertically centered
    drawFrog(pctx, 26, 4, s, nextPair.colors[1], false);
    drawFrog(pctx, 26, 46, s, nextPair.colors[0], false);
  }

  // --- Ghost Position ---
  function ghostPosition() {
    if (!currentPair) return null;
    const ghost = {
      pivot: { ...currentPair.pivot },
      rotation: currentPair.rotation,
      colors: [...currentPair.colors],
    };
    while (true) {
      ghost.pivot.r++;
      if (!canPlacePair(ghost)) {
        ghost.pivot.r--;
        break;
      }
    }
    return ghost;
  }

  // --- Movement ---
  function movePair(dr, dc) {
    if (!currentPair || animating || paused || gameOver) return false;
    const test = {
      pivot: { r: currentPair.pivot.r + dr, c: currentPair.pivot.c + dc },
      rotation: currentPair.rotation,
      colors: currentPair.colors,
    };
    if (canPlacePair(test)) {
      currentPair.pivot = test.pivot;
      return true;
    }
    return false;
  }

  function rotatePair() {
    if (!currentPair || animating || paused || gameOver) return;
    const newRot = (currentPair.rotation + 1) % 4;
    const test = {
      pivot: { ...currentPair.pivot },
      rotation: newRot,
      colors: currentPair.colors,
    };

    if (canPlacePair(test)) {
      currentPair.rotation = newRot;
      return;
    }
    // Wall kick: try shifting left/right
    for (const kick of [1, -1]) {
      const kickTest = {
        pivot: { r: test.pivot.r, c: test.pivot.c + kick },
        rotation: newRot,
        colors: currentPair.colors,
      };
      if (canPlacePair(kickTest)) {
        currentPair.pivot = kickTest.pivot;
        currentPair.rotation = newRot;
        return;
      }
    }
  }

  function hardDrop() {
    if (!currentPair || animating || paused || gameOver) return;
    const ghost = ghostPosition();
    if (ghost) {
      currentPair.pivot = ghost.pivot;
      currentPair.rotation = ghost.rotation;
      lockPair();
    }
  }

  // --- Lock & Cascade ---
  function lockPair() {
    if (!currentPair) return;
    const cells = getPairCells(currentPair);
    cells.forEach((cell) => {
      if (isInBounds(cell.r, cell.c)) {
        grid[cell.r][cell.c] = cell.color;
      }
    });
    currentPair = null;
    // Start cascade resolution
    resolveCascade();
  }

  function applyGravity() {
    let moved = false;
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 2; r >= 0; r--) {
        if (grid[r][c] !== 0 && grid[r + 1][c] === 0) {
          // Drop this frog down
          let nr = r + 1;
          while (nr + 1 < ROWS && grid[nr + 1][c] === 0) nr++;
          grid[nr][c] = grid[r][c];
          grid[r][c] = 0;
          moved = true;
        }
      }
    }
    return moved;
  }

  function findMatches() {
    const visited = createGrid();
    const groups = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== 0 && !visited[r][c]) {
          const color = grid[r][c];
          const group = [];
          const stack = [{ r, c }];
          while (stack.length > 0) {
            const pos = stack.pop();
            if (
              !isInBounds(pos.r, pos.c) ||
              visited[pos.r][pos.c] ||
              grid[pos.r][pos.c] !== color
            )
              continue;
            visited[pos.r][pos.c] = 1;
            group.push(pos);
            stack.push({ r: pos.r - 1, c: pos.c });
            stack.push({ r: pos.r + 1, c: pos.c });
            stack.push({ r: pos.r, c: pos.c - 1 });
            stack.push({ r: pos.r, c: pos.c + 1 });
          }
          if (group.length >= MATCH_MIN) {
            groups.push(group);
          }
        }
      }
    }
    return groups;
  }

  function clearMatches(groups) {
    let cleared = 0;
    groups.forEach((group) => {
      group.forEach((pos) => {
        grid[pos.r][pos.c] = 0;
        cleared++;
      });
    });
    return cleared;
  }

  // Animated cascade with delays
  function resolveCascade() {
    animating = true;
    let chainCount = 0;

    function step() {
      applyGravity();
      const groups = findMatches();

      if (groups.length > 0) {
        chainCount++;
        const cleared = clearMatches(groups);
        const chainBonus = chainCount * chainCount;
        score += cleared * 10 * chainBonus;
        linesCleared += cleared;
        level = Math.floor(linesCleared / 20) + 1;
        dropInterval = Math.max(100, 800 - (level - 1) * 60);

        if (chainCount > maxChain) maxChain = chainCount;
        updateUI();

        // Flash effect then continue
        drawBoard();
        setTimeout(() => {
          applyGravity();
          drawBoard();
          setTimeout(step, 150);
        }, 200);
      } else {
        animating = false;
        // Check game over: if row 0 or 1 has anything
        if (grid[0].some((v) => v !== 0) || grid[1].some((v) => v !== 0)) {
          endGame();
          return;
        }
        spawnPair();
        drawBoard();
      }
    }

    setTimeout(step, 100);
  }

  // --- Spawn ---
  function spawnPair() {
    currentPair = nextPair || createPair();
    nextPair = createPair();
    drawNextPreview();

    if (!canPlacePair(currentPair)) {
      endGame();
    }
  }

  // --- UI ---
  function updateUI() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = linesCleared;
    chainEl.textContent = maxChain;
  }

  // --- Game Loop ---
  function gameLoop(timestamp) {
    if (gameOver) return;
    if (paused) {
      requestAnimationFrame(gameLoop);
      return;
    }

    if (!animating && currentPair) {
      if (timestamp - lastDrop > dropInterval) {
        if (!movePair(1, 0)) {
          lockPair();
        }
        lastDrop = timestamp;
      }
    }

    drawBoard();
    requestAnimationFrame(gameLoop);
  }

  // --- Controls ---
  document.addEventListener("keydown", function (e) {
    if (gameOver && e.key !== "Enter") return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        movePair(0, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        movePair(0, 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (movePair(1, 0)) {
          score += 1;
          updateUI();
        }
        lastDrop = performance.now();
        break;
      case "ArrowUp":
        e.preventDefault();
        rotatePair();
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      case "p":
      case "P":
        if (!gameOver) togglePause();
        break;
      case "Enter":
        if (gameOver) startGame();
        break;
    }
  });

  // Touch controls for mobile
  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 10 && absDy < 10) {
      rotatePair(); // tap to rotate
    } else if (absDx > absDy) {
      movePair(0, dx > 0 ? 1 : -1);
    } else if (dy > 0) {
      hardDrop();
    }
  });

  // --- Pause ---
  function togglePause() {
    paused = !paused;
    if (paused) {
      overlay.classList.remove("hidden");
      overlayTitle.textContent = "PAUSED";
      overlayMsg.textContent = "Press P to resume";
      startBtn.textContent = "RESUME";
      startBtn.onclick = function () {
        togglePause();
      };
    } else {
      overlay.classList.add("hidden");
      lastDrop = performance.now();
    }
  }

  // --- Game Over ---
  function endGame() {
    gameOver = true;
    overlay.classList.remove("hidden");
    overlayTitle.textContent = "GAME OVER";
    overlayMsg.textContent =
      "Score: " + score + " | Level: " + level + " | Max Chain: " + maxChain;
    startBtn.textContent = "PLAY AGAIN";
    startBtn.onclick = startGame;
  }

  // --- Start ---
  function startGame() {
    grid = createGrid();
    score = 0;
    level = 1;
    linesCleared = 0;
    maxChain = 0;
    gameOver = false;
    paused = false;
    animating = false;
    dropInterval = 800;
    currentPair = null;
    nextPair = null;
    lastDrop = performance.now();

    updateUI();
    overlay.classList.add("hidden");
    spawnPair();
    requestAnimationFrame(gameLoop);
  }

  // --- Init ---
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "DROP FROGS";
  overlayMsg.textContent = "Match 4+ same-color frogs to clear them!";
  startBtn.textContent = "START";
  startBtn.onclick = startGame;

  // Draw an idle frog on the board for flair
  drawBoard();
})();
