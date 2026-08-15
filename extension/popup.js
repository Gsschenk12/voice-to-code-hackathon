const SOURCE = "vtc-meet-capture";

function setBadge(id, ok, labelOk, labelBad) {
  const el = document.getElementById(id);
  if (!el) return;
  const good = Boolean(ok);
  el.textContent = good ? labelOk : labelBad;
  el.className = `badge ${good ? "ok" : "warn"}`;
}

function refresh() {
  chrome.runtime.sendMessage(
    { source: SOURCE, type: "get-status" },
    (response) => {
      if (chrome.runtime.lastError || !response) {
        setBadge("meet", false, "Found", "Missing");
        setBadge("captions", false, "On", "Off");
        setBadge("app", false, "Found", "Missing");
        setBadge("capturing", false, "Yes", "No");
        const err = document.getElementById("error");
        if (err) {
          err.hidden = false;
          err.textContent = "Extension background unavailable — reload the extension.";
        }
        return;
      }
      setBadge("meet", response.meetTabFound, "Found", "Missing");
      setBadge("captions", response.captionsOn, "On", "Off");
      setBadge("app", response.appTabFound, "Found", "Missing");
      setBadge("capturing", response.capturing, "Yes", "No");
      const err = document.getElementById("error");
      if (err) {
        if (response.lastError) {
          err.hidden = false;
          err.textContent = response.lastError;
        } else {
          err.hidden = true;
          err.textContent = "";
        }
      }
    },
  );
}

refresh();
setInterval(refresh, 1500);
