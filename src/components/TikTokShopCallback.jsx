import React from 'react';

const TikTokShopCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const entries = Array.from(params.entries());
  const code = params.get('code') || params.get('auth_code');
  const error = params.get('error') || params.get('error_description');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#f6f7f9',
      fontFamily: "'Outfit', sans-serif",
      color: '#111827'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 680,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 28,
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)'
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', fontWeight: 900, fontSize: 22, marginBottom: 16 }}>
          ♪
        </div>
        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#0f172a' }}>
          TikTok Shop Callback
        </h1>
        <p style={{ margin: '8px 0 18px', color: '#64748b', fontSize: '0.92rem', lineHeight: 1.55 }}>
          Đường dẫn nhận ủy quyền đã sẵn sàng. Sau bước này mình sẽ nối backend để đổi authorization code lấy access token và lưu vào Supabase.
        </p>

        <div style={{
          borderRadius: 14,
          border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
          background: error ? '#fef2f2' : '#f0fdf4',
          padding: 14,
          marginBottom: 16,
          color: error ? '#dc2626' : '#16a34a',
          fontWeight: 800
        }}>
          {error ? 'TikTok trả về lỗi ủy quyền' : code ? 'Đã nhận authorization code từ TikTok' : 'Callback URL hoạt động'}
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 10 }}>
            Query params
          </div>
          {entries.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {entries.map(([key, value]) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, fontSize: '0.84rem' }}>
                  <span style={{ color: '#475569', fontWeight: 800 }}>{key}</span>
                  <span style={{ color: '#0f172a', wordBreak: 'break-word', fontFamily: 'monospace' }}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>
              Chưa có query param. Đây là bình thường nếu mày mở URL trực tiếp để test.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TikTokShopCallback;
