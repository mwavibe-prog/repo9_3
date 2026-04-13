const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");
const QRCode = require("qrcode");
const os = require("os");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Get local IP for QR code
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// QR code endpoint
app.get("/api/qrcode", async (req, res) => {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}/play.html`;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: "#1a2e5a", light: "#ffffff" },
    });
    res.json({ qr: dataUrl, url });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate QR" });
  }
});

// ====== GAME STATE ======
const FOODS = [
  { id: "rice", emoji: "🍚", name: "Rice", color: "#fff8e1" },
  { id: "fish", emoji: "🐟", name: "Fish", color: "#bbdefb" },
  { id: "apple", emoji: "🍎", name: "Apple", color: "#ffcdd2" },
  { id: "carrot", emoji: "🥕", name: "Carrot", color: "#ffe0b2" },
  { id: "cake", emoji: "🍰", name: "Cake", color: "#f8bbd0" },
  { id: "soup", emoji: "🍲", name: "Soup", color: "#c8e6c9" },
  { id: "bread", emoji: "🍞", name: "Bread", color: "#ffe082" },
  { id: "milk", emoji: "🥛", name: "Milk", color: "#e3f2fd" },
];

const ROUND_DURATION = 12000; // 12 seconds per round
const MAX_ROUNDS = 10;
const MAX_PLAYERS = 15;
const COUNTDOWN_SECONDS = 3;

let game = createFreshGame();

function createFreshGame() {
  return {
    state: "lobby", // lobby, countdown, playing, roundEnd, gameOver
    players: {},
    round: 0,
    targetFood: null,
    roundTimer: null,
    countdownTimer: null,
    roundStartTime: 0,
    roundResponses: {},
  };
}

function broadcastToAll(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

function broadcastGameState() {
  const playerList = Object.values(game.players).map((p) => ({
    name: p.name,
    score: p.score,
    avatar: p.avatar,
  }));
  playerList.sort((a, b) => b.score - a.score);

  broadcastToAll({
    type: "gameState",
    state: game.state,
    players: playerList,
    round: game.round,
    maxRounds: MAX_ROUNDS,
    targetFood: game.targetFood,
    playerCount: Object.keys(game.players).length,
  });
}

function pickRandomFood() {
  return FOODS[Math.floor(Math.random() * FOODS.length)];
}

function pickFoodChoices(target) {
  // Return 4 choices including the target
  const choices = [target];
  const others = FOODS.filter((f) => f.id !== target.id);
  while (choices.length < 4 && others.length > 0) {
    const idx = Math.floor(Math.random() * others.length);
    choices.push(others.splice(idx, 1)[0]);
  }
  // Shuffle
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

function startCountdown() {
  game.state = "countdown";
  let count = COUNTDOWN_SECONDS;
  broadcastToAll({ type: "countdown", count });

  game.countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(game.countdownTimer);
      startRound();
    } else {
      broadcastToAll({ type: "countdown", count });
    }
  }, 1000);
}

function startRound() {
  game.round++;
  if (game.round > MAX_ROUNDS) {
    endGame();
    return;
  }

  game.state = "playing";
  game.targetFood = pickRandomFood();
  game.roundResponses = {};
  game.roundStartTime = Date.now();

  const choices = pickFoodChoices(game.targetFood);

  broadcastToAll({
    type: "roundStart",
    round: game.round,
    maxRounds: MAX_ROUNDS,
    targetFood: game.targetFood,
    choices: choices,
    duration: ROUND_DURATION,
  });

  // Round timer
  game.roundTimer = setTimeout(() => {
    endRound();
  }, ROUND_DURATION);
}

function endRound() {
  clearTimeout(game.roundTimer);
  game.state = "roundEnd";

  // Score players who answered correctly
  const results = [];
  for (const [playerId, response] of Object.entries(game.roundResponses)) {
    const player = game.players[playerId];
    if (!player) continue;

    if (response.foodId === game.targetFood.id) {
      // Faster = more points (max 100, min 10)
      const elapsed = response.time - game.roundStartTime;
      const bonus = Math.max(10, Math.round(100 - (elapsed / ROUND_DURATION) * 90));
      player.score += bonus;
      results.push({ name: player.name, correct: true, points: bonus });
    } else {
      results.push({ name: player.name, correct: false, points: 0 });
    }
  }

  // Mark players who didn't respond
  for (const player of Object.values(game.players)) {
    if (!game.roundResponses[player.id]) {
      results.push({ name: player.name, correct: false, points: 0, timeout: true });
    }
  }

  const playerList = Object.values(game.players)
    .map((p) => ({ name: p.name, score: p.score, avatar: p.avatar }))
    .sort((a, b) => b.score - a.score);

  broadcastToAll({
    type: "roundEnd",
    round: game.round,
    maxRounds: MAX_ROUNDS,
    targetFood: game.targetFood,
    results,
    leaderboard: playerList,
  });

  // Auto-advance to next round after 4 seconds
  setTimeout(() => {
    if (game.state === "roundEnd") {
      startCountdown();
    }
  }, 4000);
}

function endGame() {
  game.state = "gameOver";
  clearTimeout(game.roundTimer);
  clearInterval(game.countdownTimer);

  const leaderboard = Object.values(game.players)
    .map((p) => ({ name: p.name, score: p.score, avatar: p.avatar }))
    .sort((a, b) => b.score - a.score);

  broadcastToAll({
    type: "gameOver",
    leaderboard,
  });
}

function resetGame() {
  clearTimeout(game.roundTimer);
  clearInterval(game.countdownTimer);
  // Keep players but reset scores
  const players = game.players;
  game = createFreshGame();
  game.players = players;
  for (const p of Object.values(game.players)) {
    p.score = 0;
  }
  broadcastGameState();
}

// ====== WEBSOCKET HANDLING ======
wss.on("connection", (ws) => {
  let playerId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "hostJoin":
        // Host (TV) just wants game state updates
        ws._isHost = true;
        broadcastGameState();
        break;

      case "playerJoin": {
        if (Object.keys(game.players).length >= MAX_PLAYERS) {
          ws.send(JSON.stringify({ type: "error", message: "Game is full (max 15 players)" }));
          return;
        }
        if (game.state !== "lobby" && game.state !== "gameOver") {
          ws.send(JSON.stringify({ type: "error", message: "Game already in progress. Please wait." }));
          return;
        }
        playerId = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const avatars = ["🐸", "🐢", "🦎", "🐊", "🐍", "🦕", "🐉", "🐲", "🦖", "🐈", "🐕", "🐇", "🦔", "🐿️", "🦜"];
        const usedAvatars = Object.values(game.players).map((p) => p.avatar);
        const available = avatars.filter((a) => !usedAvatars.includes(a));
        const avatar = available.length > 0 ? available[0] : avatars[Math.floor(Math.random() * avatars.length)];

        game.players[playerId] = {
          id: playerId,
          name: msg.name || "Player",
          score: 0,
          avatar,
          ws,
        };

        ws.send(JSON.stringify({
          type: "joined",
          playerId,
          avatar,
          name: msg.name,
        }));

        broadcastGameState();
        break;
      }

      case "startGame":
        if (game.state === "lobby" || game.state === "gameOver") {
          if (game.state === "gameOver") resetGame();
          startCountdown();
        }
        break;

      case "answer":
        if (game.state === "playing" && playerId && !game.roundResponses[playerId]) {
          game.roundResponses[playerId] = {
            foodId: msg.foodId,
            time: Date.now(),
          };
          // Check if all players answered
          if (Object.keys(game.roundResponses).length >= Object.keys(game.players).length) {
            clearTimeout(game.roundTimer);
            endRound();
          }
        }
        break;

      case "resetGame":
        resetGame();
        break;
    }
  });

  ws.on("close", () => {
    if (playerId && game.players[playerId]) {
      delete game.players[playerId];
      broadcastGameState();
    }
  });
});

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`\n🐸 Feed Teto Server running!`);
  console.log(`   TV/Host: http://localhost:${PORT}`);
  console.log(`   Players: http://${ip}:${PORT}/play.html`);
  console.log(`\n   Open the TV/Host page and scan the QR code with phones!\n`);
});
