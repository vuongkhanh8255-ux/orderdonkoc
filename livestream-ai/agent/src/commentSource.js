/*
 * Nguon comment cho agent. Hai che do:
 *  - WebSocket server (mac dinh): nhan comment tu Chrome extension (Phase 0)
 *    qua ws://127.0.0.1:<port>. Extension gui { type:'comment', user, text }.
 *  - Mock (--mock): go cau hoi tu ban phim de test ma khong can Shopee/extension.
 *
 * Ca hai deu goi onComment({ user, text }).
 */
import { WebSocketServer } from 'ws';
import readline from 'node:readline';

export function startBridgeServer(port, onComment) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });

  wss.on('connection', (ws) => {
    console.log('[Bridge] Extension da ket noi.');
    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
      if (msg && msg.type === 'comment' && msg.text) {
        onComment({ user: msg.user || '', text: msg.text });
      }
    });
    ws.on('close', () => console.log('[Bridge] Extension ngat ket noi.'));
  });

  wss.on('listening', () =>
    console.log(`[Bridge] Cho comment tu extension o ws://127.0.0.1:${port}`)
  );
  wss.on('error', (e) => console.error('[Bridge] Loi:', e.message));

  return wss;
}

export function startMockSource(onComment) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n[Mock] Go 1 cau hoi (gia lap comment) roi Enter. Vi du: "gia bao nhieu shop oi"');
  console.log('[Mock] Ctrl+C de thoat.\n');
  rl.on('line', (line) => {
    const text = line.trim();
    if (text) onComment({ user: 'test', text });
  });
  return rl;
}
