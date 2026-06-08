// src/components/ChatInboxTab.jsx
// Mockup — TikTok Shop Chat Inbox (unified CS inbox)
import React, { useState } from 'react';

// ── Mock data ────────────────────────────────────────────────────────────────
const SHOPS = [
  { id: 1, name: 'Body Miss Việt Nam', platform: 'tiktok', color: '#3b82f6' },
  { id: 2, name: 'eHerb Hồ Chí Minh', platform: 'tiktok', color: '#10b981' },
  { id: 3, name: 'Milaganics Việt Nam', platform: 'tiktok', color: '#8b5cf6' },
  { id: 4, name: 'Moaw Moaws Việt Nam', platform: 'tiktok', color: '#ff7a30' },
  { id: 5, name: 'eHerb Việt Nam', platform: 'tiktok', color: '#eab308' },
];

const MOCK_CONVERSATIONS = [
  { id: 1, shopId: 1, buyer: 'Nguyễn Thị Mai', avatar: 'NM', lastMsg: 'Em ơi cho chị hỏi sản phẩm này có ship COD không ạ?', time: '2 phút trước', unread: 2, status: 'active', orderId: '#TT26050001' },
  { id: 2, shopId: 1, buyer: 'Trần Văn Hùng', avatar: 'TH', lastMsg: 'Đã nhận hàng, cảm ơn shop nhé!', time: '15 phút trước', unread: 0, status: 'resolved', orderId: '#TT26050002' },
  { id: 3, shopId: 2, buyer: 'Lê Hoàng Anh', avatar: 'LA', lastMsg: 'Sản phẩm này còn hàng không ạ? Em muốn mua 3 hộp', time: '28 phút trước', unread: 1, status: 'active', orderId: null },
  { id: 4, shopId: 3, buyer: 'Phạm Thu Trang', avatar: 'PT', lastMsg: 'Shop ơi em đặt nhầm size, đổi được không ạ?', time: '45 phút trước', unread: 3, status: 'active', orderId: '#TT26049988' },
  { id: 5, shopId: 4, buyer: 'Đỗ Minh Tuấn', avatar: 'DT', lastMsg: 'OK em cảm ơn shop, em sẽ đặt thêm ạ', time: '1 giờ trước', unread: 0, status: 'resolved', orderId: '#TT26049972' },
  { id: 6, shopId: 1, buyer: 'Vũ Thị Lan', avatar: 'VL', lastMsg: 'Cho em hỏi mã giảm giá còn dùng được không ạ?', time: '1 giờ trước', unread: 1, status: 'active', orderId: null },
  { id: 7, shopId: 5, buyer: 'Hoàng Đức Nam', avatar: 'HN', lastMsg: 'Em đã chuyển khoản rồi nhé shop', time: '2 giờ trước', unread: 0, status: 'active', orderId: '#TT26049965' },
  { id: 8, shopId: 2, buyer: 'Ngô Thanh Hà', avatar: 'NH', lastMsg: 'Hàng bao lâu thì tới Hà Nội vậy shop?', time: '3 giờ trước', unread: 0, status: 'active', orderId: '#TT26049951' },
  { id: 9, shopId: 3, buyer: 'Bùi Quang Vinh', avatar: 'BV', lastMsg: 'Review 5 sao cho shop nha, sản phẩm xài tốt lắm', time: '4 giờ trước', unread: 0, status: 'resolved', orderId: '#TT26049940' },
  { id: 10, shopId: 4, buyer: 'Cao Thị Hương', avatar: 'CH', lastMsg: 'Em muốn đổi sang màu hồng được không ạ?', time: '5 giờ trước', unread: 0, status: 'active', orderId: '#TT26049933' },
];

const MOCK_MESSAGES = [
  { id: 1, from: 'buyer', text: 'Shop ơi, em muốn hỏi về sản phẩm serum Vitamin C ạ', time: '10:02' },
  { id: 2, from: 'buyer', text: 'Sản phẩm này có ship COD không ạ?', time: '10:03' },
  { id: 3, from: 'agent', text: 'Chào chị ạ! Dạ sản phẩm Serum Vitamin C của shop hiện đang có sẵn và hỗ trợ ship COD toàn quốc ạ 😊', time: '10:05' },
  { id: 4, from: 'agent', text: 'Chị đặt hàng qua TikTok Shop sẽ được miễn phí vận chuyển cho đơn từ 150k ạ', time: '10:05' },
  { id: 5, from: 'buyer', text: 'Vậy em mua 2 lọ được giảm giá không ạ?', time: '10:08' },
  { id: 6, from: 'agent', text: 'Dạ hiện shop đang có combo 2 lọ giảm 15% chị ơi. Chị thêm vào giỏ hàng sẽ tự động áp dụng ạ ❤️', time: '10:10' },
  { id: 7, from: 'buyer', text: 'Em ơi cho chị hỏi sản phẩm này có ship COD không ạ?', time: '10:15' },
];

