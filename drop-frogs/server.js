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

app.use(express.static(path.join(__dirname, "public")));

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

app.get("/api/qrcode", async (req, res) => {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}/play.html`;
  try {
    const qr = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: "#1a2e5a" } });
    res.json({ qr, url });
  } catch (err) {
    res.status(500).json({ error: "QR failed" });
  }
});

// ====== GAME STATE ======
const MAX_PLAYERS = 15;
const GAME_DURATION = 120000; // 2 minutes
const COUNTDOWN_SECONDS = 3;

let game = {
  state: "lobby", // lobby | countdown | playing | gameOver
  players: {},
  timerStart: 0,
  countdownTimer: null,
  gameTimer: null,
};

function playerList() {
  return Object.values(game.players)
    .map((p) => ({ id: p.id, name: p.name, score: p.score, avatar: p.avatar, boardSnapshot: p.boardSnapshot }))
    .sort((a, b) => b.score - a.score);
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(data); });
}

function broadcastState() {
  broadcast({
    type: "gameState",
    state: game.state,
    players: playerList(),
    playerCount: Object.keys(game.players).length,
    timeLeft: game.state === "playing" ? Math.max(0, GAME_DURATION - (Date.now() - game.timerStart)) : GAME_DURATION,
    duration: GAME_DURATION,
  });
}

function startCountdown() {
  game.state = "countdown";
  let count = COUNTDOWN_SECONDS;
  broadcast({ type: "countdown", count });
  game.countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(game.countdownTimer);
      startGame();
    } else {
      broadcast({ type: "countdown", count });
    }
  }, 1000);
}

function startGame() {
  game.state = "playing";
  game.timerStart = Date.now();
  for (const p of Object.values(game.players)) {
    p.score = 0;
    p.boardSnapshot = null;
  }
  broadcast({ type: "gameStart", duration: GAME_DURATION });
  broadcastState();

  // Send periodic time updates
  const tick = setInterval(() => {
    if (game.state !== "playing") { clearInterval(tick); return; }
    const left = Math.max(0, GAME_DURATION - (Date.now() - game.timerStart));
    broadcast({ type: "timeUpdate", timeLeft: left, duration: GAME_DURATION });
  }, 1000);

  game.gameTimer = setTimeout(() => {
    clearInterval(tick);
    endGame();
  }, GAME_DURATION);
}

function endGame() {
  game.state = "gameOver";
  clearTimeout(game.gameTimer);
  clearInterval(game.countdownTimer);
  broadcast({ type: "gameOver", leaderboard: playerList() });
}

function resetGame() {
  clearTimeout(game.gameTimer);
  clearInterval(game.countdownTimer);
  game.state = "lobby";
  for (const p of Object.values(game.players)) {
    p.score = 0;
    p.boardSnapshot = null;
  }
  broadcastState();
}

// ====== WEBSOCKETS ======
const AVATARS = ["🐸","🐢","🦎","🐊","🐍","🦕","🐉","🐲","🦖","🐈","🐕","🐇","🦔","🐿️","🦜"];

wss.on("connection", (ws) => {
  let playerId = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "hostJoin":
        ws._isHost = true;
        broadcastState();
        break;

      case "playerJoin": {
        if (Object.keys(game.players).length >= MAX_PLAYERS) {
          ws.send(JSON.stringify({ type: "error", message: "Game is full! (max 15)" }));
          return;
        }
        if (game.state !== "lobby" && game.state !== "gameOver") {
          ws.send(JSON.stringify({ type: "error", message: "Game in progress. Wait for next round." }));
          return;
        }
        playerId = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const used = Object.values(game.players).map((p) => p.avatar);
        const avail = AVATARS.filter((a) => !used.includes(a));
        const avatar = avail.length > 0 ? avail[0] : AVATARS[Math.floor(Math.random() * AVATARS.length)];

        game.players[playerId] = {
          id: playerId,
          name: (msg.name || "Player").slice(0, 15),
          score: 0,
          avatar,
          boardSnapshot: null,
          ws,
        };
        ws.send(JSON.stringify({ type: "joined", playerId, avatar, name: game.players[playerId].name }));
        broadcastState();
        break;
      }

      case "startGame":
        if (game.state === "lobby" || game.state === "gameOver") {
          if (game.state === "gameOver") resetGame();
          startCountdown();
        }
        break;

      case "scoreUpdate":
        if (playerId && game.players[playerId] && game.state === "playing") {
          game.players[playerId].score = msg.score || 0;
          game.players[playerId].boardSnapshot = msg.board || null;
          broadcastState();
        }
        break;

      case "playerGameOver":
        if (playerId && game.players[playerId] && game.state === "playing") {
          game.players[playerId].score = msg.score || game.players[playerId].score;
          game.players[playerId].boardSnapshot = msg.board || null;
          broadcastState();
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
      broadcastState();
    }
  });
});

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`\n🐸 Drop Frogs Multiplayer Server running!`);
  console.log(`   TV/Host:  http://localhost:${PORT}`);
  console.log(`   Players:  http://${ip}:${PORT}/play.html`);
  console.log(`\n   Open the TV page and scan the QR code with phones!\n`);
});
