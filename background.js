// Background service worker: manage enabled state and badge, broadcast toggle to tabs

const DEFAULT_ENABLED = false;

function setBadge(enabled) {
  try {
    if (enabled) {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
    } else {
      chrome.action.setBadgeText({ text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: DEFAULT_ENABLED }, (items) => {
    if (items.enabled === undefined) {
      chrome.storage.local.set({ enabled: DEFAULT_ENABLED });
      setBadge(DEFAULT_ENABLED);
    } else {
      setBadge(!!items.enabled);
    }
  });
});

// Ensure badge reflects current state when the service worker starts
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get({ enabled: DEFAULT_ENABLED }, (items) =>
      setBadge(!!items.enabled)
    );
  });
}

// React to changes in storage: update badge and broadcast toggle to all tabs
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled) {
    const enabled = !!changes.enabled.newValue;
    setBadge(enabled);
    // notify all tabs so content scripts can enable/disable immediately
    try {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab && tab.id) {
            chrome.tabs.sendMessage(
              tab.id,
              { type: "ANTI_PAGEBLOCK_TOGGLE", enabled },
              () => {
                // ignore individual send errors
              }
            );
          }
        }
      });
    } catch (e) {}
  }
});
