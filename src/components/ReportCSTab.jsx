import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwl0bImCEVCdWA8rSM6SxJH1Go9YuKxmcysQiH2ZxRl6jnCSS6Rdna3ztKYnx5nbr9A6A/exec';
const TOKEN = 'stella2026';

const BRANDS = ['Bodymiss', 'Milaganics', 'Moaw Moaws', 'eHerb', 'Real Steel', 'Masube', 'Healmi'];

const BRAND_COLORS = {
  'Bodymiss': '#3b82f6', 'Milaganics': '#10b981', 'Moaw Moaws': '#f97316',
  'eHerb': '#eab308', 'Real Steel': '#8b5cf6', 'Masube': '#ec4899', 'Healmi': '#06b6d4',
};

// Generate unique keys for each metric row
const SHOPEE_METRICS = [
  { group: 'CHĂM SÓC\nKHÁCH HÀNG', items: [
    { key: 'sp_ty_le_phan_hoi', label: 'Tỷ lệ phản hồi', target: '≥80.00%' },
    { key: 'sp_thoi_gian_phan_hoi', label: 'Thời gian phản hồi', target: '≤ 2 Giờ' },
    { key: 'sp_so_cuoc_tro_chuyen', label: 'Số cuộc trò chuyện 1 tháng', target: '' },
  ]},
  { group: 'QUẢN LÝ\nĐƠN HÀNG', items: [
    { key: 'sp_danh_gia_tieu_cuc', label: 'Tỷ lệ đánh giá tiêu cực', target: '<30.00%' },
    { key: 'sp_don_hang_khong_tc', label: 'Tỷ lệ đơn hàng không thành công', target: '<3.00%' },
    { key: 'sp_huy_don', label: 'Tỷ lệ hủy đơn', target: '<5.00%' },
    { key: 'sp_tra_hang_hoan_tien', label: 'Tỷ lệ Trả hàng/Hoàn tiền', target: '<5.00%' },
    { key: 'sp_giao_hang_tre', label: 'Tỷ lệ giao hàng trễ', target: '<3.00%' },
    { key: 'sp_giao_hang_nhanh', label: 'Tỷ lệ giao hàng nhanh', target: '≥90%' },
    { key: 'sp_danh_gia_shop', label: 'Đánh giá Shop', target: '≥4.00/5' },
  ]},
];

const TIKTOK_METRICS = [
  { group: 'CHĂM SÓC\nKHÁCH HÀNG', items: [
    { key: 'tt_tra_loi_12h', label: 'Tỷ lệ trả lời 12 giờ', target: '85%' },
    { key: 'tt_hai_long', label: 'Tỷ lệ hài lòng', target: '70%' },
    { key: 'tt_so_cuoc_tro_chuyen', label: 'Số cuộc trò chuyện 1 tháng', target: '' },
  ]},
  { group: 'HIỆU SUẤT\nCỬA HÀNG', items: [
    { key: 'tt_danh_gia_tieu_cuc', label: 'Tỉ lệ đánh giá tiêu cực', target: '≤ 0.50%' },
    { key: 'tt_danh_gia_tieu_cuc_dv', label: 'Tỷ lệ đánh giá tiêu cực dịch vụ', target: '≤ 0.50%' },
    { key: 'tt_tra_hang_hoan_tien', label: 'Tỷ lệ trả hàng/hoàn tiền', target: '≤ 1.50%' },
    { key: 'tt_huy_loi_nguoi_ban', label: 'Tỷ lệ hủy do lỗi của người bán', target: '≤ 2.50%' },
    { key: 'tt_gui_hang_muon', label: 'Tỷ lệ gửi hàng muộn', target: '≤ 4.00%' },
    { key: 'tt_gui_hang_nhanh', label: 'Tỷ lệ gửi hàng nhanh', target: '≥ 98%' },
    { key: 'tt_danh_gia_shop', label: 'Đánh giá Shop', target: '≥4.00/5' },
  ]},
];

const today = () => new Date().toISOString().split('T')[0];

const normBrand = (b) => {
  if (!b) return '';
  const n = b.toUpperCase().replace(/\s+/g, '');
  if (n.includes('BODYMISS')) return 'Bodymiss';
  if (n.includes('MILAGANICS') || n.includes('MILA')) return 'Milaganics';
  if (n.includes('MOAW')) return 'Moaw Moaws';
  if (n.includes('EHERB')) return 'eHerb';
  if (n.includes('REALSTEEL') || n.includes('REAL')) return 'Real Steel';
  if (n.includes('MASUBE')) return 'Masube';
  if (n.includes('HEALMI')) return 'Healmi';
  return b;
};

