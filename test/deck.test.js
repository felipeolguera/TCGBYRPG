import assert from "node:assert/strict";
import test from "node:test";

import { drawStartingHand, formatCardQuantity, groupCards, parseDecklist } from "../src/deck.js";

const SILVIE_DECKLIST = `# Main Deck
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
1 Assassin's Ripper
1 Bauble of Abundance
1 Blinding Orb
1 Curved Dagger
1 Poisoned Coating Oil
1 Poisoned Dagger
1 Smoke Bombs
1 Tariff Ring
1 Windwalker Boots`;

test("parses Silvie main deck exports and ignores material deck cards", () => {
  const parsed = parseDecklist(SILVIE_DECKLIST);

  assert.equal(parsed.sawMainSection, true);
  assert.equal(parsed.totalCards, 60);
  assert.equal(parsed.cards.length, 17);
  assert.equal(parsed.cards.find((card) => card.name === "Sable Remnant").quantity, 4);
  assert.equal(parsed.cards.some((card) => card.name === "Spirit of Wind"), false);
});

test("supports common quantity formats and combines duplicate card names", () => {
  const parsed = parseDecklist(`# Main Deck
4x Sable Remnant
Sable Remnant x3
Dream Fairy (2)
1 Dream Fairy`);

  assert.deepEqual(parsed.cards, [
    { name: "Dream Fairy", quantity: 3 },
    { name: "Sable Remnant", quantity: 7 }
  ]);
  assert.equal(parsed.totalCards, 10);
});

test("uses sectionless card lines when no main deck section is present", () => {
  const parsed = parseDecklist(`4 Planted Explosive
3 Esteemed Knight

# Material Deck
1 Lorraine, Blademaster`);

  assert.equal(parsed.totalCards, 7);
  assert.equal(parsed.cards.some((card) => card.name === "Lorraine, Blademaster"), false);
});

test("draws the requested number of cards from the parsed deck", () => {
  const parsed = parseDecklist(SILVIE_DECKLIST);
  const hand = drawStartingHand(parsed.cards, 6, () => 0.42);

  assert.equal(hand.length, 6);
  assert.ok(hand.every((card) => parsed.cards.some((deckCard) => deckCard.name === card.name)));
});

test("rejects unsupported hand sizes and too-small decks", () => {
  const parsed = parseDecklist("4 Sable Remnant");

  assert.throws(() => drawStartingHand(parsed.cards, 5), /Hand size must be 6 or 7/);
  assert.throws(() => drawStartingHand(parsed.cards, 6), /at least 6 cards/);
});

test("groups and formats hand cards for display", () => {
  const grouped = groupCards([
    { name: "Zephyr" },
    { name: "Zephyr" },
    { name: "Dream Fairy" }
  ]);

  assert.deepEqual(grouped, [
    { name: "Dream Fairy", quantity: 1 },
    { name: "Zephyr", quantity: 2 }
  ]);
  assert.equal(formatCardQuantity(grouped[1]), "2 Zephyr");
});
