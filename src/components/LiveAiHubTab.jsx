// src/components/LiveAiHubTab.jsx
// Gom 3 mảng Live AI về 1 chỗ (đỡ tách 3 mục menu rời):
//   ① Kho câu hỏi (Module 4)  ② Xưởng Clip (Module 5)  ③ Live AI Studio
// Mỗi tab con lazy-load riêng — mở tab nào mới tải code tab đó.
import { useState, lazy, Suspense } from 'react';

const LivestreamAiTab = lazy(() => import('./LivestreamAiTab'));
const LiveClipFactoryTab = lazy(() => import('./LiveClipFactoryTab'));
const LiveStudioTab = lazy(() => import('./LiveStudioTab'));

const ORANGE = '#ff6a2c';
const TABS = [
  { key: 'faq',     icon: '🤖', name: 'Kho câu hỏi', sub: 'Module 4' },
  { key: 'factory', icon: '🏭', name: 'Xưởng Clip',  sub: 'Module 5' },
  { key: 'studio',  icon: '🎛️', name: 'Studio',      sub: 'điều khiển live' },
];

export default function LiveAiHubTab({ initial = 'faq' }) {
  const [tab, setTab] = useState(initial);
  return (
    <div>
      {/* Thanh tab con — dính trên đầu để chuyển qua lại nhanh */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: 8 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 9,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.88rem',
              background: tab === t.key ? ORANGE : 'transparent', color: tab === t.key ? '#fff' : '#475569',
            }}>
            <span>{t.icon}</span> {t.name}
            <span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.75 }}>{t.sub}</span>
          </button>
        ))}
      </div>
      <Suspense fallback={<div style={{ padding: 30, color: '#94a3b8' }}>⏳ Đang tải…</div>}>
        {tab === 'faq' && <LivestreamAiTab />}
        {tab === 'factory' && <LiveClipFactoryTab />}
        {tab === 'studio' && <LiveStudioTab />}
      </Suspense>
    </div>
  );
}
