/*
 * Dieu phoi: comment -> intent -> phat clip tra loi, co kiem soat.
 *  - Khoa "dang tra loi": khi 1 clip dang phat, comment moi vao hang doi (khong
 *    lam OBS giat scene lien tuc).
 *  - Cooldown moi intent: khong phat lai cung 1 clip trong cooldownSec giay
 *    (tranh spam khi nhieu nguoi hoi cung cau).
 *  - Gioi han hang doi: bo bot khi comment don dap.
 * Khi khong khop intent -> im lang (an toan hon phat nham).
 */
import { matchIntent } from './intent.js';

// Comment thật của khách trên live rất ngắn. Dài hơn mức này = extension dò nhầm vùng chat,
// bắn nguyên trang web vào → bỏ qua, đừng phát clip oan.
const MAX_COMMENT_LEN = 200;

export class Orchestrator {
  constructor({ obs, intents, logic, onEvent }) {
    this.obs = obs;
    // 4/8/2026: ban su kien ra ngoai de tab Studio tren web hien NHAT KY + trang thai THAT
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.intents = intents;
    this.cooldownSec = logic.cooldownSec ?? 45;
    this.minConfidence = logic.minConfidence ?? 1;
    this.maxQueue = logic.maxQueue ?? 3;
    // FAILSAFE: neu su kien "clip xong" khong bao gio toi (OBS truc trac) thi sau failsafeSec
    // tu ve IDLE — khong bi ket scene ANSWER ca buoi live. Clip FAQ 10-30s nen 180s la du rong.
    this.failsafeMs = (logic.failsafeSec ?? 180) * 1000;
    this._fsTimer = null;

    this.answering = false;
    this.queue = [];
    this.lastPlayedAt = new Map(); // intentId -> timestamp
    // XOAY VONG CLIP (5/8/2026): 1 cau hoi co the co nhieu clip. Live 2 tieng ma cau "gia bao nhieu"
    // lan nao cung phat Y HET 1 clip -> khan gia biet ngay la may chay tu dong. Nho vi tri da phat
    // cua tung cau de lan sau phat cai KE TIEP.
    this.clipIdx = new Map();      // intentId -> vi tri clip vua phat

    // Khi clip tra loi xong: quay ve idle, xu ly hang doi
    this.obs.onAnswerEnded(() => this._onAnswerEnded());
    // OBS noi lai giua luc dang phat -> su kien "clip xong" da mat, reset ve idle + xu ly hang doi
    if (typeof this.obs.onReconnected === 'function') this.obs.onReconnected(() => this._onObsReconnected());
  }

  async start() {
    await this.obs.goIdle();
    console.log('[Orchestrator] Bat dau o che do IDLE.');
  }

  // ── LENH TU STUDIO (4/8/2026) ─────────────────────────────────────────────
  /** Phat NGAY 1 cau theo id (bo qua cooldown/hang doi) — de test clip trong luc live. */
  async playById(intentId) {
    const intent = this.intents.find((i) => i.id === intentId);
    if (!intent) return { ok: false, error: 'Khong tim thay cau hoi: ' + intentId };
    const coClip = (Array.isArray(intent.clips) && intent.clips.length) || String(intent.clip || '').trim();
    if (!coClip) return { ok: false, error: 'Cau nay chua co clip' };
    this.queue = [];                 // bam tay = uu tien, don hang doi cu
    if (this.answering) { try { await this.obs.goIdle(); } catch (e) {} this.answering = false; }
    await this._play(intent);
    return { ok: true, label: intent.label };
  }

  /** Dung clip dang phat, ve IDLE ngay. */
  async stopNow() {
    clearTimeout(this._fsTimer);
    this.queue = [];
    try { await this.obs.goIdle(); } catch (e) { return { ok: false, error: e.message }; }
    this.answering = false;
    this.onEvent({ kind: 'stopped' });
    return { ok: true };
  }

  /** Trang thai hien tai cho Studio hien dung thuc te. */
  getState() {
    return {
      answering: this.answering,
      queue: this.queue.map((i) => i.id),
      intents: this.intents.map((i) => ({
        id: i.id, label: i.label, clip: i.clip || '',
        soClip: (Array.isArray(i.clips) ? i.clips.length : 0) || (String(i.clip || '').trim() ? 1 : 0),
      })),
    };
  }

