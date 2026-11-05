// Playwright MCP helper for Abot (browser_run_code_unsafe). Paste the body, then call cases at the bottom.
// Waits until the reply text stops changing; never waits on /chat/stream finishing (it hangs).
async (page) => {
  const openChat = async (url = 'http://localhost:3334/') => {
    await page.goto(url);
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Mở Abot' }).click();
    await page.waitForTimeout(1500);
  };

  // Sends one single-line message and returns the reply text after it
  const send = async (msg) => {
    const input = page.getByPlaceholder('Hỏi Abot…');
    await input.fill(msg);
    await input.press('Enter');
    const key = msg.trim().replace(/\s+/g, ' ').slice(0, 30);
    let last = '';
    let stable = 0;
    for (let k = 0; k < 60 && stable < 3; k++) {
      await page.waitForTimeout(1000);
      const text = (await page.locator('body').innerText()).replace(/[ \t]+/g, ' ');
      const i = text.lastIndexOf(key);
      const tail = i < 0 ? '' : text.slice(i + key.length);
      const settled = tail && tail === last && !/Đang xử lý|Đang suy nghĩ/.test(tail);
      stable = settled ? stable + 1 : 0;
      last = tail;
    }
    return last.replace(/vài giây trước|một phút trước/g, '').replace(/\n+/g, ' | ').trim().slice(0, 600);
  };

  // Sends a message and confirms with "ok" when a preview asks for it
  const run = async (msg) => {
    let reply = await send(msg);
    if (/Xác nhận thực hiện|Đang chờ bạn xác nhận/.test(reply)) reply += '  ==> OK: ' + (await send('ok'));
    return reply;
  };

  // Lessons of a topic as the API stores them: the evidence, not Abot's reply
  const lessons = async (slug) =>
    (await (await page.request.get(`http://localhost:3334/api/v1/roadmaps/${slug}`)).json()).items.map(
      (i) => `${i.title} | ${i.section ?? 'Chung'}`
    );

  await openChat();
  return {
    // Example: A1: await run('thêm bài Vector DB vào topic QA Sandbox mục RAG'),
    // after: await lessons('qa-sandbox'),
  };
};
