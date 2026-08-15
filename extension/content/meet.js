/**
 * Google Meet caption observer.
 * Finds the captions region, parses speaker/text rows structurally,
 * and sends snapshot messages to the background service worker.
 */

(() => {
  const SOURCE = "vtc-meet-capture";
  const POLL_MS = 1000;

  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {Element | null} */
  let observedRegion = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null;
  let capturing = false;
  let lastSnapshotKey = "";

  const CAPTION_ARIA =
    /^(captions|sous-titres|untertitel|leyendas|字幕)$/i;
  const CAPTION_ARIA_LOOSE =
    /caption|sous-titre|untertitel|leyenda|字幕/i;

  function send(type, extra = {}) {
    try {
      chrome.runtime.sendMessage({ source: SOURCE, type, ...extra });
    } catch {
      // extension context invalidated
    }
  }

  function findCaptionRegion() {
    const labelled = document.querySelectorAll(
      '[role="region"][aria-label], [aria-label]',
    );
    for (const el of labelled) {
      const lbl = (el.getAttribute("aria-label") || "").trim();
      if (CAPTION_ARIA.test(lbl)) return el;
    }
    for (const el of labelled) {
      const lbl = (el.getAttribute("aria-label") || "").trim();
      if (CAPTION_ARIA_LOOSE.test(lbl)) return el;
    }

    const live = document.querySelectorAll('[aria-live="polite"]');
    for (const el of live) {
      if (scoreCaptionRegion(el) > 0) return el;
    }

    const byJsname =
      document.querySelector('[jsname="tgaKEf"]') ||
      document.querySelector(".iOzk7");
    if (byJsname) return byJsname;

    return null;
  }

  function scoreCaptionRegion(el) {
    if (!(el instanceof HTMLElement)) return 0;
    const text = (el.innerText || "").trim();
    if (!text) return 0;
    if (el.querySelector('img[src*="googleusercontent"]')) return 3;
    if (text.split("\n").filter(Boolean).length >= 1) return 1;
    return 0;
  }

  /**
   * Structural row parse: prefer avatar-anchored rows, else split lines.
   * @returns {{ speaker: string, text: string }[]}
   */
  function parseRows(region) {
    if (!(region instanceof HTMLElement)) return [];

    const avatarRows = [];
    const imgs = region.querySelectorAll(
      'img[src*="googleusercontent"], img[data-iml]',
    );
    for (const img of imgs) {
      const row = img.closest("div")?.parentElement ?? img.parentElement;
      if (!row || !(row instanceof HTMLElement)) continue;
      const spans = [...row.querySelectorAll("span, div")].filter(
        (n) =>
          n instanceof HTMLElement &&
          !n.querySelector("img") &&
          (n.innerText || "").trim(),
      );
      if (spans.length === 0) continue;
      const texts = spans
        .map((n) => (n.innerText || "").trim())
        .filter(Boolean);
      // Prefer short first label as speaker, last as caption.
      let speaker = "";
      let text = "";
      if (texts.length === 1) {
        text = texts[0];
      } else {
        speaker = texts[0];
        text = texts[texts.length - 1];
        if (speaker === text && texts.length > 2) {
          text = texts.slice(1).join(" ");
        }
      }
      if (!text || text.toLowerCase() === speaker.toLowerCase()) continue;
      avatarRows.push({ speaker, text });
    }
    if (avatarRows.length) return dedupeAdjacent(avatarRows);

    // Fallback: known row containers / line split
    const knownRows = region.querySelectorAll(
      'div[jsname="dsyhDe"], div.CNusmb, div.TBMuR',
    );
    if (knownRows.length) {
      const rows = [];
      for (const row of knownRows) {
        if (!(row instanceof HTMLElement)) continue;
        const spkEl = row.querySelector(
          'div.KcIKyf, div.zs7s8d, span[jsname="YSxPC"]',
        );
        const txtEl = row.querySelector(
          'div.bh44bd, span[jsname="tgaKEf"], div.iTTPOb',
        );
        const speaker = (spkEl?.innerText || "").trim();
        const text = (txtEl?.innerText || row.innerText || "").trim();
        if (!text) continue;
        rows.push({ speaker, text });
      }
      if (rows.length) return dedupeAdjacent(rows);
    }

    const lines = (region.innerText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    // Heuristic: alternating speaker / text when even count
    if (lines.length >= 2 && lines.length % 2 === 0) {
      const rows = [];
      for (let i = 0; i < lines.length; i += 2) {
        rows.push({ speaker: lines[i], text: lines[i + 1] });
      }
      return dedupeAdjacent(rows);
    }
    return [{ speaker: "", text: lines[lines.length - 1] }];
  }

  function dedupeAdjacent(rows) {
    const out = [];
    for (const row of rows) {
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.speaker === row.speaker &&
        (row.text.startsWith(prev.text) || prev.text.startsWith(row.text))
      ) {
        // Keep the longer interim text for same speaker
        if (row.text.length >= prev.text.length) out[out.length - 1] = row;
        continue;
      }
      out.push(row);
    }
    return out;
  }

  function tryEnableCaptions() {
    const buttons = document.querySelectorAll(
      'button, [role="button"], div[role="button"]',
    );
    for (const btn of buttons) {
      if (!(btn instanceof HTMLElement)) continue;
      const label = (
        btn.getAttribute("aria-label") ||
        btn.getAttribute("data-tooltip-text") ||
        btn.innerText ||
        ""
      ).toLowerCase();
      if (
        /turn on captions|show captions|captions|closed captions|cc\b/.test(
          label,
        ) &&
        !/turn off|hide captions/.test(label)
      ) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function emitSnapshot(region) {
    const captionsOn = Boolean(region);
    const rows = region ? parseRows(region) : [];
    const key = JSON.stringify(rows);
    if (key === lastSnapshotKey && captionsOn === Boolean(observedRegion)) {
      // Still notify status periodically via poll path
      return;
    }
    lastSnapshotKey = key;
    send("snapshot", {
      rows,
      captionsOn,
      at: Date.now(),
    });
    send("meet-status", {
      captionsOn,
      capturing,
      error: captionsOn
        ? null
        : "Turn on captions (CC) in Google Meet",
    });
  }

  function attachObserver(region) {
    if (observedRegion === region && observer) return;
    detachObserver();
    observedRegion = region;
    observer = new MutationObserver(() => {
      if (!capturing) return;
      emitSnapshot(region);
    });
    observer.observe(region, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    emitSnapshot(region);
  }

  function detachObserver() {
    observer?.disconnect();
    observer = null;
    observedRegion = null;
  }

  function tick() {
    if (!capturing) return;
    const region = findCaptionRegion();
    if (region) {
      attachObserver(region);
      emitSnapshot(region);
    } else {
      detachObserver();
      lastSnapshotKey = "";
      send("meet-status", {
        captionsOn: false,
        capturing,
        error: "Turn on captions (CC) in Google Meet",
      });
      send("snapshot", { rows: [], captionsOn: false, at: Date.now() });
    }
  }

  function startCapture() {
    capturing = true;
    lastSnapshotKey = "";
    send("meet-status", { captionsOn: false, capturing: true, error: null });
    if (!findCaptionRegion()) {
      tryEnableCaptions();
    }
    tick();
    if (!pollTimer) {
      pollTimer = setInterval(tick, POLL_MS);
    }
  }

  function stopCapture() {
    capturing = false;
    detachObserver();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    lastSnapshotKey = "";
    send("meet-status", {
      captionsOn: Boolean(findCaptionRegion()),
      capturing: false,
      error: null,
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== SOURCE) return;
    if (message.type === "start") {
      startCapture();
      sendResponse({ source: SOURCE, type: "ack" });
    } else if (message.type === "stop") {
      stopCapture();
      sendResponse({ source: SOURCE, type: "ack" });
    } else if (message.type === "hello" || message.type === "get-status") {
      sendResponse({
        source: SOURCE,
        type: "status",
        captionsOn: Boolean(findCaptionRegion()),
        capturing,
      });
    }
  });

  send("register-meet", {
    captionsOn: Boolean(findCaptionRegion()),
  });
})();
