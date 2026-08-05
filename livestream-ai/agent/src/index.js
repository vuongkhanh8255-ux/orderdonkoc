/*
 * Diem vao Desktop Agent.
 *
 * Che do chay:
 *   node src/index.js               -> that: ket noi OBS + nhan comment tu extension
 *   node src/index.js --mock        -> go cau hoi tu ban phim thay cho extension
 *   node src/index.js --dry         -> khong ket noi OBS (gia lap), chi test logic
 *   node src/index.js --mock --dry  -> test thuan logic, khong can OBS lan Shopee
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObsController } from './obs.js';
import { Orchestrator } from './orchestrator.js';
import { startBridgeServer, startMockSource, broadcast } from './commentSource.js';
import { loadFromSupabase } from './faqSource.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const MOCK = args.has('--mock');
const DRY = args.has('--dry');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

// Doc Supabase URL + anon key tu .env GOC cua koc-tool (livestream-ai/agent/../../.env) — cung key
// frontend xai (anon key vốn public). Nho vay agent tu ket noi Supabase, khong can commit key vao repo.
function readRootEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '..', '..', '.env'), 'utf8');
    const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
    return { url: get('VITE_SUPABASE_URL'), anonKey: get('VITE_SUPABASE_ANON_KEY') };
  } catch { return {}; }
}

// OBS gia lap cho che do --dry: tu bao "clip xong" sau 3s de test vong lap
class DryObs {
  constructor() { this._end = null; }
  onAnswerEnded(fn) { this._end = fn; }
  async connect() { console.log('[DRY] Bo qua ket noi OBS.'); }
  async goIdle() { console.log('[DRY] -> IDLE (playlist)'); }
  async playAnswer(clip) {
    console.log(`[DRY] Phat clip: ${clip} (gia lap 3s)`);
    setTimeout(() => this._end && this._end(), 3000);
  }
  async sanityCheck() { return []; }
  async disconnect() {}
}

async function main() {
  const config = loadJson('config.json');

  // Nguon kho cau hoi: UU TIEN Supabase (dashboard Module 4 trong koc-tool) -> sua tren web la agent tu lay.
  // Khong cau hinh / loi mang -> fallback faq.json (ban that) -> faq.example.json.
  let faq = null, logic = config.logic;
  let src = '';
  const rootEnv = readRootEnv();
  const sb = {
    url: (config.supabase && config.supabase.url) || rootEnv.url || '',
    anonKey: (config.supabase && config.supabase.anonKey) || process.env.SUPABASE_ANON_KEY || rootEnv.anonKey || '',
  };

  // ── GIAN HANG (Khanh 4/8/2026) ────────────────────────────────────────────
  // May nay phat live cho gian nao? Moi gian co kho cau hoi + bo clip RIENG.
  // Khong khai -> KHONG duoc nap tu web (nap tat ca la phat nham clip cua shop khac).
  const SHOP = String(config.shop || '').trim();
  if (SHOP) console.log(`[Config] Gian hang: ${SHOP}`);
  else console.warn('[Config] ⚠ Chua khai "shop" trong config.json -> khong nap duoc tu web, chi dung faq.json tai may.');

  let sbOk = false;                      // goi web THANH CONG (phan biet voi loi mang)
  try {
    const fromSb = await loadFromSupabase(sb, SHOP);
    if (fromSb) {
      sbOk = true;
      if (fromSb.intents.length) {
        faq = { intents: fromSb.intents };
        logic = fromSb.logic;
        src = `Supabase (Module 4) — gian "${SHOP}"`;
      }
    }
  } catch (e) {
    console.warn(`[Config] Khong nap duoc tu Supabase (${e.message}) -> dung file faq.json.`);
  }

  // Goi web OK nhung gian nay CHUA co cau hoi nao = gan nhu chac chan go sai ma gian hang.
  // KHONG im lang quay ve faq.json (file do co the la clip cua gian khac -> phat nham khi dang live).
  if (SHOP && sbOk && !faq) {
    console.error('\n❌ ============================================');
    console.error(`❌  Gian "${SHOP}" CHUA co cau hoi nao tren web (Module 4).`);
    console.error('❌  Kiem tra: (1) go dung ma gian hang chua — bam nut "Copy" o Module 4;');
    console.error('❌            (2) da tao cau hoi + BAT (enabled) cho gian nay chua.');
    console.error('❌  Dung agent de tranh phat nham clip cua gian khac.');
    console.error('❌ ============================================\n');
    process.exit(1);
  }

  if (!faq) {
    const faqFile = fs.existsSync(path.join(ROOT, 'faq.json')) ? 'faq.json' : 'faq.example.json';
    faq = loadJson(faqFile);
    src = faqFile;
  }
  console.log(`[Config] Nguon: ${src} — ${faq.intents.length} intent.`);

  const obs = DRY ? new DryObs() : new ObsController(config.obs);
  await obs.connect();

  if (!DRY) {
    const warnings = await obs.sanityCheck();
    if (warnings.length) {
      console.warn('\n⚠ CANH BAO CONFIG OBS:');
      warnings.forEach((w) => console.warn('  - ' + w));
      console.warn('  (Tao scene/source tuong ung trong OBS, hoac sua config.json)\n');
    }
  }

  // Su kien cua orchestrator -> ban thang xuong Studio (nhat ky chay realtime)
  const orch = new Orchestrator({
    obs, intents: faq.intents, logic,
    onEvent: (ev) => broadcast({ type: 'log', at: Date.now(), ...ev }),
  });
  await orch.start();

  // TỰ NẠP LẠI KHO CÂU HỎI mỗi 60s (4/8/2026).
  // Trước đây chỉ nạp 1 lần lúc khởi động → sửa clip/câu hỏi trên web (Module 4) mà agent
  // vẫn phát clip CŨ, phải tắt bật lại mới ăn (đã dính khi test: đổi clip "Hỏi giá" nhưng
  // agent vẫn phát file cũ). Giờ sửa trên web, chờ tối đa 1 phút là agent tự cập nhật.
  if (src.startsWith('Supabase')) {
    setInterval(async () => {
      try {
        const moi = await loadFromSupabase(sb, SHOP);   // van khoa dung gian hang cua may nay
        if (!moi || !moi.intents.length) return;        // gian bi xoa het cau hoi -> giu ban dang chay
        const cuJson = JSON.stringify(orch.intents);
        if (cuJson === JSON.stringify(moi.intents)) return;   // không đổi thì im lặng
        orch.intents = moi.intents;
        console.log(`[Config] Da tu cap nhat kho cau hoi tu web — ${moi.intents.length} intent.`);
      } catch (e) { /* mạng chập chờn thì bỏ qua, giữ bản đang chạy */ }
    }, 60_000);
  }

  const onComment = (c) => orch.onComment(c);

  // ── LENH TU TAB STUDIO tren web (4/8/2026) ────────────────────────────────
  // Studio mo ws://127.0.0.1:<port> roi gui {type:'cmd', action}. Tra loi qua chinh socket do.
  const onCommand = async (msg, ws) => {
    const reply = (o) => { try { ws.send(JSON.stringify({ type: 'cmdres', action: msg.action, ...o })); } catch (e) {} };
    switch (msg.action) {
      case 'hello':                       // Studio vua noi -> gui trang thai + danh sach clip
        return reply({ ok: true, shop: SHOP, state: orch.getState() });
      case 'play':
        return reply(await orch.playById(msg.intent_id));
      case 'stop':
        return reply(await orch.stopNow());
      case 'reload': {                    // nap lai kho cau hoi tu web NGAY (khong cho 60s)
        try {
          const moi = await loadFromSupabase(sb, SHOP);
          if (!moi || !moi.intents.length) return reply({ ok: false, error: 'Web tra ve 0 cau hoi' });
          orch.intents = moi.intents;
          broadcast({ type: 'log', at: Date.now(), kind: 'reload', n: moi.intents.length });
          return reply({ ok: true, n: moi.intents.length, state: orch.getState() });
        } catch (e) { return reply({ ok: false, error: e.message }); }
      }
      default:
        return reply({ ok: false, error: 'Lenh la: ' + msg.action });
    }
  };

  if (MOCK) {
    console.log('\n⚠️ ============================================');
    console.log('⚠️  CHE DO MOCK — go tay de TEST, KHONG phai che do live!');
    console.log('⚠️  Ngay live chay:  npm start   (khong co --mock)');
    console.log('⚠️ ============================================\n');
    startMockSource(onComment);
  } else {
    startBridgeServer(config.bridge.port, onComment, onCommand);
  }

  // Dong sach khi thoat
  process.on('SIGINT', async () => {
    console.log('\nDang thoat...');
    await obs.disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Loi khoi dong:', e.message);
  process.exit(1);
});
