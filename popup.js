const runBtn = document.getElementById("runBtn");
const status = document.getElementById("status");
const enabledToggle = document.getElementById("enabledToggle");

async function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.style.color = isError ? "#b00" : "green";
}

function sendRunMessage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "run-paywall-fix" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
}
async function trySendWithRetries(tab, maxAttempts = 5) {
  let attempt = 0;
  let lastError = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const resp = await sendRunMessage(tab.id);
      return { success: true, response: resp, attempts: attempt };
    } catch (err) {
      lastError = err;
      console.error("sendMessage error (attempt " + attempt + "):", err);
      setStatus(`sendMessage error: ${err.message || String(err)}`, true);
      if (attempt >= maxAttempts) break;
      // If sendMessage failed, try to inject the content script as a fallback
      // (some pages or timing may prevent manifest auto-injection). If injection
      // also fails, we'll retry sending the message after a short delay.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: ["content_script.js"],
        });
        console.log("Fallback injection executed");
        setStatus(
          `Injected fallback script, retrying... (attempt ${attempt + 1})`
        );
      } catch (injectErr) {
        // Injection may fail due to CSP or chrome restrictions; log and continue.
        console.warn("Fallback injection failed:", injectErr);
        setStatus(
          `inject fallback failed: ${injectErr.message || String(injectErr)}`,
          true
        );
      }

      // wait a bit before retrying sendMessage
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  return { success: false, error: lastError, attempts: attempt };
}

runBtn.addEventListener("click", async () => {
  setStatus("Running...");
  const tab = await queryActiveTab();
  if (!tab || !tab.id) {
    setStatus("No active tab", true);
    return;
  }

  try {
    // Send the run message to the already-injected content script.
    const resp = await trySendWithRetries(tab, 5);
    if (!resp.success) throw resp.error || new Error("Failed to send message");
    console.log("sendMessage response:", resp);
    setStatus("Done ✔");
    setTimeout(() => setStatus(""), 2000);
  } catch (err) {
    console.error("Run failed:", err);
    setStatus(err && err.message ? err.message : String(err), true);
  }
});

// Initialize toggle state from storage
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get({ enabled: false }, (items) => {
    const enabled = items.enabled === undefined ? false : !!items.enabled;
    enabledToggle.checked = enabled;
  });
});

enabledToggle.addEventListener("change", async () => {
  const enabled = !!enabledToggle.checked;
  // save and notify via storage change (background will broadcast)
  chrome.storage.local.set({ enabled }, () => {
    // try to also notify the active tab immediately so UX is snappy
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab && tab.id) {
          chrome.tabs.sendMessage(
            tab.id,
            { type: "ANTI_PAGEBLOCK_TOGGLE", enabled },
            () => {}
          );
          // If the user just disabled the extension, reload the active tab so DOM changes can be undone by a full reload
          if (!enabled) {
            try {
              chrome.tabs.reload(tab.id);
            } catch (e) {}
          }
        }
      });
    } catch (e) {}
  });
});
