const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "https://repo93-production.up.railway.app";

app.use(express.static(path.join(__dirname, "public")));

// ====== ROOM SYSTEM ======
const rooms = {}; // roomCode -> room state
const MAX_PLAYERS = 15;
const AVATARS = ["🐸","🐢","🦎","🐊","🐍","🦕","🐉","🐲","🦖","🐈","🐕","🐇","🦔","🐿️","🦜"];

const FOODS = [
  { id:"rice",   emoji:"🍚", name:"Rice" },
  { id:"fish",   emoji:"🐟", name:"Fish" },
  { id:"apple",  emoji:"🍎", name:"Apple" },
  { id:"carrot", emoji:"🥕", name:"Carrot" },
  { id:"cake",   emoji:"🍰", name:"Cake" },
  { id:"soup",   emoji:"🍲", name:"Soup" },
  { id:"bread",  emoji:"🍞", name:"Bread" },
  { id:"milk",   emoji:"🥛", name:"Milk" },
];

function genRoomCode() {
  var code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[code]);
  return code;
}

function createRoom(code) {
  return {
    code: code,
    state: "lobby",
    players: {},
    round: 0,
    maxRounds: 10,
    targetFood: null,
    roundTimer: null,
    countdownTimer: null,
    roundStartTime: 0,
    roundResponses: {},
    roundDuration: 12000,
  };
}

function getPlayerList(room) {
  return Object.values(room.players)
    .map(function(p) { return { name: p.name, score: p.score, avatar: p.avatar }; })
    .sort(function(a, b) { return b.score - a.score; });
}

function broadcastRoom(room, msg) {
  var data = JSON.stringify(msg);
  Object.values(room.players).forEach(function(p) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(data);
  });
  if (room.hostWs && room.hostWs.readyState === 1) room.hostWs.send(data);
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickChoices(target) {
  var choices = [target];
  var others = FOODS.filter(function(f) { return f.id !== target.id; });
  while (choices.length < 4 && others.length > 0) {
    var idx = Math.floor(Math.random() * others.length);
    choices.push(others.splice(idx, 1)[0]);
  }
  for (var i = choices.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = choices[i]; choices[i] = choices[j]; choices[j] = tmp;
  }
  return choices;
}

function startCountdown(room) {
  room.state = "countdown";
  var count = 3;
  broadcastRoom(room, { type: "countdown", count: count });
  room.countdownTimer = setInterval(function() {
    count--;
    if (count <= 0) {
      clearInterval(room.countdownTimer);
      startRound(room);
    } else {
      broadcastRoom(room, { type: "countdown", count: count });
    }
  }, 1000);
}

function startRound(room) {
  room.round++;
  if (room.round > room.maxRounds) { endGame(room); return; }
  room.state = "playing";
  room.targetFood = pickRandom(FOODS);
  room.roundResponses = {};
  room.roundStartTime = Date.now();
  var choices = pickChoices(room.targetFood);
  broadcastRoom(room, {
    type: "roundStart", round: room.round, maxRounds: room.maxRounds,
    targetFood: room.targetFood, choices: choices, duration: room.roundDuration,
  });
  room.roundTimer = setTimeout(function() { endRound(room); }, room.roundDuration);
}

function endRound(room) {
  clearTimeout(room.roundTimer);
  room.state = "roundEnd";
  var results = [];
  Object.keys(room.roundResponses).forEach(function(pid) {
    var resp = room.roundResponses[pid];
    var player = room.players[pid];
    if (!player) return;
    if (resp.foodId === room.targetFood.id) {
      var elapsed = resp.time - room.roundStartTime;
      var bonus = Math.max(10, Math.round(100 - (elapsed / room.roundDuration) * 90));
      player.score += bonus;
      results.push({ name: player.name, correct: true, points: bonus });
    } else {
      results.push({ name: player.name, correct: false, points: 0 });
    }
  });
  Object.values(room.players).forEach(function(p) {
    if (!room.roundResponses[p.id]) {
      results.push({ name: p.name, correct: false, points: 0, timeout: true });
    }
  });
  broadcastRoom(room, {
    type: "roundEnd", round: room.round, maxRounds: room.maxRounds,
    targetFood: room.targetFood, results: results, leaderboard: getPlayerList(room),
  });
  setTimeout(function() { if (room.state === "roundEnd") startCountdown(room); }, 4000);
}

function endGame(room) {
  room.state = "gameOver";
  clearTimeout(room.roundTimer);
  clearInterval(room.countdownTimer);
  broadcastRoom(room, { type: "gameOver", leaderboard: getPlayerList(room) });
}

