const SECTION_PATTERNS = [
  { section: "main", pattern: /^#?\s*(main\s+deck|mainboard|main)\s*:?\s*$/i },
  { section: "material", pattern: /^#?\s*(material\s+deck|materials?|material)\s*:?\s*$/i },
  { section: "sideboard", pattern: /^#?\s*(side\s*board|sideboard)\s*:?\s*$/i },
  { section: "maybeboard", pattern: /^#?\s*(maybe\s*board|maybeboard)\s*:?\s*$/i }
];

const DECORATIVE_LINE = /^[-=_*\s]+$/;
const MAX_REASONABLE_QUANTITY = 999;

export function parseDecklist(decklistText) {
  const lines = String(decklistText ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const parsedLines = [];
  const ignoredLines = [];
  const warnings = [];
  let currentSection = "all";
  let sawMainSection = false;

  lines.forEach((rawLine, index) => {
    const original = rawLine;
    const line = normalizeLine(rawLine);

    if (!line || DECORATIVE_LINE.test(line)) {
      return;
    }

    const section = identifySection(line);
    if (section) {
      currentSection = section;
      if (section === "main") {
        sawMainSection = true;
      }
      return;
    }

    if (isComment(line)) {
      return;
    }

    const card = parseCardLine(line);
    if (!card) {
      ignoredLines.push({ lineNumber: index + 1, text: original.trim() });
      return;
    }

    if (card.quantity <= 0) {
      ignoredLines.push({ lineNumber: index + 1, text: original.trim() });
      return;
    }

    if (card.quantity > MAX_REASONABLE_QUANTITY) {
      warnings.push(
        `Line ${index + 1} has a very large quantity (${card.quantity}) for "${card.name}".`
      );
    }

    parsedLines.push({
      ...card,
      section: currentSection,
      lineNumber: index + 1
    });
  });

  const mainLines = sawMainSection
    ? parsedLines.filter((card) => card.section === "main")
    : parsedLines.filter((card) => card.section === "all");

  const cards = combineDuplicates(mainLines);
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  if (!sawMainSection && parsedLines.some((card) => card.section !== "all")) {
    warnings.push("No Main Deck section was found, so only cards before other sections were used.");
  }

  if (sawMainSection && totalCards === 0) {
    warnings.push("A Main Deck section was found, but no card lines were parsed inside it.");
  }

  if (ignoredLines.length > 0) {
    warnings.push(
      `${ignoredLines.length} line${ignoredLines.length === 1 ? "" : "s"} could not be parsed.`
    );
  }

  return {
    cards,
    totalCards,
    ignoredLines,
    warnings,
    sawMainSection
  };
}

export function drawStartingHand(cards, handSize, rng = Math.random) {
  if (!Number.isInteger(handSize) || ![6, 7].includes(handSize)) {
    throw new Error("Hand size must be 6 or 7 cards.");
  }

  const deck = expandDeck(cards);
  if (deck.length < handSize) {
    throw new Error(`Deck must contain at least ${handSize} cards to draw a starting hand.`);
  }

  return shuffle(deck, rng).slice(0, handSize);
}

export function groupCards(cards) {
  const grouped = new Map();

  cards.forEach((card) => {
    const existing = grouped.get(card.name);
    if (existing) {
      existing.quantity += card.quantity ?? 1;
      return;
    }

    grouped.set(card.name, {
      name: card.name,
      quantity: card.quantity ?? 1
    });
  });

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function formatCardQuantity(card) {
  return `${card.quantity} ${card.name}`;
}

function normalizeLine(rawLine) {
  return rawLine
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identifySection(line) {
  return SECTION_PATTERNS.find(({ pattern }) => pattern.test(line))?.section ?? null;
}

function isComment(line) {
  return /^(\/\/|;)/.test(line);
}

function parseCardLine(line) {
  const patterns = [
    /^(\d+)\s*[xX]?\s+(.+)$/,
    /^(\d+)\s*[xX]\s+(.+)$/,
    /^(.+?)\s+[xX]\s*(\d+)$/,
    /^(.+?)\s*\((\d+)\)$/
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const quantityFirst = /^\d/.test(match[1]);
    const quantity = Number.parseInt(quantityFirst ? match[1] : match[2], 10);
    const name = cleanupCardName(quantityFirst ? match[2] : match[1]);

    if (Number.isInteger(quantity) && name) {
      return { quantity, name };
    }
  }

  return null;
}

function cleanupCardName(name) {
  return name
    .replace(/\s+#.*$/, "")
    .replace(/\s+\/\/.*$/, "")
    .trim();
}

function combineDuplicates(cards) {
  const byName = new Map();

  cards.forEach((card) => {
    const key = card.name.toLocaleLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.quantity += card.quantity;
      return;
    }

    byName.set(key, {
      name: card.name,
      quantity: card.quantity
    });
  });

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function expandDeck(cards) {
  return cards.flatMap((card) =>
    Array.from({ length: card.quantity }, (_, index) => ({
      name: card.name,
      copy: index + 1
    }))
  );
}

function shuffle(cards, rng) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function randomIndex(maxExclusive, rng) {
  return Math.floor(rng() * maxExclusive);
}
