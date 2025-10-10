// Background service worker: manage per-tab enabled state and badge

const DEFAULT_TAB_ENABLED = false;

const ENABLED_TABS_KEY = "enabledTabs";

function setBadgeForTab(tabId, enabled) {
  try {
    chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "OFF" });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: enabled ? "#4caf50" : "#d32f2f",
    });
  } catch (e) {}
}

async function getEnabledTabs() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [ENABLED_TABS_KEY]: {} }, (items) => {
      resolve(items[ENABLED_TABS_KEY] || {});
    });
  });
}

async function setEnabledForTab(tabId, enabled) {
  const map = await getEnabledTabs();
  map[tabId] = !!enabled;
  await new Promise((resolve) =>
    chrome.storage.local.set({ [ENABLED_TABS_KEY]: map }, resolve)
  );
  setBadgeForTab(tabId, !!enabled);
  // notify only that tab
  try {
    chrome.tabs.sendMessage(
      tabId,
      { type: "ANTI_PAGEBLOCK_TOGGLE", enabled },
      () => {}
    );
  } catch (e) {}
}

async function removeTabFromMap(tabId) {
  const map = await getEnabledTabs();
  if (map.hasOwnProperty(tabId)) {
    delete map[tabId];
    await new Promise((resolve) =>
      chrome.storage.local.set({ [ENABLED_TABS_KEY]: map }, resolve)
    );
  }
}

// Respond to runtime messages for getting/setting per-tab enabled state
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "GET_TAB_ENABLED") {
    // allow callers to pass tabId (popup), otherwise use sender.tab if available
    const requestedTabId = msg.tabId;
    const senderTabId = sender.tab && sender.tab.id;
    if (requestedTabId !== undefined && requestedTabId !== null) {
      getEnabledTabs().then((map) => {
        const enabled = !!map[requestedTabId];
        if (reply) reply({ enabled });
      });
      return true;
    }
    if (senderTabId) {
      getEnabledTabs().then((map) => {
        const enabled = !!map[senderTabId];
        if (reply) reply({ enabled });
      });
      return true;
    }
    // fallback: query the active tab in the current window (popup callers)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const tabId = tab && tab.id;
      if (!tabId) {
        if (reply) reply({ enabled: DEFAULT_TAB_ENABLED });
        return;
      }
      getEnabledTabs().then((map) => {
        const enabled = !!map[tabId];
        if (reply) reply({ enabled });
      });
    });
    return true; // will reply asynchronously
  }
  if (msg.type === "SET_TAB_ENABLED") {
    const tabId = msg.tabId;
    setEnabledForTab(tabId, !!msg.enabled);
  }
});

// Update badge when a tab becomes active or updated
chrome.tabs.onActivated.addListener(async (info) => {
  const map = await getEnabledTabs();
  const enabled = !!map[info.tabId];
  setBadgeForTab(info.tabId, enabled);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // when a tab's URL or status changes, ensure badge matches stored state
  if (changeInfo.status === "complete" || changeInfo.url) {
    const map = await getEnabledTabs();
    const enabled = !!map[tabId];
    setBadgeForTab(tabId, enabled);
    // notify tab of current state
    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: "ANTI_PAGEBLOCK_TOGGLE", enabled },
        () => {}
      );
    } catch (e) {}
  }
});

// Clean up map when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabFromMap(tabId);
});
