chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clipToKnowledgeOS",
    title: "Save selection to Knowledge OS",
    contexts: ["selection", "page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "clipToKnowledgeOS" && tab && tab.id) {
    const title = tab.title || "Clipped Web Note";
    const url = tab.url || "";
    const selectedText = info.selectionText || "";

    chrome.storage.local.get(['clipperEndpoint', 'clipperAdminKey'], async (result) => {
      const endpoint = result.clipperEndpoint || 'https://crisne.blog/api/v1/clipper';
      const adminKey = result.clipperAdminKey || '';

      const payload = {
        title,
        url,
        summary: selectedText,
        content: selectedText,
        category: "Web Clipper",
        tags: ["web-clip", "quick-save"]
      };

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (adminKey) headers['x-admin-key'] = adminKey;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          // Inject a sleek floating Toast Notification at top-right of active tab
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (articleTitle) => {
              const toast = document.createElement('div');
              toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                background: #111827;
                color: #f3f4f6;
                border: 1px solid #10b981;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
                padding: 12px 16px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 10px;
                animation: toastIn 0.3s ease-out;
              `;
              toast.innerHTML = `
                <span style="font-size:16px;">✅</span>
                <div>
                  <div style="font-weight:600; color:#34d399;">Saved to Knowledge OS</div>
                  <div style="font-size:11px; color:#9ca3af; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${articleTitle}</div>
                </div>
              `;
              document.body.appendChild(toast);
              setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
              }, 3000);
            },
            args: [title]
          });
        } else {
          throw new Error(data.error?.message || 'Save failed');
        }
      } catch (err) {
        console.error('Background clip error:', err);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (errorMsg) => {
            alert(`❌ Knowledge OS Save Error: ${errorMsg}`);
          },
          args: [err.message]
        });
      }
    });
  }
});
