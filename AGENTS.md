# Tab Cleaner — Chrome Extension

## Overview
Chrome Manifest V3 extension that lists all open (non-pinned) tabs in a popup, grouped by domain or by time-since-last-accessed, with one-click close for individual tabs or entire groups.

**Language:** Lithuanian UI  
**Version:** 1.0.0  
**Platform:** Chromium-based browsers (Chrome, Vivaldi, Edge, etc.)

---

## File Structure

```
tab-cleaner/
├── manifest.json          # Manifest V3 config
├── popup.html             # Popup UI structure
├── popup.js               # All popup logic — tabs query, grouping, rendering, actions
├── popup.css              # Popup styles — dark theme, green accent
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

No background service worker and no content script — the popup talks to the browser directly via the `chrome.tabs` API, which is available in popup context with the `tabs` permission.

---

## Architecture

### Data Flow

```
chrome.tabs.query({})
    │
    ▼
popup.js (groups tabs by domain, renders UI)
    │
    │  chrome.tabs.update / chrome.tabs.remove
    ▼
Browser (tab state changes)
    │
    │  chrome.tabs.onCreated/onUpdated/onRemoved/onAttached
    ▼
popup.js (auto-refresh via live listeners)
```

### Permissions
- `tabs` — required to query, update (activate), and remove tabs, and to read tab URLs/titles/favicons.

No `host_permissions`, no `storage`, no `scripting` — the extension never reads page content beyond what the `tabs` API exposes (URL, title, favIconUrl).

---

## Key Behaviors

### Grouping
Tabs can be grouped by **domain** (default) or by **time**. The active mode is
held in `currentGroupMode` (`'domain'` or `'time'`), toggled via the `▦` header
button and its options panel (`#group-options`).

#### Domain mode
- `getDomain(url)` parses the URL with `URL()` and returns `hostname`.
- Special protocols (`chrome:`, `chrome-extension:`, `about:`, `edge:`) are bucketed under the literal group name `Sistemos`.
- Unparseable URLs fall back to `Kita`.

#### Time mode
- `getTimeBucket(lastAccessed)` buckets tabs by age since `tab.lastAccessed`:
  `1h` (≤1h), `1-4h`, `4-8h`, `today`, `yesterday`, `week` (≤7 days), `older`.
- Buckets are ordered chronologically (newest first) regardless of the sort mode.
- The group header shows a 🕒 icon instead of a favicon.

Pinned tabs are filtered out on load (intentionally preserved by the user) in both modes.

### Favicons
Priority for favicon source:
1. `tab.favIconUrl` if it's a `data:` or `http(s)` URL.
2. Google's S2 favicon service: `https://www.google.com/s2/favicons?sz=16&domain=<hostname>` for http(s) pages.
3. Empty placeholder element.

Broken favicon images hide themselves via the inline `onerror` handler (allowed because CSP for popup HTML is not restricted like content scripts — popup CSP defaults permit inline event attributes; if a future stricter CSP is added, switch to `addEventListener`).

### Sorting
- `domain` (default) — alphabetical by hostname, case-insensitive, Lithuanian locale.
- `count` — by number of tabs in the group (desc), tie-broken alphabetically.
- `recent` — by the most recently accessed tab's `lastAccessed` timestamp in each group.

In **time mode**, groups are always sorted chronologically (by `TIME_BUCKET_ORDER`);
the sort selector only affects domain mode. The sort options panel is still
visible but has no effect while in time mode.

Within every group, individual tabs are always ordered by `lastAccessed` (most recent first).

### Collapse State
- `collapsedDomains` is an in-memory `Set` of group keys (domain name or time-bucket id) that are collapsed.
- Switching group mode clears the collapse state.
- The `⊟` header button toggles all groups at once (collapses if any are open, expands if all are collapsed).
- State is lost on popup close (no persistence by design — fresh view each open).

### Filtering / Search
- `#search` input filters tabs by title, URL, or domain (case-insensitive substring).
- Empty result shows the `no-results` empty state; no tabs at all shows the `empty-state`.
- Group counts in the badge reflect filtered tabs, not all tabs. The badge label adapts to the group mode (`domenų` vs `grupių`).

### Tab Actions
- Clicking a tab row activates it (`chrome.tabs.update({active:true})`) and focuses its window (`chrome.windows.update({focused:true})`), then closes the popup.
- The ✕ button on a tab row calls `chrome.tabs.remove(tabId)`.
- The ✕ button on a group header calls `chrome.tabs.remove([ids...])` for all tabs in that group (`closeGroup(key)`).
- The header ✕ "close all" button removes every non-pinned tab.
- None of these actions show a `confirm()` dialog — closes are immediate (per user request).

### Live Updates
The popup registers `chrome.tabs.onCreated`, `onUpdated`, `onRemoved`, and `onAttached` listeners that re-run `loadTabs()`. This keeps the list fresh while the popup is open. Listeners are attached on `DOMContentLoaded` and die with the popup.

---

## Important Implementation Details

### CSP
Manifest V3 popup pages run under a default CSP that allows inline scripts/styles and inline event handlers. `onerror` inline handlers on `<img>` are used for favicon fallback. Do **not** add inline scripts beyond the single `<script src="popup.js">` tag.

### XSS Safety
All user-controlled strings (tab titles, URLs, domain names) are escaped before insertion into `innerHTML` via `escapeHtml`/`escapeAttr`. This is mandatory because the UI is built with string templating rather than `createElement`.

### Extension Context
Because there is no background script and no `chrome.runtime.sendMessage` calls, there is no "Extension context invalidated" failure mode. The popup simply re-queries `chrome.tabs` each time it opens.

### Active Tab Highlight
A tab row gets the `active` class (green-tinted background) when `tab.active` is true. This is per-window active state; if multiple windows are open, multiple tabs may appear active.

---

## Styling Notes

- Dark theme (`#0f0f0f` background, `#1a1a1a` cards) matching the sibling `youtube-tabs-manager` extension.
- Accent color: green `#4ade80` (vs. YouTube red in the sibling extension).
- Popup dimensions: `420px × 600px` (max height, scrollable list).
- Close buttons on tab rows are `opacity: 0` until the row is hovered, to reduce visual noise.

---

## Installation (Development)

1. Open `chrome://extensions/` (or `vivaldi://extensions/`, `edge://extensions/`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `tab-cleaner/` directory

### After code changes
- Click the refresh icon on the extension card
- Close and reopen the popup
- No content script to reload — changes take effect on next popup open

---

## Icons
Generated programmatically with Pillow (Python): solid green rounded square with a dark X mark. Source: a one-off `python3` script (not committed). To regenerate, draw a `#4ade80` rounded rectangle and cross two dark lines through the center at sizes 16, 48, 128.

---

## Future Ideas
- Persist collapsed-domain state across popup opens (via `chrome.storage.local`).
- Tab count per domain in the extension icon badge.
- Whitelist domains that should never be bulk-closed.
- Keyboard navigation (arrow keys + Enter to close).
- Drag tabs between domains to move them (would require `chrome.tabs.move`).
- Undo last close (re-open recently closed tabs via `chrome.sessions.restore`).
