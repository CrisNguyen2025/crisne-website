document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('title');
  const urlInput = document.getElementById('url');
  const summaryInput = document.getElementById('summary');
  const categoryInput = document.getElementById('category');
  const tagsInput = document.getElementById('tags');
  const endpointInput = document.getElementById('endpoint');
  const adminKeyInput = document.getElementById('adminKey');
  const form = document.getElementById('clipForm');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load saved endpoint & admin key settings
  chrome.storage.local.get(['clipperEndpoint', 'clipperAdminKey'], (result) => {
    if (result.clipperEndpoint) endpointInput.value = result.clipperEndpoint;
    if (result.clipperAdminKey) adminKeyInput.value = result.clipperAdminKey;
  });

  // Get active tab info & selection
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      titleInput.value = tab.title || '';
      urlInput.value = tab.url || '';

      // Execute script to get selected text on page
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || ''
        },
        (results) => {
          if (results && results[0] && results[0].result) {
            summaryInput.value = results[0].result;
          }
        }
      );
    }
  } catch (err) {
    console.error('Failed to get active tab info:', err);
  }

  // Handle Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving to Knowledge OS...';
    statusDiv.className = 'status';
    statusDiv.innerText = '';

    const endpoint = endpointInput.value.trim() || 'https://crisne.blog/api/v1/clipper';
    const adminKey = adminKeyInput.value.trim();

    // Save settings
    chrome.storage.local.set({
      clipperEndpoint: endpoint,
      clipperAdminKey: adminKey
    });

    const payload = {
      title: titleInput.value.trim(),
      url: urlInput.value.trim(),
      summary: summaryInput.value.trim(),
      content: summaryInput.value.trim(),
      category: categoryInput.value.trim() || 'Web Clipper',
      tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean)
    };

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminKey) {
        headers['x-admin-key'] = adminKey;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        statusDiv.className = 'status success';
        statusDiv.innerText = '✅ Successfully saved to Knowledge OS!';
        saveBtn.innerText = 'Saved!';
      } else {
        throw new Error(data.error?.message || 'Failed to save');
      }
    } catch (err) {
      statusDiv.className = 'status error';
      statusDiv.innerText = `❌ Error: ${err.message}`;
      saveBtn.innerText = 'Try Again';
      saveBtn.disabled = false;
    }
  });
});
