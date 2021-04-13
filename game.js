exports.startGame = function (
  io,
  socket,
  room,
  lobbyId,
  tabooCards,
  roomSockets,
  gameInterval,
  lobby
) {
  //game variables
  // let usedWords = [];
  // let overAllTurn = 0;
  // let team1Members = [];
  // let team2Members = [];
  // let team1Turn = 0;
  // let team2Turn = 0;
  //start the game
  // io.in(lobbyId).emit("enough-players");
  // io.in(lobbyId).emit("start-game");

  //game-entered
  socket.on("game-entered", () => {
    if (!room.isGameOn) {
      room.timer = room.totalTimer;
      room.passCount = room.totalPassCount;
    } else {
      let myTeam = 2;
      room.team1.forEach((player) => {
        if (Object.keys(player)[0] === socket.id) {
          myTeam = 1;
        }
      });
      let cardToSend =
        room.lastCard === -1
          ? room.usedCards[room.usedCards.length - 1]
          : room.usedCards[room.usedCards.length - 2];
      if (room.teamTurn === myTeam) {
        roomSockets[socket.id].emit("role-finder");
      } else {
        roomSockets[socket.id].emit("role-controller", tabooCards[cardToSend]);
      }
      io.in(lobbyId).emit("room-update", room);
    }

    //finally
    socket.emit("room-start", room);
  });

  function toggleTimer() {
    //console.log("intervaldeyim");
    io.in(lobbyId).emit("time-update", room.timer);
    room.timer--;
    if (room.timer === -1) {
      setTimeout(() => {
        room.isTimerOn = false;
        room.timer = room.totalTimer;
        room.passCount = room.totalPassCount;
        room[`overAllTurn${room.teamTurn}`] =
          (room[`overAllTurn${room.teamTurn}`] + 1) %
          room[`team${room.teamTurn}`].length;
        room.teamTurn = room.teamTurn === 1 ? 2 : 1;
        //console.log("en son odanin hali", room);
        io.in(lobbyId).emit("room-update", room);
        io.in(lobbyId).emit("turn-ended");
        io.in(lobbyId).emit("play-sound", "turn-ended");
        clearInterval(gameInterval.myInterval);
      }, 1000);
    }
  }

  socket.on("toggle-time", () => {
    io.in(lobbyId).emit("play-sound", "toggle-timer");
    //console.log("toggle timedayim");
    //console.log("TOOGLE TIME", room);

    room.isTimerOn = !room.isTimerOn;
    //console.log("TOGGLE TIME", room.isTimerOn);

    //console.log("intervalden once");
    //let myInterval;
    //room.gameInterval = 1;
    if (room.isTimerOn) {
      //let tmpTimer;
      gameInterval.myInterval = setInterval(toggleTimer, 1000);
      //gameInterval = tmpTimer[Symbol.toPrimitive]();
      //console.log("game interval opened", gameInterval);
    } else {
      //console.log("game interval before closed", gameInterval);
      clearInterval(gameInterval.myInterval);
      //gameInterval = null;
      //console.log("game interval after closed", gameInterval);
    }
    //console.log(socket.id, gameInterval.myInterval);
    io.in(lobbyId).emit("room-update", room);
  });

  socket.on("new-card", (currentTeam, action, defaultCard = 0) => {
    room.isGameOn = true;
    lobby.isGameOn = true;
    let otherTeam = currentTeam === 1 ? 2 : 1;
    let randomCard;
    room.isNewTurn = false;
    if (action === "n") {
      room.isNewTurn = true;
    } else if (action === "c") {
      io.in(lobbyId).emit("play-sound", "correct");
      room[`team${currentTeam}Score`]++;
      room.lastOperation = 1;
    } else if (action === "faul") {
      io.in(lobbyId).emit("play-sound", "taboo");
      room[`team${currentTeam}Score`]++;
      room.lastOperation = 1;
      [otherTeam, currentTeam] = [currentTeam, otherTeam];
	}  else if (action === "p") {
      io.in(lobbyId).emit("play-sound", "pass");
      room.lastOperation = 0;
      room.passCount--;
    } else if (action === "b") {
      io.in(lobbyId).emit("play-sound", "go-back");
      room[`team${room.teamTurn}Score`] -= room.lastOperation;
      room.lastOperation = 0;
      randomCard = defaultCard;
      room.lastCard = room.usedCards[room.usedCards.length - 1];
    }
    //console.dir(io.sockets);
    //console.log("new card", socket.id, currentTeam);
    if (room.lastCard !== -1 && defaultCard === 0) {
      randomCard = room.lastCard;
      room.lastCard = -1;
    } else if (defaultCard === 0) {
      randomCard = Math.floor(Math.random() * Math.floor(4000));
      while (room.usedCards.includes(randomCard)) {
        randomCard = Math.floor(Math.random() * Math.floor(4000));
      }
      room.usedCards.push(randomCard);
    }

    room[`team${currentTeam}`].forEach((player) => {
      if (
        Object.keys(player)[0] ===
        Object.keys(
          room[`team${currentTeam}`][room[`overAllTurn${currentTeam}`]]
        )[0]
      ) {
        //socket.emit("role-teller", tabooCards[randomCard]);
        roomSockets[Object.keys(player)[0]].emit(
          "role-teller",
          tabooCards[randomCard]
        );
      } else {
        //io.to(Object.keys(player)[0]).emit("role-finder");
        roomSockets[Object.keys(player)[0]].emit("role-finder");
      }
    });

    //console.log("otherr team", otherTeam);
    room[`team${otherTeam}`].forEach((player) => {
      // io.to(Object.keys(player)[0]).emit(
      //   "role-controller",
      //   tabooCards[randomCard]
      // );
      roomSockets[Object.keys(player)[0]].emit(
        "role-controller",
        tabooCards[randomCard]
      );
    });
    io.in(lobbyId).emit("room-update", room);
    io.in(lobbyId).emit("lobby", lobby);
  });

  //leave the game

  function deletePlayer(currentTeam) {
    //socket.removeAllListeners();
    if (!room) {
      //socket.emit("bad-url");
      return;
    }
    //io.in(lobbyId).emit("play-sound", "logout-game");
    console.log("im deleting from game", socket.id);
    room.memberCount = room.memberCount - 1;
    room.readyMemberCount -= 1;
    //lobby.memberCount -= 1;
    //lobby.readyMemberCount -= 1;
    let deletingIndex = room[`team${currentTeam}`].findIndex((player) => {
      return Object.keys(player)[0] === socket.id;
      //console.log(player);
    });
    console.log(deletingIndex);
    if (deletingIndex === -1) {
      return;
    }
    //console.log("before room", room.team1, room.team2);
    room[`team${currentTeam}`].splice(deletingIndex, 1);
    //lobby[`team${currentTeam}`].splice(deletingIndex, 1);
    //delete roomSockets[socket.id];
    room.roomLeader = Object.keys(roomSockets)[0];
    //lobby.roomLeader = Object.keys(roomSockets)[0];
    io.in(lobbyId).emit("room-update", room);
    //io.in(lobbyId).emit("lobby", lobby);
    if (
      currentTeam === room.teamTurn &&
      room[`overAllTurn${currentTeam}`] === deletingIndex
    ) {
      room[`overAllTurn${currentTeam}`] =
        room[`overAllTurn${currentTeam}`] % room[`team${currentTeam}`].length;
      console.log("new turn", room[`overAllTurn${currentTeam}`]);

      io.in(lobbyId).emit("room-update", room);
      io.in(lobbyId).emit("turn-ended");
    }

    if (room.team1.length < 2 || room.team2.length < 2) {
      //TODO: stop the game
      room.isGameInterrupted = true;
      room.isTimerOn = false;
      clearInterval(gameInterval.myInterval);
      io.in(lobbyId).emit("room-update", room);
    }
    //console.log("after room", room.team1, room.team2);
  }

  socket.on("delete-player", deletePlayer);
  //console.log(socket.id, socket.eventNames());
};
