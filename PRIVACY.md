# Privacy Policy — Margin

**Effective:** 2026-04-18
**Extension:** Margin (Chrome Web Store)
**Contact:** vedu.mallela@gmail.com

## TL;DR

Margin does **not** collect, transmit, or sell any of your data. Everything you do in Margin stays on your computer.

## What Margin Stores Locally

All data is stored on your device using the Chrome extension storage APIs (`chrome.storage.local` and IndexedDB). Nothing is ever sent to a server.

The extension stores:

- **Your library** — titles, authors, covers, shelves, and the raw PDF bytes of books you've added
- **Your highlights** — text you've selected, notes you've attached, colors
- **Your flashcards** — fronts, backs, and spaced-repetition scheduling data (SM-2 state)
- **Your reading positions** — the last page/scroll offset of each book
- **Your settings** — theme, font, column width, custom highlight colors

## What Margin Does Not Do

- ❌ No analytics, telemetry, or tracking
- ❌ No third-party services, scripts, or fonts loaded from external origins — all fonts are bundled locally
- ❌ No accounts, sign-in, or cloud sync
- ❌ No selling, sharing, or transfer of data to third parties
- ❌ No advertisements

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `storage` | Saves your library, highlights, and settings locally |
| `declarativeNetRequest` | Intercepts `.pdf` URLs in the browser and opens them in the Margin reader instead of Chrome's built-in viewer |
| `contextMenus` | Adds "Open in Margin" to the right-click menu on PDF links |
| `tabs` | Opens the reader tab when you click a PDF link or activate the extension |
| `host_permissions: <all_urls>` | Required to detect PDF URLs on any website so they can be redirected to the reader |

## Data Deletion

Uninstall Margin from `chrome://extensions` to remove all locally stored data. You can also delete individual books, highlights, or cards from inside the extension at any time.

## Changes to This Policy

If this policy changes, a new version will be published in the extension's Chrome Web Store listing with a new effective date.
