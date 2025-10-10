const paywallSelectors = [
  '[class*="paywall"]',
  '[id*="paywall"]',
  '[class*="gateway"]',
  '[id*="gateway"]',
  '[id="gateway-content"]',
  '[data-testid="gateway-content"]',
  '[class*="darkwall"]',
  '[id*="darkwall"]',
  '[class*="overlay"]',
  '[class*="modal"]',
  '[id*="overlay"]',
  '[role="dialog"]',
  "[data-paywall]",
  "[data-overlay]",
];

function removeParentOfMatches() {
  // Safer removal: for each matched element, try to remove a nearby overlay/modal
  // ancestor (if reasonable). Never remove documentElement or body, and avoid
  // removing very large elements that likely contain the whole page. If removal
  // would be unsafe or throws, hide the element instead.
  const matched = [];
  paywallSelectors.forEach((s) => {
    document.querySelectorAll(s).forEach((el) => {
      if (el) matched.push(el);
    });
  });

  const isTooLarge = (el) => {
    try {
      const r = el.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return false;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const area = r.width * r.height;
      const varea = vw * vh;
      // If an element covers more than 85% of viewport, treat as too large.
      return area > varea * 0.85;
    } catch (e) {
      return false;
    }
  };

  const findOverlayAncestor = (el) => {
    let ancestor = el;
    let depth = 0;
    while (
      ancestor &&
      ancestor !== document.documentElement &&
      ancestor !== document.body &&
      depth < 8
    ) {
      try {
        const id = (ancestor.id || "").toLowerCase();
        const cls = (ancestor.className || "").toString().toLowerCase();
        const role =
          (ancestor.getAttribute && ancestor.getAttribute("role")) || "";
        if (
          id.includes("overlay") ||
          id.includes("paywall") ||
          id.includes("gateway") ||
          id === "gateway-content" ||
          id.includes("modal") ||
          id.includes("darkwall") ||
          cls.includes("overlay") ||
          cls.includes("paywall") ||
          cls.includes("gateway") ||
          cls.includes("gateway-content") ||
          cls.includes("modal") ||
          cls.includes("darkwall") ||
          role === "dialog"
        ) {
          return ancestor;
        }
      } catch (e) {}
      ancestor = ancestor.parentElement;
      depth++;
    }
    return null;
  };

  // Avoid removing or hiding elements that look like the main article container.
  const isArticleLike = (el) => {
    if (!el) return false;
    try {
      const id = (el.id || "").toString().toLowerCase();
      const cls = (el.className || "").toString().toLowerCase();
      // If the id or class contains the substring 'article', treat as article-like
      if (id.includes("article") || cls.includes("article")) return true;
      // Common patterns fallback (redundant but kept for safety)
      const pats = [
        "articlewrapper",
        "article-wrapper",
        "article__",
        "article-body",
        "articlebody",
        "article-",
        " article",
        "post-",
        "post__",
        "main-content",
        "main-article",
        "content-article",
        "articlewrapper",
      ];
      for (let p of pats) {
        if (id.includes(p) || cls.includes(p)) return true;
      }
      // also check tag name
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "article") return true;
    } catch (e) {}
    return false;
  };

  const safeRemoveOrHide = (el) => {
    if (!el) return;
    try {
      // If this node contains an article-like descendant, skip removal/hiding
      try {
        if (
          el.querySelector &&
          (el.querySelector("article") ||
            el.querySelector('[id*="article"], [class*="article"]'))
        ) {
          el.setAttribute("data-dev-paywall-skip", "contains-article");
          return;
        }
      } catch (q) {}
      // Never remove root elements
      if (el === document.documentElement || el === document.body) {
        el.style.setProperty("display", "none", "important");
        el.setAttribute("data-dev-paywall-hidden", "true");
        return;
      }
      if (isTooLarge(el)) {
        // Avoid removing giant nodes; hide them instead so layout remains usable.
        el.style.setProperty("display", "none", "important");
        el.setAttribute("data-dev-paywall-hidden", "true");
        return;
      }
      el.remove();
    } catch (e) {
      try {
        el.style.setProperty("display", "none", "important");
        el.setAttribute("data-dev-paywall-hidden", "true");
      } catch (ee) {}
    }
  };

  // Heuristic: make sure the matched element is actually a paywall overlay and
  // not a content card that happens to include the string 'paywall' in a class.
  const isLikelyPaywall = (el) => {
    if (!el) return false;
    try {
      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toString().toLowerCase();
      // Allowlist patterns: if the element contains these, treat as content
      const allow = [
        "fc-card",
        "fc-show",
        "article-card",
        "card",
        "content",
        "figure",
        "caption",
        "headline",
      ];
      for (let a of allow) if (cls.includes(a) || id.includes(a)) return false;

      // If the element explicitly contains 'gateway' in class or id, or is gateway-content, treat as paywall-like
      if (
        cls.includes("gateway") ||
        id.includes("gateway") ||
        id === "gateway-content" ||
        (el.getAttribute &&
          el.getAttribute("data-testid") === "gateway-content")
      )
        return true;

      // Detect linear-gradient backgrounds that go from white to black (common dim/backdrop)
      const isWhiteToBlackGradient = (node) => {
        try {
          const cs = getComputedStyle(node);
          const bg = (cs && (cs.backgroundImage || cs.background)) || "";
          const s = bg.toString().toLowerCase();
          if (!s.includes("linear-gradient")) return false;
          const hasWhite =
            s.includes("255,255,255") ||
            s.includes("255, 255, 255") ||
            s.includes("white") ||
            s.includes("#fff") ||
            s.includes("#ffffff") ||
            s.includes("rgba(255,255,255") ||
            s.includes("rgba(255, 255, 255");
          const hasBlack =
            s.includes("0,0,0") ||
            s.includes("0, 0, 0") ||
            s.includes("black") ||
            s.includes("#000") ||
            s.includes("#000000") ||
            s.includes("rgba(0,0,0") ||
            s.includes("rgba(0, 0, 0");
          return hasWhite && hasBlack;
        } catch (e) {
          return false;
        }
      };

      if (isWhiteToBlackGradient(el)) return true;

      // If element has a lot of text content, it's likely real content, not a paywall overlay
      const text = (el.innerText || "").trim();
      if (text.length > 200) return false;

      // If element has many child nodes (complex content), treat as content
      if (el.querySelectorAll && el.querySelectorAll("*").length > 40)
        return false;

      // Otherwise, treat as likely an overlay/paywall
      return true;
    } catch (e) {
      return true;
    }
  };

  // Process each matched element independently.
  matched.forEach((el) => {
    try {
      // Skip if the matched element looks like the article/main content.
      if (isArticleLike(el)) return;

      // Prefer to remove a nearby overlay/modal ancestor if one exists and is safe.
      const overlay = findOverlayAncestor(el);
      // detect if overlay contains the article; if so, don't remove it
      let overlayContainsArticle = false;
      try {
        if (
          overlay &&
          overlay.querySelector &&
          (overlay.querySelector("article") ||
            overlay.querySelector('[id*="article"], [class*="article"]'))
        ) {
          overlayContainsArticle = true;
        }
      } catch (q) {}
      if (
        overlay &&
        !isArticleLike(overlay) &&
        !overlayContainsArticle &&
        overlay !== document.documentElement &&
        overlay !== document.body &&
        !isTooLarge(overlay) &&
        isLikelyPaywall(overlay)
      ) {
        safeRemoveOrHide(overlay);
      } else {
        // If overlay ancestor is unsafe or not found, consider removing the matched element.
        // Only remove if the element itself looks like a paywall; otherwise mark it skipped.
        if (isLikelyPaywall(el)) {
          safeRemoveOrHide(el);
        } else {
          try {
            el.setAttribute("data-dev-paywall-skip", "likely-content");
          } catch (e) {}
        }
      }
    } catch (e) {
      try {
        el.style.setProperty("display", "none", "important");
        el.setAttribute("data-dev-paywall-hidden", "true");
      } catch (ee) {}
    }
  });
}

