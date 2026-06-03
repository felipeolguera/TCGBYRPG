const API_BASE_URL = "https://api.gatcg.com";

const EXAMPLE_DECKLIST = `# Material Deck
1 Spirit of Wind
1 Tristan, Underhanded
1 Backup Charger
1 Censer of Restful Peace
1 Portentous Tanggu
1 Prismspire Scepter
1 Smoke Bombs
1 Tariff Ring
1 The Looking Glass
1 Purifying Thurible
1 Inert Sword
1 Ranger Strides

# Main Deck
1 Coronation Ceremony
4 Dodge Roll
4 Evasive Maneuvers
2 Incapacitate
3 Invective Instruction
4 Mad Hatter, Morose Heritor
4 Aether's Embrace
4 Concealed Marksman
4 Draught of Stamina
4 Fairy Whispers
1 Galewind Scout
4 Liu Bei, Oathkeeper
4 Perse, Relentless Raptor
4 Second Wind
4 Skirting Step
4 Windy Leap
2 Zephyr
3 Cheshire Cat, Impish Grin

# Sideboard
1 Enfeebling Orb
1 Nullifying Lantern
1 Nullifying Mirror
1 Safeguard Amulet
1 Viridian Protective Trinket

# https://silv.ie/deck/peace-scout-attacks/1`;

const state = {
  abortController: null,
  cardCache: new Map(),
};

const deckInput = document.querySelector("#deck-input");
const analyzeButton = document.querySelector("#analyze");
const clearButton = document.querySelector("#clear");
const loadExampleButton = document.querySelector("#load-example");
const statusElement = document.querySelector("#status");
const resultsElement = document.querySelector("#results");
const cardTemplate = document.querySelector("#card-template");

deckInput.value = EXAMPLE_DECKLIST;

loadExampleButton.addEventListener("click", () => {
  deckInput.value = EXAMPLE_DECKLIST;
  deckInput.focus();
});

clearButton.addEventListener("click", () => {
  deckInput.value = "";
  resultsElement.className = "results empty-state";
  resultsElement.innerHTML = `
    <h3>Paste a decklist and click Analyze deck.</h3>
    <p>The app will identify cards, call <code>api.gatcg.com</code>, and organize each card into an easy-to-read explanation.</p>
  `;
  setStatus("Ready");
  deckInput.focus();
});

analyzeButton.addEventListener("click", () => {
  analyzeDeck().catch((error) => {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);
    setBusy(false);
    state.abortController = null;
    setStatus("Error", "error");
    resultsElement.className = "results";
    resultsElement.innerHTML = `
      <div class="notice">
        Something went wrong while analyzing the deck. Check the browser console for details, then try again.
      </div>
    `;
  });
});

async function analyzeDeck() {
  const parsedDeck = parseDeckList(deckInput.value);

  if (parsedDeck.cards.length === 0) {
    setStatus("No cards found", "error");
    resultsElement.className = "results";
    resultsElement.innerHTML = `
      <div class="notice">No card lines were found. Add lines like <code>4 Fairy Whispers</code> and try again.</div>
    `;
    return;
  }

  if (state.abortController) {
    state.abortController.abort();
  }

  state.abortController = new AbortController();
  setBusy(true);
  setStatus(`Fetching 0/${parsedDeck.cards.length}`, "loading");
  resultsElement.className = "results empty-state";
  resultsElement.innerHTML = "<h3>Fetching card data...</h3><p>This can take a moment for a full decklist.</p>";

  const enrichedCards = [];

  for (const [index, cardEntry] of parsedDeck.cards.entries()) {
    setStatus(`Fetching ${index + 1}/${parsedDeck.cards.length}: ${cardEntry.name}`, "loading");
    const card = await findCard(cardEntry.name, state.abortController.signal);
    enrichedCards.push({
      ...cardEntry,
      card,
      error: card ? null : `Could not find "${cardEntry.name}"`,
    });
  }

  setBusy(false);
  setStatus("Complete");
  renderResults({
    ...parsedDeck,
    cards: enrichedCards,
  });
}

