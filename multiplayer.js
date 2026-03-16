(() => {
  const hubTabs = [...document.querySelectorAll(".hub-tab")];
  const hubPages = {
    countLabHub: document.getElementById("countLabHub"),
    multiplayerHub: document.getElementById("multiplayerHub"),
  };

  const multiNameInput = document.getElementById("multiNameInput");
  const joinCodeInput = document.getElementById("joinCodeInput");
  const createRoomBtn = document.getElementById("createRoomBtn");
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const sitOutBtn = document.getElementById("sitOutBtn");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");
  const roomPanel = document.getElementById("roomPanel");
  const roomCodeLabel = document.getElementById("roomCodeLabel");
  const myNameLabel = document.getElementById("myNameLabel");
  const roomStatus = document.getElementById("roomStatus");
  const multiError = document.getElementById("multiError");
  const tablePhaseLabel = document.getElementById("tablePhaseLabel");
  const multiDealerCards = document.getElementById("multiDealerCards");
  const multiDealerValue = document.getElementById("multiDealerValue");
  const multiPlayerSeats = document.getElementById("multiPlayerSeats");
  const hostActions = document.getElementById("hostActions");
  const betInput = document.getElementById("betInput");
  const placeBetBtn = document.getElementById("placeBetBtn");
  const clearBetBtn = document.getElementById("clearBetBtn");
  const rebuyBtn = document.getElementById("rebuyBtn");
  const startRoundHostBtn = document.getElementById("startRoundHostBtn");
  const hitMultiBtn = document.getElementById("hitMultiBtn");
  const standMultiBtn = document.getElementById("standMultiBtn");
  const doubleMultiBtn = document.getElementById("doubleMultiBtn");
  const splitMultiBtn = document.getElementById("splitMultiBtn");

  const phaseLabelMap = {
    lobby: "Lobby",
    betting: "Betting",
    playing: "Playing",
    dealer: "Dealer Turn",
  };

  const seatOrder = [0, 1, 6, 2, 5, 3, 4];

  let socket = null;
  let clientId = null;
  let roomState = null;
  let selectedPlayerId = null;
  let hostAdjustAmount = 100;
  let reconnectTimer = null;

  function setActiveHub(targetId) {
    for (const tab of hubTabs) {
      tab.classList.toggle("active", tab.dataset.hubTarget === targetId);
    }
    for (const [key, page] of Object.entries(hubPages)) {
      page.classList.toggle("hidden", key !== targetId);
    }
  }

  function setMultiMessage(text, tone = "neutral") {
    multiError.textContent = text;
    multiError.classList.remove("good", "warn");
    if (tone === "good" || tone === "warn") {
      multiError.classList.add(tone);
    }
  }

  function setRoomStatus(text, tone = "neutral") {
    roomStatus.textContent = text;
    roomStatus.classList.remove("good", "warn");
    if (tone === "good" || tone === "warn") {
      roomStatus.classList.add(tone);
    }
  }

  function getDisplayName() {
    const raw = multiNameInput.value.trim();
    if (raw) {
      return raw.slice(0, 20);
    }
    return `Player${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function sendMessage(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setMultiMessage("Keine Verbindung zum Server. Warte auf Reconnect...", "warn");
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function createCardNode(card) {
    if (card.hidden) {
      const hidden = document.createElement("span");
      hidden.className = "card-back";
      hidden.textContent = "??";
      return hidden;
    }

    const node = document.createElement("span");
    node.className = `table-card${card.isRed ? " red" : ""}`;
    node.textContent = card.label;
    return node;
  }

  function renderDealer(cards) {
    multiDealerCards.innerHTML = "";
    for (const card of cards) {
      multiDealerCards.append(createCardNode(card));
    }
  }

  function shouldPopupOpenDown(seatNumber) {
    return seatNumber === 3 || seatNumber === 4;
  }

  function getOrderedPlayers(players, viewerId) {
    const mine = players.find((player) => player.id === viewerId);
    const others = players.filter((player) => player.id !== viewerId);
    if (!mine) {
      return players;
    }
    return [mine, ...others];
  }

  function renderPlayers(players, viewerId, hostCanSelect) {
    multiPlayerSeats.innerHTML = "";

    const ordered = getOrderedPlayers(players, viewerId);
    for (let i = 0; i < ordered.length; i += 1) {
      const player = ordered[i];
      const seatNumber = seatOrder[i % seatOrder.length];
      const seatClass = `seat-${seatNumber}`;
      const node = document.createElement("article");
      const selectedClass = selectedPlayerId === player.id ? " selected" : "";
      const selectableClass = hostCanSelect ? " selectable" : "";
      const popupDownClass =
        selectedPlayerId === player.id && shouldPopupOpenDown(seatNumber) ? " popup-down" : "";
      node.className = `table-seat player-seat ${seatClass}${player.id === viewerId ? " self" : ""}${selectedClass}${selectableClass}${popupDownClass}`;
      node.dataset.playerId = player.id;
      node.dataset.playerName = player.name;

      const head = document.createElement("header");
      head.className = "seat-head";
      const hostTag = player.isHost ? " (Host)" : "";
      const totalBet = Number.isFinite(player.totalBet) ? player.totalBet : player.bet;
      head.innerHTML = `<strong>${player.name}${hostTag}</strong><span class="player-meta">Bank: ${player.balance} | Einsatz: ${totalBet} | ${player.statusLabel}</span>`;

      const handsWrap = document.createElement("div");
      handsWrap.className = `seat-hands${player.hands.length <= 1 ? " single" : ""}`;

      for (let handIndex = 0; handIndex < player.hands.length; handIndex += 1) {
        const hand = player.hands[handIndex];
        const handGroup = document.createElement("section");
        handGroup.className = `seat-hand-group${hand.isActive ? " active" : ""}`;

        const handMeta = document.createElement("div");
        handMeta.className = "seat-hand-meta";
        const valueText = hand.handValue === null ? "-" : hand.handValue;
        // Show doubled indicator in the hand label
        const doubledTag = hand.isDoubled ? " [2x]" : "";
        const handLabel =
          player.hands.length > 1
            ? `Hand ${handIndex + 1}${hand.isActive ? "*" : ""}${doubledTag}`
            : `Hand${doubledTag}`;
        handMeta.innerHTML = `<span>${handLabel}</span><span>${valueText}</span>`;

        const cards = document.createElement("div");
        cards.className = "seat-cards";
        for (const card of hand.cards) {
          cards.append(createCardNode(card));
        }

        // Bet chip display below cards
        const betChip = document.createElement("div");
        betChip.className = `hand-bet-chip${hand.isDoubled ? " doubled" : ""}`;
        betChip.textContent = hand.isDoubled ? `${hand.bet} (2x)` : String(hand.bet);

        handGroup.append(handMeta, cards, betChip);
        handsWrap.append(handGroup);
      }

      if (player.hands.length === 0) {
        const empty = document.createElement("div");
        empty.className = "seat-empty";
        empty.textContent = "Noch keine Karten";
        handsWrap.append(empty);
      }

      if (hostCanSelect && selectedPlayerId === player.id) {
        const popup = document.createElement("div");
        popup.className = "seat-popup";
        popup.innerHTML = `
          <p class="seat-popup-title">${player.name} anpassen</p>
          <div class="seat-popup-row">
            <input class="seat-popup-input" type="number" min="10" step="10" value="${hostAdjustAmount}" />
            <button class="btn seat-popup-btn" data-popup-action="give" data-player-id="${player.id}">+ Chips</button>
            <button class="btn seat-popup-btn" data-popup-action="take" data-player-id="${player.id}">- Chips</button>
            <button class="btn seat-popup-btn seat-popup-close" data-popup-action="close">X</button>
          </div>
        `;
        node.append(popup);
      }

      node.append(head, handsWrap);
      multiPlayerSeats.append(node);
    }
  }

  function renderRoom(room) {
    roomState = room;
    roomPanel.classList.remove("hidden");

    roomCodeLabel.textContent = room.code;
    myNameLabel.textContent = room.viewer.name || "-";
    setRoomStatus(room.message || "Warte auf Aktionen...");
    const phaseLabel = phaseLabelMap[room.phase] || room.phase;
    tablePhaseLabel.textContent = `${phaseLabel} | Shoe: ${room.shoeRemaining}`;
    if (!room.viewer.canAdjustPlayers) {
      selectedPlayerId = null;
    }
    if (selectedPlayerId && !room.players.some((player) => player.id === selectedPlayerId)) {
      selectedPlayerId = null;
    }
    renderDealer(room.dealerHand);
    multiDealerValue.textContent = room.dealerValue !== null ? `Wert: ${room.dealerValue}` : "Wert: -";
    renderPlayers(room.players, room.viewer.id, room.viewer.canAdjustPlayers);
    sitOutBtn.disabled = !room.viewer.inRoom;
    sitOutBtn.textContent = room.viewer.isSittingOut ? "Wieder hinsetzen" : "Aufstehen";

    betInput.disabled = !room.viewer.canBet;
    placeBetBtn.disabled = !room.viewer.canBet;
    clearBetBtn.disabled = !room.viewer.canBet || room.viewer.bet <= 0;
    rebuyBtn.disabled = !room.viewer.canRebuyAll;
    startRoundHostBtn.disabled = !room.viewer.canStartRound;
    hitMultiBtn.disabled = !room.viewer.canHit;
    standMultiBtn.disabled = !room.viewer.canStand;
    doubleMultiBtn.disabled = !room.viewer.canDouble;
    splitMultiBtn.disabled = !room.viewer.canSplit;
    hostActions.classList.toggle("hidden", !room.viewer.isHost);
  }

  function clearRoomView() {
    roomState = null;
    selectedPlayerId = null;
    roomPanel.classList.add("hidden");
    roomCodeLabel.textContent = "-";
    myNameLabel.textContent = "-";
    multiPlayerSeats.innerHTML = "";
    multiDealerCards.innerHTML = "";
    multiDealerValue.textContent = "Wert: -";
    tablePhaseLabel.textContent = "Warte auf Bets";
    setRoomStatus("Kein aktiver Raum.");
    sitOutBtn.disabled = true;
    sitOutBtn.textContent = "Aufstehen";
    placeBetBtn.disabled = true;
    clearBetBtn.disabled = true;
    rebuyBtn.disabled = true;
    startRoundHostBtn.disabled = true;
    hitMultiBtn.disabled = true;
    standMultiBtn.disabled = true;
    doubleMultiBtn.disabled = true;
    splitMultiBtn.disabled = true;
    hostActions.classList.add("hidden");
  }

  function connectSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${window.location.host}`);

    socket.addEventListener("open", () => {
      setMultiMessage("Server verbunden.", "good");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    socket.addEventListener("message", (event) => {
      let data = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "welcome") {
        clientId = data.clientId;
        return;
      }

      if (data.type === "room_state") {
        renderRoom(data.room);
        return;
      }

      if (data.type === "left_room") {
        clearRoomView();
        setMultiMessage("Du hast den Raum verlassen.");
        return;
      }

      if (data.type === "error") {
        setMultiMessage(data.message, "warn");
        return;
      }

      if (data.type === "info") {
        setMultiMessage(data.message);
      }
    });

    socket.addEventListener("close", () => {
      setMultiMessage("Verbindung getrennt. Reconnect läuft...", "warn");
      reconnectTimer = setTimeout(connectSocket, 1400);
    });
  }

  for (const tab of hubTabs) {
    tab.addEventListener("click", () => {
      setActiveHub(tab.dataset.hubTarget);
    });
  }

  joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  });

  createRoomBtn.addEventListener("click", () => {
    connectSocket();
    sendMessage({
      type: "create_room",
      name: getDisplayName(),
      clientId,
    });
  });

  joinRoomBtn.addEventListener("click", () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) {
      setMultiMessage("Bitte einen Raumcode eingeben.", "warn");
      return;
    }

    connectSocket();
    sendMessage({
      type: "join_room",
      name: getDisplayName(),
      code,
      clientId,
    });
  });

  leaveRoomBtn.addEventListener("click", () => {
    sendMessage({ type: "leave_room" });
  });

  sitOutBtn.addEventListener("click", () => {
    if (!roomState || !roomState.viewer.inRoom) {
      return;
    }
    sendMessage({ type: "toggle_sit_out" });
  });

  placeBetBtn.addEventListener("click", () => {
    const amount = Number(betInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMultiMessage("Bet muss eine positive Zahl sein.", "warn");
      return;
    }
    sendMessage({ type: "place_bet", amount: Math.floor(amount) });
  });

  clearBetBtn.addEventListener("click", () => {
    sendMessage({ type: "clear_bet" });
  });

  rebuyBtn.addEventListener("click", () => {
    sendMessage({ type: "rebuy" });
  });

  startRoundHostBtn.addEventListener("click", () => {
    sendMessage({ type: "start_round" });
  });

  hitMultiBtn.addEventListener("click", () => {
    sendMessage({ type: "player_action", action: "hit" });
  });

  standMultiBtn.addEventListener("click", () => {
    sendMessage({ type: "player_action", action: "stand" });
  });

  doubleMultiBtn.addEventListener("click", () => {
    sendMessage({ type: "player_action", action: "double" });
  });

  splitMultiBtn.addEventListener("click", () => {
    sendMessage({ type: "player_action", action: "split" });
  });

  multiPlayerSeats.addEventListener("click", (event) => {
    if (!roomState || !roomState.viewer.canAdjustPlayers) {
      return;
    }

    const popupAction = event.target.closest("[data-popup-action]");
    if (popupAction) {
      const action = popupAction.dataset.popupAction;
      if (action === "close") {
        selectedPlayerId = null;
        renderRoom(roomState);
        return;
      }

      const targetId = popupAction.dataset.playerId || selectedPlayerId;
      if (!targetId) {
        setMultiMessage("Spieler nicht gefunden.", "warn");
        return;
      }

      const popupRoot = popupAction.closest(".seat-popup");
      const input = popupRoot ? popupRoot.querySelector(".seat-popup-input") : null;
      const amount = Number(input ? input.value : hostAdjustAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setMultiMessage("Bitte einen gültigen Betrag eingeben.", "warn");
        return;
      }

      hostAdjustAmount = Math.floor(amount);
      sendMessage({
        type: "host_adjust_player",
        targetId,
        delta: action === "give" ? hostAdjustAmount : -hostAdjustAmount,
      });
      return;
    }

    const seat = event.target.closest(".player-seat");
    if (!seat) {
      return;
    }

    const playerId = seat.dataset.playerId || null;
    selectedPlayerId = selectedPlayerId === playerId ? null : playerId;
    renderRoom(roomState);
  });

  multiPlayerSeats.addEventListener("input", (event) => {
    const input = event.target.closest(".seat-popup-input");
    if (!input) {
      return;
    }

    const amount = Number(input.value);
    if (Number.isFinite(amount) && amount > 0) {
      hostAdjustAmount = Math.floor(amount);
    }
  });

  clearRoomView();
  setActiveHub("countLabHub");
  connectSocket();
})();