function resetRoom(room) {
  clearTimeout(room.roundTimer);
  clearInterval(room.countdownTimer);
  room.state = "lobby";
  room.round = 0;
  Object.values(room.players).forEach(function(p) { p.score = 0; });
  broadcastRoom(room, {
    type: "gameState", state: "lobby",
    players: getPlayerList(room),
    playerCount: Object.keys(room.players).length,
  });
}

// ====== API ======
app.get("/api/create-room", function(req, res) {
  var code = genRoomCode();
  rooms[code] = createRoom(code);
  var url = BASE_URL + "/play.html?room=" + code;
  QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: "#1a2e5a" } })
    .then(function(qr) { res.json({ code: code, url: url, qr: qr }); })
    .catch(function() { res.json({ code: code, url: url, qr: "" }); });
});

// ====== WEBSOCKET ======
wss.on("connection", function(ws) {
  var playerId = null;
  var roomCode = null;

  ws.on("message", function(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    switch (msg.type) {
      case "hostJoin": {
        roomCode = msg.room;
        var room = rooms[roomCode];
        if (!room) { ws.send(JSON.stringify({ type: "error", message: "Room not found" })); return; }
        room.hostWs = ws;
        ws.send(JSON.stringify({
          type: "gameState", state: room.state,
          players: getPlayerList(room),
          playerCount: Object.keys(room.players).length,
        }));
        break;
      }
      case "playerJoin": {
        roomCode = msg.room;
        var room2 = rooms[roomCode];
        if (!room2) { ws.send(JSON.stringify({ type: "error", message: "Room not found. Check room code." })); return; }
        if (Object.keys(room2.players).length >= MAX_PLAYERS) { ws.send(JSON.stringify({ type: "error", message: "Room is full (max 15)" })); return; }
        if (room2.state !== "lobby" && room2.state !== "gameOver") { ws.send(JSON.stringify({ type: "error", message: "Game in progress. Wait." })); return; }
        playerId = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
        var used = Object.values(room2.players).map(function(p) { return p.avatar; });
        var avail = AVATARS.filter(function(a) { return used.indexOf(a) === -1; });
        var avatar = avail.length > 0 ? avail[0] : pickRandom(AVATARS);
        room2.players[playerId] = { id: playerId, name: (msg.name || "Player").slice(0, 15), score: 0, avatar: avatar, ws: ws };
        ws.send(JSON.stringify({ type: "joined", playerId: playerId, avatar: avatar, name: room2.players[playerId].name }));
        broadcastRoom(room2, {
          type: "gameState", state: room2.state,
          players: getPlayerList(room2),
          playerCount: Object.keys(room2.players).length,
        });
        break;
      }
      case "startGame": {
        var room3 = rooms[roomCode];
        if (!room3) return;
        if (room3.state === "lobby" || room3.state === "gameOver") {
          if (room3.state === "gameOver") resetRoom(room3);
          startCountdown(room3);
        }
        break;
      }
      case "answer": {
        var room4 = rooms[roomCode];
        if (!room4 || room4.state !== "playing" || !playerId || room4.roundResponses[playerId]) return;
        room4.roundResponses[playerId] = { foodId: msg.foodId, time: Date.now() };
        if (Object.keys(room4.roundResponses).length >= Object.keys(room4.players).length) {
          clearTimeout(room4.roundTimer);
          endRound(room4);
        }
        break;
      }
    }
  });

  ws.on("close", function() {
    if (playerId && roomCode && rooms[roomCode]) {
      delete rooms[roomCode].players[playerId];
      var room = rooms[roomCode];
      broadcastRoom(room, {
        type: "gameState", state: room.state,
        players: getPlayerList(room),
        playerCount: Object.keys(room.players).length,
      });
      // clean up empty rooms after a delay
      if (Object.keys(room.players).length === 0 && !room.hostWs) {
        setTimeout(function() {
          if (rooms[roomCode] && Object.keys(rooms[roomCode].players).length === 0) delete rooms[roomCode];
        }, 60000);
      }
    }
    if (roomCode && rooms[roomCode] && rooms[roomCode].hostWs === ws) {
      rooms[roomCode].hostWs = null;
    }
  });
});

server.listen(PORT, function() {
  console.log("\n🐸 Frog Puzzle Server running on port " + PORT);
  console.log("   Open http://localhost:" + PORT + " for the TV host screen\n");
});
