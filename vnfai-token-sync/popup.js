const dot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const expText = document.getElementById("expText");
const savedAtText = document.getElementById("savedAtText");
const hint = document.getElementById("hint");

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("vi-VN");
}

function fmtMs(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("vi-VN");
}

// Load token status
chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (res) => {
  if (!res || res.error === "no_token") {
    dot.className = "dot none";
    statusText.textContent = "Chưa có token";
    statusText.className = "value gray";
    hint.textContent = "Truy cập vnfai.com để tự động sync token";
    return;
  }
  if (res.error === "token_expired") {
    dot.className = "dot expired";
    statusText.textContent = "Token đã hết hạn";
    statusText.className = "value orange";
    expText.textContent = fmtDate(res.expiredAt);
    expText.className = "value orange";
    hint.textContent = "Reload trang vnfai.com để lấy token mới";
    return;
  }
  // ok
  dot.className = "dot ok";
  statusText.textContent = "Token hợp lệ ✓";
  statusText.className = "value green";
  expText.textContent = fmtDate(res.exp);
  expText.className = "value";
  savedAtText.textContent = fmtMs(res.savedAt);
  hint.textContent = "Token đã sẵn sàng cho internal tools";
});

// Open vnfai
document.getElementById("openVnfai").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://upb.ops.vnfai.com" });
});

// Copy token
document.getElementById("copyToken").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (res) => {
    if (res?.token) {
      navigator.clipboard.writeText(res.token).then(() => {
        hint.textContent = "✓ Đã copy token vào clipboard";
        setTimeout(() => { hint.textContent = "Token đã sẵn sàng cho internal tools"; }, 2000);
      });
    } else {
      hint.textContent = "Không có token để copy";
    }
  });
});

// Clear token
document.getElementById("clearToken").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_TOKEN" }, () => {
    dot.className = "dot none";
    statusText.textContent = "Đã xóa token";
    statusText.className = "value gray";
    expText.textContent = "—";
    savedAtText.textContent = "—";
    hint.textContent = "Truy cập vnfai.com để sync lại";
  });
});
