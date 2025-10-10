# Dev Paywall Tester (AntiPageblock)

> NOTICE: This project is provided for educational research purposes and is intended for developers testing and debugging site behavior. It is not intended for evading paywalls on third-party content or for unlawful use. Use responsibly and only on sites you control or have permission to test.

Testing only Chrome extension to test removing paywall-like overlays and restore page scrolling/visibility.

## How it works 

- The extension installs an always-active content script (`content_script.js`) via the manifest.
- The popup sends a message to the content script to "run" the paywall-removal logic.
- The content script applies several strategies to remove or hide overlays:
	- Remove overlay/modals/paywall elements (selectors like `paywall`, `overlay`, `darkwall`, `gateway`, `gateway-content`).
	- Remove or unset `overflow:hidden` inline styles and CSS rules.
	- Unset `position: fixed` and convert fixed elements to a CSS class that forces static positioning.
- The content script is defensive: it avoids removing anything that looks like the main article or rich content.
- A MutationObserver + SPA detection (history push/replace/popstate) keeps re-running the fixes if the page replaces DOM or re-inserts overlays.

## Files changed / important scripts

- `manifest.json` — always-active content script entry and permissions.
- `popup.html` / `popup.js` — popup UI that triggers the content script run; it sends a message to the content script and shows status.
- `content_script.js` — the worker that applies the fixes. Its key functions are:
	- `removeParentOfMatches()` — finds paywall-like nodes and removes or hides them safely.
	- `isLikelyPaywall(el)` — heuristic to decide whether a matched node is probably a paywall overlay or real content.
	- `isArticleLike(el)` — conservative whitelist to avoid touching article containers.
	- MutationObserver + history wrappers — ensures the script re-applies fixes on SPA navigations and DOM changes.

## Safety heuristics 

The extension tries to avoid breaking real content. Key safeguards:

- Article whitelist: any element whose id/class contains the substring `article` or obvious article patterns (e.g., `ArticleWrapper`, `article-body`, `main-content`) is never removed.
- Content allowlist: elements with classes like `fc-card`, `fc-show`, `card`, `content`, `figure`, etc., are treated as content and not removed even if their class contains `paywall`.
- Structural checks: elements with lots of text (>200 chars) or many descendants (>40) are considered content.
- Size checks: elements that cover >85% of the viewport are not removed; they're hidden instead to avoid destroying the page.
- Descendant check: we avoid removing an ancestor that contains an article element or descendants with `article` in class/id.

These heuristics reduce false positives but are intentionally conservative. You can add site-specific exceptions if needed.

## Targeted patterns

The script targets common overlay/paywall patterns including:
- class/id tokens: `paywall`, `darkwall`, `overlay`, `modal`, `gateway`, `gateway-content`.
- attributes: `[data-paywall]`, `[data-overlay]`, `[data-testid="gateway-content"]`.
- linear-gradient backgrounds that include both white and black (a common dim backdrop).

## How to test 

1. Open `chrome://extensions` and enable Developer mode.
2. Click "Load unpacked" and choose the `AntiPageblock` folder (or hit Reload if already loaded).
3. Open a target page (e.g., news article with a paywall).
4. Open DevTools → Console and Sources → Content Scripts to confirm `content_script.js` is present.
5. Click the extension icon and press the Run button.
6. Look for console messages:
	 - `Dev Paywall Tester: content script loaded` — content script was injected.
	 - `Dev Paywall Tester: re-ran fixes (debounced)` — the script re-applied fixes after DOM changes.
7. Inspect the DOM for any elements with `data-dev-paywall-hidden="true"` (these were hidden) or `data-dev-paywall-skip` (these were skipped by heuristics).

## Troubleshooting

- "Could not establish connection. Receiving end does not exist." — This means the popup tried to message the content script before it was ready. The popup has a fallback injection and retry logic; reload the page and try again. If it persists, check DevTools → Sources → Content Scripts.
- Content disappears unexpectedly — If the article disappears, check for `data-dev-paywall-skip` values (e.g., `contains-article` or `likely-content`) in the inspector to see why a node was skipped. If something is wrongly removed, paste the affected node's outerHTML or class/id and I'll adjust heuristics.
- Injection blocked by CSP — Some sites or pages (chrome://, file://, certain CSP headers) prevent injection; the popup's fallback injection may fail in those cases.

## Customization

- You can edit the `paywallSelectors` array in `content_script.js` to add or remove patterns.
- Update `isLikelyPaywall` or its allowlist to tune false positives for your site.
- Console logging: the script currently logs key events; I can add per-run counts (removed/hidden/skipped) on request.

## Implementation notes

- The script is intentionally conservative and heuristic-driven — it isn't perfect but minimizes site breakage.
- If you want automatic aggressive removal, we can add a popup toggle for "aggressive mode" which bypasses some heuristics.

