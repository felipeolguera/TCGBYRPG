import { drawStartingHand, formatCardQuantity, groupCards, parseDecklist } from "./deck.js";

const SAMPLE_DECKLIST = `# Main Deck
3 Incapacitate
4 Sable Remnant
4 Slice and Dice
2 Aesan Protector
3 Blackmarket Broker
4 Dream Fairy
4 Fairy Whispers
4 Galewhisper Rogue
4 Reclaim
4 Shimmercloak Assassin
3 Stifling Trap
4 Surveil the Winds
3 Tempest Downfall
3 Veiling Breeze
4 Winbless Lookout
4 Windmill Engineer
3 Zephyr

# Material Deck
1 Spirit of Wind
1 Tristan, Underhanded
1 Tristan, Hired Blade
1 Assassin's Ripper`;

const decklistInput = document.querySelector("#decklist");
const handSizeInputs = document.querySelectorAll("input[name='hand-size']");
const generateButton = document.querySelector("#generate-hand");
const clearButton = document.querySelector("#clear-decklist");
const sampleButton = document.querySelector("#load-sample");
const copyButton = document.querySelector("#copy-hand");
const deckSummary = document.querySelector("#deck-summary");
const feedback = document.querySelector("#feedback");
const handResult = document.querySelector("#hand-result");
const handList = document.querySelector("#hand-list");
const handDetails = document.querySelector("#hand-details");

let lastHand = [];

decklistInput.addEventListener("input", updateDeckPreview);
generateButton.addEventListener("click", generateHand);
clearButton.addEventListener("click", clearDecklist);
sampleButton.addEventListener("click", loadSample);
copyButton.addEventListener("click", copyHand);

updateDeckPreview();

function getSelectedHandSize() {
  return Number.parseInt(
    Array.from(handSizeInputs).find((input) => input.checked)?.value ?? "7",
    10
  );
}

function updateDeckPreview() {
  const parsedDeck = parseDecklist(decklistInput.value);
  const hasCards = parsedDeck.totalCards > 0;

  deckSummary.textContent = hasCards
    ? `${parsedDeck.totalCards} main deck card${parsedDeck.totalCards === 1 ? "" : "s"} parsed from ${parsedDeck.cards.length} unique card${parsedDeck.cards.length === 1 ? "" : "s"}.`
    : "Paste a Silvie decklist to see the parsed main deck count.";

  renderFeedback(parsedDeck, false);
  generateButton.disabled = !hasCards;
}

function generateHand() {
  const parsedDeck = parseDecklist(decklistInput.value);
  const handSize = getSelectedHandSize();

  try {
    lastHand = drawStartingHand(parsedDeck.cards, handSize);
  } catch (error) {
    renderFeedback(parsedDeck, true, error.message);
    return;
  }

  const groupedHand = groupCards(lastHand);
  handList.replaceChildren(
    ...groupedHand.map((card) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const quantity = document.createElement("strong");

      name.textContent = card.name;
      quantity.textContent = `x${card.quantity}`;
      item.append(name, quantity);
      return item;
    })
  );

  handDetails.textContent = `${handSize} cards drawn from a ${parsedDeck.totalCards}-card main deck.`;
  handResult.hidden = false;
  copyButton.disabled = false;
  renderFeedback(parsedDeck, true);
}

function renderFeedback(parsedDeck, showSuccess, errorMessage = "") {
  const messages = [];

  if (errorMessage) {
    messages.push({ type: "error", text: errorMessage });
  } else if (showSuccess && parsedDeck.totalCards > 0) {
    messages.push({ type: "success", text: "Starting hand generated. Click Generate again to reshuffle." });
  }

  parsedDeck.warnings.forEach((warning) => {
    messages.push({ type: "warning", text: warning });
  });

  if (parsedDeck.ignoredLines.length > 0) {
    const ignoredPreview = parsedDeck.ignoredLines
      .slice(0, 3)
      .map((line) => `line ${line.lineNumber}: "${line.text}"`)
      .join("; ");
    messages.push({
      type: "warning",
      text: `Ignored ${ignoredPreview}${parsedDeck.ignoredLines.length > 3 ? "; ..." : ""}`
    });
  }

  if (messages.length === 0) {
    feedback.replaceChildren();
    feedback.hidden = true;
    return;
  }

  feedback.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("p");
      item.className = `message message-${message.type}`;
      item.textContent = message.text;
      return item;
    })
  );
  feedback.hidden = false;
}

function clearDecklist() {
  decklistInput.value = "";
  lastHand = [];
  handResult.hidden = true;
  copyButton.disabled = true;
  updateDeckPreview();
  decklistInput.focus();
}

function loadSample() {
  decklistInput.value = SAMPLE_DECKLIST;
  updateDeckPreview();
  decklistInput.focus();
}

async function copyHand() {
  if (lastHand.length === 0) {
    return;
  }

  const handText = groupCards(lastHand).map(formatCardQuantity).join("\n");

  try {
    await navigator.clipboard.writeText(handText);
    copyButton.textContent = "Copied!";
    window.setTimeout(() => {
      copyButton.textContent = "Copy hand";
    }, 1200);
  } catch {
    renderFeedback(parseDecklist(decklistInput.value), true, "Unable to copy the hand automatically.");
  }
}
