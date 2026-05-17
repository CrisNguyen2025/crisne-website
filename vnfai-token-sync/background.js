/**
 * background.js — Service Worker
 * Nhận token từ content script, lưu vào chrome.storage.local
 * Trả token cho bất kỳ tab nào hỏi qua onMessageExternal (internal tools)
 */

// ── Handler chung cho cả internal và external messages ──────────────────────
function handleMessage(message, sender, sendResponse) {
  // Nhận token từ content script
  if (message.type === "SAVE_TOKEN" && message.token) {
    const data = {
      vnfai_token: message.token,
      vnfai_token_saved_at: Date.now(),
    };
    chrome.storage.local.set(data, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Cấp token cho trang internal tools
  if (message.type === "GET_TOKEN") {
    chrome.storage.local.get(["vnfai_token", "vnfai_token_saved_at"], (result) => {
      const token = result.vnfai_token || null;
      const savedAt = result.vnfai_token_saved_at || null;

      if (!token) {
        sendResponse({ ok: false, error: "no_token" });
        return;
      }

      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const exp = payload.exp;
        const now = Math.floor(Date.now() / 1000);
        if (exp && exp < now) {
          sendResponse({ ok: false, error: "token_expired", expiredAt: exp });
          return;
        }
        sendResponse({ ok: true, token, exp, savedAt });
      } catch (_) {
        sendResponse({ ok: true, token, savedAt });
      }
    });
    return true;
  }

  // Xóa token
  if (message.type === "CLEAR_TOKEN") {
    chrome.storage.local.remove(["vnfai_token", "vnfai_token_saved_at"], () => {
      sendResponse({ ok: true });
    });
    return true;
  }
}

// Internal messages (content script, popup)
chrome.runtime.onMessage.addListener(handleMessage);

// External messages (webpage dùng chrome.runtime.sendMessage(EXT_ID, ...))
chrome.runtime.onMessageExternal.addListener(handleMessage);