function parseDeckList(input) {
  const sections = [];
  const cards = [];
  let currentSection = "Main Deck";

  const ensureSection = (name) => {
    if (!sections.includes(name)) {
      sections.push(name);
    }
  };

  ensureSection(currentSection);

  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        return;
      }

      if (/^#?\s*https?:\/\//i.test(line)) {
        return;
      }

      const headingMatch = line.match(/^#+\s*(.+)$/);
      if (headingMatch) {
        currentSection = normalizeSectionName(headingMatch[1]);
        ensureSection(currentSection);
        return;
      }

      const cardMatch = line.match(/^(?:(\d+)\s*x?\s+)?(.+?)\s*$/i);
      if (!cardMatch) {
        return;
      }

      const quantity = Number(cardMatch[1] || 1);
      const name = cardMatch[2].replace(/\s+#.*$/, "").trim();

      if (!name) {
        return;
      }

      ensureSection(currentSection);
      cards.push({
        quantity,
        name,
        section: currentSection,
      });
    });

  return { sections, cards };
}

function normalizeSectionName(name) {
  const cleanName = name.trim();
  const lowerName = cleanName.toLowerCase();

  if (lowerName.includes("material")) {
    return "Material Deck";
  }

  if (lowerName.includes("side")) {
    return "Sideboard";
  }

  if (lowerName.includes("main")) {
    return "Main Deck";
  }

  return cleanName || "Main Deck";
}

