# firsthandTCG

A small browser app for explaining Grand Archive TCG decklists.

## What it does

- Parses decklists with sections such as `# Material Deck`, `# Main Deck`, and `# Sideboard`.
- Looks up each card through the public Grand Archive API.
- Shows quantities, types, stats, rules text, and a plain-English role for each card.
- Generates a strategy summary from the deck's detected cards, champion, classes, and keywords.

## Run locally

This app has no package dependencies. Serve the folder with any static file server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

You can also open `index.html` directly in a browser, but using a local server is the most reliable option.