  // Goi moi khi co comment moi
  onComment({ user, text }) {
    // CHẶN RÁC (4/8/2026): lúc phòng live chưa có comment thật, extension dò nhầm vùng chat
    // và bắn NGUYÊN TRANG (cả nghìn ký tự: menu, hướng dẫn OBS, tên sản phẩm...) vào đây
    // → khớp trúng "Hỏi giá"/"Voucher" và PHÁT CLIP OAN. Comment thật của khách rất ngắn.
    const clean = String(text || '').trim();
    if (!clean) return;
    if (clean.length > MAX_COMMENT_LEN) {
      console.log(`[bo qua] doan text dai ${clean.length} ky tu — khong phai comment that (chan rac)`);
      return;
    }
    const m = matchIntent(clean, this.intents, this.minConfidence);
    if (!m) {
      console.log(`[skip] "${text}" — khong khop intent`);
      return;
    }
    const intent = m.intent;

    // Cooldown
    const last = this.lastPlayedAt.get(intent.id) || 0;
    const sinceSec = (Date.now() - last) / 1000;
    if (sinceSec < this.cooldownSec) {
      console.log(`[cooldown] ${intent.label} (con ${Math.ceil(this.cooldownSec - sinceSec)}s)`);
      return;
    }

    console.log(`[match] "${text}" -> ${intent.label} (diem ${m.score})`);

    if (this.answering) {
      // Dang phat clip khac -> vao hang doi (khong trung intent da co trong queue)
      if (this.queue.find((i) => i.id === intent.id)) return;
      if (this.queue.length >= this.maxQueue) {
        console.log('[queue] day, bo qua:', intent.label);
        return;
      }
      this.queue.push(intent);
      return;
    }

    this._play(intent);
  }

  /** Chon clip KE TIEP cua 1 cau hoi (xoay vong). Chi co 1 clip thi luon la clip do. */
  _chonClip(intent) {
    const ds = Array.isArray(intent.clips) && intent.clips.length
      ? intent.clips
      : (String(intent.clip || '').trim() ? [String(intent.clip).trim()] : []);
    if (!ds.length) return { path: '', i: 0, n: 0 };
    const truoc = this.clipIdx.has(intent.id) ? this.clipIdx.get(intent.id) : -1;
    const i = (truoc + 1) % ds.length;
    this.clipIdx.set(intent.id, i);
    return { path: ds[i], i, n: ds.length };
  }

  async _play(intent) {
    this.answering = true;
    this._armFailsafe();
    const chon = this._chonClip(intent);
    try {
      const stt = chon.n > 1 ? ` (clip ${chon.i + 1}/${chon.n})` : '';
      console.log(`▶ PHAT: ${intent.label}${stt} -> ${chon.path}`);
      this.onEvent({ kind: 'play', intentId: intent.id, label: intent.label, clip: chon.path, clipIdx: chon.i + 1, clipTong: chon.n });
      await this.obs.playAnswer(chon.path);
      // Chi tinh cooldown khi PHAT THANH CONG (fail thi nguoi xem hoi lai phai duoc tra loi ngay)
      this.lastPlayedAt.set(intent.id, Date.now());
      this._playStartedAt = Date.now();
    } catch (e) {
      console.error('[OBS] Loi phat clip:', e.message);
      clearTimeout(this._fsTimer);
      // playAnswer co the fail SAU khi da chuyen scene -> phai keo ve IDLE keo ket man hinh answer den
      try { await this.obs.goIdle(); } catch (e2) {}
      this.answering = false;
      this._next();
    }
    // answering se duoc mo khoa boi su kien MediaInputPlaybackEnded (hoac failsafe)
  }

  _armFailsafe() {
    clearTimeout(this._fsTimer);
    this._fsTimer = setTimeout(() => {
      if (this.answering) {
        console.warn(`[Failsafe] Clip qua ${this.failsafeMs / 1000}s chua bao xong -> tu ve IDLE`);
        this._onAnswerEnded(true);
      }
    }, this.failsafeMs);
  }

  async _onAnswerEnded(fromFailsafe = false) {
    // Guard 1: su kien den muon (sau khi failsafe/reconnect da xu ly) -> bo qua, khong goIdle/next lan 2
    if (!this.answering) return;
    // Guard 2: su kien "ket thuc" ban ra NGAY khi vua doi file/restart (swap clip cu) -> khong phai
    // clip nay xong that (clip that ngan nhat cung ~5s), bo qua keo cat clip dang phat.
    if (!fromFailsafe && Date.now() - (this._playStartedAt || 0) < 2000) return;
    clearTimeout(this._fsTimer);
    console.log('✔ Clip tra loi xong -> ve IDLE');
    this.onEvent({ kind: 'ended' });
    try { await this.obs.goIdle(); } catch (e) {}
    this.answering = false;
    this._next();
  }

  // OBS rot ket noi giua clip roi noi lai duoc: su kien PlaybackEnded da mat -> reset ngay,
  // khong de ket answering toi khi failsafe (3 phut live cam la qua dai).
  _onObsReconnected() {
    if (!this.answering) return;
    console.warn('[OBS] Noi lai giua luc dang phat clip -> coi nhu clip xong, xu ly hang doi.');
    clearTimeout(this._fsTimer);
    this.answering = false;
    this._next();
  }

  _next() {
    if (this.answering) return;
    const intent = this.queue.shift();
    if (intent) this._play(intent);
  }
}
