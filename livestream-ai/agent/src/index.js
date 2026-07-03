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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const MOCK = args.has('--mock');
const DRY = args.has('--dry');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
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

  // Uu tien faq.json (ban that), khong co thi dung faq.example.json
  const faqFile = fs.existsSync(path.join(ROOT, 'faq.json')) ? 'faq.json' : 'faq.example.json';
  const faq = loadJson(faqFile);
  console.log(`[Config] Dung ${faqFile} — ${faq.intents.length} intent.`);

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

  const orch = new Orchestrator({ obs, intents: faq.intents, logic: config.logic });
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