async function findCard(name, signal) {
  const cacheKey = name.toLowerCase();

  if (state.cardCache.has(cacheKey)) {
    return state.cardCache.get(cacheKey);
  }

  const autocompleteUrl = `${API_BASE_URL}/cards/autocomplete?name=${encodeURIComponent(name)}`;
  const matches = await fetchJson(autocompleteUrl, signal);

  if (!Array.isArray(matches) || matches.length === 0) {
    state.cardCache.set(cacheKey, null);
    return null;
  }

  const lowerName = name.toLowerCase();
  const match =
    matches.find((item) => item.name.toLowerCase() === lowerName) ||
    matches.find((item) => item.name.toLowerCase().includes(lowerName)) ||
    matches[0];

  const cardUrl = `${API_BASE_URL}/cards/${encodeURIComponent(match.slug)}`;
  const card = await fetchJson(cardUrl, signal);
  state.cardCache.set(cacheKey, card);
  return card;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function renderResults(deck) {
  const fragment = document.createDocumentFragment();
  const cardsWithData = deck.cards.filter((entry) => entry.card);
  const activeChampion = getActiveChampion(cardsWithData);
  const activeClasses = activeChampion?.classes || [];

  resultsElement.className = "results";
  resultsElement.innerHTML = "";

  fragment.appendChild(renderStrategy(deck, activeChampion));

  const missingCards = deck.cards.filter((entry) => entry.error);
  if (missingCards.length > 0) {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = `Could not find: ${missingCards.map((entry) => entry.name).join(", ")}`;
    fragment.appendChild(notice);
  }

  deck.sections.forEach((sectionName) => {
    const sectionCards = deck.cards.filter((entry) => entry.section === sectionName);

    if (sectionCards.length === 0) {
      return;
    }

    const section = document.createElement("section");
    section.className = "section";
    const totalQuantity = sectionCards.reduce((total, entry) => total + entry.quantity, 0);
    section.innerHTML = `
      <h3>${escapeHtml(sectionName)} <span class="badge">${totalQuantity} cards</span></h3>
      <div class="cards"></div>
    `;

    const cardsContainer = section.querySelector(".cards");
    sectionCards.forEach((entry) => {
      cardsContainer.appendChild(renderCard(entry, activeClasses));
    });

    fragment.appendChild(section);
  });

  resultsElement.appendChild(fragment);
}

function renderStrategy(deck, activeChampion) {
  const cards = deck.cards.filter((entry) => entry.card);
  const mainCards = cards.filter((entry) => entry.section !== "Material Deck");
  const strategyItems = buildStrategyItems(mainCards, activeChampion);
  const totalMain = mainCards.reduce((total, entry) => total + entry.quantity, 0);
  const totalMaterial = cards
    .filter((entry) => entry.section === "Material Deck")
    .reduce((total, entry) => total + entry.quantity, 0);
  const championName = activeChampion?.name || "not detected";
  const championClassLabel = activeChampion
    ? ` (${(activeChampion.classes || []).join(", ") || "no class"})`
    : "";

  const wrapper = document.createElement("div");
  wrapper.className = "summary";
  wrapper.innerHTML = `
    <div class="summary-card">
      <h3>Deck read</h3>
      <ul>
        <li><strong>${totalMaterial}</strong> material cards and <strong>${totalMain}</strong> main/side cards were found.</li>
        <li>Active champion: <strong>${escapeHtml(championName)}</strong>${escapeHtml(championClassLabel)}.</li>
        ${strategyItems.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </div>
  `;

  return wrapper;
}

function buildStrategyItems(entries, activeChampion) {
  const keywordCounts = countKeywords(entries);
  const classCounts = countValues(entries, (card) => card.classes || []);
  const elementCounts = countValues(entries, (card) => card.elements || [card.element].filter(Boolean));
  const topClass = topCount(classCounts);
  const topElement = topCount(elementCounts);
  const items = [];

  if (topElement) {
    items.push(`Your most common element is <strong>${escapeHtml(topElement[0])}</strong>, so effects that reward that element are important to sequence carefully.`);
  }

  if (topClass) {
    items.push(`The deck's most common card class is <strong>${escapeHtml(topClass[0])}</strong>, while your champion class is <strong>${escapeHtml((activeChampion?.classes || []).join(", ") || "unknown")}</strong>. Watch which class bonuses are actually active.`);
  }

  if (keywordCounts.distant || keywordCounts.ranged) {
    items.push("Core plan: make Ranger allies <strong>distant</strong>, then attack while their <strong>Ranged</strong> bonuses are active.");
  }

  if (keywordCounts.wake) {
    items.push("Use wake-up effects after a strong attack or after defending so your best ally can act again.");
  }

  if (keywordCounts.suppress) {
    items.push("Use suppress effects as tempo tools to remove blockers, weapons, or regalia for the turn you want to push damage.");
  }

  if (keywordCounts.negate || keywordCounts.spellshroud || keywordCounts.stealth) {
    items.push("Hold protection for the turns where a key ally is carrying your damage plan; preventing one answer can convert into multiple attacks.");
  }

  if (keywordCounts.glimpse || keywordCounts.draw) {
    items.push("Your card selection and draw effects help find the right mix of ally, distance enabler, and protection.");
  }

  if (items.length === 0) {
    items.push("Play to the cards that create repeatable pressure, then save reactions for the opponent's highest-impact turns.");
  }

  return items;
}

function renderCard(entry, activeClasses) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  const title = node.querySelector("h4");
  const meta = node.querySelector(".meta");
  const quantity = node.querySelector(".quantity");
  const stats = node.querySelector(".stats");
  const thumbnail = node.querySelector(".thumbnail img");
  const insights = node.querySelector(".insights");
  const rules = node.querySelector(".rules");

  if (!entry.card) {
    title.textContent = entry.name;
    meta.textContent = "Card not found";
    quantity.textContent = `x${entry.quantity}`;
    thumbnail.removeAttribute("src");
    thumbnail.alt = "";
    insights.append(renderInsight("Lookup", entry.error));
    rules.textContent = "";
    return node;
  }

  const card = entry.card;
  const imageUrl = getCardImageUrl(card);
  title.textContent = card.name;
  quantity.textContent = `x${entry.quantity}`;
  meta.textContent = buildMeta(card);
  stats.append(...buildStats(card));
  if (imageUrl) {
    thumbnail.src = imageUrl;
    thumbnail.alt = `${card.name} card image`;
  } else {
    thumbnail.removeAttribute("src");
    thumbnail.alt = "";
  }
  insights.append(...buildCardInsights(card, activeClasses).map(({ label, text }) => renderInsight(label, text)));
  rules.textContent = card.effect_raw || "No rules text.";

  return node;
}

function getCardImageUrl(card) {
  const imagePath = (card.editions || []).find((edition) => edition.image)?.image;

  if (!imagePath) {
    return "";
  }

  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  return `${API_BASE_URL}${imagePath}`;
}

function renderInsight(label, text) {
  const wrapper = document.createElement("p");
  const title = document.createElement("strong");
  const body = document.createElement("span");

  wrapper.className = "insight";
  title.textContent = label;
  body.textContent = text;
  wrapper.append(title, body);

  return wrapper;
}

