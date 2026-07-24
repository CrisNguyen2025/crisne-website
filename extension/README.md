# 🧩 crisne.blog Knowledge OS Web Clipper (Chrome Extension)

Official Manifest V3 Chrome Extension to clip articles, technical notes, code snippets, and web content directly into your **AI-First Knowledge Operating System**.

---

## 🚀 How to Install in Chrome / Brave / Edge

1. Open your browser and navigate to `chrome://extensions/` (or `brave://extensions/` / `edge://extensions/`).
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** (Tải tiện ích đã giải nén).
4. Select the `extension` folder located inside this codebase (`crisne-website/extension`).
5. The **crisne.blog Knowledge OS** icon will appear in your browser extension toolbar!

---

## ⚡ How to Use

### Method 1: Popup Form
1. Open any interesting web page.
2. Click the extension icon in your browser toolbar.
3. The extension automatically extracts the **Page Title**, **URL**, and any text you currently have highlighted/selected.
4. Add custom tags or notes if desired.
5. Click **Save to Knowledge OS**!

### Method 2: Right-Click Context Menu
1. Highlight any text on a web page.
2. Right-click ➔ Select **"Save selection to Knowledge OS"**.
3. It instantly sends the clipped content directly to your site's `/api/v1/clipper` endpoint!

---

## ⚙️ Configuration

- **API Endpoint**: Defaults to `https://crisne.blog/api/v1/clipper` (can be changed to `http://localhost:3334/api/v1/clipper` during local testing).
- **Admin API Key**: If you set `ADMIN_API_KEY` in your website's environment variables (`.env.local`), enter the key here. Otherwise leave empty for single-user bypass mode.
