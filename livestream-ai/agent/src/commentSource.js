/*
 * Nguon comment cho agent. Hai che do:
 *  - WebSocket server (mac dinh): nhan comment tu Chrome extension (Phase 0)
 *    qua ws://127.0.0.1:<port>. Extension gui { type:'comment', user, text }.
 *  - Mock (--mock): go cau hoi tu ban phim de test ma khong can Shopee/extension.
 *
 * Ca hai deu goi onComment({ user, text }).
 *
 * 4/8/2026 — THEM KENH DIEU KHIEN cho tab Studio tren web:
 *   Studio mo WebSocket toi CHINH cong nay va gui { type:'cmd', action, ... }.
 *   Agent ban lai { type:'log' } / { type:'state' } de Studio hien nhat ky + trang thai THAT.
 *   Dung chung 1 cong 8787 voi extension — khoi mo them cong, khoi sua firewall.
 */
import { WebSocketServer } from 'ws';
import readline from 'node:readline';

let _wss = null;

export function startBridgeServer(port, onComment, onCommand) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  _wss = wss;

  wss.on('connection', (ws) => {
    console.log('[Bridge] Client da ket noi (extension hoac Studio).');
    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
      if (!msg) return;
      if (msg.type === 'comment' && msg.text) {
        onComment({ user: msg.user || '', text: msg.text });
      } else if (msg.type === 'cmd' && typeof onCommand === 'function') {
        Promise.resolve(onCommand(msg, ws)).catch((e) =>
          console.error('[Bridge] Loi xu ly lenh:', e.message)
        );
      }
    });
    ws.on('close', () => console.log('[Bridge] Client ngat ket noi.'));
  });

  wss.on('listening', () =>
    console.log(`[Bridge] Cho comment + lenh Studio o ws://127.0.0.1:${port}`)
  );
  wss.on('error', (e) => console.error('[Bridge] Loi:', e.message));

  return wss;
}

/** Ban 1 goi toi MOI client dang mo (Studio) — dung cho nhat ky + trang thai. */
export function broadcast(obj) {
  if (!_wss) return;
  const s = JSON.stringify(obj);
  for (const c of _wss.clients) {
    if (c.readyState === 1) { try { c.send(s); } catch (e) { /* client vua dong */ } }
  }
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
