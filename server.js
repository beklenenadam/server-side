const express = require("express");
//const path = require("path");
const http = require("http");
const PORT = process.env.PORT || 3000;
const app = express();
const cors = require("cors");
const fs = require("fs");
const evnts = require("events");
const { startGame } = require("./game");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS"
  );
  next();
});

app.use(cors());

app.set("port", PORT);

const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let rooms = {};
let gameRooms = {};
let roomsSockets = {};
let roomIntervals = {};
let toPush = null;
let faulCards;
fs.readFile("words.json", (err, data) => {
  if (err) throw err;
  faulCards = JSON.parse(data);
});

io.engine.generateId = (req) => {
  return Math.random().toString(36).substr(2, 5);
};
io.on("connection", (socket) => {

  socket.emit("connected");
  socket.on("create", () => {
    rooms[`${socket.id}`] = {
      team1: [],
      team2: [],
      memberCount: 0,
      readyMemberCount: 0,
      totalConnected: 0,
      overAllTurn1: 0,
      overAllTurn2: 0,
      teamTurn: 1,
      usedCards: [],
      team1Score: 0,
      team2Score: 0,
      passCount: 3,
      timer: 90,
      totalPassCount: 3,
      totalTimer: 90,
      isTimerOn: false,
      roomLeader: socket.id,
      lastOperation: 0,
      lastCard: -1,
      isNewTurn: true,
      isGameOn: false,
      isGameInterrupted: false,
      roundCount: 0,
      totalRoundCount: 5,
    };
    roomIntervals[socket.id] = { myInterval: null };
    rooms[`${socket.id}`].memberCount++;
    rooms[`${socket.id}`].totalConnected++;
    rooms[`${socket.id}`].team1.push({
      [`${socket.id}`]: `Oyuncu ${rooms[`${socket.id}`].totalConnected}`,
    });
    roomsSockets[socket.id] = {};
    roomsSockets[socket.id][socket.id] = socket;
    gameRooms[socket.id] = {};
    gameRooms[socket.id].isGameOn = false;
    io.in(socket.id).emit("lobby", rooms[`${socket.id}`]);
  });

  socket.on("login-lobby", (lobbyId) => {
    if (!rooms[`${lobbyId}`]) {
      console.log("login lobby failed");
      return;
    }
    io.in(lobbyId).emit("play-sound-lobby", "user-joined");
    socket.join(lobbyId);
    rooms[`${lobbyId}`].memberCount++;
    rooms[`${lobbyId}`].totalConnected++;
    toPush = `Oyuncu ${rooms[`${lobbyId}`].totalConnected}`;
    if (
      rooms[`${lobbyId}`].team1.length > rooms[`${lobbyId}`].team2.length
    ) {
      rooms[`${lobbyId}`].team2.push({ [socket.id]: toPush });
    } else {
      rooms[`${lobbyId}`].team1.push({ [socket.id]: toPush });
    }
    roomsSockets[lobbyId][socket.id] = socket;
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("user-ready", (newUserName, lobbyId, currentTeam) => {
    io.in(lobbyId).emit("play-sound-lobby", "ready-toggle");
    rooms[`${lobbyId}`].readyMemberCount++;
    let myIndex;
    rooms[`${lobbyId}`][`team${currentTeam}`].forEach((player, index) => {
      if (Object.keys(player)[0] === socket.id) {
        player[socket.id] = newUserName;
        myIndex = index;
      }
    });
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
    if (gameRooms[lobbyId].isGameOn) {
      let tmpUser = JSON.parse(
        JSON.stringify(rooms[`${lobbyId}`][`team${currentTeam}`][myIndex])
      );
      gameRooms[lobbyId][`team${currentTeam}`].push(tmpUser);
      gameRooms[lobbyId].memberCount++;
      gameRooms[lobbyId].readyMemberCount++;
      gameRooms[lobbyId].totalConnected++;

      socket.emit("enough-players");
      socket.emit("start-game");
      if (gameRooms[lobbyId].isGameInterrupted) {
        if (
          gameRooms[lobbyId].team1.length >= 2 &&
          gameRooms[lobbyId].team2.length >= 2
        ) {
          gameRooms[lobbyId].isGameInterrupted = false;
        }
      }
      return;
    }
    if (
      rooms[`${lobbyId}`].readyMemberCount === rooms[`${lobbyId}`].memberCount
    ) {
      if (
        rooms[`${lobbyId}`].team1.length < 2 ||
        rooms[`${lobbyId}`].team2.length < 2
      ) {
        io.in(lobbyId).emit("not-enough-players");
      } else {
        gameRooms[lobbyId] = JSON.parse(JSON.stringify(rooms[`${lobbyId}`]));
        io.in(lobbyId).emit("enough-players");
        io.in(lobbyId).emit("start-game");
      }
    } else {
      io.in(lobbyId).emit("enough-players");
    }
  });
  socket.on("get-game-listeners", (lobbyId) => {
    startGame(
      io,
      socket,
      gameRooms[`${lobbyId}`],
      lobbyId,
      faulCards,
      roomsSockets[lobbyId],
      roomIntervals[lobbyId],
      rooms[`${lobbyId}`]
    );
  });
  socket.on("timer-passcount-change", (lobbyId, timer, passCount) => {
    rooms[`${lobbyId}`].totalTimer = timer;
    rooms[`${lobbyId}`].totalPassCount = passCount;
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("hmm", (rdy) => {
    console.log("hmm", rdy);
  });
  socket.on("delete-from-lobby", (currentTeam, lobbyId, isReady) => {
    if (!rooms[`${lobbyId}`]) {
      return;
    }
    console.log("im deleting from loby");
    let deletingIndex = rooms[lobbyId][`team${currentTeam}`].findIndex(
      (player) => {
        return Object.keys(player)[0] === socket.id;
      }
    );
    console.log("delete ondex from lobby", deletingIndex);
    if (deletingIndex === -1) {
      return;
    }

    io.in(lobbyId).emit("play-sound-lobby", "user-logout");
    rooms[lobbyId].memberCount -= 1;
    if (isReady) {
      console.log("adam hazir");
      rooms[lobbyId].readyMemberCount -= 1;
    }

    rooms[lobbyId][`team${currentTeam}`].splice(deletingIndex, 1);
    delete roomsSockets[lobbyId][socket.id];
    rooms[lobbyId].roomLeader = Object.keys(roomsSockets[lobbyId])[0];
    io.in(lobbyId).emit("lobby", rooms[lobbyId]);
  });
  socket.on("called-leave", () => {
    console.log("im called before leave");
  });
  socket.on("disconnect", () => {
    console.log("I LOST INTERNET");
    let lobbyId = Object.keys(rooms).find(
      (room) => socket.id in roomsSockets[room]
    );
    if (lobbyId) {
      io.in(lobbyId).emit("play-sound-lobby", "user-logout");
      let currentTeam = 1;
      rooms[lobbyId].team2.forEach((player) => {
        if (Object.keys(player)[0] === socket.id) {
          currentTeam = 2;
        }
      });
      let deletingIndex = rooms[lobbyId][`team${currentTeam}`].findIndex(
        (player) => {
          return Object.keys(player)[0] === socket.id;
        }
      );

      rooms[lobbyId][`team${currentTeam}`].splice(deletingIndex, 1);
      rooms[lobbyId].memberCount--;
      delete roomsSockets[lobbyId][socket.id];
      rooms[lobbyId].roomLeader = Object.keys(roomsSockets[lobbyId])[0];
      if (gameRooms[lobbyId].isGameOn) {
        let isInGame = false;
        gameRooms[lobbyId][`team${currentTeam}`].forEach((player) => {
          if (Object.keys(player)[0] === socket.id) {
            isInGame = true;
          }
        });
        if (isInGame) {
          console.log("it is in game");
          let deletingIndexGame = gameRooms[lobbyId][
            `team${currentTeam}`
          ].findIndex((player) => {
            return Object.keys(player)[0] === socket.id;
          });
          gameRooms[lobbyId][`team${currentTeam}`].splice(deletingIndexGame, 1);
          gameRooms[lobbyId].roomLeader = Object.keys(roomsSockets[lobbyId])[0];
          gameRooms[lobbyId].memberCount--;
          gameRooms[lobbyId].readyMemberCount--;
          rooms[lobbyId].readyMemberCount--;
          io.in(lobbyId).emit("room-update", gameRooms[lobbyId]);
          io.in(lobbyId).emit("lobby", rooms[lobbyId]);

          if (
            currentTeam === rooms[lobbyId].teamTurn &&
            rooms[lobbyId][`overAllTurn${currentTeam}`] === deletingIndexGame
          ) {
            gameRooms[lobbyId][`overAllTurn${currentTeam}`] =
              gameRooms[lobbyId][`overAllTurn${currentTeam}`] %
              gameRooms[lobbyId][`team${currentTeam}`].length;
            io.in(lobbyId).emit("turn-ended");
          }
          if (
            gameRooms[lobbyId].team1.length < 2 ||
            gameRooms[lobbyId].team2.length < 2
          ) {
            gameRooms[lobbyId].isGameInterrupted = true;
            gameRooms[lobbyId].isTimerOn = false;
            clearInterval(roomIntervals[lobbyId].myInterval);
            io.in(lobbyId).emit("room-update", gameRooms[lobbyId]);
          }
        }
      } else {
        rooms[lobbyId].readyMemberCount = 0;
        io.in(lobbyId).emit("ready-reset");
      }
      io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
    } else {
      console.log("NO LOBBY FOUND DISCONNECT");
    }
  });

  socket.on("user-not-ready", (lobbyId) => {
    io.in(lobbyId).emit("play-sound-lobby", "ready-off");
    rooms[`${lobbyId}`].readyMemberCount--;
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("change-team", (currentTeam, lobbyId, isReady) => {
    io.in(lobbyId).emit("play-sound-lobby", "change-team");
    newTeam = currentTeam === 1 ? 2 : 1;
    if (isReady) {
      rooms[`${lobbyId}`].readyMemberCount--;
    }
    let deletingIndex = rooms[`${lobbyId}`][`team${currentTeam}`].findIndex(
      (player) => {
        return Object.keys(player)[0] === socket.id;
      }
    );
    let tmpUser = rooms[`${lobbyId}`][`team${currentTeam}`][deletingIndex];
    rooms[`${lobbyId}`][`team${currentTeam}`].splice(deletingIndex, 1);
    rooms[`${lobbyId}`][`team${newTeam}`].push(tmpUser);

    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("print-rooms", () => {
    console.log(socket.rooms);
    console.log();
  });
});

server.listen(PORT);