function buildMeta(card) {
  const parts = [
    ...(card.elements || [card.element].filter(Boolean)),
    ...(card.types || []),
    ...(card.subtypes || []),
  ];

  return parts.join(" - ");
}

function buildStats(card) {
  const stats = [];
  const cost = card.cost?.value ? `${card.cost.value} ${card.cost.type}` : null;

  addStat(stats, "Cost", cost);
  addStat(stats, "Level", card.level);
  addStat(stats, "Power", card.power);
  addStat(stats, "Life", card.life);
  addStat(stats, "Durability", card.durability);
  addStat(stats, "Speed", card.speed === true ? "Fast" : card.speed === false ? "Slow" : null);

  return stats;
}

function addStat(stats, label, value) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  stats.push(wrapper);
}

function buildCardInsights(card, activeClasses) {
  const effect = (card.effect_raw || "").toLowerCase();
  const types = card.types || [];
  const subtypes = card.subtypes || [];
  const insights = [];
  const isChampion = types.includes("CHAMPION");
  const isAlly = types.includes("ALLY");
  const isRegalia = types.includes("REGALIA");
  const isAction = types.includes("ACTION");
  const isRanger = subtypes.includes("RANGER") || (card.classes || []).includes("RANGER");

  const addInsight = (label, text) => {
    if (!insights.some((insight) => insight.label === label && insight.text === text)) {
      insights.push({ label, text });
    }
  };

  if (isChampion) {
    addInsight(
      "Primary use",
      `Your champion sets the deck's life total to ${card.life ?? "unknown"} and defines which class bonuses are active: ${joinList(card.classes || []) || "none detected"}.`,
    );
  }

  if (isAlly) {
    const body = [card.power, card.life].every((value) => value !== null && value !== undefined)
      ? `${card.power}/${card.life}`
      : "board";
    addInsight("Primary use", `${body} ally that gives you a board piece to attack, defend, or build combat tricks around.`);
  }

  if (isRegalia) {
    addInsight("Primary use", "Material deck tool you can choose when the matchup or current turn calls for its effect.");
  }

  if (types.includes("ITEM") && !isRegalia) {
    addInsight("Primary use", "Item that can sit on the field until the right turn to cash in its activated effect.");
  }

  if (isAction) {
    addInsight("Primary use", card.speed ? "Fast action you can hold up for combat, protection, or a surprise tempo swing." : "Proactive action for your own main turn.");
  }

  if (effect.includes("ranged")) {
    addInsight("Creative line", "Make this unit distant before attacks, then stack pump or wake effects so its Ranged bonus matters more than once.");
  }

  if (effect.includes("becomes distant")) {
    addInsight("Creative line", "Use it on a Ranger before your attack step, or during the opponent's turn so the unit can survive combat and be distant for your next turn.");
  }

  if (effect.includes("wake up")) {
    addInsight("Creative line", "After a distant ally attacks or rests for an ability, wake it to attack again, block, or reuse a key tap/rest effect.");
  }

  if (effect.includes("suppress")) {
    addInsight("Creative line", "Suppress the object that blocks your best attack turn: a defender, a weapon, or a regalia piece that would answer your board.");
  }

  if (effect.includes("negate")) {
    addInsight("Best timing", "Hold enough reserve for the opponent's highest-impact action, especially removal or a blowout combat trick.");
  }

  if (effect.includes("spellshroud") || effect.includes("stealth")) {
    addInsight("Best timing", "Save this for the ally carrying your damage plan; protecting one distant threat can represent several attacks over two turns.");
  }

  if (effect.includes("glimpse") || effect.includes("draw")) {
    addInsight("Creative line", "Use card flow before committing the turn so you can find the missing piece: ally, distance enabler, protection, or wake effect.");
  }

  if (effect.includes("banish") && effect.includes("graveyard")) {
    addInsight("Best timing", "Do not fire graveyard hate too early; wait until it breaks up a recursion turn, element requirement, or graveyard payoff.");
  }

  if (effect.includes("glimpse") && effect.includes("reveal the top card")) {
    addInsight("Creative line", "Stack a Wind card on top with glimpse, then reveal it immediately to turn the spell into real card advantage.");
  }

  if (effect.includes("banish target ally you control") && effect.includes("return it")) {
    addInsight("Creative line", "Blink your ally to dodge removal, clear damage, or retrigger an On Enter effect; because it returns rested, pair it with wake effects when you still need to attack.");
  }

  if (effect.includes("whenever another unit you control becomes distant")) {
    addInsight("Creative line", "Target another unit with your distant effect first so this card turns on for free and gives you a second attacker without spending another card.");
  }

  if (effect.includes("rest: suppress") || effect.includes("rest]**: suppress")) {
    addInsight("Creative line", "Make this distant before using the rest ability, then consider waking it afterward so you still get pressure after the suppression.");
  }

  if (effect.includes("materialize a ranger regalia")) {
    addInsight("Creative line", "Use this when Ranger Strides or another Ranger regalia is worth the random material banish; it can turn one ally into both a body and a finisher setup.");
  }

  if (effect.includes("pay (2) for each attack")) {
    addInsight("Best timing", "Use it before an opponent's wide attack turn; taxing every attack is strongest when they planned to swing multiple times.");
  }

  if (effect.includes("cards in graveyards lose all abilities")) {
    addInsight("Best timing", "Materialize it before the opponent's graveyard cards become active so their recursion or death-trigger setup never turns on.");
  }

  if (effect.includes("all activated abilities of distortion regalia")) {
    addInsight("Creative line", "Treat this like a protected toolbox threat: each Distortion regalia you control gives it more text, while Distortion weapons also raise its power.");
  }

  if (effect.includes("draw a card into your memory")) {
    addInsight("Creative line", "Drawing into memory can set up reserve for later turns; if your champion gives agility, memory cards may come back to hand at end phase.");
  }

  if (effect.includes("prevent") && effect.includes("damage")) {
    addInsight("Best timing", "Use prevention after the opponent commits damage, forcing them to spend a real card while your unit survives or becomes distant.");
  }

  if (isRanger && !effect.includes("ranged") && !effect.includes("becomes distant")) {
    addInsight("Deck fit", "Because this is a Ranger card, it still works with the deck's Ranger support even when it is not your champion class.");
  }

  if (effect.includes("[class bonus]") && !hasActiveClassBonus(card, activeClasses)) {
    addInsight("Watch out", `Its class bonus is probably off with your current champion class (${joinList(activeClasses) || "unknown"}), so plan around the base text first.`);
  }

  if (insights.length === 0) {
    addInsight("Primary use", "Use this card when its type line and stats fit the current turn: develop threats first, then spend tricks when they change combat or protect damage.");
  }

  return insights.slice(0, 4);
}

