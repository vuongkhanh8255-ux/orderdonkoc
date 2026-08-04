// bg.js — Service worker giữ kết nối WebSocket tới agent local (ws://127.0.0.1:8787).
//
// VÌ SAO KHÔNG NỐI THẲNG TRONG content.js (bug 4/8/2026):
//   WebSocket tạo trong content script bị **CSP của trang Shopee** chặn → badge cứ hiện
//   "agent: khong co agent" dù agent đang chạy ngon (đã kiểm: trang https bình thường nối
//   được ws://127.0.0.1:8787, agent nhận comment + phát clip OK). Service worker chạy trên
//   origin chrome-extension:// nên KHÔNG dính CSP của trang → nối được.
//
// Luồng mới:  content.js  --(chrome.runtime.sendMessage)-->  bg.js  --(WebSocket)-->  agent
// Trạng thái: content.js hỏi lại bg.js mỗi 5s (khỏi cần quyền "tabs" để phát ngược).

const WS_URL = 'ws://127.0.0.1:8787';
const RETRY_MS = 5000;
const PING_MS = 20000;   // gửi ping để Chrome không ngủ service worker giữa 2 comment

let ws = null;
let connected = false;
let retryTimer = null;
let pingTimer = null;

function connect() {
  clearTimeout(retryTimer);
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      connected = true;
      console.log('[ShopeeCR/bg] Da noi agent', WS_URL);
      clearInterval(pingTimer);
      // Ping đều đặn: vừa giữ service worker sống, vừa phát hiện agent tắt sớm.
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* kệ */ }
        }
      }, PING_MS);
    };
    ws.onclose = () => {
      connected = false;
      clearInterval(pingTimer);
      retryTimer = setTimeout(connect, RETRY_MS);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* kệ */ } };
  } catch (e) {
    connected = false;
    retryTimer = setTimeout(connect, RETRY_MS);
  }
}

connect();

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || !msg.__cr__) return;

  if (msg.type === 'status') {
    // Tiện thể: bị hỏi mà đang đứt thì thử nối lại luôn (service worker vừa hồi sinh).
    if (!connected && (!ws || ws.readyState > 1)) connect();
    reply({ connected });
    return true;
  }

  if (msg.type === 'comment' && ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(msg.payload)); } catch (e) { /* kệ */ }
  }
});
