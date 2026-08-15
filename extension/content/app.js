/**
 * Bridge: extension background ↔ Voice to Code page via window.postMessage.
 * Only accepts page messages with source "vtc-meet-capture".
 */

(() => {
  const SOURCE = "vtc-meet-capture";

  function toPage(payload) {
    window.postMessage({ source: SOURCE, ...payload }, window.location.origin);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.source !== SOURCE) return;
    // Relay status / snapshot / hello / ack to the page
    if (
      message.type === "status" ||
      message.type === "snapshot" ||
      message.type === "hello" ||
      message.type === "ack"
    ) {
      toPage(message);
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    // Page → extension (start / stop / hello / get-status)
    if (
      data.type === "start" ||
      data.type === "stop" ||
      data.type === "hello" ||
      data.type === "get-status"
    ) {
      chrome.runtime.sendMessage(
        { source: SOURCE, type: data.type },
        (response) => {
          if (chrome.runtime.lastError) {
            toPage({
              type: "status",
              meetTabFound: false,
              appTabFound: false,
              capturing: false,
              captionsOn: false,
              lastError:
                "Load the unpacked extension from extension/",
            });
            return;
          }
          if (response) toPage(response);
        },
      );
    }
  });

  chrome.runtime.sendMessage({ source: SOURCE, type: "register-app" }, () => {
    void chrome.runtime.lastError;
  });

  // Announce presence so a page already open can handshake quickly
  toPage({
    type: "hello",
    meetTabFound: false,
    appTabFound: true,
    capturing: false,
    captionsOn: false,
  });
})();
