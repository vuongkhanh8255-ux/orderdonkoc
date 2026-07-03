// src/components/LiveAiHubTab.jsx
// Gom Live AI về 1 chỗ + trang QUY TRÌNH dẫn đường (ai mở lên cũng biết làm gì, theo thứ tự nào):
//   🏠 Quy trình (mặc định) — 4 bước to rõ + tiến độ THẬT từ DB + nút nhảy đúng tab
//   ① Kho câu hỏi (Module 4)  ② Xưởng Clip (Module 5)  ③ Studio (ngày live)
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '../supabaseClient';

const LivestreamAiTab = lazy(() => import('./LivestreamAiTab'));
const LiveClipFactoryTab = lazy(() => import('./LiveClipFactoryTab'));
const LiveStudioTab = lazy(() => import('./LiveStudioTab'));

const ORANGE = '#ff6a2c';
const TABS = [
  { key: 'home',    icon: '🏠', name: 'Quy trình' },
  { key: 'faq',     icon: '📝', name: '① Kho câu hỏi' },
  { key: 'factory', icon: '🏭', name: '② Xưởng Clip' },
  { key: 'studio',  icon: '🎛️', name: '③ Studio' },
];

export default function LiveAiHubTab({ initial = 'home' }) {
  const [tab, setTab] = useState(initial);
  return (
    <div>
      {/* Thanh tab — đánh số theo thứ tự làm việc */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: 8 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem',
              background: tab === t.key ? ORANGE : 'transparent', color: tab === t.key ? '#fff' : '#475569',
            }}>
            <span>{t.icon}</span> {t.name}
          </button>
        ))}
      </div>
      <Suspense fallback={<div style={{ padding: 30, color: '#94a3b8' }}>⏳ Đang tải…</div>}>
        {tab === 'home' && <FlowHome go={setTab} />}
        {tab === 'faq' && <LivestreamAiTab />}
        {tab === 'factory' && <LiveClipFactoryTab />}
        {tab === 'studio' && <LiveStudioTab />}
      </Suspense>
    </div>
  );
}

