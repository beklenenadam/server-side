const express = require("express");
//const path = require("path");
const http = require("http");
const PORT = process.env.PORT || 3000;
const app = express();
const cors = require("cors");
const fs = require("fs");
const evnts = require("events");
//const uniqid = require("uniqid");
const { startGame } = require("./game");
//const { startGame } = require("repl");

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

// cors: {
//   origin: "*",
//   methods: ["GET", "POST"],
// },

const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

//variables
let rooms = {};
let gameRooms = {};
let roomsSockets = {};
let roomIntervals = {};
let toPush = null;
let tabooCards;
fs.readFile("words.json", (err, data) => {
  if (err) throw err;
  tabooCards = JSON.parse(data);
});
// io.set("heartbeat timeout", 4000);
// io.set("heartbeat interval", 2000);

io.engine.generateId = (req) => {
  return Math.random().toString(36).substr(2, 5);
};
//Handle connnection
io.on("connection", (socket) => {
  // console.log("rooms", socket.rooms.size);
  // if (socket.rooms.size === 1) {
  // }

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
    // rooms[`${socket.id}`].team1.push(
    //   `user${rooms[`${socket.id}`].totalConnected}`
    // );
    rooms[`${socket.id}`].team1.push({
      [`${socket.id}`]: `Oyuncu ${rooms[`${socket.id}`].totalConnected}`,
    });
    roomsSockets[socket.id] = {};
    roomsSockets[socket.id][socket.id] = socket;
    gameRooms[socket.id] = {};
    gameRooms[socket.id].isGameOn = false;
    io.in(socket.id).emit("lobby", rooms[`${socket.id}`]);
  });

  // socket.on("remove-all-listeners", () => {
  //   //console.log("eventler", socket.eventNames());
  //   //console.log("eventler", socket.listenersAny());
  //   //console.log("hmm", getEventListeners(socket, "delete-player"));
  //   console.log("asda");
  //   //evnts.getEventListeners(socket, "delete-player");
  //   socket.removeAllListeners(["game-entered"]);
  //   socket.removeAllListeners(["toggle-time"]);
  //   socket.removeAllListeners(["new-card"]);
  //   socket.removeAllListeners(["delete-player"]);
  // });
  socket.on("login-lobby", (lobbyId) => {
    if (!rooms[`${lobbyId}`]) {
      //socket.emit("bad-url");
      console.log("login lobby failed");
      return;
    }
    io.in(lobbyId).emit("play-sound-lobby", "user-joined");
    socket.join(lobbyId);
    rooms[`${lobbyId}`].memberCount++;
    rooms[`${lobbyId}`].totalConnected++;
    toPush = `Oyuncu ${rooms[`${lobbyId}`].totalConnected}`;
    if (
      // Object.keys(rooms[`${lobbyId}`].team1).length >
      // Object.keys(rooms[`${lobbyId}`].team2).length
      rooms[`${lobbyId}`].team1.length > rooms[`${lobbyId}`].team2.length
    ) {
      //rooms[`${lobbyId}`].team2.push(toPush);
      rooms[`${lobbyId}`].team2.push({ [socket.id]: toPush });
    } else {
      //rooms[`${lobbyId}`].team1.push(toPush);
      //rooms[`${lobbyId}`].team1[socket.id] = toPush;
      rooms[`${lobbyId}`].team1.push({ [socket.id]: toPush });
    }
    //console.log(rooms[`${lobbyId}`]);
    roomsSockets[lobbyId][socket.id] = socket;
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("user-ready", (newUserName, lobbyId, currentTeam) => {
    //startGame(io, socket, rooms[`${lobbyId}`], lobbyId);
    io.in(lobbyId).emit("play-sound-lobby", "ready-toggle");
    rooms[`${lobbyId}`].readyMemberCount++;
    //console.log("takim", rooms[`${lobbyId}`][`team${currentTeam}`]);
    //console.log("ismim", rooms[`${lobbyId}`][`team${currentTeam}`][socket.id]);
    //rooms[`${lobbyId}`][`team${currentTeam}`][socket.id] = newUserName;
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

      // gameRooms[lobbyId].team1 = JSON.parse(
      //   JSON.stringify(rooms[`${lobbyId}`].team1)
      // );
      // gameRooms[lobbyId].team2 = JSON.parse(
      //   JSON.stringify(rooms[`${lobbyId}`].team2)
      // );
      gameRooms[lobbyId].memberCount++;
      //gameRooms[lobbyId].memberCount = rooms[`${lobbyId}`].memberCount;
      gameRooms[lobbyId].readyMemberCount++;
      //gameRooms[lobbyId].readyMemberCount =
      //rooms[`${lobbyId}`].readyMemberCount;
      gameRooms[lobbyId].totalConnected++;
      //gameRooms[lobbyId].totalConnected = rooms[`${lobbyId}`].totalConnected;

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
      // console.log("lobi", rooms[lobbyId]);
      // console.log("oyun", gameRooms[lobbyId]);
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
        //TODO: Oyunu baslat
        //rooms[`${lobbyId}`].isGameOn = true;
        gameRooms[lobbyId] = JSON.parse(JSON.stringify(rooms[`${lobbyId}`]));
        io.in(lobbyId).emit("enough-players");
        io.in(lobbyId).emit("start-game");
        //startGame(io, socket, rooms[`${lobbyId}`], lobbyId);
        //
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
      tabooCards,
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
    //socket.removeAllListeners();
    if (!rooms[`${lobbyId}`]) {
      //socket.emit("bad-url");
      return;
    }
    console.log("im deleting from loby");
    let deletingIndex = rooms[lobbyId][`team${currentTeam}`].findIndex(
      (player) => {
        return Object.keys(player)[0] === socket.id;
        //console.log(player);
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
    //console.log("lobi", rooms[lobbyId]);
  });
  socket.on("called-leave", () => {
    console.log("im called before leave");
  });
  // DISCONNECT - TO HANDLE LATER - MAYBE
  socket.on("disconnect", () => {
    console.log("I LOST INTERNET");
    //io.in(lobbyId).emit("play-sound-lobby", "user-logout");
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
          //console.log(player);
        }
      );

      rooms[lobbyId][`team${currentTeam}`].splice(deletingIndex, 1);
      rooms[lobbyId].memberCount--;
      delete roomsSockets[lobbyId][socket.id];
      rooms[lobbyId].roomLeader = Object.keys(roomsSockets[lobbyId])[0];
      //console.log(
      //  gameRooms[lobbyId].isGameOn,
      //  socket.id in gameRooms[lobbyId][`team${currentTeam}`]
      //);
      //console.log(socket.id, gameRooms[lobbyId][`team${currentTeam}`]);
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
            //console.log(player);
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
          //handle if not enough players
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

  // socket.on("try-start-game", (lobbyId) => {
  //   //rooms[`${lobbyId}`].isGameOn = true;
  //   //io.in(lobbyId).emit("enough-players");
  //   //io.in(lobbyId).emit("start-game");
  //   //game logic
  //   gameRooms[lobbyId] = JSON.parse(JSON.stringify(rooms[`${lobbyId}`]));
  //   //console.log("OYUN BASLADI GAME ROOM", gameRooms[lobbyId]);
  //   io.in(lobbyId).emit("enough-players");
  //   io.in(lobbyId).emit("start-game");
  // });
  socket.on("user-not-ready", (lobbyId) => {
    io.in(lobbyId).emit("play-sound-lobby", "ready-off");
    rooms[`${lobbyId}`].readyMemberCount--;
    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("change-team", (currentTeam, lobbyId, isReady) => {
    io.in(lobbyId).emit("play-sound-lobby", "change-team");
    newTeam = currentTeam === 1 ? 2 : 1;
    //console.log(currentTeam);
    if (isReady) {
      rooms[`${lobbyId}`].readyMemberCount--;
    }
    // rooms[`${lobbyId}`][`team${newTeam}`][socket.id] =
    //   rooms[`${lobbyId}`][`team${currentTeam}`][socket.id];
    // console.log("yeni takim", newTeam);
    // delete rooms[`${lobbyId}`][`team${currentTeam}`][socket.id];
    let deletingIndex = rooms[`${lobbyId}`][`team${currentTeam}`].findIndex(
      (player) => {
        return Object.keys(player)[0] === socket.id;
        //console.log(player);
      }
    );
    let tmpUser = rooms[`${lobbyId}`][`team${currentTeam}`][deletingIndex];
    //console.log("tmpusr", tmpUser);
    rooms[`${lobbyId}`][`team${currentTeam}`].splice(deletingIndex, 1);
    rooms[`${lobbyId}`][`team${newTeam}`].push(tmpUser);

    io.in(lobbyId).emit("lobby", rooms[`${lobbyId}`]);
  });
  socket.on("print-rooms", () => {
    console.log(socket.rooms);
    console.log();
  });
});

//Start server
server.listen(PORT);
