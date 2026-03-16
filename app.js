const suits = [
  { id: "S", symbol: "\u2660", isRed: false },
  { id: "H", symbol: "\u2665", isRed: true },
  { id: "D", symbol: "\u2666", isRed: true },
  { id: "C", symbol: "\u2663", isRed: false },
];

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MAX_SPLIT_HANDS = 4;

const state = {
  mode: "trainer",
  statsCollapsed: false,
  decks: 6,
  shoe: [],
  runningCount: 0,
  cardsSeen: 0,
  attempts: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  history: [],
  trainer: {
    quizMode: false,
    pendingCard: null,
  },
  play: {
    roundActive: false,
    phase: "idle",
    playerHands: [],
    activeHandIndex: 0,
    dealerHand: [],
    pendingCheck: null,
  },
};

const modeSelectEl = document.getElementById("modeSelect");
const deckCountEl = document.getElementById("deckCount");
const quizModeEl = document.getElementById("quizMode");
const newShoeBtn = document.getElementById("newShoeBtn");
const nextCardBtn = document.getElementById("nextCardBtn");
const answerPad = document.getElementById("answerPad");
const answerButtons = [...document.querySelectorAll(".answer")];

const trainerSectionEl = document.getElementById("trainerSection");
const playSectionEl = document.getElementById("playSection");
const trainerOnlyEls = [...document.querySelectorAll(".trainer-only")];

const cardDisplayEl = document.getElementById("cardDisplay");
const feedbackEl = document.getElementById("feedback");

const dealerHandEl = document.getElementById("dealerHand");
const playerHandEl = document.getElementById("playerHand");
const dealerValueEl = document.getElementById("dealerValue");
const playerValueEl = document.getElementById("playerValue");
const playFeedbackEl = document.getElementById("playFeedback");
const startRoundBtn = document.getElementById("startRoundBtn");
const hitBtn = document.getElementById("hitBtn");
const standBtn = document.getElementById("standBtn");
const doubleBtn = document.getElementById("doubleBtn");
const splitBtn = document.getElementById("splitBtn");

const countCheckEl = document.getElementById("countCheck");
const countPromptEl = document.getElementById("countPrompt");
const countGuessInputEl = document.getElementById("countGuessInput");
const submitCountBtn = document.getElementById("submitCountBtn");
const countCheckFeedbackEl = document.getElementById("countCheckFeedback");

const runningCountEl = document.getElementById("runningCount");
const trueCountEl = document.getElementById("trueCount");
const cardsSeenEl = document.getElementById("cardsSeen");
const cardsRemainingEl = document.getElementById("cardsRemaining");
const accuracyEl = document.getElementById("accuracy");
const bestStreakEl = document.getElementById("bestStreak");
const penetrationTextEl = document.getElementById("penetrationText");
const penetrationFillEl = document.getElementById("penetrationFill");
const historyEl = document.getElementById("history");
const statsPanelEl = document.getElementById("statsPanel");
const statsToggleBtn = document.getElementById("statsToggleBtn");

function getHiLoValue(rank) {
  if (["2", "3", "4", "5", "6"].includes(rank)) {
    return 1;
  }
  if (["10", "J", "Q", "K", "A"].includes(rank)) {
    return -1;
  }
  return 0;
}

function formatSigned(value) {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function formatCard(card) {
  return `${card.rank}${card.symbol}`;
}

function buildShoe(decks) {
  const shoe = [];

  for (let d = 0; d < decks; d += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        shoe.push({
          rank,
          suit: suit.id,
          symbol: suit.symbol,
          isRed: suit.isRed,
          value: getHiLoValue(rank),
        });
      }
    }
  }

  return shoe;
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function setFeedbackElement(element, text, tone = "neutral") {
  element.textContent = text;
  element.classList.remove("good", "warn");
  if (tone === "good" || tone === "warn") {
    element.classList.add(tone);
  }
}

function setTrainerFeedback(text, tone = "neutral") {
  setFeedbackElement(feedbackEl, text, tone);
}

function setPlayFeedback(text, tone = "neutral") {
  setFeedbackElement(playFeedbackEl, text, tone);
}

function setAnswerPadEnabled(enabled) {
  answerPad.classList.toggle("disabled", !enabled);
}

function setCountCheckVisible(visible) {
  countCheckEl.classList.toggle("hidden", !visible);
}