function getActiveChampion(entries) {
  const champions = entries
    .filter((entry) => entry.section === "Material Deck")
    .map((entry) => entry.card)
    .filter((card) => (card.types || []).includes("CHAMPION"));

  if (champions.length === 0) {
    return null;
  }

  return champions.sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))[0];
}

function hasActiveClassBonus(card, activeClasses) {
  const cardClasses = card.classes || [];
  return cardClasses.some((cardClass) => activeClasses.includes(cardClass));
}

function countKeywords(entries) {
  return entries.reduce(
    (counts, entry) => {
      const text = `${entry.card?.effect_raw || ""} ${entry.card?.name || ""}`.toLowerCase();

      Object.keys(counts).forEach((keyword) => {
        if (text.includes(keyword)) {
          counts[keyword] += entry.quantity;
        }
      });

      if (text.includes("draw")) {
        counts.draw += entry.quantity;
      }

      if (text.includes("wake up")) {
        counts.wake += entry.quantity;
      }

      return counts;
    },
    {
      distant: 0,
      ranged: 0,
      wake: 0,
      suppress: 0,
      negate: 0,
      spellshroud: 0,
      stealth: 0,
      glimpse: 0,
      draw: 0,
    },
  );
}

function countValues(entries, getter) {
  const counts = new Map();

  entries.forEach((entry) => {
    getter(entry.card).forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + entry.quantity);
    });
  });

  return counts;
}

function topCount(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
}

function setBusy(isBusy) {
  analyzeButton.disabled = isBusy;
  loadExampleButton.disabled = isBusy;
  clearButton.disabled = isBusy;
}

function setStatus(text, type = "") {
  statusElement.textContent = text;
  statusElement.className = `status ${type}`.trim();
}

function joinList(values) {
  return unique(values).join(", ");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