// ── 🏠 Trang QUY TRÌNH — nhìn 10 giây là biết đang ở đâu, làm gì tiếp ──
function FlowHome({ go }) {
  const [stat, setStat] = useState(null); // { nIntents, nClipDone, nPath, total }
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: intents }, { data: prod }] = await Promise.all([
        supabase.from('livestream_intents').select('id, clip, enabled'),
        supabase.from('livestream_clip_prod').select('intent_id, status'),
      ]);
      if (!alive) return;
      const all = intents || [];
      setStat({
        nIntents: all.filter(i => i.enabled).length,
        total: all.length,
        nClipDone: (prod || []).filter(p => p.status === 'xong').length,
        nPath: all.filter(i => String(i.clip || '').trim()).length,
      });
    })();
    return () => { alive = false; };
  }, []);

  const s = stat || { nIntents: 0, total: 0, nClipDone: 0, nPath: 0 };
  // Trạng thái từng bước: xong (xanh) / đang dở (cam) / chưa (xám)
  const st1 = s.total > 0 ? 'done' : 'todo';
  const st2 = s.nClipDone >= s.total && s.total > 0 ? 'done' : s.nClipDone > 0 ? 'doing' : 'todo';
  const st3 = s.nPath >= s.total && s.total > 0 ? 'done' : s.nPath > 0 ? 'doing' : 'todo';

  const STEPS = [
    {
      n: 1, icon: '📝', title: 'Tạo câu hỏi', state: st1, tab: 'faq',
      desc: 'Thêm các câu người xem hay hỏi khi live (giá? ship? voucher? size?…) kèm TỪ KHOÁ để máy nhận diện comment.',
      progress: stat ? `${s.total} câu hỏi (${s.nIntents} đang bật)` : '…',
      cta: 'Vào Kho câu hỏi',
    },
    {
      n: 2, icon: '🏭', title: 'Sản xuất clip trả lời', state: st2, tab: 'factory',
      desc: 'Mỗi câu hỏi làm 1 clip: ghi đại ý → ✨ AI viết kịch bản + prompt → up ảnh sản phẩm thật → 🪄 tạo ảnh → 🎬 tạo video.',
      progress: stat ? `${s.nClipDone}/${s.total} clip đã render xong` : '…',
      cta: 'Vào Xưởng Clip',
    },
    {
      n: 3, icon: '💾', title: 'Tải clip về máy phát live', state: st3, tab: 'factory',
      desc: 'Tải video xong về MÁY CHẠY OBS, lưu vào 1 thư mục cố định (VD C:/live-clips/), rồi điền đường dẫn file vào ô ④ của từng câu hỏi.',
      progress: stat ? `${s.nPath}/${s.total} câu hỏi đã có đường dẫn clip` : '…',
      cta: 'Điền ở Xưởng Clip (ô ④)',
    },
    {
      n: 4, icon: '🔴', title: 'Ngày live — bật máy chạy', state: 'todo', tab: 'studio',
      desc: 'Mở OBS → chạy agent trên máy phát live → bắt đầu live trong Shopee Seller Center. Làm đúng checklist bên dưới là chạy.',
      progress: 'Checklist 5 bước ở cuối trang',
      cta: 'Mở Studio điều khiển',
    },
  ];
  const C = { done: { bd: '#86efac', bg: '#f0fdf4', tag: '#166534', tagBg: '#dcfce7', tagTxt: 'Xong ✓' }, doing: { bd: '#fdba74', bg: '#fff7ed', tag: '#9a3412', tagBg: '#ffedd5', tagTxt: 'Đang làm' }, todo: { bd: '#e2e8f0', bg: '#fff', tag: '#64748b', tagBg: '#f1f5f9', tagTxt: 'Chưa làm' } };

  const card = { background: '#fff', borderRadius: 16, border: '1px solid #eef0f3', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      {/* Ý tưởng 1 câu — chữ to */}
      <div style={{ ...card, padding: '22px 26px', marginBottom: 18, background: 'linear-gradient(135deg,#fff7ed,#fff)', border: '1.5px solid #fed7aa' }}>
        <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#1e293b' }}>🤖 Live AI — máy bán hàng thay mình trên Shopee Live</div>
        <div style={{ fontSize: '1rem', color: '#475569', marginTop: 8, lineHeight: 1.65 }}>
          Lúc vắng người hỏi, máy <b>phát clip giới thiệu sản phẩm</b> (vòng lặp). Có người comment hỏi giá / ship / voucher…
          → máy <b>tự nhận diện và bật đúng clip trả lời</b>, xong quay lại vòng lặp. Người xem tưởng có host thật đang tư vấn.
        </div>
      </div>

      {/* 4 bước — nhìn là biết làm gì, bấm là nhảy đúng chỗ */}
      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', margin: '0 0 10px 4px' }}>👇 Làm theo thứ tự 4 bước</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginBottom: 22 }}>
        {STEPS.map(step => {
          const c = C[step.state];
          return (
            <div key={step.n} style={{ ...card, border: `1.5px solid ${c.bd}`, background: c.bg, padding: 18, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.05rem', flex: 'none' }}>{step.n}</span>
                <span style={{ fontSize: '1.35rem' }}>{step.icon}</span>
                <span style={{ marginLeft: 'auto', background: c.tagBg, color: c.tag, borderRadius: 20, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 800 }}>{c.tagTxt}</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: '1.08rem', color: '#0f172a', marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.6, flex: 1 }}>{step.desc}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: ORANGE, margin: '10px 0' }}>📌 {step.progress}</div>
              <button onClick={() => go(step.tab)}
                style={{ padding: '11px 14px', borderRadius: 10, border: 'none', background: ORANGE, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                {step.cta} →
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        {/* Chuẩn bị 1 lần */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a', marginBottom: 10 }}>🔑 Chuẩn bị 1 LẦN (trước khi dùng nút tự động)</div>
          <ol style={{ margin: 0, paddingLeft: 22, fontSize: '0.95rem', color: '#334155', lineHeight: 2 }}>
            <li>Lấy key <b>OpenAI</b> (platform.openai.com → API keys, nạp ~$5-10 + Verify Organization).</li>
            <li>Lấy key <b>HeyGen</b> (Settings → API, nạp ví Pay-As-You-Go ~$10-20).</li>
            <li>Vào <b>Vercel → orderdonkoc → Settings → Environment Variables</b>: thêm <code>OPENAI_API_KEY</code> + <code>HEYGEN_API_KEY</code> → Redeploy.</li>
          </ol>
          <div style={{ marginTop: 10, fontSize: '0.88rem', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, padding: '9px 12px' }}>
            Chưa cắm key thì các nút ✨ / 🪄 / 🎬 sẽ báo "Chưa cấu hình…API_KEY" — không hư gì, cắm xong là chạy.
          </div>
        </div>

        {/* Checklist ngày live */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a', marginBottom: 10 }}>🔴 Checklist NGÀY LIVE (5 bước, làm đúng thứ tự)</div>
          <ol style={{ margin: 0, paddingLeft: 22, fontSize: '0.95rem', color: '#334155', lineHeight: 2 }}>
            <li>Mở <b>OBS</b> — có 2 scene <code>IDLE</code> / <code>ANSWER</code>, clip vòng lặp đang chạy ở IDLE, WebSocket đang bật (port 4455).</li>
            <li>Máy phát live mở terminal: <code>cd livestream-ai/agent</code> → gõ <b><code>npm start</code></b> (⚠️ KHÔNG phải --mock).</li>
            <li>Chờ thấy 2 dòng: <code>[Config] Nguon: Supabase</code> + <code>[OBS] Da ket noi</code>.</li>
            <li>Vào <b>Shopee Seller Center</b> bắt đầu live (OBS đẩy RTMP: dán server + stream key của Shopee).</li>
            <li>Kết thúc: dừng live → OBS Stop Streaming → terminal Ctrl+C.</li>
          </ol>
          <div style={{ marginTop: 10, fontSize: '0.88rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 12px' }}>
            Gặp lỗi (khung đen, không nối OBS…) → mở file <b>livestream-ai/QUY-TRINH-VA-KE-HOACH.md</b> mục "XỬ LÝ SỰ CỐ" tra 30 giây là ra.
          </div>
        </div>
      </div>
    </div>
  );
}