function renderTrainerCard(card) {
  if (!card) {
    cardDisplayEl.classList.remove("red", "drawn");
    cardDisplayEl.classList.add("placeholder");
    cardDisplayEl.innerHTML = '<span class="rank">?</span><span class="suit">\u2663</span>';
    cardDisplayEl.setAttribute("data-corner", `?\u2663`);
    return;
  }

  cardDisplayEl.classList.remove("placeholder", "drawn", "red");
  if (card.isRed) {
    cardDisplayEl.classList.add("red");
  }

  cardDisplayEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.symbol}</span>`;
  cardDisplayEl.setAttribute("data-corner", `${card.rank}${card.symbol}`);
  cardDisplayEl.classList.add("drawn");
}

function renderHistory() {
  historyEl.innerHTML = "";
  for (const card of state.history) {
    const item = document.createElement("span");
    item.className = `history-card${card.isRed ? " red" : ""}`;
    item.textContent = formatCard(card);
    historyEl.append(item);
  }
}

function handValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
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

function getHandInfo(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
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

  return { total, soft: aces > 0 };
}

function cardNumericValue(rank) {
  if (rank === "A") {
    return 11;
  }
  if (["10", "J", "Q", "K"].includes(rank)) {
    return 10;
  }
  return Number(rank);
}

function cardLabelForStrategy(rank) {
  if (["J", "Q", "K"].includes(rank)) {
    return "10";
  }
  return rank;
}

function normalizePairRank(rank) {
  if (["10", "J", "Q", "K"].includes(rank)) {
    return "10";
  }
  return rank;
}

function createPlayHand(cards = [], options = {}) {
  return {
    cards: [...cards],
    status: "playing",
    fromSplitAces: Boolean(options.fromSplitAces),
    isDoubled: false,
  };
}

function getActivePlayHand() {
  return state.play.playerHands[state.play.activeHandIndex] ?? null;
}

function canPlayerAct() {
  if (
    state.mode !== "play" ||
    !state.play.roundActive ||
    state.play.phase !== "player" ||
    state.play.pendingCheck
  ) {
    return false;
  }

  const hand = getActivePlayHand();
  return Boolean(hand && hand.status === "playing");
}

function canPlayerDoubleAction() {
  const hand = getActivePlayHand();
  return Boolean(canPlayerAct() && hand.cards.length === 2 && !hand.fromSplitAces);
}

function canPlayerSplitAction() {
  const hand = getActivePlayHand();
  if (!canPlayerAct() || state.play.playerHands.length >= MAX_SPLIT_HANDS) {
    return false;
  }
  if (!hand || hand.cards.length !== 2) {
    return false;
  }
  return normalizePairRank(hand.cards[0].rank) === normalizePairRank(hand.cards[1].rank);
}

function actionLabel(action) {
  if (action === "hit") {
    return "Hit";
  }
  if (action === "stand") {
    return "Stand";
  }
  if (action === "double") {
    return "Double";
  }
  if (action === "split") {
    return "Split";
  }
  return action;
}

function resolveRecommendedAction(ideal, options) {
  let action = ideal.action;
  let reason = ideal.reason;

  if (action === "split" && !options.canSplit) {
    const fallbackAction = ideal.noSplit ?? "hit";
    action = fallbackAction;
    reason = `${ideal.reason} Split ist hier nicht möglich, daher ${actionLabel(fallbackAction)} als beste Alternative.`;
  }

  if (action === "double" && !options.canDouble) {
    const fallbackAction = ideal.noDouble ?? "hit";
    action = fallbackAction;
    reason = `${ideal.reason} Double ist hier nicht möglich, daher ${actionLabel(fallbackAction)} als beste Alternative.`;
  }

  return { action, reason };
}

function pairDescriptor(pairRank) {
  if (pairRank === "A") {
    return "Paar Asse";
  }
  return `Paar ${pairRank}er`;
}

function recommendPairAction(pairRank, dealerValue) {
  if (pairRank === "A") {
    return {
      action: "split",
      noSplit: "hit",
      reason: "Asse werden gesplittet, um zwei starke Soft-Starts statt einer starren 12 zu spielen.",
    };
  }

  if (pairRank === "10") {
    return {
      action: "stand",
      reason: "20 ist bereits sehr stark; Split verschlechtert den Erwartungswert.",
    };
  }

  if (pairRank === "9") {
    if ([2, 3, 4, 5, 6, 8, 9].includes(dealerValue)) {
      return {
        action: "split",
        noSplit: "stand",
        reason: "9er gegen mittlere Dealerkarten werden gesplittet, um zwei gewinnbare Hände zu erzeugen.",
      };
    }
    return {
      action: "stand",
      reason: "18 bleibt gegen 7, 10 oder Ass stabiler als ein Split.",
    };
  }

  if (pairRank === "8") {
    return {
      action: "split",
      noSplit: "hit",
      reason: "8er werden immer gesplittet, weil harte 16 langfristig zu schwach ist.",
    };
  }

  if (pairRank === "7") {
    if (dealerValue >= 2 && dealerValue <= 7) {
      return {
        action: "split",
        noSplit: "hit",
        reason: "7er gegen 2 bis 7 splitten, um Druck auf die schwächere Dealer-Range zu machen.",
      };
    }
    return {
      action: "hit",
      reason: "14 gegen starke Dealerkarten ist zu schwach für Stand.",
    };
  }

  if (pairRank === "6") {
    if (dealerValue >= 2 && dealerValue <= 6) {
      return {
        action: "split",
        noSplit: "hit",
        reason: "6er gegen 2 bis 6 splitten; so vermeidest du eine schwierige harte 12.",
      };
    }
    return {
      action: "hit",
      reason: "12 gegen 7 oder höher ist zu passiv für Stand.",
    };
  }

  if (pairRank === "5") {
    if (dealerValue >= 2 && dealerValue <= 9) {
      return {
        action: "double",
        noDouble: "hit",
        reason: "Paar 5er spielt sich wie harte 10: aggressiv verdoppeln gegen 2 bis 9.",
      };
    }
    return {
      action: "hit",
      reason: "Gegen 10 oder Ass ist harte 10 ohne Double nur ein Hit.",
    };
  }

  if (pairRank === "4") {
    if (dealerValue === 5 || dealerValue === 6) {
      return {
        action: "split",
        noSplit: "hit",
        reason: "4er nur gegen 5 oder 6 splitten, weil der Dealer dort am verwundbarsten ist.",
      };
    }
    return {
      action: "hit",
      reason: "8 ist gegen die meisten Dealer-Upcards zu niedrig für Stand.",
    };
  }

  if (pairRank === "3" || pairRank === "2") {
    if (dealerValue >= 2 && dealerValue <= 7) {
      return {
        action: "split",
        noSplit: "hit",
        reason: "Kleine Paare gegen 2 bis 7 splitten für zwei bessere Aufbau-Chancen.",
      };
    }
    return {
      action: "hit",
      reason: "Kleine Paare gegen 8 oder höher nicht stehen lassen.",
    };
  }

  return {
    action: "hit",
    reason: "Mit dieser Paar-Situation ist Hit die solide Standardlinie.",
  };
}

function recommendSoftAction(total, dealerValue) {
  if (total >= 20) {
    return {
      action: "stand",
      reason: "Soft 20 ist stark genug, da willst du keine Volatilität mehr.",
    };
  }

  if (total === 19) {
    if (dealerValue === 6) {
      return {
        action: "double",
        noDouble: "stand",
        reason: "Soft 19 gegen 6 nutzt die hohe Bust-Wahrscheinlichkeit des Dealers für maximalen Wert.",
      };
    }
    return {
      action: "stand",
      reason: "Soft 19 ist gegen fast alle Upcards bereits vorne.",
    };
  }

  if (total === 18) {
    if (dealerValue >= 3 && dealerValue <= 6) {
      return {
        action: "double",
        noDouble: "stand",
        reason: "Soft 18 gegen 3 bis 6 kann profitabel verdoppelt werden.",
      };
    }
    if ([2, 7, 8].includes(dealerValue)) {
      return {
        action: "stand",
        reason: "Soft 18 gegen 2, 7 oder 8 ist als Stand stabiler als Hit.",
      };
    }
    return {
      action: "hit",
      reason: "Soft 18 gegen 9, 10 oder Ass braucht Verbesserung durch Hit.",
    };
  }

  if (total === 17) {
    if (dealerValue >= 3 && dealerValue <= 6) {
      return {
        action: "double",
        noDouble: "hit",
        reason: "Soft 17 gegen 3 bis 6 ist ein klassischer Double-Spot.",
      };
    }
    return {
      action: "hit",
      reason: "Soft 17 ist zu schwach für Stand.",
    };
  }

  if (total === 16 || total === 15) {
    if (dealerValue >= 4 && dealerValue <= 6) {
      return {
        action: "double",
        noDouble: "hit",
        reason: "Soft 15/16 gegen 4 bis 6 wird aggressiv verdoppelt.",
      };
    }
    return {
      action: "hit",
      reason: "Soft 15/16 braucht gegen starke Dealerkarten mehr Gesamtwert.",
    };
  }

  if (dealerValue === 5 || dealerValue === 6) {
    return {
      action: "double",
      noDouble: "hit",
      reason: "Soft 13/14 gegen 5 oder 6 ist ein Value-Double.",
    };
  }

  return {
    action: "hit",
    reason: "Niedrige Soft-Hände werden weiterentwickelt statt stehen gelassen.",
  };
}

function recommendHardAction(total, dealerValue) {
  if (total >= 17) {
    return {
      action: "stand",
      reason: "Hard 17+ steht, weil zusätzliche Karte oft nur bustet.",
    };
  }

  if (total >= 13 && total <= 16) {
    if (dealerValue >= 2 && dealerValue <= 6) {
      return {
        action: "stand",
        reason: "Dealer 2 bis 6 hat hohe Bust-Chance, daher bleibst du stehen.",
      };
    }
    return {
      action: "hit",
      reason: "Gegen 7 bis Ass musst du Hard 13-16 verbessern.",
    };
  }

  if (total === 12) {
    if (dealerValue >= 4 && dealerValue <= 6) {
      return {
        action: "stand",
        reason: "Hard 12 steht nur gegen 4 bis 6 wegen Dealer-Bust-Druck.",
      };
    }
    return {
      action: "hit",
      reason: "Hard 12 gegen 2, 3 oder 7+ ist langfristig ein Hit.",
    };
  }

  if (total === 11) {
    return {
      action: "double",
      noDouble: "hit",
      reason: "Hard 11 ist der stärkste Double-Spot gegen jede Dealer-Upcard.",
    };
  }

  if (total === 10) {
    if (dealerValue >= 2 && dealerValue <= 9) {
      return {
        action: "double",
        noDouble: "hit",
        reason: "Hard 10 gegen 2 bis 9 wird für maximalen Erwartungswert verdoppelt.",
      };
    }
    return {
      action: "hit",
      reason: "Hard 10 gegen 10 oder Ass nicht passiv spielen.",
    };
  }

  if (total === 9) {
    if (dealerValue >= 3 && dealerValue <= 6) {
      return {
        action: "double",
        noDouble: "hit",
        reason: "Hard 9 gegen 3 bis 6 ist ein guter Double-Spot.",
      };
    }
    return {
      action: "hit",
      reason: "Hard 9 gegen starke Dealerkarten braucht Verbesserung.",
    };
  }

  return {
    action: "hit",
    reason: "Hard 8 oder weniger wird immer getroffen.",
  };
}

function getStrategyRecommendation(hand, dealerUpcard, options) {
  if (!hand || !dealerUpcard) {
    return null;
  }

  const dealerValue = cardNumericValue(dealerUpcard.rank);
  const dealerLabel = cardLabelForStrategy(dealerUpcard.rank);
  const info = getHandInfo(hand.cards);
  const canUsePairStrategy =
    hand.cards.length === 2 && normalizePairRank(hand.cards[0].rank) === normalizePairRank(hand.cards[1].rank);

  let context = "";
  let ideal;

  if (canUsePairStrategy) {
    const pairRank = normalizePairRank(hand.cards[0].rank);
    context = `${pairDescriptor(pairRank)} gegen Dealer ${dealerLabel}`;
    ideal = recommendPairAction(pairRank, dealerValue);
  } else if (info.soft) {
    context = `Soft ${info.total} gegen Dealer ${dealerLabel}`;
    ideal = recommendSoftAction(info.total, dealerValue);
  } else {
    context = `Hard ${info.total} gegen Dealer ${dealerLabel}`;
    ideal = recommendHardAction(info.total, dealerValue);
  }

  const resolved = resolveRecommendedAction(ideal, options);
  return {
    action: resolved.action,
    reason: resolved.reason,
    context,
  };
}

function getDecisionReviewText(action) {
  const hand = getActivePlayHand();
  const dealerUpcard = state.play.dealerHand[0];
  const recommendation = getStrategyRecommendation(hand, dealerUpcard, {
    canDouble: canPlayerDoubleAction(),
    canSplit: canPlayerSplitAction(),
  });

  if (!recommendation) {
    return null;
  }

  if (action === recommendation.action) {
    return {
      tone: "good",
      text: `Richtige Entscheidung: ${actionLabel(action)}. ${recommendation.context}: ${recommendation.reason}`,
    };
  }

  return {
    tone: "warn",
    text: `Nicht optimal: ${actionLabel(action)}. ${recommendation.context}: Besser wäre ${actionLabel(
      recommendation.action,
    )}. ${recommendation.reason}`,
  };
}

function combinePlayFeedback(prefixText, suffixText) {
  if (!prefixText) {
    return suffixText;
  }
  if (!suffixText) {
    return prefixText;
  }
  return `${prefixText} ${suffixText}`;
}

function currentActionPrompt() {
  const actions = ["Hit", "Stand"];
  if (canPlayerDoubleAction()) {
    actions.push("Double");
  }
  if (canPlayerSplitAction()) {
    actions.push("Split");
  }
  return `Du bist dran: ${actions.join(", ")}.`;
}

function renderHand(container, hand) {
  container.innerHTML = "";
  for (const card of hand) {
    if (card.hidden) {
      const back = document.createElement("span");
      back.className = "card-back";
      back.textContent = "ZU";
      container.append(back);
      continue;
    }

    const item = document.createElement("span");
    item.className = `mini-card${card.isRed ? " red" : ""}`;
    item.textContent = formatCard(card);
    container.append(item);
  }
}

function renderPlayHands() {
  renderHand(dealerHandEl, state.play.dealerHand);
  if (state.play.dealerHand.some((card) => card.hidden)) {
    dealerValueEl.textContent = "Wert: ?";
  } else if (state.play.dealerHand.length === 0) {
    dealerValueEl.textContent = "Wert: 0";
  } else {
    dealerValueEl.textContent = `Wert: ${handValue(state.play.dealerHand)}`;
  }

  playerHandEl.innerHTML = "";
  const hands = state.play.playerHands;

  if (hands.length === 0) {
    playerValueEl.textContent = "Wert: 0";
    return;
  }

  if (hands.length === 1) {
    const onlyHand = hands[0];
    renderHand(playerHandEl, onlyHand.cards);
    const doubledTag = onlyHand.isDoubled ? " (Double)" : "";
    playerValueEl.textContent = `Wert: ${handValue(onlyHand.cards)}${doubledTag}`;
    return;
  }

  const splitHandsWrap = document.createElement("div");
  splitHandsWrap.className = "split-hands";

  for (let index = 0; index < hands.length; index += 1) {
    const hand = hands[index];
    const handBlock = document.createElement("article");
    handBlock.className = "split-hand";

    if (
      state.play.roundActive &&
      state.play.phase === "player" &&
      hand.status === "playing" &&
      index === state.play.activeHandIndex
    ) {
      handBlock.classList.add("active");
    }
    if (hand.status !== "playing") {
      handBlock.classList.add("resolved");
    }

    const title = document.createElement("p");
    title.className = "split-hand-title";
    let titleSuffix = "";
    if (hand.isDoubled) {
      titleSuffix += " (Double)";
    }
    if (hand.fromSplitAces) {
      titleSuffix += " (Split Asse)";
    }
    if (hand.status === "stood") {
      titleSuffix += " - Stand";
    }
    if (hand.status === "bust") {
      titleSuffix += " - Bust";
    }
    if (hand.status === "playing" && index === state.play.activeHandIndex && state.play.phase === "player") {
      titleSuffix += " - Aktiv";
    }
    title.textContent = `Hand ${index + 1}${titleSuffix}`;

    const cardsRow = document.createElement("div");
    cardsRow.className = "hand-cards";
    renderHand(cardsRow, hand.cards);

    const valueText = document.createElement("p");
    valueText.className = "split-hand-value";
    valueText.textContent = `Wert: ${handValue(hand.cards)}`;

    handBlock.append(title, cardsRow, valueText);
    splitHandsWrap.append(handBlock);
  }

  playerHandEl.append(splitHandsWrap);

  if (state.play.phase === "player") {
    const activeHand = getActivePlayHand();
    if (activeHand) {
      playerValueEl.textContent = `Aktive Hand ${state.play.activeHandIndex + 1}/${hands.length}: ${handValue(activeHand.cards)}`;
      return;
    }
  }

  const totals = hands.map((hand, index) => `H${index + 1}: ${handValue(hand.cards)}`).join(" | ");
  playerValueEl.textContent = totals;
}

function updateMetrics() {
  const decksRemainingRaw = state.shoe.length / 52;
  const decksRemaining = Math.max(0.25, decksRemainingRaw);
  const trueCount = state.shoe.length === 0 ? state.runningCount : state.runningCount / decksRemaining;
  const accuracy = state.attempts > 0 ? (state.correct / state.attempts) * 100 : 0;
  const penetration = (state.cardsSeen / (state.decks * 52)) * 100;
  const canPlayActions = canPlayerAct();

  runningCountEl.textContent = String(state.runningCount);
  trueCountEl.textContent = trueCount.toFixed(1);
  cardsSeenEl.textContent = String(state.cardsSeen);
  cardsRemainingEl.textContent = String(state.shoe.length);
  accuracyEl.textContent = `${accuracy.toFixed(0)}%`;
  bestStreakEl.textContent = String(state.bestStreak);
  penetrationTextEl.textContent = `${penetration.toFixed(0)}%`;
  penetrationFillEl.style.width = `${Math.min(100, penetration)}%`;

  nextCardBtn.disabled =
    state.mode !== "trainer" || state.shoe.length === 0 || Boolean(state.trainer.pendingCard);
  startRoundBtn.disabled = state.mode !== "play" || Boolean(state.play.pendingCheck);
  hitBtn.disabled = !canPlayActions;
  standBtn.disabled = !canPlayActions;
  doubleBtn.disabled = !canPlayerDoubleAction();
  splitBtn.disabled = !canPlayerSplitAction();
  submitCountBtn.disabled = !Boolean(state.play.pendingCheck);
}

function setStatsCollapsed(collapsed) {
  state.statsCollapsed = collapsed;
  statsPanelEl.classList.toggle("collapsed", collapsed);
  statsToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  statsToggleBtn.textContent = collapsed ? "Stats ausklappen" : "Stats einklappen";
}

function takeCardFromShoe() {
  if (state.shoe.length === 0) {
    return null;
  }
  return state.shoe.pop();
}

function applyCardToState(card) {
  state.runningCount += card.value;
  state.cardsSeen += 1;
  state.history.unshift(card);
  state.history = state.history.slice(0, 14);
  renderHistory();
  updateMetrics();
}

function resetGlobalStats() {
  state.runningCount = 0;
  state.cardsSeen = 0;
  state.attempts = 0;
  state.correct = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.history = [];
}

function resetTrainerState() {
  state.trainer.quizMode = quizModeEl.checked;
  state.trainer.pendingCard = null;
  setAnswerPadEnabled(false);
  renderTrainerCard(null);
}

function resetPlayState() {
  state.play.roundActive = false;
  state.play.phase = "idle";
  state.play.playerHands = [];
  state.play.activeHandIndex = 0;
  state.play.dealerHand = [];
  state.play.pendingCheck = null;
  setCountCheckVisible(false);
  renderPlayHands();
}

function newShoe() {
  state.decks = Number(deckCountEl.value);
  state.shoe = buildShoe(state.decks);
  shuffle(state.shoe);

  resetGlobalStats();
  resetTrainerState();
  resetPlayState();
  renderHistory();

  setTrainerFeedback('Frisches Shoe gemischt. Drücke "Nächste Karte".');
  setPlayFeedback('Play Mode aktiv. Klicke "Neue Runde".');
  updateMetrics();
}

function scoreCountGuess(guess, contextText = "") {
  const actual = state.runningCount;
  const prefix = contextText ? `${contextText} ` : "";

  state.attempts += 1;
  if (guess === actual) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    updateMetrics();
    return { text: `${prefix}Richtig. Running Count ist ${actual}.`, tone: "good" };
  }

  state.streak = 0;
  updateMetrics();
  return { text: `${prefix}Falsch. Running Count ist ${actual}, nicht ${guess}.`, tone: "warn" };
}

function drawTrainerCard() {
  if (state.mode !== "trainer" || state.trainer.pendingCard) {
    return;
  }

  const card = takeCardFromShoe();
  if (!card) {
    setTrainerFeedback('Shoe leer. Klicke "Neues Shoe".', "warn");
    updateMetrics();
    return;
  }

  renderTrainerCard(card);

  if (state.trainer.quizMode) {
    state.trainer.pendingCard = card;
    setAnswerPadEnabled(true);
    setTrainerFeedback(`Tagge ${formatCard(card)}: +1, 0 oder -1?`);
    updateMetrics();
    return;
  }

  applyCardToState(card);
  setTrainerFeedback(`${formatCard(card)} gezählt als ${formatSigned(card.value)}.`);
}

function answerTrainerCard(guess) {
  if (!state.trainer.pendingCard) {
    return;
  }

  const card = state.trainer.pendingCard;
  state.attempts += 1;

  if (guess === card.value) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    setTrainerFeedback(`Richtig. ${formatCard(card)} ist ${formatSigned(card.value)}.`, "good");
  } else {
    state.streak = 0;
    setTrainerFeedback(
      `Daneben. ${formatCard(card)} ist ${formatSigned(card.value)}, nicht ${formatSigned(guess)}.`,
      "warn",
    );
  }

  applyCardToState(card);
  state.trainer.pendingCard = null;
  setAnswerPadEnabled(false);
  updateMetrics();
}

function setMode(nextMode) {
  const previousMode = state.mode;

  if (state.mode === "trainer" && state.trainer.pendingCard) {
    applyCardToState(state.trainer.pendingCard);
    setTrainerFeedback(
      `Moduswechsel: ${formatCard(state.trainer.pendingCard)} automatisch gezählt (${formatSigned(
        state.trainer.pendingCard.value,
      )}).`,
      "warn",
    );
    state.trainer.pendingCard = null;
    setAnswerPadEnabled(false);
  }

  if (state.mode === "play" && (state.play.roundActive || state.play.pendingCheck)) {
    state.play.roundActive = false;
    state.play.phase = "idle";
    state.play.pendingCheck = null;
    setCountCheckVisible(false);
    setPlayFeedback("Runde wegen Moduswechsel beendet.", "warn");
  }

  state.mode = nextMode;
  trainerSectionEl.classList.toggle("hidden", state.mode !== "trainer");
  playSectionEl.classList.toggle("hidden", state.mode !== "play");
  for (const element of trainerOnlyEls) {
    element.classList.toggle("hidden", state.mode !== "trainer");
  }

  if (previousMode !== state.mode && state.mode === "play") {
    setStatsCollapsed(true);
  }
  if (previousMode !== state.mode && state.mode === "trainer") {
    setStatsCollapsed(false);
  }

  updateMetrics();
}

function promptCountCheck(prompt, onContinue) {
  state.play.pendingCheck = { onContinue };
  countPromptEl.textContent = `${prompt} - Wie ist der Running Count?`;
  countGuessInputEl.value = "";
  setFeedbackElement(countCheckFeedbackEl, "");
  setCountCheckVisible(true);
  updateMetrics();
  countGuessInputEl.focus();
}

function drawForPlay(target, playerHandOverride = null, options = {}) {
  const card = takeCardFromShoe();
  if (!card) {
    return null;
  }

  const hidden = Boolean(options.hidden);
  const deferCount = Boolean(options.deferCount);
  card.hidden = hidden;
  card.counted = !deferCount;

  if (target === "player") {
    const targetHand = playerHandOverride ?? getActivePlayHand();
    if (!targetHand) {
      return null;
    }
    targetHand.cards.push(card);
  } else {
    state.play.dealerHand.push(card);
  }

  if (deferCount) {
    updateMetrics();
  } else {
    applyCardToState(card);
  }
  renderPlayHands();
  return card;
}

function revealDealerHoleCard(onContinue) {
  const holeCard = state.play.dealerHand.find((card) => card.hidden);
  if (!holeCard) {
    if (typeof onContinue === "function") {
      onContinue();
    }
    return;
  }

  holeCard.hidden = false;
  if (!holeCard.counted) {
    holeCard.counted = true;
    applyCardToState(holeCard);
  } else {
    updateMetrics();
  }
  renderPlayHands();

  promptCountCheck(`Dealer deckt ${formatCard(holeCard)} auf`, () => {
    if (typeof onContinue === "function") {
      onContinue();
    }
  });
}

function finishPlayRound(message, tone = "neutral") {
  state.play.roundActive = false;
  state.play.phase = "finished";
  state.play.pendingCheck = null;
  setCountCheckVisible(false);
  setPlayFeedback(`${message} Starte "Neue Runde" für die nächste Hand.`, tone);
  updateMetrics();
}

function getPlayResultMessage() {
  const dealerValue = handValue(state.play.dealerHand);
  const hasMultipleHands = state.play.playerHands.length > 1;
  const parts = [];
  let wins = 0;
  let losses = 0;
  let pushes = 0;

  for (let index = 0; index < state.play.playerHands.length; index += 1) {
    const hand = state.play.playerHands[index];
    const playerValue = handValue(hand.cards);
    const handLabel = hasMultipleHands ? `Hand ${index + 1}` : "Deine Hand";
    const doubledTag = hand.isDoubled ? " (Double)" : "";

    if (playerValue > 21) {
      losses += 1;
      parts.push(`${handLabel}${doubledTag} bustet mit ${playerValue}.`);
      continue;
    }

    if (dealerValue > 21) {
      wins += 1;
      parts.push(`${handLabel}${doubledTag} gewinnt, Dealer bustet mit ${dealerValue}.`);
      continue;
    }

    if (playerValue > dealerValue) {
      wins += 1;
      parts.push(`${handLabel}${doubledTag} gewinnt ${playerValue} zu ${dealerValue}.`);
      continue;
    }

    if (playerValue < dealerValue) {
      losses += 1;
      parts.push(`${handLabel}${doubledTag} verliert ${playerValue} zu ${dealerValue}.`);
      continue;
    }

    pushes += 1;
    parts.push(`${handLabel}${doubledTag} pusht bei ${playerValue}.`);
  }

  let tone = "neutral";
  if (wins > 0 && losses === 0) {
    tone = "good";
  } else if (losses > 0 && wins === 0 && pushes === 0) {
    tone = "warn";
  }

  return { text: parts.join(" "), tone };
}

function proceedAfterPlayerAction(decisionReview = null) {
  renderPlayHands();

  const reviewText = decisionReview ? decisionReview.text : "";
  const reviewTone = decisionReview ? decisionReview.tone : "neutral";
  const currentHand = getActivePlayHand();

  if (currentHand && currentHand.status === "playing") {
    state.play.phase = "player";
    setPlayFeedback(combinePlayFeedback(reviewText, currentActionPrompt()), reviewTone);
    updateMetrics();
    return;
  }

  for (let index = state.play.activeHandIndex + 1; index < state.play.playerHands.length; index += 1) {
    if (state.play.playerHands[index].status === "playing") {
      state.play.activeHandIndex = index;
      state.play.phase = "player";
      renderPlayHands();
      setPlayFeedback(
        combinePlayFeedback(reviewText, `Hand ${index + 1} ist aktiv. ${currentActionPrompt()}`),
        reviewTone,
      );
      updateMetrics();
      return;
    }
  }

  const allHandsBusted = state.play.playerHands.every((hand) => handValue(hand.cards) > 21);
  if (allHandsBusted) {
    const result = getPlayResultMessage();
    finishPlayRound(combinePlayFeedback(reviewText, result.text), result.tone);
    return;
  }

  state.play.phase = "dealer";
  setPlayFeedback(combinePlayFeedback(reviewText, "Dealer ist am Zug..."), reviewTone);
  updateMetrics();
  dealerTurn();
}

function submitCountCheck() {
  if (!state.play.pendingCheck) {
    return;
  }

  const raw = countGuessInputEl.value.trim();
  if (raw === "") {
    setFeedbackElement(countCheckFeedbackEl, "Bitte einen Count eingeben.", "warn");
    return;
  }

  const guess = Number(raw);
  if (!Number.isInteger(guess)) {
    setFeedbackElement(countCheckFeedbackEl, "Nur ganze Zahlen sind erlaubt.", "warn");
    return;
  }

  const result = scoreCountGuess(guess, "Count Check:");
  setPlayFeedback(result.text, result.tone);

  const onContinue = state.play.pendingCheck.onContinue;
  state.play.pendingCheck = null;
  setCountCheckVisible(false);
  updateMetrics();

  if (typeof onContinue === "function") {
    onContinue();
  }
}

function startPlayRound() {
  if (state.mode !== "play") {
    return;
  }

  if (state.shoe.length < 4) {
    setPlayFeedback('Zu wenige Karten im Shoe. Bitte "Neues Shoe" klicken.', "warn");
    updateMetrics();
    return;
  }

  state.play.roundActive = true;
  state.play.phase = "dealing";
  state.play.pendingCheck = null;
  state.play.playerHands = [createPlayHand()];
  state.play.activeHandIndex = 0;
  state.play.dealerHand = [];
  setCountCheckVisible(false);
  renderPlayHands();
  setPlayFeedback("Runde startet...");
  updateMetrics();

  const openingOrder = [
    { target: "player", faceDown: false },
    { target: "dealer", faceDown: false },
    { target: "player", faceDown: false },
    { target: "dealer", faceDown: true },
  ];

  function dealOpeningCard(index) {
    if (index >= openingOrder.length) {
      const playerValue = handValue(state.play.playerHands[0].cards);
      const dealerValue = handValue(state.play.dealerHand);
      const playerHasBlackjack = playerValue === 21 && state.play.playerHands[0].cards.length === 2;
      const dealerHasBlackjack = dealerValue === 21 && state.play.dealerHand.length === 2;

      if (playerHasBlackjack || dealerHasBlackjack) {
        revealDealerHoleCard(() => {
          const naturalResult = getPlayResultMessage();
          finishPlayRound(naturalResult.text, naturalResult.tone);
        });
        return;
      }
      state.play.phase = "player";
      setPlayFeedback(currentActionPrompt());
      updateMetrics();
      return;
    }

    const step = openingOrder[index];
    const target = step.target;
    const card =
      target === "player"
        ? drawForPlay("player", state.play.playerHands[0])
        : drawForPlay("dealer", null, { hidden: step.faceDown, deferCount: step.faceDown });
    if (!card) {
      finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
      return;
    }

    if (step.faceDown) {
      dealOpeningCard(index + 1);
      return;
    }

    if (target === "player") {
      promptCountCheck(`Du ziehst ${formatCard(card)}`, () => {
        dealOpeningCard(index + 1);
      });
      return;
    }

    promptCountCheck(`Dealer zeigt ${formatCard(card)}`, () => {
      dealOpeningCard(index + 1);
    });
  }

  dealOpeningCard(0);
}

function playerHit() {
  if (!canPlayerAct()) {
    return;
  }

  const decisionReview = getDecisionReviewText("hit");
  const activeHand = getActivePlayHand();
  const card = drawForPlay("player", activeHand);
  if (!card) {
    finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
    return;
  }

  promptCountCheck(`Du ziehst ${formatCard(card)}`, () => {
    if (handValue(activeHand.cards) > 21) {
      activeHand.status = "bust";
    }
    proceedAfterPlayerAction(decisionReview);
  });
}

function playerDouble() {
  if (!canPlayerDoubleAction()) {
    return;
  }

  const decisionReview = getDecisionReviewText("double");
  const activeHand = getActivePlayHand();
  activeHand.isDoubled = true;

  const card = drawForPlay("player", activeHand);
  if (!card) {
    finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
    return;
  }

  promptCountCheck(`Du ziehst ${formatCard(card)} für Double`, () => {
    if (handValue(activeHand.cards) > 21) {
      activeHand.status = "bust";
    } else {
      activeHand.status = "stood";
    }
    proceedAfterPlayerAction(decisionReview);
  });
}

function playerSplit() {
  if (!canPlayerSplitAction()) {
    return;
  }

  const decisionReview = getDecisionReviewText("split");
  const sourceHand = getActivePlayHand();
  const sourceIndex = state.play.activeHandIndex;
  const [firstCard, secondCard] = sourceHand.cards;
  const splitAces = normalizePairRank(firstCard.rank) === "A" && normalizePairRank(secondCard.rank) === "A";
  const firstSplitHand = createPlayHand([firstCard], { fromSplitAces: splitAces });
  const secondSplitHand = createPlayHand([secondCard], { fromSplitAces: splitAces });

  state.play.playerHands.splice(sourceIndex, 1, firstSplitHand, secondSplitHand);
  state.play.activeHandIndex = sourceIndex;
  renderPlayHands();
  updateMetrics();

  const firstCardDrawn = drawForPlay("player", firstSplitHand);
  if (!firstCardDrawn) {
    finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
    return;
  }

  promptCountCheck(`Hand ${sourceIndex + 1} zieht ${formatCard(firstCardDrawn)}`, () => {
    if (splitAces) {
      firstSplitHand.status = "stood";
    } else if (handValue(firstSplitHand.cards) > 21) {
      firstSplitHand.status = "bust";
    }

    const secondCardDrawn = drawForPlay("player", secondSplitHand);
    if (!secondCardDrawn) {
      finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
      return;
    }

    promptCountCheck(`Hand ${sourceIndex + 2} zieht ${formatCard(secondCardDrawn)}`, () => {
      if (splitAces) {
        secondSplitHand.status = "stood";
      } else if (handValue(secondSplitHand.cards) > 21) {
        secondSplitHand.status = "bust";
      }
      state.play.activeHandIndex = sourceIndex;
      proceedAfterPlayerAction(decisionReview);
    });
  });
}

function dealerTurn() {
  if (!state.play.roundActive) {
    return;
  }

  if (state.play.dealerHand.some((card) => card.hidden)) {
    revealDealerHoleCard(() => {
      dealerTurn();
    });
    return;
  }

  const dealerValue = handValue(state.play.dealerHand);
  if (dealerValue >= 17) {
    const result = getPlayResultMessage();
    finishPlayRound(result.text, result.tone);
    return;
  }

  const card = drawForPlay("dealer");
  if (!card) {
    finishPlayRound('Shoe ist leer. Bitte "Neues Shoe" klicken.', "warn");
    return;
  }

  promptCountCheck(`Dealer zieht ${formatCard(card)}`, () => {
    const updatedDealerValue = handValue(state.play.dealerHand);
    if (updatedDealerValue > 21) {
      const result = getPlayResultMessage();
      finishPlayRound(result.text, result.tone);
      return;
    }
    dealerTurn();
  });
}

function playerStand() {
  if (!canPlayerAct()) {
    return;
  }

  const decisionReview = getDecisionReviewText("stand");
  const activeHand = getActivePlayHand();
  activeHand.status = "stood";
  proceedAfterPlayerAction(decisionReview);
}

modeSelectEl.addEventListener("change", () => {
  setMode(modeSelectEl.value);
});

newShoeBtn.addEventListener("click", newShoe);
nextCardBtn.addEventListener("click", drawTrainerCard);

quizModeEl.addEventListener("change", () => {
  state.trainer.quizMode = quizModeEl.checked;

  if (state.trainer.pendingCard) {
    applyCardToState(state.trainer.pendingCard);
    setTrainerFeedback(
      `Quiz umgestellt: ${formatCard(state.trainer.pendingCard)} automatisch gezählt (${formatSigned(
        state.trainer.pendingCard.value,
      )}).`,
      "warn",
    );
    state.trainer.pendingCard = null;
    setAnswerPadEnabled(false);
  } else {
    setTrainerFeedback(state.trainer.quizMode ? "Quiz aktiv." : "Quiz deaktiviert.");
  }

  updateMetrics();
});

for (const button of answerButtons) {
  button.addEventListener("click", () => {
    const guess = Number(button.dataset.answer);
    answerTrainerCard(guess);
  });
}

startRoundBtn.addEventListener("click", startPlayRound);
hitBtn.addEventListener("click", playerHit);
standBtn.addEventListener("click", playerStand);
doubleBtn.addEventListener("click", playerDouble);
splitBtn.addEventListener("click", playerSplit);
submitCountBtn.addEventListener("click", submitCountCheck);

countGuessInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitCountCheck();
  }
});

statsToggleBtn.addEventListener("click", () => {
  setStatsCollapsed(!state.statsCollapsed);
});

newShoe();
setStatsCollapsed(false);
setMode(modeSelectEl.value);
