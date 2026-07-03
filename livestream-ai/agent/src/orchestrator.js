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

export class Orchestrator {
  constructor({ obs, intents, logic }) {
    this.obs = obs;
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

    // Khi clip tra loi xong: quay ve idle, xu ly hang doi
    this.obs.onAnswerEnded(() => this._onAnswerEnded());
  }

  async start() {
    await this.obs.goIdle();
    console.log('[Orchestrator] Bat dau o che do IDLE.');
  }

  // Goi moi khi co comment moi
  onComment({ user, text }) {
    const m = matchIntent(text, this.intents, this.minConfidence);
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

  async _play(intent) {
    this.answering = true;
    this.lastPlayedAt.set(intent.id, Date.now());
    this._armFailsafe();
    try {
      console.log(`▶ PHAT: ${intent.label} -> ${intent.clip}`);
      await this.obs.playAnswer(intent.clip);
    } catch (e) {
      console.error('[OBS] Loi phat clip:', e.message);
      clearTimeout(this._fsTimer);
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
        this._onAnswerEnded();
      }
    }, this.failsafeMs);
  }

  async _onAnswerEnded() {
    // Guard: su kien den muon (sau khi failsafe da xu ly) thi bo qua, khong goIdle/next lan 2
    if (!this.answering) return;
    clearTimeout(this._fsTimer);
    console.log('✔ Clip tra loi xong -> ve IDLE');
    try { await this.obs.goIdle(); } catch (e) {}
    this.answering = false;
    this._next();
  }

  _next() {
    if (this.answering) return;
    const intent = this.queue.shift();
    if (intent) this._play(intent);
  }
}
