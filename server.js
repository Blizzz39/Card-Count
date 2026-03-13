const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const port = Number(process.env.PORT) || 3000;
const root = process.cwd();

const DEFAULT_BANKROLL = 1000;
const REBUY_AMOUNT = 1000;
const MIN_BET = 10;
const SHOE_DECKS = 6;
const MAX_PLAYERS = 7;
const MAX_HANDS = 4;
const AUTO_START_DELAY_MS = 4500;
const ROUND_SHOE_MIN_CARDS = 75;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const suits = [
  { symbol: "\u2660", isRed: false },
  { symbol: "\u2665", isRed: true },
  { symbol: "\u2666", isRed: true },
  { symbol: "\u2663", isRed: false },
];

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const rooms = new Map();
const clients = new Map();

function send(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function publicCard(card) {
  return {
    label: `${card.rank}${card.symbol}`,
    rank: card.rank,
    symbol: card.symbol,
    isRed: card.isRed,
  };
}

function createHand(bet, options = {}) {
  return {
    cards: options.cards ? [...options.cards] : [],
    bet,
    state: options.state || "playing",
    isNaturalBlackjack: Boolean(options.isNaturalBlackjack),
    fromSplitAces: Boolean(options.fromSplitAces),
    isDoubled: false,
  };
}

function makeClientId() {
  return crypto.randomBytes(6).toString("hex");
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function getUniqueRoomCode() {
  let code = makeRoomCode();
  while (rooms.has(code)) {
    code = makeRoomCode();
  }
  return code;
}

function createShoe(deckCount = SHOE_DECKS) {
  const shoe = [];
  for (let d = 0; d < deckCount; d += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        shoe.push({
          rank,
          symbol: suit.symbol,
          isRed: suit.isRed,
        });
      }
    }
  }
  shuffle(shoe);
  return shoe;
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function handValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (["10", "J", "Q", "K"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function resolveRequestPath(urlPath) {
  const sanitized = decodeURIComponent(urlPath.split("?")[0]);
  const requested = sanitized === "/" ? "/index.html" : sanitized;
  const target = path.join(root, requested);
  const normalized = path.normalize(target);

  if (!normalized.startsWith(root)) {
    return null;
  }

  return normalized;
}

function clearAutoStartTimer(room) {
  if (room.autoStartTimer) {
    clearTimeout(room.autoStartTimer);
    room.autoStartTimer = null;
  }
  room.nextAutoStartAt = null;
}

function prepareShoeForRound(room) {
  if (room.shoe.length >= ROUND_SHOE_MIN_CARDS) {
    return;
  }

  room.shoe = createShoe(SHOE_DECKS);
  room.message = "Neues gemischtes Shoe vorbereitet.";
}

function drawCard(room) {
  let card = room.shoe.pop();
  if (card) {
    return card;
  }

  room.shoe = createShoe(SHOE_DECKS);
  room.message = "Shoe war leer und wurde neu gemischt.";
  card = room.shoe.pop();
  return card;
}

function getCurrentHand(player) {
  if (!player.hands || player.hands.length === 0) {
    return null;
  }

  let index = Number(player.activeHandIndex) || 0;
  while (index < player.hands.length && player.hands[index].state !== "playing") {
    index += 1;
  }

  player.activeHandIndex = index;
  if (index >= player.hands.length) {
    return null;
  }
  return player.hands[index];
}

function refreshPlayerState(player) {
  const current = getCurrentHand(player);
  if (current) {
    player.state = "playing";
    return;
  }

  if (!player.hands || player.hands.length === 0) {
    player.state = "waiting";
    player.activeHandIndex = 0;
    return;
  }

  if (player.hands.every((hand) => hand.state === "busted")) {
    player.state = "busted";
    return;
  }
  if (player.hands.every((hand) => hand.state === "blackjack")) {
    player.state = "blackjack";
    return;
  }
  player.state = "stood";
}

function updateHandStateAfterDraw(hand) {
  const total = handValue(hand.cards);
  if (total > 21) {
    hand.state = "busted";
  } else if (total === 21) {
    hand.state = "stood";
  }
}

function getHandStatusLabel(hand) {
  const doubledTag = hand.isDoubled ? " (2x)" : "";
  switch (hand.state) {
    case "playing":
      return `Spielt${doubledTag}`;
    case "stood":
      return `Stand${doubledTag}`;
    case "busted":
      return `Bust${doubledTag}`;
    case "blackjack":
      return "Blackjack";
    default:
      return "Wartet";
  }
}

function getPlayerStatusLabel(player) {
  if (player.lastOutcome) {
    return player.lastOutcome;
  }

  if (player.state === "playing" && player.hands.length > 1) {
    const current = Math.min(player.activeHandIndex + 1, player.hands.length);
    return `Spielt H${current}/${player.hands.length}`;
  }

  switch (player.state) {
    case "playing":
      return "Spielt";
    case "stood":
      return "Stand";
    case "busted":
      return "Bust";
    case "blackjack":
      return "Blackjack";
    default:
      return player.bet >= MIN_BET ? "Bereit" : "Wartet";
  }
}

function getEligiblePlayers(room) {
  return [...room.players.values()].filter((player) => player.bet >= MIN_BET && player.balance >= player.bet);
}

function getRoundPlayers(room) {
  return [...room.players.values()].filter((player) => player.hands.length > 0);
}

function getActivePlayers(room) {
  const result = [];
  for (const player of getRoundPlayers(room)) {
    refreshPlayerState(player);
    if (player.state === "playing") {
      result.push(player);
    }
  }
  return result;
}

function canStartRound(room) {
  if (!["lobby", "betting"].includes(room.phase)) {
    return false;
  }
  return getEligiblePlayers(room).length > 0;
}

function canPlayerAct(room, player) {
  if (!player || room.phase !== "playing") {
    return false;
  }
  refreshPlayerState(player);
  return player.state === "playing" && Boolean(getCurrentHand(player));
}

function canPlayerSplit(room, player) {
  if (!canPlayerAct(room, player)) {
    return false;
  }

  const hand = getCurrentHand(player);
  if (!hand) {
    return false;
  }
  if (player.hands.length >= MAX_HANDS) {
    return false;
  }
  if (hand.cards.length !== 2) {
    return false;
  }
  if (hand.cards[0].rank !== hand.cards[1].rank) {
    return false;
  }
  if (player.balance < hand.bet) {
    return false;
  }
  return true;
}

// Double Down is allowed on the first two cards of any hand,
// unless the hand comes from split aces, or the player lacks funds.
function canPlayerDouble(room, player) {
  if (!canPlayerAct(room, player)) {
    return false;
  }

  const hand = getCurrentHand(player);
  if (!hand) {
    return false;
  }
  // Must be exactly the starting two cards
  if (hand.cards.length !== 2) {
    return false;
  }
  // Cannot double on split aces (one-card rule)
  if (hand.fromSplitAces) {
    return false;
  }
  // Need enough balance to match the current bet
  if (player.balance < hand.bet) {
    return false;
  }
  return true;
}

function scheduleAutoStart(room) {
  clearAutoStartTimer(room);

  if (!["lobby", "betting"].includes(room.phase)) {
    return;
  }

  if (getEligiblePlayers(room).length === 0) {
    return;
  }

  room.nextAutoStartAt = Date.now() + AUTO_START_DELAY_MS;
  room.autoStartTimer = setTimeout(() => {
    room.autoStartTimer = null;
    room.nextAutoStartAt = null;

    if (!rooms.has(room.code)) {
      return;
    }
    if (!["lobby", "betting"].includes(room.phase)) {
      return;
    }

    const result = startRound(room, { auto: true });
    if (!result.ok) {
      room.message = result.message;
    }
    broadcastRoom(room);
  }, AUTO_START_DELAY_MS);
}

function serializeRoomForViewer(room, viewerId) {
  const viewer = room.players.get(viewerId) || null;
  const hideDealerHoleCard = room.phase === "playing" && room.dealerHand.length > 1;
  const dealerHand = room.dealerHand.map((card, index) => {
    if (hideDealerHoleCard && index === 1) {
      return { hidden: true, label: "??" };
    }
    return publicCard(card);
  });
  const dealerValue = hideDealerHoleCard ? null : room.dealerHand.length ? handValue(room.dealerHand) : null;

  return {
    code: room.code,
    phase: room.phase,
    message: room.message,
    minBet: MIN_BET,
    shoeRemaining: room.shoe.length,
    shoeDecks: SHOE_DECKS,
    nextAutoStartAt: room.nextAutoStartAt,
    dealerHand,
    dealerValue,
    players: [...room.players.values()].map((player) => {
      refreshPlayerState(player);
      const totalBet = player.hands.length
        ? player.hands.reduce((sum, hand) => sum + hand.bet, 0)
        : player.bet;
      return {
        id: player.id,
        name: player.name,
        balance: player.balance,
        bet: player.bet,
        totalBet,
        hands: player.hands.map((hand, index) => ({
          cards: hand.cards.map(publicCard),
          bet: hand.bet,
          isDoubled: hand.isDoubled,
          handValue: hand.cards.length ? handValue(hand.cards) : null,
          statusLabel: getHandStatusLabel(hand),
          isActive: player.state === "playing" && index === player.activeHandIndex,
        })),
        statusLabel: getPlayerStatusLabel(player),
        isHost: player.id === room.hostId,
      };
    }),
    viewer: {
      id: viewer ? viewer.id : null,
      name: viewer ? viewer.name : null,
      isHost: Boolean(viewer) && viewer.id === room.hostId,
      inRoom: Boolean(viewer),
      bet: viewer ? viewer.bet : 0,
      canBet: Boolean(viewer) && ["lobby", "betting"].includes(room.phase),
      canStartRound: Boolean(viewer) && viewer.id === room.hostId && canStartRound(room),
      canRebuyAll: Boolean(viewer) && viewer.id === room.hostId,
      canAdjustPlayers: Boolean(viewer) && viewer.id === room.hostId,
      canHit: canPlayerAct(room, viewer),
      canStand: canPlayerAct(room, viewer),
      canSplit: canPlayerSplit(room, viewer),
      canDouble: canPlayerDouble(room, viewer),
    },
  };
}

function broadcastRoom(room) {
  for (const player of room.players.values()) {
    send(player.ws, {
      type: "room_state",
      room: serializeRoomForViewer(room, player.id),
    });
  }
}

function startRound(room, { auto = false } = {}) {
  if (!canStartRound(room)) {
    return { ok: false, message: "Runde kann nicht gestartet werden." };
  }

  clearAutoStartTimer(room);
  prepareShoeForRound(room);
  room.phase = "playing";
  room.dealerHand = [];

  for (const player of room.players.values()) {
    player.hands = [];
    player.activeHandIndex = 0;
    player.state = "waiting";
    player.lastOutcome = "";
  }

  const participants = getEligiblePlayers(room);
  if (participants.length === 0) {
    room.phase = "betting";
    return { ok: false, message: "Keine gueltigen Bets fuer eine Runde." };
  }

  // Deduct bets and create initial hands
  for (const player of participants) {
    player.balance -= player.bet;
    player.hands = [createHand(player.bet)];
    player.activeHandIndex = 0;
    player.state = "playing";
  }

  // Deal order: player1, player2, ... dealer, player1, player2, ... dealer
  for (const player of participants) {
    player.hands[0].cards.push(drawCard(room));
  }
  room.dealerHand.push(drawCard(room));

  for (const player of participants) {
    const hand = player.hands[0];
    hand.cards.push(drawCard(room));
    if (handValue(hand.cards) === 21) {
      hand.state = "blackjack";
      hand.isNaturalBlackjack = true;
    }
  }
  room.dealerHand.push(drawCard(room));

  for (const player of participants) {
    refreshPlayerState(player);
  }

  room.message = auto
    ? "Neue Runde automatisch gestartet."
    : "Runde gestartet. Hit, Stand, Split oder Double.";
  evaluateRoundProgress(room);
  return { ok: true };
}

function runDealerAndSettle(room) {
  room.phase = "dealer";

  // Dealer draws until hard/soft 17 or higher (stands on soft 17)
  while (handValue(room.dealerHand) < 17) {
    room.dealerHand.push(drawCard(room));
  }

  const dealerTotal = handValue(room.dealerHand);
  const dealerBlackjack = dealerTotal === 21 && room.dealerHand.length === 2;
  const dealerBust = dealerTotal > 21;
  const summary = [];

  for (const player of getRoundPlayers(room)) {
    const handOutcomes = [];

    for (let i = 0; i < player.hands.length; i += 1) {
      const hand = player.hands[i];
      const total = handValue(hand.cards);
      const doubledTag = hand.isDoubled ? " (D)" : "";
      let payout = 0;
      let outcome = "Verloren";

      if (total > 21) {
        outcome = `Bust${doubledTag}`;
      } else if (hand.isNaturalBlackjack && !dealerBlackjack) {
        // Natural blackjack pays 3:2
        const bonus = Math.floor(hand.bet * 1.5);
        payout = hand.bet + bonus;
        outcome = `Blackjack +${bonus}`;
      } else if (dealerBlackjack && !hand.isNaturalBlackjack) {
        outcome = "Dealer BJ";
      } else if (dealerBust || total > dealerTotal) {
        payout = hand.bet * 2;
        outcome = `Gewonnen +${hand.bet}${doubledTag}`;
      } else if (total === dealerTotal) {
        payout = hand.bet;
        outcome = `Push${doubledTag}`;
      } else {
        outcome = `Verloren${doubledTag}`;
      }

      player.balance += payout;
      handOutcomes.push(player.hands.length > 1 ? `H${i + 1}: ${outcome}` : outcome);
    }

    player.lastOutcome = handOutcomes.join(" | ");
    summary.push(`${player.name}: ${player.lastOutcome}`);
    player.state = "waiting";
    player.activeHandIndex = 0;

    if (player.bet > player.balance) {
      player.bet = player.balance;
    }
    if (player.bet < MIN_BET) {
      player.bet = 0;
    }
  }

  room.phase = "betting";
  room.message = summary.length ? `Auszahlung: ${summary.join(" || ")}` : "Runde beendet.";
  scheduleAutoStart(room);
}

function evaluateRoundProgress(room) {
  const roundPlayers = getRoundPlayers(room);
  if (roundPlayers.length === 0) {
    room.phase = "betting";
    room.dealerHand = [];
    room.message = "Keine aktiven Haende. Neue Bets setzen.";
    scheduleAutoStart(room);
    return;
  }

  if (getActivePlayers(room).length === 0) {
    runDealerAndSettle(room);
  }
}

function applyPlayerAction(room, player, action) {
  if (action === "split") {
    if (!canPlayerSplit(room, player)) {
      return { ok: false, message: "Split ist aktuell nicht erlaubt." };
    }

    const sourceHand = getCurrentHand(player);
    const index = player.activeHandIndex;
    player.balance -= sourceHand.bet;

    const [firstCard, secondCard] = sourceHand.cards;
    const isSplitAces = firstCard.rank === "A" && secondCard.rank === "A";
    const firstHand = createHand(sourceHand.bet, {
      cards: [firstCard],
      fromSplitAces: isSplitAces,
    });
    const secondHand = createHand(sourceHand.bet, {
      cards: [secondCard],
      fromSplitAces: isSplitAces,
    });

    firstHand.cards.push(drawCard(room));
    secondHand.cards.push(drawCard(room));

    // Split aces: each hand gets exactly one card and stands immediately
    if (isSplitAces) {
      firstHand.state = "stood";
      secondHand.state = "stood";
    } else {
      updateHandStateAfterDraw(firstHand);
      updateHandStateAfterDraw(secondHand);
    }

    player.hands.splice(index, 1, firstHand, secondHand);
    player.activeHandIndex = index;
    refreshPlayerState(player);

    room.message = `${player.name} splittet in zwei Haende.`;
    evaluateRoundProgress(room);
    return { ok: true };
  }

  if (action === "double") {
    if (!canPlayerDouble(room, player)) {
      return { ok: false, message: "Double Down ist aktuell nicht erlaubt." };
    }

    const hand = getCurrentHand(player);
    // Deduct additional bet equal to the original hand bet
    player.balance -= hand.bet;
    hand.bet *= 2;
    hand.isDoubled = true;

    // Draw exactly one card, then auto-stand
    const card = drawCard(room);
    hand.cards.push(card);
    updateHandStateAfterDraw(hand);

    // If not busted, force stand (player may not draw more after doubling)
    if (hand.state === "playing") {
      hand.state = "stood";
    }

    refreshPlayerState(player);
    room.message = `${player.name} doubled down (Einsatz: ${hand.bet}) - zieht ${card.rank}${card.symbol}.`;
    evaluateRoundProgress(room);
    return { ok: true };
  }

  if (!canPlayerAct(room, player)) {
    return { ok: false, message: "Aktion aktuell nicht erlaubt." };
  }

  const hand = getCurrentHand(player);
  if (!hand) {
    return { ok: false, message: "Keine aktive Hand gefunden." };
  }

  if (action === "hit") {
    const card = drawCard(room);
    hand.cards.push(card);
    updateHandStateAfterDraw(hand);
    refreshPlayerState(player);
    room.message = `${player.name} zieht ${card.rank}${card.symbol}.`;
    evaluateRoundProgress(room);
    return { ok: true };
  }

  if (action === "stand") {
    hand.state = "stood";
    refreshPlayerState(player);
    room.message = `${player.name} bleibt stehen.`;
    evaluateRoundProgress(room);
    return { ok: true };
  }

  return { ok: false, message: "Unbekannte Aktion." };
}

function createRoomForPlayer(player) {
  const code = getUniqueRoomCode();
  const room = {
    code,
    hostId: player.id,
    players: new Map(),
    phase: "lobby",
    dealerHand: [],
    shoe: createShoe(SHOE_DECKS),
    message: `${player.name} hat den Raum erstellt.`,
    autoStartTimer: null,
    nextAutoStartAt: null,
  };

  room.players.set(player.id, player);
  rooms.set(code, room);
  return room;
}

function resetPlayerStateForLobby(player, name) {
  player.name = name;
  player.balance = DEFAULT_BANKROLL;
  player.bet = 0;
  player.hands = [];
  player.activeHandIndex = 0;
  player.state = "waiting";
  player.lastOutcome = "";
}

function removePlayerFromRoom(player, reason) {
  const room = rooms.get(player.roomCode);
  if (!room) {
    return;
  }

  room.players.delete(player.id);
  player.roomCode = null;

  if (room.players.size === 0) {
    clearAutoStartTimer(room);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === player.id) {
    room.hostId = [...room.players.keys()][0];
  }

  room.message = `${player.name} ${reason}`;

  if (room.phase === "playing") {
    evaluateRoundProgress(room);
  } else {
    scheduleAutoStart(room);
  }

  broadcastRoom(room);
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || "/");

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(err.code === "ENOENT" ? "Not Found" : "Internal Server Error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const client = {
    id: makeClientId(),
    name: "",
    roomCode: null,
    ws,
    balance: DEFAULT_BANKROLL,
    bet: 0,
    hands: [],
    activeHandIndex: 0,
    state: "waiting",
    lastOutcome: "",
  };

  clients.set(ws, client);
  send(ws, { type: "welcome", clientId: client.id });

  ws.on("message", (raw) => {
    let payload = null;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Ungueltige Nachricht." });
      return;
    }

    const currentClient = clients.get(ws);
    if (!currentClient) {
      return;
    }

    if (payload.type === "create_room") {
      if (currentClient.roomCode) {
        removePlayerFromRoom(currentClient, "hat den Raum verlassen.");
      }

      const name =
        String(payload.name || "").trim().slice(0, 20) || `Player${currentClient.id.slice(0, 4)}`;
      resetPlayerStateForLobby(currentClient, name);

      const room = createRoomForPlayer(currentClient);
      currentClient.roomCode = room.code;
      broadcastRoom(room);
      return;
    }

    if (payload.type === "join_room") {
      const code = String(payload.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: "error", message: "Raum nicht gefunden." });
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        send(ws, { type: "error", message: `Raum ist voll (max ${MAX_PLAYERS} Spieler).` });
        return;
      }

      if (currentClient.roomCode) {
        removePlayerFromRoom(currentClient, "hat den Raum verlassen.");
      }

      const name =
        String(payload.name || "").trim().slice(0, 20) || `Player${currentClient.id.slice(0, 4)}`;
      resetPlayerStateForLobby(currentClient, name);
      currentClient.roomCode = room.code;

      room.players.set(currentClient.id, currentClient);
      room.message = `${currentClient.name} ist dem Raum beigetreten.`;
      scheduleAutoStart(room);
      broadcastRoom(room);
      return;
    }

    if (payload.type === "leave_room") {
      if (!currentClient.roomCode) {
        send(ws, { type: "left_room" });
        return;
      }
      removePlayerFromRoom(currentClient, "hat den Raum verlassen.");
      send(ws, { type: "left_room" });
      return;
    }

    if (!currentClient.roomCode) {
      send(ws, { type: "error", message: "Du bist in keinem Raum." });
      return;
    }

    const room = rooms.get(currentClient.roomCode);
    if (!room) {
      currentClient.roomCode = null;
      send(ws, { type: "left_room" });
      return;
    }

    if (payload.type === "place_bet") {
      if (!["lobby", "betting"].includes(room.phase)) {
        send(ws, { type: "error", message: "Bets sind nur vor der Runde erlaubt." });
        return;
      }

      const amount = Math.floor(Number(payload.amount));
      if (!Number.isFinite(amount) || amount < MIN_BET) {
        send(ws, { type: "error", message: `Mindestbet ist ${MIN_BET}.` });
        return;
      }
      if (amount > currentClient.balance) {
        send(ws, { type: "error", message: "Nicht genug Chips fuer diese Bet." });
        return;
      }

      currentClient.bet = amount;
      room.phase = "betting";
      room.message = `${currentClient.name} setzt ${amount}.`;
      scheduleAutoStart(room);
      broadcastRoom(room);
      return;
    }

    if (payload.type === "clear_bet") {
      if (!["lobby", "betting"].includes(room.phase)) {
        send(ws, { type: "error", message: "Bet kann gerade nicht geloescht werden." });
        return;
      }

      currentClient.bet = 0;
      room.message = `${currentClient.name} loescht die Bet.`;
      scheduleAutoStart(room);
      broadcastRoom(room);
      return;
    }

    if (payload.type === "rebuy") {
      if (room.hostId !== currentClient.id) {
        send(ws, { type: "error", message: "Nur der Host darf +1000 Chips an alle geben." });
        return;
      }

      for (const player of room.players.values()) {
        player.balance += REBUY_AMOUNT;
      }
      room.message = `${currentClient.name} gibt allen +${REBUY_AMOUNT} Chips.`;
      scheduleAutoStart(room);
      broadcastRoom(room);
      return;
    }

    if (payload.type === "host_adjust_player") {
      if (room.hostId !== currentClient.id) {
        send(ws, { type: "error", message: "Nur der Host darf Spieler-Chips aendern." });
        return;
      }

      const targetId = String(payload.targetId || "");
      const targetPlayer = room.players.get(targetId);
      if (!targetPlayer) {
        send(ws, { type: "error", message: "Ausgewaehlter Spieler nicht gefunden." });
        return;
      }

      const delta = Math.floor(Number(payload.delta));
      if (!Number.isFinite(delta) || delta === 0) {
        send(ws, { type: "error", message: "Chip-Aenderung muss ungleich 0 sein." });
        return;
      }
      if (Math.abs(delta) > 1000000) {
        send(ws, { type: "error", message: "Chip-Aenderung ist zu gross." });
        return;
      }

      if (delta > 0) {
        targetPlayer.balance += delta;
        room.message = `${currentClient.name} gibt ${targetPlayer.name} +${delta} Chips.`;
      } else {
        const remove = Math.min(targetPlayer.balance, Math.abs(delta));
        targetPlayer.balance -= remove;
        room.message = `${currentClient.name} nimmt ${targetPlayer.name} ${remove} Chips weg.`;
      }

      scheduleAutoStart(room);
      broadcastRoom(room);
      return;
    }

    if (payload.type === "start_round") {
      if (room.hostId !== currentClient.id) {
        send(ws, { type: "error", message: "Nur der Host darf die Runde starten." });
        return;
      }

      const result = startRound(room, { auto: false });
      if (!result.ok) {
        send(ws, { type: "error", message: result.message });
        return;
      }
      broadcastRoom(room);
      return;
    }

    if (payload.type === "player_action") {
      const action = String(payload.action || "").toLowerCase();
      const result = applyPlayerAction(room, currentClient, action);
      if (!result.ok) {
        send(ws, { type: "error", message: result.message });
        return;
      }
      broadcastRoom(room);
    }
  });

  ws.on("close", () => {
    const currentClient = clients.get(ws);
    if (!currentClient) {
      return;
    }

    if (currentClient.roomCode) {
      removePlayerFromRoom(currentClient, "hat die Verbindung verloren.");
    }
    clients.delete(ws);
  });
});

server.listen(port, () => {
  console.log(`Blackjack Hub running at http://localhost:${port}`);
});
