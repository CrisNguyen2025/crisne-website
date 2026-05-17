/**
 * content.js — inject vào upb.ops.vnfai.com
 * Hook vào fetch + XHR để bắt Bearer token từ request headers
 */

(function () {
  "use strict";

  // ── Hook fetch ──────────────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const [input, init] = args;
      const headers = init?.headers || (input instanceof Request ? input.headers : null);

      if (headers) {
        let authValue = null;
        if (headers instanceof Headers) {
          authValue = headers.get("authorization");
        } else if (typeof headers === "object") {
          authValue =
            headers["authorization"] ||
            headers["Authorization"] ||
            null;
        }
        if (authValue && authValue.startsWith("Bearer ")) {
          const token = authValue.slice(7);
          saveToken(token);
        }
      }
    } catch (_) {
      // silent — never break the original fetch
    }
    return originalFetch.apply(this, args);
  };

  // ── Hook XMLHttpRequest ─────────────────────────────────────────────────────
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (
      (name.toLowerCase() === "authorization") &&
      typeof value === "string" &&
      value.startsWith("Bearer ")
    ) {
      const token = value.slice(7);
      saveToken(token);
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  // ── Save token via chrome.runtime.sendMessage ───────────────────────────────
  let lastSavedToken = null;

  function saveToken(token) {
    if (!token || token === lastSavedToken) return;
    lastSavedToken = token;

    // Decode exp from JWT payload to check validity
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const exp = payload.exp;
      const now = Math.floor(Date.now() / 1000);
      if (exp && exp < now) return; // already expired, skip
    } catch (_) {
      // can't decode, save anyway
    }

    chrome.runtime.sendMessage({ type: "SAVE_TOKEN", token }, (res) => {
      if (chrome.runtime.lastError) return; // extension context invalidated
      if (res?.ok) {
        console.debug("[VNFai Sync] Token saved ✓");
      }
    });
  }
})();