// src/components/CrmCareTab.jsx — CRM Module 5: Quy trình chăm sóc khách hàng
// 7 quy trình/kịch bản (crm_care_docs) — chọn bên trái, soạn nội dung bên phải, lưu vào DB.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const FONT = "'Be Vietnam Pro','Inter',system-ui,-apple-system,sans-serif";
const ORANGE = '#ff6a2c';
const card = { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const btn = { padding: '9px 18px', borderRadius: 9, border: 'none', background: ORANGE, color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', fontFamily: FONT };

const ICONS = {
  goi_dien: '📞', nhan_tin: '💬', khach_moi: '🌱', mua_lai: '🔄',
  khieu_nai: '⚠️', follow_up: '📌', vip: '👑',
};
// Gợi ý khung nội dung cho từng quy trình — bấm để chèn, rồi sửa lại theo thực tế công ty.
const TEMPLATES = {
  goi_dien: `1. MỞ ĐẦU (10s)
- Chào: "Dạ em chào anh/chị {tên}, em {tên NV} bên {công ty} ạ."
- Xác nhận đúng người + xin phép 1-2 phút.

2. KHAI THÁC NHU CẦU
- Anh/chị đang dùng sản phẩm nào cho khách?
- Tần suất nhập hàng? Số lượng mỗi lần?

3. GIỚI THIỆU / BÁO GIÁ
- Nêu 1-2 sản phẩm phù hợp + chính sách combo.

4. XỬ LÝ TỪ CHỐI
- "Để em gửi bảng giá qua Zalo anh/chị tham khảo trước nhé."

5. CHỐT
- Xác nhận đơn / hẹn ngày gọi lại (ghi vào ghi chú KH).`,
  nhan_tin: `MẪU 1 — Chào khách mới:
"Dạ em chào anh/chị, em {tên NV} bên {công ty}. Em gửi anh/chị bảng giá sỉ + chương trình combo tháng này ạ 🌿"

MẪU 2 — Follow-up sau khi gửi bảng giá (sau 1-2 ngày):
"Dạ anh/chị xem bảng giá chưa ạ? Có sản phẩm nào anh/chị cần em tư vấn thêm không ạ?"

MẪU 3 — Nhắc mua lại:
"Dạ đợt trước anh/chị lấy {sản phẩm}, chắc cũng sắp hết rồi ạ. Tháng này bên em đang có {ưu đãi} ạ."`,
  khach_moi: `BƯỚC 1 — Ngày 0: Lưu thông tin KH vào Module 2 (tên, SĐT, tỉnh, phân loại tệp).
BƯỚC 2 — Ngày 0: Gửi bảng giá + catalog (Module 4).
BƯỚC 3 — Ngày 1-2: Gọi điện tư vấn theo kịch bản gọi điện.
BƯỚC 4 — Ngày 3-5: Nhắn tin follow-up nếu chưa phản hồi.
BƯỚC 5 — Sau khi chốt đơn: tạo đơn ở Module 3, theo dõi giao hàng.
BƯỚC 6 — Sau giao 3 ngày: hỏi thăm chất lượng, xin feedback.`,
  mua_lai: `- Rà khách có đơn gần nhất > 30 ngày (Module 2, cột "Ngày mua gần nhất").
- Ưu tiên khách phân loại "Mua lại" và "VIP".
- Nhắn tin nhắc mua lại kèm ưu đãi combo đang chạy.
- Không phản hồi sau 2 lần nhắn → gọi điện.
- Vẫn không phản hồi sau 60 ngày → chuyển nhóm "cần chăm sóc lại".`,
  khieu_nai: `BƯỚC 1 — TIẾP NHẬN: ghi nhận đầy đủ (mã đơn, mã vận đơn, ảnh/video lỗi).
BƯỚC 2 — XÁC MINH: đối chiếu đơn ở Module 3 + tình trạng giao hàng.
BƯỚC 3 — PHÂN LOẠI: lỗi sản phẩm / lỗi vận chuyển / nhầm hàng / kỳ vọng khác.
BƯỚC 4 — XỬ LÝ: đổi hàng - hoàn tiền - tặng bù theo chính sách.
BƯỚC 5 — PHẢN HỒI KH trong 24h.
BƯỚC 6 — GHI NHẬN: cập nhật ghi chú KH; nếu khách gian lận/bom hàng → đưa vào Module 6 Blacklist.`,
  follow_up: `- Sau giao 3 ngày: hỏi khách đã nhận hàng, chất lượng ổn không.
- Sau 7 ngày: hỏi phản hồi từ khách của họ (spa/mini mart bán lại).
- Sau 20-30 ngày: nhắc nhập lại hàng.
- Ghi lại toàn bộ tương tác vào ghi chú khách hàng.`,
  vip: `Tiêu chuẩn VIP: trên 5 đơn HOẶC tổng chi tiêu trên 10 triệu.

- Có nhân sự phụ trách cố định, phản hồi trong 1h giờ hành chính.
- Ưu tiên giữ giá + báo trước khi có thay đổi bảng giá.
- Tặng quà/mẫu thử dịp lễ, sinh nhật.
- Gọi điện chăm sóc định kỳ mỗi tháng.
- Ưu tiên xử lý khiếu nại trước.`,
};

export default function CrmCareTab({ currentUser }) {
  const [docs, setDocs] = useState([]);
  const [sel, setSel] = useState(null);        // doc_key đang chọn
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('crm_care_docs').select('*').order('sort_order');
    const list = data || [];
    setDocs(list);
    setSel(prev => prev || list[0]?.doc_key || null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cur = docs.find(d => d.doc_key === sel) || null;
  // Đổi tài liệu đang chọn → nạp lại nội dung vào ô soạn
  useEffect(() => { setDraft(cur?.content || ''); setMsg(''); }, [sel, cur?.id]);

  const dirty = !!cur && draft !== (cur.content || '');

  const save = async () => {
    if (!cur) return;
    setSaving(true);
    const { error } = await supabase.from('crm_care_docs')
      .update({ content: draft, updated_at: new Date().toISOString(), updated_by: currentUser?.username || currentUser?.name || null })
      .eq('doc_key', cur.doc_key);
    setSaving(false);
    if (error) { setMsg('⚠️ Lỗi lưu: ' + error.message); return; }
    setMsg('✅ Đã lưu.');
    setDocs(ds => ds.map(d => d.doc_key === cur.doc_key ? { ...d, content: draft, updated_at: new Date().toISOString() } : d));
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>📖 Quy trình chăm sóc khách hàng</h3>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
          Kịch bản & quy trình chuẩn cho cả team. Chọn mục bên trái để xem/sửa nội dung.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Danh sách quy trình */}
        <div style={{ ...card, padding: 8 }}>
          {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải…</div>}
          {!loading && docs.map(d => {
            const active = d.doc_key === sel;
            const filled = !!(d.content || '').trim();
            return (
              <button key={d.doc_key} onClick={() => setSel(d.doc_key)} style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                padding: '11px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: FONT,
                background: active ? '#fff7ed' : 'transparent',
                color: active ? '#9a3412' : '#334155',
                fontWeight: active ? 800 : 600, fontSize: '0.84rem', marginBottom: 2,
              }}>
                <span style={{ fontSize: '1rem' }}>{ICONS[d.doc_key] || '📄'}</span>
                <span style={{ flex: 1 }}>{d.title}</span>
                <span title={filled ? 'Đã có nội dung' : 'Chưa có nội dung'}
                  style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: filled ? '#16a34a' : '#e2e8f0' }} />
              </button>
            );
          })}
        </div>

        {/* Soạn nội dung */}
        <div style={{ ...card, padding: 18 }}>
          {!cur ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chọn 1 quy trình bên trái</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                  {ICONS[cur.doc_key] || '📄'} {cur.title}
                </div>
                {cur.updated_at && (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Cập nhật {new Date(cur.updated_at).toLocaleString('vi-VN')}{cur.updated_by ? ` · ${cur.updated_by}` : ''}
                  </span>
                )}
                {!(cur.content || '').trim() && (
                  <button onClick={() => setDraft(TEMPLATES[cur.doc_key] || '')}
                    style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#6d28d9', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer', fontFamily: FONT }}>
                    ✨ Chèn nội dung mẫu
                  </button>
                )}
              </div>

              <textarea value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="Nhập nội dung quy trình / kịch bản ở đây…"
                style={{
                  width: '100%', minHeight: 400, padding: '13px 15px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', fontSize: '0.86rem', lineHeight: 1.7, fontFamily: FONT,
                  boxSizing: 'border-box', resize: 'vertical', outline: 'none', whiteSpace: 'pre-wrap',
                }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={save} disabled={saving || !dirty}
                  style={{ ...btn, opacity: (saving || !dirty) ? 0.5 : 1, cursor: (saving || !dirty) ? 'default' : 'pointer' }}>
                  {saving ? 'Đang lưu…' : dirty ? '💾 Lưu thay đổi' : 'Đã lưu'}
                </button>
                {dirty && <span style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 700 }}>● Có thay đổi chưa lưu</span>}
                {msg && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: msg.startsWith('⚠️') ? '#dc2626' : '#059669' }}>{msg}</span>}
                <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: '#94a3b8' }}>{draft.length} ký tự</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
