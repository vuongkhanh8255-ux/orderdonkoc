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
import { startBridgeServer, startMockSource } from './commentSource.js';
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
  try {
    const fromSb = await loadFromSupabase(sb);
    if (fromSb && fromSb.intents.length) {
      faq = { intents: fromSb.intents };
      logic = fromSb.logic;
      src = 'Supabase (dashboard Module 4)';
    }
  } catch (e) {
    console.warn(`[Config] Khong nap duoc tu Supabase (${e.message}) -> dung file faq.json.`);
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

  const orch = new Orchestrator({ obs, intents: faq.intents, logic });
  await orch.start();

  const onComment = (c) => orch.onComment(c);

  if (MOCK) {
    startMockSource(onComment);
  } else {
    startBridgeServer(config.bridge.port, onComment);
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
