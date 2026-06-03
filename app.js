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
    const lookup = await findCard(cardEntry.name, state.abortController.signal);
    enrichedCards.push({
      ...cardEntry,
      card: lookup.card,
      suggestions: lookup.suggestions,
      error: lookup.error,
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
      const name = cleanDeckCardName(cardMatch[2]);

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

function cleanDeckCardName(rawName) {
  return rawName
    .replace(/\s+#.*$/, "")
    .replace(/\s+\[[^\]]+\]\s*$/, "")
    .replace(/\s+\([A-Z0-9-]{2,}\)\s*(?:#?\d+[A-Z]?)?\s*$/i, "")
    .replace(/\s+[A-Z0-9-]{2,}-\d+[A-Z]?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCardNameForMatch(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function findCard(name, signal) {
  const cacheKey = normalizeCardNameForMatch(name);

  if (state.cardCache.has(cacheKey)) {
    return state.cardCache.get(cacheKey);
  }

  const autocompleteUrl = `${API_BASE_URL}/cards/autocomplete?name=${encodeURIComponent(name)}`;
  const matches = await fetchJson(autocompleteUrl, signal);

  if (!Array.isArray(matches) || matches.length === 0) {
    const miss = {
      card: null,
      suggestions: [],
      error: `No API results matched "${name}".`,
    };
    state.cardCache.set(cacheKey, miss);
    return miss;
  }

  const normalizedName = normalizeCardNameForMatch(name);
  const exactMatches = matches.filter((item) => normalizeCardNameForMatch(item.name) === normalizedName);
  const match = exactMatches[0];

  if (!match) {
    const miss = {
      card: null,
      suggestions: matches.slice(0, 5).map((item) => item.name),
      error: `No exact card-name match for "${name}".`,
    };
    state.cardCache.set(cacheKey, miss);
    return miss;
  }

  const cardUrl = `${API_BASE_URL}/cards/${encodeURIComponent(match.slug)}`;
  const card = await fetchJson(cardUrl, signal);
  const hit = { card, suggestions: [], error: null };
  state.cardCache.set(cacheKey, hit);
  return hit;
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
    notice.textContent = `Needs review: ${missingCards.map((entry) => entry.name).join(", ")}. These cards were not exact API matches, so the app did not guess.`;
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
    items.push(`Detected <strong>distant/Ranged</strong> text on ${keywordCounts.distant + keywordCounts.ranged} card copies, including ${escapeHtml(exampleCardsWithText(entries, ["distant", "ranged"]))}. Read each card's exact condition before counting a Ranged bonus.`);
  }

  if (keywordCounts.wake) {
    items.push(`Detected <strong>wake up</strong> text on ${keywordCounts.wake} card copies, including ${escapeHtml(exampleCardsWithText(entries, ["wake up"]))}. Use those after the target has already rested, attacked, defended, or used a rest ability.`);
  }

  if (keywordCounts.suppress) {
    items.push(`Detected <strong>suppress</strong> text on ${keywordCounts.suppress} card copies, including ${escapeHtml(exampleCardsWithText(entries, ["suppress"]))}. Choose the target that changes the current turn the most.`);
  }

  if (keywordCounts.negate || keywordCounts.spellshroud || keywordCounts.stealth) {
    items.push(`Detected interaction/protection text on cards like ${escapeHtml(exampleCardsWithText(entries, ["negate", "spellshroud", "stealth"]))}. Hold the required reserve until the exact printed protection or negate line can matter.`);
  }

  if (keywordCounts.glimpse || keywordCounts.draw) {
    items.push(`Detected card-flow text on cards like ${escapeHtml(exampleCardsWithText(entries, ["glimpse", "draw"]))}. Use those effects before committing to a line so your decisions use the extra information.`);
  }

  if (items.length === 0) {
    items.push("No strong repeated keywords were detected. Use the individual card panels below: each one quotes the exact printed text used for its advice.");
  }

  return items;
}

function exampleCardsWithText(entries, keywords) {
  const examples = entries
    .filter((entry) => {
      const text = `${entry.card?.effect_raw || ""} ${entry.card?.name || ""}`.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword));
    })
    .map((entry) => entry.card.name);

  return unique(examples).slice(0, 3).join(", ") || "none";
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
    const suggestionText = entry.suggestions?.length
      ? ` Closest API suggestions: ${entry.suggestions.join(", ")}.`
      : "";
    insights.append(renderInsight("Lookup", `${entry.error}${suggestionText}`));
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
  const effectText = card.effect_raw || "";
  const effect = effectText.toLowerCase();
  const rulesLines = getRulesLines(effectText);
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

  if (rulesLines.length > 0) {
    addInsight("Card text checked", `Using the printed text: "${truncateText(rulesLines.join(" / "), 220)}"`);
  } else {
    addInsight("Card text checked", "This card has no printed rules text in the API, so advice is based only on type line and stats.");
  }

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
    addInsight("Primary use", "Material deck tool. Materialize it when its exact printed line below matters in the matchup or current turn.");
  }

  if (types.includes("ITEM") && !isRegalia) {
    addInsight("Primary use", "Item that can sit on the field until the right turn to use its printed activated or sacrifice effect.");
  }

  if (isAction) {
    addInsight("Primary use", card.speed ? "Fast action. Hold reserve open when its printed text can change combat or stop an opposing play." : "Slow/proactive action. Plan to use it on your own turn around its printed target and cost.");
  }

  rulesLines.forEach((line) => addRuleLineAdvice(line, addInsight));

  if (isRanger && !effect.includes("ranged") && !effect.includes("becomes distant")) {
    addInsight("Deck fit", "Its type line includes Ranger, so it can be chosen by effects that specifically ask for a Ranger card or Ranger unit.");
  }

  if (effect.includes("[class bonus]") && !hasActiveClassBonus(card, activeClasses)) {
    addInsight("Watch out", `The text has a Class Bonus, but your detected champion class is ${joinList(activeClasses) || "unknown"}. If those classes do not match, ignore the bonus text and plan around the base effect only.`);
  }

  if (insights.length === 0) {
    addInsight("Primary use", "Use this card when its type line and stats fit the current turn. No extra rules text was available to infer a more specific line.");
  }

  return insights.slice(0, 6);
}

function addRuleLineAdvice(line, addInsight) {
  const lowerLine = line.toLowerCase();
  const quotedLine = `"${truncateText(line, 150)}"`;

  if (lowerLine.includes("on enter")) {
    addInsight("Timing", `${quotedLine} means you should play or materialize this when the enter effect immediately matters, not just because you have spare reserve.`);
  }

  if (lowerLine.includes("ranged")) {
    addInsight("Use the keyword", `${quotedLine} only improves attacks while the unit is distant, so do not count that bonus unless another effect or game state actually made it distant.`);
  }

  if (lowerLine.includes("becomes distant")) {
    addInsight("Setup line", `${quotedLine} is a distance setup effect. Choose the unit whose next attack, defense, or conditional ability is improved by being distant.`);
  }

  if (lowerLine.includes("wake up")) {
    addInsight("Sequencing", `${quotedLine} is best after the target has already rested, attacked, defended, or used a rest ability, so the wake effect creates extra value.`);
  }

  if (lowerLine.includes("suppress")) {
    addInsight("Target priority", `${quotedLine} temporarily removes a specific problem object. Aim it at the blocker, weapon, regalia, or ally that most affects this turn.`);
  }

  if (lowerLine.includes("negate")) {
    addInsight("Hold reserve", `${quotedLine} only matters while the target activation is on the stack. Keep the cost available when you expect a key action.`);
  }

  if (lowerLine.includes("spellshroud")) {
    addInsight("Protection", `${quotedLine} stops spell targeting for the turn. Use it before the opponent's spell-based answer resolves, on the unit that matters most.`);
  }

  if (lowerLine.includes("stealth")) {
    addInsight("Protection", `${quotedLine} makes attacks harder to point at that ally unless true sight applies, so use it to protect a unit that would otherwise be attacked.`);
  }

  if (lowerLine.includes("prevent") && lowerLine.includes("damage")) {
    addInsight("Damage math", `${quotedLine} changes the next damage event described by the card. Wait until the opponent has committed damage so the prevention trades for real effort.`);
  }

  if (lowerLine.includes("glimpse")) {
    addInsight("Deck setup", `${quotedLine} lets you control upcoming cards. Put the card you need next on top and move bad reveals to the bottom.`);
  }

  if (lowerLine.includes("reveal the top card")) {
    addInsight("Deck setup", `${quotedLine} rewards arranging the top card first. If another line on the card glimpses or filters, sequence that before the reveal.`);
  }

  if (lowerLine.includes("draw")) {
    addInsight("Card flow", `${quotedLine} replaces itself or adds resources. Use that extra card before committing to a risky attack line when possible.`);
  }

  if (lowerLine.includes("draw a card into your memory")) {
    addInsight("Resource use", `${quotedLine} adds to memory instead of hand, so treat it as future reserve/material for later turns unless another effect returns memory to hand.`);
  }

  if (lowerLine.includes("banish") && lowerLine.includes("graveyard")) {
    addInsight("Graveyard timing", `${quotedLine} should be saved for the moment it breaks a graveyard payoff, recursion setup, or element requirement.`);
  }

  if (lowerLine.includes("cards in graveyards")) {
    addInsight("Matchup role", `${quotedLine} is matchup text. Bring it out when the opponent's graveyard text or graveyard elements are part of their plan.`);
  }

  if (lowerLine.includes("banish target ally you control") && lowerLine.includes("return it")) {
    addInsight("Blink line", `${quotedLine} can save an ally or reuse enter text, but follow the card's return state exactly when planning attacks or blocks.`);
  }

  if (lowerLine.includes("whenever another unit you control becomes distant")) {
    addInsight("Trigger setup", `${quotedLine} means you should make a different unit distant first if you want this card to become distant without spending another effect on it.`);
  }

  if (lowerLine.includes("materialize a ranger regalia")) {
    addInsight("Material plan", `${quotedLine} trades a random material banish for a Ranger regalia. Use it when that regalia is worth the risk to your remaining material deck.`);
  }

  if (lowerLine.includes("pay (2) for each attack")) {
    addInsight("Defensive timing", `${quotedLine} is strongest before a turn with multiple enemy attacks, because every attack declaration becomes more expensive.`);
  }

  if (lowerLine.includes("activated abilities of distortion regalia")) {
    addInsight("Build-around", `${quotedLine} depends on which Distortion regalia you actually control, so check those cards before choosing targets or lines.`);
  }

  if (lowerLine.includes("gets +") || lowerLine.includes("gets +x")) {
    addInsight("Combat math", `${quotedLine} changes stats for a defined window. Count the exact bonus and duration before declaring attacks or blocks.`);
  }

  if (lowerLine.includes("costs") && lowerLine.includes("less")) {
    addInsight("Cost check", `${quotedLine} is conditional cost reduction. Confirm the condition is true before assuming you can hold less reserve open.`);
  }
}

function getRulesLines(effectText) {
  return effectText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
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
