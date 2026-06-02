# First Hand TCG

A small web app for Grand Archive TCG players to generate a random 6- or 7-card
starting hand from a pasted Silvie decklist.

## Use

Open `index.html` in a browser, paste a decklist exported from
<https://build-v2.silvie.org/>, choose a 6- or 7-card hand, and click
**Generate hand**.

The parser supports Silvie-style sections:

```text
# Main Deck
4 Sable Remnant
3 Dream Fairy

# Material Deck
1 Spirit of Wind
```

Only the Main Deck is used for random hands. Material deck and sideboard sections
are ignored.

## Development

Run the automated tests with:

```sh
npm test
```
