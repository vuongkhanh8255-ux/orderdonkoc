/*
 * Adapter dieu khien OBS qua obs-websocket v5.
 * Mo hinh 2 scene:
 *   - idleScene:  phat vong playlist clip idle (tu setup trong OBS).
 *   - answerScene: chua 1 media source (answerSource) de phat clip tra loi.
 *
 * Tra loi 1 cau hoi:
 *   setInputSettings(answerSource, local_file = clip)  -> doi file
 *   setCurrentProgramScene(answerScene)                -> chuyen canh
 *   TriggerMediaInputAction(RESTART)                   -> phat lai tu dau
 * Khi clip phat xong: su kien MediaInputPlaybackEnded -> quay ve idleScene.
 */
import { OBSWebSocket } from 'obs-websocket-js';

const RESTART = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART';

export class ObsController {
  constructor(cfg) {
    this.cfg = cfg;
    this.obs = new OBSWebSocket();
    this.connected = false;
    this._onAnswerEnd = null;
  }

  async connect() {
    const { url, password } = this.cfg;
    await this.obs.connect(url, password || undefined);
    this.connected = true;

    // Khi clip tra loi phat xong -> callback (de orchestrator quay ve idle)
    this.obs.on('MediaInputPlaybackEnded', (data) => {
      if (data.inputName === this.cfg.answerSource && this._onAnswerEnd) {
        this._onAnswerEnd();
      }
    });

    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      console.warn('[OBS] Mat ket noi.');
    });

    console.log('[OBS] Da ket noi', url);
  }

  onAnswerEnded(fn) {
    this._onAnswerEnd = fn;
  }

  // Chuyen ve canh idle (playlist)
  async goIdle() {
    await this.obs.call('SetCurrentProgramScene', { sceneName: this.cfg.idleScene });
  }

  // Phat 1 clip tra loi
  async playAnswer(clipPath) {
    // Doi file cua answer source. QUAN TRONG: is_local_file=true de OBS chay che do FILE LOCAL
    // (neu khong, media source o che do network/URL se bo qua local_file -> khung den).
    // looping=false de clip phat xong ban su kien MediaInputPlaybackEnded -> agent quay ve IDLE.
    await this.obs.call('SetInputSettings', {
      inputName: this.cfg.answerSource,
      inputSettings: { is_local_file: true, local_file: clipPath, looping: false },
      overlay: true
    });
    // Chuyen sang canh answer
    await this.obs.call('SetCurrentProgramScene', { sceneName: this.cfg.answerScene });
    // Phat lai tu dau (vi vua doi file)
    await this.obs.call('TriggerMediaInputAction', {
      inputName: this.cfg.answerSource,
      mediaAction: RESTART
    });
  }

  // Kiem tra scene/source da ton tai chua (goi luc khoi dong de canh bao sai config)
  async sanityCheck() {
    const warnings = [];
    try {
      const { scenes } = await this.obs.call('GetSceneList');
      const names = scenes.map((s) => s.sceneName);
      if (!names.includes(this.cfg.idleScene)) warnings.push(`Thieu scene "${this.cfg.idleScene}"`);
      if (!names.includes(this.cfg.answerScene)) warnings.push(`Thieu scene "${this.cfg.answerScene}"`);
    } catch (e) {
      warnings.push('Khong lay duoc danh sach scene: ' + e.message);
    }
    try {
      await this.obs.call('GetInputSettings', { inputName: this.cfg.answerSource });
    } catch (e) {
      warnings.push(`Thieu media source "${this.cfg.answerSource}" (hoac sai ten)`);
    }
    return warnings;
  }

  async disconnect() {
    try { await this.obs.disconnect(); } catch (e) {}
  }
}
