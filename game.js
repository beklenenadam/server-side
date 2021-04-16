exports.startGame = function (
  io,
  socket,
  room,
  lobbyId,
  faulCards,
  roomSockets,
  gameInterval,
  lobby
) {
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
        roomSockets[socket.id].emit("role-controller", faulCards[cardToSend]);
      }
      io.in(lobbyId).emit("room-update", room);
    }

    socket.emit("room-start", room);
  });

  function toggleTimer() {
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
        io.in(lobbyId).emit("room-update", room);
        io.in(lobbyId).emit("turn-ended");
        io.in(lobbyId).emit("play-sound", "turn-ended");
        clearInterval(gameInterval.myInterval);
      }, 1000);
    }
  }

  socket.on("toggle-time", () => {
    io.in(lobbyId).emit("play-sound", "toggle-timer");

    room.isTimerOn = !room.isTimerOn;
    if (room.isTimerOn) {
      gameInterval.myInterval = setInterval(toggleTimer, 1000);
    } else {
      clearInterval(gameInterval.myInterval);
    }
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
      io.in(lobbyId).emit("play-sound", "faul");
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
        roomSockets[Object.keys(player)[0]].emit(
          "role-teller",
          faulCards[randomCard]
        );
      } else {
        roomSockets[Object.keys(player)[0]].emit("role-finder");
      }
    });

    room[`team${otherTeam}`].forEach((player) => {
      roomSockets[Object.keys(player)[0]].emit(
        "role-controller",
        faulCards[randomCard]
      );
    });
    io.in(lobbyId).emit("room-update", room);
    io.in(lobbyId).emit("lobby", lobby);
  });

  function deletePlayer(currentTeam) {
    if (!room) {
      return;
    }
    room.memberCount = room.memberCount - 1;
    room.readyMemberCount -= 1;
    let deletingIndex = room[`team${currentTeam}`].findIndex((player) => {
      return Object.keys(player)[0] === socket.id;
    });
    if (deletingIndex === -1) {
      return;
    }
    room[`team${currentTeam}`].splice(deletingIndex, 1);
    room.roomLeader = Object.keys(roomSockets)[0];
    io.in(lobbyId).emit("room-update", room);
    if (
      currentTeam === room.teamTurn &&
      room[`overAllTurn${currentTeam}`] === deletingIndex
    ) {
      room[`overAllTurn${currentTeam}`] =
        room[`overAllTurn${currentTeam}`] % room[`team${currentTeam}`].length;

      io.in(lobbyId).emit("room-update", room);
      io.in(lobbyId).emit("turn-ended");
    }

    if (room.team1.length < 2 || room.team2.length < 2) {
      room.isGameInterrupted = true;
      room.isTimerOn = false;
      clearInterval(gameInterval.myInterval);
      io.in(lobbyId).emit("room-update", room);
    }
  }

  socket.on("delete-player", deletePlayer);
};