function replaceInlineOverflowHidden() {
  document.querySelectorAll("[style]").forEach((el) => {
    const s = el.getAttribute("style");
    if (!s) return;
    if (s.includes("overflow:hidden") || s.includes("overflow: hidden")) {
      const newS = s.replace(/overflow\s*:\s*hidden\s*;?/gi, "");
      el.setAttribute("style", newS);
      el.style.overflow = "";
      el.style.overflowX = "";
      el.style.overflowY = "";
    }
  });
}

function unsetFixedPositions() {
  document.querySelectorAll("*").forEach((el) => {
    try {
      const cs = getComputedStyle(el);
      if (cs && cs.position === "fixed") {
        el.style.position = "";
        if (el.style.getPropertyValue("position") === "fixed") {
          el.style.setProperty("position", "static", "important");
        }
      }
    } catch (e) {}
  });
}

function fixAccessibleStylesheets() {
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) {
        const r = rules[j];
        if (r.style) {
          if (r.style.overflow && r.style.overflow.toLowerCase() === "hidden") {
            r.style.overflow = "";
          }
          if (
            r.style.getPropertyValue("overflow") &&
            r.cssText &&
            r.cssText.toLowerCase().includes("overflow:hidden")
          ) {
            r.style.removeProperty("overflow");
          }
          if (r.style.position && r.style.position.toLowerCase() === "fixed") {
            r.style.position = "";
          }
        } else if (
          r.cssText &&
          r.cssText.toLowerCase().includes("overflow:hidden")
        ) {
          try {
            const selector = r.selectorText;
            if (selector) {
              const replacement = `${selector}{}`;
              sheet.insertRule(replacement, sheet.cssRules.length);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

function injectOverrideStyle() {
  if (document.getElementById("dev-paywall-tester-override")) return;
  const s = document.createElement("style");
  s.id = "dev-paywall-tester-override";
  s.innerText = `
    * { overflow: visible !important; }
    .dev-paywall-test-fixed { position: static !important; }
  `;
  document.documentElement.appendChild(s);
}

function convertFixedToClass() {
  document.querySelectorAll("*").forEach((el) => {
    try {
      const cs = getComputedStyle(el);
      if (cs && cs.position === "fixed") {
        el.classList.add("dev-paywall-test-fixed");
      }
    } catch (e) {}
  });
}

let antiPageblockEnabled = false;

function runAll() {
  if (!antiPageblockEnabled) return;
  removeParentOfMatches();
  replaceInlineOverflowHidden();
  unsetFixedPositions();
  fixAccessibleStylesheets();
  injectOverrideStyle();
  convertFixedToClass();
  replaceInlineOverflowHidden();
  unsetFixedPositions();
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "run-paywall-fix") {
    runAll();
    reply({ status: "done" });
    return;
  }
  if (msg.type === "ANTI_PAGEBLOCK_TOGGLE") {
    antiPageblockEnabled = !!msg.enabled;
    if (antiPageblockEnabled) {
      // run once immediately when enabled
      try {
        runAll();
      } catch (e) {}
      // ensure observer is attached
      try {
        attachObserver();
      } catch (e) {}
    }
  }
});

// Log when the content script is loaded so the popup can confirm injection.
try {
  console.log("Dev Paywall Tester: content script loaded");
} catch (e) {}

// Re-run when SPA navigation or other scripts replace large parts of the DOM.
// Use a debounced MutationObserver and a periodic fallback re-run/reattach so
// the script stays resilient if the page replaces the document root.
let debounceTimer = null;
let lastRun = 0;
const debouncedRunAll = () => {
  const now = Date.now();
  // throttle to at most once per 1500ms
  if (now - lastRun < 1500) return;
  lastRun = now;
  try {
    runAll();
    console.log("Dev Paywall Tester: re-ran fixes (debounced)");
  } catch (e) {}
};

const observerCallback = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(debouncedRunAll, 250);
};

let observer = new MutationObserver(observerCallback);
let observedRoot = document.documentElement || document.body;

const attachObserver = () => {
  try {
    if (observer) observer.disconnect();
    observedRoot = document.documentElement || document.body;
    observer = new MutationObserver(observerCallback);
    observer.observe(observedRoot, { childList: true, subtree: true });
  } catch (e) {}
};

// Initialize enabled state from storage, then attach observer accordingly.
chrome.storage && chrome.storage.local
  ? chrome.storage.local.get({ enabled: false }, (items) => {
      antiPageblockEnabled =
        items.enabled === undefined ? false : !!items.enabled;
      if (antiPageblockEnabled) {
        try {
          runAll();
        } catch (e) {}
      }
      try {
        attachObserver();
      } catch (e) {}
    })
  : (function () {
      antiPageblockEnabled = false;
      try {
        runAll();
        attachObserver();
      } catch (e) {}
    })();

// Periodic fallback: reattach observer if the root changed and run debounced run
const reattachInterval = setInterval(() => {
  try {
    const currentRoot = document.documentElement || document.body;
    if (currentRoot !== observedRoot) attachObserver();
    // ensure we rerun periodically in case the observer was removed
    debouncedRunAll();
  } catch (e) {}
}, 2000);

// Re-run on SPA navigation events
window.addEventListener("popstate", debouncedRunAll);

// Best-effort: try to detect pushState/replaceState calls by wrapping them if possible
try {
  const _push = history.pushState;
  history.pushState = function () {
    const res = _push.apply(this, arguments);
    debouncedRunAll();
    return res;
  };
  const _replace = history.replaceState;
  history.replaceState = function () {
    const res = _replace.apply(this, arguments);
    debouncedRunAll();
    return res;
  };
} catch (e) {}