const QUICK_REPLIES = [
  'Cảm ơn bạn đã liên hệ shop ạ!',
  'Dạ sản phẩm hiện đang có sẵn ạ',
  'Shop hỗ trợ ship COD toàn quốc ạ',
  'Đơn hàng sẽ được giao trong 2-4 ngày ạ',
];

// ── Component ────────────────────────────────────────────────────────────────
export default function ChatInboxTab() {
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedConvo, setSelectedConvo] = useState(MOCK_CONVERSATIONS[0]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [msgInput, setMsgInput] = useState('');

  const filteredConvos = MOCK_CONVERSATIONS.filter(c => {
    if (selectedShop && c.shopId !== Number(selectedShop)) return false;
    if (filterStatus === 'unread' && c.unread === 0) return false;
    if (filterStatus === 'active' && c.status !== 'active') return false;
    if (filterStatus === 'resolved' && c.status !== 'resolved') return false;
    if (searchText && !c.buyer.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const getShop = (id) => SHOPS.find(s => s.id === id);
  const totalUnread = MOCK_CONVERSATIONS.reduce((s, c) => s + c.unread, 0);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 900 }}>💬 Chat Inbox</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
            Quản lý tin nhắn khách hàng từ tất cả shop · <strong style={{ color: '#ff6a2c' }}>{totalUnread}</strong> tin chưa đọc
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {SHOPS.map(s => (
              <div key={s.id} style={{
                width: 8, height: 8, borderRadius: '50%', background: s.color,
                boxShadow: '0 0 0 2px #fff, 0 0 0 3px ' + s.color + '40',
              }} title={s.name} />
            ))}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>{SHOPS.length} shop · TikTok</span>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{
        display: 'grid', gridTemplateColumns: '340px 1fr 280px', gap: 0,
        background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
        height: 'calc(100vh - 220px)', minHeight: 560, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
      }}>

        {/* ── Left: Conversation List ──────────────────────────────────────── */}
        <div style={{ borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
          {/* Filters */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              type="text" placeholder="🔍 Tìm khách hàng..."
              value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <select value={selectedShop} onChange={e => setSelectedShop(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.74rem', fontWeight: 600, fontFamily: 'inherit', color: '#374151', background: '#fff', cursor: 'pointer' }}>
                <option value="">Tất cả shop</option>
                {SHOPS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 0, marginTop: 8, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
              {[
                { key: 'all', label: 'Tất cả' },
                { key: 'unread', label: `Chưa đọc (${totalUnread})` },
                { key: 'active', label: 'Đang xử lý' },
                { key: 'resolved', label: 'Đã xong' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterStatus(f.key)}
                  style={{ flex: 1, padding: '5px 4px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, border: 'none', background: filterStatus === f.key ? '#fff' : 'transparent', color: filterStatus === f.key ? '#ff6a2c' : '#64748b', cursor: 'pointer', boxShadow: filterStatus === f.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConvos.map(c => {
              const shop = getShop(c.shopId);
              const isSelected = selectedConvo?.id === c.id;
              return (
                <div key={c.id} onClick={() => setSelectedConvo(c)}
                  style={{
                    padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                    background: isSelected ? '#fff7ed' : 'transparent',
                    borderLeft: isSelected ? '3px solid #ff6a2c' : '3px solid transparent',
                    transition: 'all 0.12s',
                  }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${shop?.color || '#94a3b8'}90, ${shop?.color || '#94a3b8'})`,
                      display: 'grid', placeItems: 'center', color: '#fff', fontSize: '0.78rem', fontWeight: 800,
                      position: 'relative',
                    }}>
                      {c.avatar}
                      {c.unread > 0 && (
                        <span style={{
                          position: 'absolute', top: -2, right: -2, width: 18, height: 18,
                          background: '#ef4444', borderRadius: '50%', color: '#fff', fontSize: '0.6rem',
                          fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #fff',
                        }}>{c.unread}</span>
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>{c.buyer}</span>
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{c.time}</span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: c.unread > 0 ? '#374151' : '#94a3b8', fontWeight: c.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.lastMsg}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: shop?.color + '15', color: shop?.color, fontWeight: 700 }}>
                          {shop?.name?.split(' ')[0]}
                        </span>
                        {c.orderId && (
                          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                            {c.orderId}
                          </span>
                        )}
                        {c.status === 'resolved' && (
                          <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>✓ Xong</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredConvos.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Không có cuộc hội thoại nào</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Chat Area ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {selectedConvo ? (
            <>
              {/* Chat header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${getShop(selectedConvo.shopId)?.color}90, ${getShop(selectedConvo.shopId)?.color})`,
                    display: 'grid', placeItems: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 800,
                  }}>{selectedConvo.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{selectedConvo.buyer}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {getShop(selectedConvo.shopId)?.name} {selectedConvo.orderId && `· ${selectedConvo.orderId}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                    📋 Xem đơn
                  </button>
                  <button style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: selectedConvo.status === 'resolved' ? '#f1f5f9' : '#dcfce7', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', color: selectedConvo.status === 'resolved' ? '#64748b' : '#16a34a' }}>
                    {selectedConvo.status === 'resolved' ? '↩ Mở lại' : '✓ Đánh dấu xong'}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#fafbfc' }}>
                {/* Date separator */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', background: '#f1f5f9', padding: '4px 14px', borderRadius: 20, fontWeight: 600 }}>Hôm nay</span>
                </div>

                {MOCK_MESSAGES.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: m.from === 'agent' ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}>
                    <div style={{
                      maxWidth: '65%', padding: '10px 16px', borderRadius: 16,
                      background: m.from === 'agent' ? '#ff6a2c' : '#fff',
                      color: m.from === 'agent' ? '#fff' : '#0f172a',
                      border: m.from === 'agent' ? 'none' : '1px solid #e5e7eb',
                      borderBottomRightRadius: m.from === 'agent' ? 4 : 16,
                      borderBottomLeftRadius: m.from === 'agent' ? 16 : 4,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>{m.text}</div>
                      <div style={{ fontSize: '0.6rem', marginTop: 4, opacity: 0.6, textAlign: 'right' }}>{m.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick replies */}
              <div style={{ padding: '8px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {QUICK_REPLIES.map((q, i) => (
                  <button key={i} onClick={() => setMsgInput(q)}
                    style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.68rem', color: '#64748b', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Input area */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}>
                <button style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '1rem', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📎</button>
                <input
                  type="text" placeholder="Nhập tin nhắn..."
                  value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: 24, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit' }}
                />
                <button style={{
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: '#ff6a2c', color: '#fff', cursor: 'pointer', fontSize: '1.1rem',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(255,106,44,0.3)',
                }}>➤</button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Chọn cuộc hội thoại</div>
                <div style={{ fontSize: '0.78rem', marginTop: 4 }}>Chọn một cuộc trò chuyện để bắt đầu</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Customer Info ──────────────────────────────────────────── */}
        {selectedConvo && (
          <div style={{ borderLeft: '1px solid #f1f5f9', padding: '20px', overflowY: 'auto', background: '#fafbfc' }}>
            {/* Customer profile */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px',
                background: `linear-gradient(135deg, ${getShop(selectedConvo.shopId)?.color}90, ${getShop(selectedConvo.shopId)?.color})`,
                display: 'grid', placeItems: 'center', color: '#fff', fontSize: '1.1rem', fontWeight: 800,
              }}>{selectedConvo.avatar}</div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{selectedConvo.buyer}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Khách hàng TikTok Shop</div>
            </div>

            {/* Info cards */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Thông tin</div>
              {[
                ['Shop', getShop(selectedConvo.shopId)?.name],
                ['Đơn hàng', selectedConvo.orderId || 'Chưa có'],
                ['Trạng thái', selectedConvo.status === 'resolved' ? '✅ Đã xong' : '🟡 Đang xử lý'],
                ['Nền tảng', '♪ TikTok Shop'],
              ].map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 8 }}>
                  <span style={{ color: '#64748b' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: '#0f172a', textAlign: 'right', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Order info */}
            {selectedConvo.orderId && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Đơn hàng gần nhất</div>
                <div style={{ background: '#fff7ed', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#ff6a2c', marginBottom: 4 }}>{selectedConvo.orderId}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Serum Vitamin C 30ml × 2</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Tổng: <strong style={{ color: '#0f172a' }}>485.000đ</strong></div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>Đã thanh toán</span>
                    <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#3b82f6', fontWeight: 700 }}>Đang giao</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Nhãn</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Khách quen', 'VIP', 'Hỏi COD'].map((tag, i) => (
                  <span key={i} style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{tag}</span>
                ))}
                <span style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, border: '1px dashed #cbd5e1', color: '#94a3b8', cursor: 'pointer' }}>+ Thêm</span>
              </div>
            </div>

            {/* Notes */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Ghi chú nội bộ</div>
              <textarea
                placeholder="Ghi chú về khách hàng..."
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.76rem', fontFamily: 'inherit', resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
        💡 Tính năng Chat Inbox đang trong giai đoạn phát triển · Dữ liệu hiển thị là mockup · Đang chờ TikTok duyệt Customer Service API
      </div>
    </div>
  );
}
