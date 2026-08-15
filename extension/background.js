/**
 * Relay hub: Meet tab ↔ app tab(s).
 * Message envelope: { source: "vtc-meet-capture", type, ... }
 */

const SOURCE = "vtc-meet-capture";

/** @type {{ meetTabId: number | null, appTabIds: Set<number>, capturing: boolean, captionsOn: boolean, lastError: string | null }} */
const state = {
  meetTabId: null,
  appTabIds: new Set(),
  capturing: false,
  captionsOn: false,
  lastError: null,
};

function isAppUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      u.port === "3000"
    );
  } catch {
    return false;
  }
}

function isMeetUrl(url) {
  if (!url) return false;
  try {
    return new URL(url).hostname === "meet.google.com";
  } catch {
    return false;
  }
}

function envelope(type, extra = {}) {
  return { source: SOURCE, type, ...extra };
}

async function broadcastToApps(message) {
  const ids = [...state.appTabIds];
  for (const tabId of ids) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      state.appTabIds.delete(tabId);
    }
  }
}

async function sendToMeet(message) {
  if (state.meetTabId == null) return false;
  try {
    await chrome.tabs.sendMessage(state.meetTabId, message);
    return true;
  } catch {
    state.meetTabId = null;
    return false;
  }
}

function publicStatus() {
  return {
    meetTabFound: state.meetTabId != null,
    appTabFound: state.appTabIds.size > 0,
    capturing: state.capturing,
    captionsOn: state.captionsOn,
    lastError: state.lastError,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.source !== SOURCE) return;

  const tabId = sender.tab?.id;
  const url = sender.tab?.url;

  switch (message.type) {
    case "register-meet": {
      if (tabId != null) state.meetTabId = tabId;
      state.captionsOn = Boolean(message.captionsOn);
      state.lastError = message.error ?? null;
      void broadcastToApps(envelope("status", publicStatus()));
      sendResponse(envelope("ack", publicStatus()));
      break;
    }
    case "register-app": {
      if (tabId != null) state.appTabIds.add(tabId);
      void broadcastToApps(envelope("status", publicStatus()));
      sendResponse(envelope("ack", publicStatus()));
      break;
    }
    case "meet-status": {
      state.captionsOn = Boolean(message.captionsOn);
      state.lastError = message.error ?? null;
      if (message.capturing != null) state.capturing = Boolean(message.capturing);
      void broadcastToApps(envelope("status", publicStatus()));
      sendResponse(envelope("ack"));
      break;
    }
    case "snapshot": {
      void broadcastToApps(
        envelope("snapshot", {
          rows: message.rows ?? [],
          captionsOn: Boolean(message.captionsOn),
          at: message.at ?? Date.now(),
        }),
      );
      sendResponse(envelope("ack"));
      break;
    }
    case "start": {
      state.capturing = true;
      state.lastError = null;
      void (async () => {
        const ok = await sendToMeet(envelope("start"));
        if (!ok) {
          state.capturing = false;
          state.lastError = "Open meet.google.com in this Chrome profile";
        }
        await broadcastToApps(envelope("status", publicStatus()));
        sendResponse(envelope("ack", publicStatus()));
      })();
      return true;
    }
    case "stop": {
      state.capturing = false;
      void sendToMeet(envelope("stop"));
      void broadcastToApps(envelope("status", publicStatus()));
      sendResponse(envelope("ack", publicStatus()));
      break;
    }
    case "get-status": {
      sendResponse(envelope("status", publicStatus()));
      break;
    }
    case "hello": {
      if (url && isAppUrl(url) && tabId != null) {
        state.appTabIds.add(tabId);
      }
      if (url && isMeetUrl(url) && tabId != null) {
        state.meetTabId = tabId;
      }
      sendResponse(envelope("hello", publicStatus()));
      break;
    }
    default:
      break;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.meetTabId === tabId) {
    state.meetTabId = null;
    state.captionsOn = false;
    state.capturing = false;
    void broadcastToApps(envelope("status", publicStatus()));
  }
  state.appTabIds.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" && !changeInfo.url) return;
  const url = tab.url;
  if (isMeetUrl(url)) {
    state.meetTabId = tabId;
  } else if (state.meetTabId === tabId && !isMeetUrl(url)) {
    state.meetTabId = null;
    state.captionsOn = false;
  }
  if (isAppUrl(url)) {
    state.appTabIds.add(tabId);
  } else if (state.appTabIds.has(tabId) && !isAppUrl(url)) {
    state.appTabIds.delete(tabId);
  }
});
