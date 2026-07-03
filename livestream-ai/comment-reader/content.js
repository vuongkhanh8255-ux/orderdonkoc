/*
 * Shopee Live Comment Reader — POC (Phase 0)
 * Muc tieu: chung minh doc duoc comment phong live Shopee realtime, on dinh.
 *
 * Trong tam thiet ke:
 *  - KHONG hardcode CSS selector (Shopee doi giao dien la gay). Thay vao do
 *    tu do vung chat bang heuristic: cho nao lien tuc co node text ngan duoc
 *    them vao => do la khung comment.
 *  - Co che "day thu cong": bam nut roi click vao 1 comment de chi dinh vung chat
 *    (du phong khi tu do sai).
 *  - Overlay hien comment bat duoc + thong ke (tong, toc do/phut) de test go/no-go.
 *  - (Tuy chon) day comment sang agent local qua WebSocket ws://127.0.0.1:8787.
 *
 * Chi chay tren frame co the la phong live. Neu 1 trang co nhieu iframe,
 * script chay o tung frame; frame nao khong co chat thi khong bao gio khoa vung.
 */
(() => {
  'use strict';

  // Tranh inject 2 lan tren cung 1 frame
  if (window.__shopeeCR__) return;
  window.__shopeeCR__ = true;

  // Chi dung overlay o frame top de khoi ve nhieu panel chong nhau;
  // frame con van chay logic bat comment va bao len top qua postMessage.
  const IS_TOP = window.top === window.self;

  // ---------------------------------------------------------------------------
  // Cau hinh
  // ---------------------------------------------------------------------------
  const CFG = {
    minTextLen: 1,          // do dai text toi thieu de coi la comment
    maxTextLen: 200,        // comment thuong ngan; dai hon coi la UI khac
    scoreEvery: 1500,       // ms - dinh ky cham diem & chon lai vung chat
    lockAfterScore: 3,      // so lan node duoc them de ung vien du dieu kien
    switchIfBetter: 2.0,    // chi doi vung neu ung vien moi manh gap N lan
    dupWindowMs: 2500,      // chong lap: text giong nhau trong khoang nay bi bo
    wsUrl: 'ws://127.0.0.1:8787', // agent local (neu co); khong co thi bo qua
  };

  // ---------------------------------------------------------------------------
  // Trang thai
  // ---------------------------------------------------------------------------
  let running = true;
  let teachMode = false;
  let chatContainer = null;
  let containerSource = 'none';        // 'auto' | 'manual' | 'none'
  const scores = new Map();            // element cha -> so lan nhan node "giong comment"
  const recentText = new Map();        // text -> mốc thời gian phat gan nhat (chong lap)
  const emitTimes = [];                // timestamp cac comment da phat (tinh toc do)
  let total = 0;

  // ---------------------------------------------------------------------------
  // Tien ich
  // ---------------------------------------------------------------------------
  const now = () => Date.now();

  function isElement(n) {
    return n && n.nodeType === 1;
  }

  function visibleText(el) {
    if (!isElement(el)) return '';
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return '';
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t;
  }

  function looksLikeComment(el) {
    const t = visibleText(el);
    if (!t) return false;
    if (t.length < CFG.minTextLen || t.length > CFG.maxTextLen) return false;
    return true;
  }

  // Tu 1 node bat ky nam trong container, leo len den "dong comment" =
  // phan tu la con truc tiep cua container.
  function rowOf(node, container) {
    let el = node;
    while (el && el.parentElement && el.parentElement !== container) {
      el = el.parentElement;
    }
    return el && el.parentElement === container ? el : null;
  }

  // Tach username / noi dung (best-effort, chi de hien cho de nhin)
  function splitComment(rowEl, fullText) {
    // Nhieu layout: username nam o phan tu con dau tien, tach biet voi noi dung.
    const kids = rowEl.children;
    if (kids && kids.length >= 2) {
      const uname = visibleText(kids[0]);
      if (uname && uname.length <= 40 && fullText.startsWith(uname)) {
        const msg = fullText.slice(uname.length).replace(/^[:\s]+/, '').trim();
        if (msg) return { user: uname, text: msg };
      }
    }
    // Fallback: tach theo dau ':'
    const idx = fullText.indexOf(':');
    if (idx > 0 && idx <= 30) {
      return { user: fullText.slice(0, idx).trim(), text: fullText.slice(idx + 1).trim() };
    }
    return { user: '', text: fullText };
  }

  // ---------------------------------------------------------------------------
  // WebSocket bridge (tuy chon) — day comment sang agent local
  // ---------------------------------------------------------------------------
  let ws = null;
  let wsTimer = null;
  function connectWS() {
    if (!IS_TOP) return; // chi top frame ket noi, tranh nhieu ket noi
    try {
      ws = new WebSocket(CFG.wsUrl);
      ws.onopen = () => setBadge('bridge', 'da noi agent');
      ws.onclose = () => { setBadge('bridge', 'khong co agent'); scheduleReconnect(); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) {
      scheduleReconnect();
    }
  }
  function scheduleReconnect() {
    clearTimeout(wsTimer);
    wsTimer = setTimeout(connectWS, 5000);
  }
  function sendWS(payload) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(payload)); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Phat 1 comment (goi tu observer)
  // ---------------------------------------------------------------------------
  function emit(rowEl) {
    const fullText = visibleText(rowEl);
    if (!fullText) return;

    // Chong lap theo text trong cua so thoi gian
    const last = recentText.get(fullText);
    const ts = now();
    if (last && ts - last < CFG.dupWindowMs) return;
    recentText.set(fullText, ts);
    if (recentText.size > 400) {
      // don bot map cho nhe
      for (const [k, v] of recentText) {
        if (ts - v > CFG.dupWindowMs * 2) recentText.delete(k);
      }
    }

    const { user, text } = splitComment(rowEl, fullText);
    const record = { user, text, raw: fullText, at: ts };
    deliver(record);
  }

  // Dua record ve mot moi: top frame lo overlay + thong ke + cau WebSocket.
  // Frame con chi bat roi chuyen len top.
  function deliver(record) {
    if (IS_TOP) {
      handleRecord(record);
    } else {
      try { window.top.postMessage({ __shopeeCR__: true, record }, '*'); } catch (e) {}
    }
  }

  // Chi chay o top frame
  function handleRecord(record) {
    total++;
    emitTimes.push(record.at);
    renderComment(record);
    // eslint-disable-next-line no-console
    console.log('[ShopeeCR]', record.user ? record.user + ': ' : '', record.text);
    sendWS({ type: 'comment', ...record });
  }

  // ---------------------------------------------------------------------------
  // Observer chinh — vua cham diem vua bat comment
  // ---------------------------------------------------------------------------
  const observer = new MutationObserver((mutations) => {
    if (!running) return;
    const processedRows = new Set(); // tranh xu ly 1 dong nhieu lan trong 1 batch

    for (const m of mutations) {
      if (m.type !== 'childList' || m.addedNodes.length === 0) continue;
      const parent = m.target;
      if (!isElement(parent)) continue;

      for (const node of m.addedNodes) {
        if (!isElement(node)) continue;
        if (!looksLikeComment(node)) continue;

        // Cham diem cho phan tu cha (de tu do vung chat)
        scores.set(parent, (scores.get(parent) || 0) + 1);

        // Neu da khoa vung chat va node nam trong do -> phat comment
        if (chatContainer && chatContainer.contains(node)) {
          const row = rowOf(node, chatContainer);
          if (row && !processedRows.has(row)) {
            processedRows.add(row);
            emit(row);
          }
        }
      }
    }
  });

  function startObserving() {
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Cham diem dinh ky -> chon vung chat tot nhat
  // ---------------------------------------------------------------------------
  setInterval(() => {
    if (!running || containerSource === 'manual') return;

    let best = null, bestScore = 0, second = 0;
    for (const [el, sc] of scores) {
      if (!el.isConnected) { scores.delete(el); continue; }
      if (sc > bestScore) { second = bestScore; best = el; bestScore = sc; }
      else if (sc > second) { second = sc; }
    }

    if (best && bestScore >= CFG.lockAfterScore) {
      if (!chatContainer) {
        setContainer(best, 'auto');
      } else if (best !== chatContainer && bestScore >= (second || 1) * CFG.switchIfBetter) {
        // Chi doi khi ung vien moi vuot troi han
        setContainer(best, 'auto');
      }
    }

    // Giam diem dan de thich nghi (tranh khoa cung mai)
    for (const [el, sc] of scores) scores.set(el, sc * 0.6);
  }, CFG.scoreEvery);

  function setContainer(el, source) {
    chatContainer = el;
    containerSource = source;
    recentText.clear();
    flash(el);
    setBadge('container', source === 'manual' ? 'thu cong ✓' : 'tu do ✓');
    // eslint-disable-next-line no-console
    console.log('[ShopeeCR] Khoa vung chat (' + source + '):', el);
  }

  // ---------------------------------------------------------------------------
  // Che do day thu cong: click vao comment de chi dinh vung
  // ---------------------------------------------------------------------------
  function onTeachClick(e) {
    if (!teachMode) return;
    e.preventDefault();
    e.stopPropagation();
    teachMode = false;
    document.removeEventListener('click', onTeachClick, true);
    const clicked = e.target;
    // Phan tu click thuong la 1 comment; cha cua no la danh sach comment
    const container = clicked && clicked.parentElement ? clicked.parentElement : clicked;
    if (container) setContainer(container, 'manual');
    const btn = document.getElementById('cr-teach');
    if (btn) btn.textContent = '🎯 Chọn vùng chat';
  }

  function enableTeach() {
    teachMode = true;
    document.addEventListener('click', onTeachClick, true);
    const btn = document.getElementById('cr-teach');
    if (btn) btn.textContent = '👉 Click vào 1 comment...';
  }

  // ---------------------------------------------------------------------------
  // Overlay UI (chi ve o top frame)
  // ---------------------------------------------------------------------------
  let listEl = null;
  const badges = {};

  function buildOverlay() {
    const wrap = document.createElement('div');
    wrap.id = 'cr-panel';
    wrap.innerHTML = `
      <div id="cr-head">
        <span>🟢 Shopee Comment Reader</span>
        <span id="cr-min" title="Thu gọn">—</span>
      </div>
      <div id="cr-stats">
        <span>Tổng: <b id="cr-total">0</b></span>
        <span>Tốc độ: <b id="cr-rate">0</b>/phút</span>
        <span id="cr-badge-container" class="cr-badge">vùng: chưa dò</span>
        <span id="cr-badge-bridge" class="cr-badge">agent: —</span>
      </div>
      <div id="cr-list"></div>
      <div id="cr-btns">
        <button id="cr-toggle">⏸ Tạm dừng</button>
        <button id="cr-teach">🎯 Chọn vùng chat</button>
        <button id="cr-clear">🗑 Xóa</button>
        <button id="cr-copy">📋 Copy</button>
      </div>
      <div id="cr-hint">Mở phòng live Shopee bất kỳ. Nếu không tự bắt được comment sau ~15s, bấm "Chọn vùng chat" rồi click vào 1 comment.</div>
    `;
    document.documentElement.appendChild(wrap);
    injectStyles();

    listEl = wrap.querySelector('#cr-list');
    badges.container = wrap.querySelector('#cr-badge-container');
    badges.bridge = wrap.querySelector('#cr-badge-bridge');

    wrap.querySelector('#cr-min').onclick = () => wrap.classList.toggle('cr-collapsed');
    wrap.querySelector('#cr-toggle').onclick = (ev) => {
      running = !running;
      ev.target.textContent = running ? '⏸ Tạm dừng' : '▶ Chạy tiếp';
    };
    wrap.querySelector('#cr-teach').onclick = enableTeach;
    wrap.querySelector('#cr-clear').onclick = () => {
      if (listEl) listEl.innerHTML = '';
      captured.length = 0;
    };
    wrap.querySelector('#cr-copy').onclick = () => {
      const txt = captured.map(c => (c.user ? c.user + ': ' : '') + c.text).join('\n');
      navigator.clipboard && navigator.clipboard.writeText(txt);
      const b = wrap.querySelector('#cr-copy');
      b.textContent = '✓ Đã copy'; setTimeout(() => (b.textContent = '📋 Copy'), 1200);
    };
  }

  const captured = []; // luu de copy
  function renderComment(rec) {
    captured.push(rec);
    if (captured.length > 500) captured.shift();
    if (!listEl) return;
    const row = document.createElement('div');
    row.className = 'cr-item';
    row.innerHTML = rec.user
      ? `<span class="cr-user"></span><span class="cr-text"></span>`
      : `<span class="cr-text"></span>`;
    if (rec.user) row.querySelector('.cr-user').textContent = rec.user;
    row.querySelector('.cr-text').textContent = rec.text;
    listEl.appendChild(row);
    while (listEl.children.length > 80) listEl.removeChild(listEl.firstChild);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function setBadge(which, text) {
    const el = badges[which];
    if (el) el.textContent = (which === 'container' ? 'vùng: ' : 'agent: ') + text;
  }

  function flash(el) {
    try {
      const old = el.style.outline;
      el.style.outline = '3px solid #ee4d2d';
      setTimeout(() => { el.style.outline = old; }, 900);
    } catch (e) {}
  }

  // Cap nhat toc do/phut moi giay
  setInterval(() => {
    const cut = now() - 60000;
    while (emitTimes.length && emitTimes[0] < cut) emitTimes.shift();
    const t = document.getElementById('cr-total');
    const r = document.getElementById('cr-rate');
    if (t) t.textContent = String(total);
    if (r) r.textContent = String(emitTimes.length);
  }, 1000);

  function injectStyles() {
    const css = `
      #cr-panel{position:fixed;top:12px;right:12px;width:320px;z-index:2147483647;
        background:#1b1b1f;color:#eee;font:13px/1.4 'Segoe UI',system-ui,sans-serif;
        border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);overflow:hidden;
        border:1px solid #333}
      #cr-head{display:flex;justify-content:space-between;align-items:center;
        padding:8px 12px;background:#ee4d2d;color:#fff;font-weight:600;cursor:default}
      #cr-min{cursor:pointer;font-weight:700;padding:0 4px}
      #cr-stats{display:flex;flex-wrap:wrap;gap:6px 10px;padding:8px 12px;
        font-size:12px;border-bottom:1px solid #2a2a2e;background:#232327}
      #cr-stats b{color:#ffb199}
      .cr-badge{background:#2f2f34;border-radius:6px;padding:1px 6px;font-size:11px}
      #cr-list{height:260px;overflow-y:auto;padding:6px 10px}
      .cr-item{padding:3px 0;border-bottom:1px dashed #2a2a2e;word-break:break-word}
      .cr-user{color:#7ec8ff;font-weight:600;margin-right:5px}
      .cr-user::after{content:':'}
      .cr-text{color:#eaeaea}
      #cr-btns{display:flex;gap:6px;padding:8px 10px;background:#232327;flex-wrap:wrap}
      #cr-btns button{flex:1;min-width:70px;background:#33333a;color:#eee;border:1px solid #44444c;
        border-radius:6px;padding:5px 6px;font-size:12px;cursor:pointer}
      #cr-btns button:hover{background:#40404a}
      #cr-hint{padding:6px 12px 10px;font-size:11px;color:#999}
      #cr-panel.cr-collapsed #cr-list,#cr-panel.cr-collapsed #cr-btns,
      #cr-panel.cr-collapsed #cr-hint,#cr-panel.cr-collapsed #cr-stats{display:none}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  // Nhan comment tu iframe con
  if (IS_TOP) {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d && d.__shopeeCR__ && d.record) handleRecord(d.record);
    });
  }

  // ---------------------------------------------------------------------------
  // Khoi dong
  // ---------------------------------------------------------------------------
  function boot() {
    if (IS_TOP) buildOverlay();
    startObserving();
    connectWS();
    // eslint-disable-next-line no-console
    console.log('[ShopeeCR] Da chay. Frame top =', IS_TOP, '| URL =', location.href);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