export default function ReportCSTab() {
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [reportDate, setReportDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Performance table data (stored in perf_data JSONB)
  const [perf, setPerf] = useState({});

  // Mapping: perf table key → form field key
  const PERF_TO_FORM = {
    tt_danh_gia_tieu_cuc: 'tt_ti_le_danh_gia_tieu_cuc',
    tt_hai_long: 'tt_ti_le_hai_long',
    tt_tra_hang_hoan_tien: 'tt_ti_le_tra_hang',
    sp_thoi_gian_phan_hoi: 'sp_thoi_gian_phan_hoi',
    sp_giao_hang_nhanh: 'sp_ti_le_giao_hang_nhanh',
    sp_tra_hang_hoan_tien: 'sp_ti_le_tra_hang',
  };

  const updatePerf = (key, val) => {
    setPerf(p => ({ ...p, [key]: val }));
    // Auto-sync to form if mapped
    if (PERF_TO_FORM[key]) {
      setForm(f => ({ ...f, [PERF_TO_FORM[key]]: val }));
    }
  };

  // Report form fields
  const [form, setForm] = useState({
    tt_ti_le_danh_gia_tieu_cuc: '', tt_ti_le_hai_long: '', tt_ti_le_tra_hang: '', tt_diem_nha_sang_tao: '',
    sp_thoi_gian_phan_hoi: '', sp_ti_le_giao_hang_nhanh: '', sp_ti_le_tra_hang: '',
    so_luot_danh_gia_tieu_cuc: '', li_do_chinh: '', key_info: '',
  });
  const updateField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Load saved report from Supabase
  // perf (bảng chỉ tiêu) → luôn lấy bản mới nhất theo brand, không phụ thuộc ngày
  // form fields (section I, II, III) → lấy theo brand + ngày
  const loadReport = useCallback(async () => {
    if (!selectedBrand || !reportDate) return;
    setLoading(true);

    // Load perf_data từ bản mới nhất của brand (không theo ngày)
    const { data: latestPerf } = await supabase
      .from('report_cs').select('perf_data')
      .eq('brand', selectedBrand)
      .not('perf_data', 'is', null)
      .order('report_date', { ascending: false })
      .limit(1).maybeSingle();
    if (latestPerf?.perf_data) setPerf(latestPerf.perf_data);

    // Load form fields theo brand + ngày cụ thể
    const { data } = await supabase
      .from('report_cs').select('*')
      .eq('brand', selectedBrand).eq('report_date', reportDate)
      .maybeSingle();
    const EMPTY_FORM = { tt_ti_le_danh_gia_tieu_cuc: '', tt_ti_le_hai_long: '', tt_ti_le_tra_hang: '', tt_diem_nha_sang_tao: '', sp_thoi_gian_phan_hoi: '', sp_ti_le_giao_hang_nhanh: '', sp_ti_le_tra_hang: '', so_luot_danh_gia_tieu_cuc: '', li_do_chinh: '', key_info: '' };
    if (data) {
      setForm({
        tt_ti_le_danh_gia_tieu_cuc: data.tt_ti_le_danh_gia_tieu_cuc || '',
        tt_ti_le_hai_long: data.tt_ti_le_hai_long || '',
        tt_ti_le_tra_hang: data.tt_ti_le_tra_hang || '',
        tt_diem_nha_sang_tao: data.tt_diem_nha_sang_tao || '',
        sp_thoi_gian_phan_hoi: data.sp_thoi_gian_phan_hoi || '',
        sp_ti_le_giao_hang_nhanh: data.sp_ti_le_giao_hang_nhanh || '',
        sp_ti_le_tra_hang: data.sp_ti_le_tra_hang || '',
        so_luot_danh_gia_tieu_cuc: data.so_luot_danh_gia_tieu_cuc || '',
        li_do_chinh: data.li_do_chinh || '',
        key_info: data.key_info || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setLoading(false);
  }, [selectedBrand, reportDate]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Save to Supabase
  const handleSave = async () => {
    if (!selectedBrand || !reportDate) return;
    setSaving(true); setSaveMsg('');
    const payload = { brand: selectedBrand, report_date: reportDate, perf_data: perf, ...form, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('report_cs').upsert(payload, { onConflict: 'brand,report_date' });
    setSaving(false);
    setSaveMsg(error ? 'Lỗi: ' + error.message : 'Đã lưu thành công!');
    setTimeout(() => setSaveMsg(''), 3000);
  };

  // CSKH đánh giá data for section II auto-fill
  const [cskh, setCskh] = useState([]);
  useEffect(() => {
    fetch(`${SCRIPT_URL}?token=${TOKEN}&sheet=11.1%20%C4%90%C3%81NH%20GI%C3%81%202026`)
      .then(r => r.json())
      .then(j => setCskh((j.data || []).filter(r => r['STT'] && r['BRAND'])))
      .catch(() => {});
  }, []);

  // Filter negative reviews by brand AND date
  const negativeReviews = useMemo(() => {
    if (!selectedBrand) return { count: 0, reasons: [] };
    const brandRows = cskh.filter(r => {
      if (normBrand(r['BRAND']) !== selectedBrand) return false;
      if (r['SỐ SAO'] !== 1 && r['SỐ SAO'] !== 2) return false;
      // Filter by reportDate (same day)
      if (reportDate && r['NGÀY']) {
        try {
          const rd = new Date(reportDate).toDateString();
          const rowDate = new Date(r['NGÀY']).toDateString();
          if (rd !== rowDate) return false;
        } catch { /* skip filter if date parse fails */ }
      }
      return true;
    });
    const reasonMap = {};
    brandRows.forEach(r => {
      const reason = r['PHÂN LOẠI'] || r['LÝ DO'] || 'Không rõ';
      reasonMap[reason] = (reasonMap[reason] || 0) + 1;
    });
    return { count: brandRows.length, reasons: Object.entries(reasonMap).sort((a, b) => b[1] - a[1]) };
  }, [cskh, selectedBrand, reportDate]);

  // Also provide all-time count for context
  const allTimeNeg = useMemo(() => {
    if (!selectedBrand) return 0;
    return cskh.filter(r => normBrand(r['BRAND']) === selectedBrand && (r['SỐ SAO'] === 1 || r['SỐ SAO'] === 2)).length;
  }, [cskh, selectedBrand]);

  const F = 13; // base font size
  const cardStyle = { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' };
  const labelStyle = { fontSize: 14, color: '#333', fontWeight: 600, marginBottom: 6, fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 };
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #fbbf24', fontSize: F, background: '#fffef5', outline: 'none', boxSizing: 'border-box', color: '#333' };
  const cellInputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #fbbf24', fontSize: F, background: '#fffef5', outline: 'none', textAlign: 'center', boxSizing: 'border-box', fontWeight: 600, color: '#333' };
  const thStyle = { padding: '8px 10px', fontSize: F - 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #fca5a5', whiteSpace: 'pre-line' };

  // Render a performance table (Shopee or TikTok)
  const renderPerfTable = (platform, metrics, brandName) => (
    <div style={platform === 'shopee' ? { borderRight: '2px solid #fca5a5' } : {}}>
      <div style={{ background: '#dc2626', color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 800, textAlign: 'center', letterSpacing: 1 }}>
        {platform === 'shopee' ? 'SHOPEE' : 'TIKTOK'} {brandName.toUpperCase()}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#fef2f2' }}>
            <th style={{ ...thStyle, textAlign: 'left', color: '#dc2626', width: '22%' }}>Danh mục</th>
            <th style={{ ...thStyle, textAlign: 'left', color: '#dc2626' }}>Chỉ số</th>
            <th style={{ ...thStyle, textAlign: 'center', color: '#dc2626', width: '14%' }}>Chỉ tiêu</th>
            <th style={{ ...thStyle, textAlign: 'center', color: '#dc2626', width: '20%' }}>
              {platform === 'shopee' ? 'SHOPEE' : 'TIKTOK'} {brandName.toUpperCase()}
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(group =>
            group.items.map((item, j) => (
              <tr key={item.key} style={{ borderBottom: '1px solid #fee2e2' }}>
                {j === 0 && (
                  <td rowSpan={group.items.length} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: '#dc2626', background: '#fef2f2', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'pre-line', borderRight: '1px solid #fca5a5' }}>
                    {group.group}
                  </td>
                )}
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{item.label}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12, color: '#888' }}>{item.target}</td>
                <td style={{ padding: '4px 6px' }}>
                  <input
                    style={cellInputStyle}
                    value={perf[item.key] || ''}
                    onChange={e => updatePerf(item.key, e.target.value)}
                    placeholder="—"
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  // Brand selector screen
  if (!selectedBrand) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif" }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>📝 REPORT CS</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#888' }}>Chọn brand để xem và tạo báo cáo CSKH</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {BRANDS.map(brand => (
            <div key={brand} onClick={() => setSelectedBrand(brand)}
              style={{ ...cardStyle, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', borderLeft: `4px solid ${BRAND_COLORS[brand]}` }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: BRAND_COLORS[brand] }}>{brand}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setSelectedBrand(null)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ← Chọn brand khác
          </button>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: BRAND_COLORS[selectedBrand] }}>
            📝 REPORT CS — {selectedBrand.toUpperCase()}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={labelStyle}>Ngày báo cáo:</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid #f97316', fontSize: 14, fontWeight: 600, background: '#fff' }} />
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Đang tải báo cáo...</div>}

      {/* Performance Table */}
      <div style={{ ...cardStyle, marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {renderPerfTable('shopee', SHOPEE_METRICS, selectedBrand)}
          {renderPerfTable('tiktok', TIKTOK_METRICS, selectedBrand)}
        </div>
      </div>

      {/* Report Form */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ fontSize: F, color: '#333', marginBottom: 8 }}>
          Đã gửi report CS ngày: <b style={{ color: '#dc2626', fontSize: F + 2 }}>{reportDate.split('-').reverse().join('/')}</b>
        </div>

        <h3 style={{ margin: '20px 0 16px', fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>I. VẬN HÀNH</h3>

        {/* 1.1 TikTok */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#333', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>1.1 Chỉ số sàn TikTok {selectedBrand}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={labelStyle}>- Tỷ lệ đánh giá tiêu cực:</div>
              <input style={inputStyle} value={form.tt_ti_le_danh_gia_tieu_cuc} onChange={e => updateField('tt_ti_le_danh_gia_tieu_cuc', e.target.value)} placeholder="0.20%" />
            </div>
            <div>
              <div style={labelStyle}>- Tỷ lệ hài lòng:</div>
              <input style={inputStyle} value={form.tt_ti_le_hai_long} onChange={e => updateField('tt_ti_le_hai_long', e.target.value)} placeholder="95.7%" />
            </div>
            <div>
              <div style={labelStyle}>- Tỷ lệ trả hàng/hoàn tiền:</div>
              <input style={inputStyle} value={form.tt_ti_le_tra_hang} onChange={e => updateField('tt_ti_le_tra_hang', e.target.value)} placeholder="0.19%" />
            </div>
            <div>
              <div style={labelStyle}>- Điểm tình trạng nhà sáng tạo:</div>
              <input style={inputStyle} value={form.tt_diem_nha_sang_tao} onChange={e => updateField('tt_diem_nha_sang_tao', e.target.value)} placeholder="300 điểm" />
            </div>
          </div>
        </div>

        {/* 1.2 Shopee */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#333', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>1.2 Chỉ số sàn Shopee {selectedBrand}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <div style={labelStyle}>- Thời gian phản hồi:</div>
              <input style={inputStyle} value={form.sp_thoi_gian_phan_hoi} onChange={e => updateField('sp_thoi_gian_phan_hoi', e.target.value)} placeholder="0.93 Giờ" />
            </div>
            <div>
              <div style={labelStyle}>- Tỷ lệ giao hàng nhanh:</div>
              <input style={inputStyle} value={form.sp_ti_le_giao_hang_nhanh} onChange={e => updateField('sp_ti_le_giao_hang_nhanh', e.target.value)} placeholder="99.84%" />
            </div>
            <div>
              <div style={labelStyle}>- Tỷ lệ trả hàng/hoàn tiền:</div>
              <input style={inputStyle} value={form.sp_ti_le_tra_hang} onChange={e => updateField('sp_ti_le_tra_hang', e.target.value)} placeholder="0.97%" />
            </div>
          </div>
        </div>

        {/* Section II */}
        <h3 style={{ margin: '24px 0 16px', fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>II. TỈ LỆ TIÊU CỰC</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={labelStyle}>- Số lượt đánh giá:</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={inputStyle} value={form.so_luot_danh_gia_tieu_cuc} onChange={e => updateField('so_luot_danh_gia_tieu_cuc', e.target.value)} placeholder="0" />
              <button onClick={() => updateField('so_luot_danh_gia_tieu_cuc', String(negativeReviews.count))}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
                title={`Ngày ${reportDate}: ${negativeReviews.count} | Tổng: ${allTimeNeg}`}>
                Ngày này ({negativeReviews.count})
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Tổng tất cả ngày: {allTimeNeg}</div>
          </div>
          <div>
            <div style={labelStyle}>- Lí do chính:</div>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.li_do_chinh} onChange={e => updateField('li_do_chinh', e.target.value)}
              placeholder={negativeReviews.reasons.length > 0 ? negativeReviews.reasons.map(([r, c]) => `+ ${r} (${c})`).join('\n') : 'Nhập lí do chính...'} />
            {negativeReviews.reasons.length > 0 && (
              <button onClick={() => updateField('li_do_chinh', negativeReviews.reasons.map(([r, c]) => `+ ${r} (${c})`).join('\n'))}
                style={{ marginTop: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 11 }}>
                Auto-fill từ data ngày {reportDate}
              </button>
            )}
          </div>
        </div>

        {/* Section III */}
        <h3 style={{ margin: '24px 0 16px', fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>III. KEY INFO</h3>
        <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} value={form.key_info} onChange={e => updateField('key_info', e.target.value)}
          placeholder="Nhập key info..." />

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving}
            style={{
              padding: '10px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff', opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Đang lưu...' : '💾 Lưu báo cáo'}
          </button>
          {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('Lỗi') ? '#ef4444' : '#10b981', fontWeight: 600 }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
