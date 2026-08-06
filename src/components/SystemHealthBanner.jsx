// src/components/SystemHealthBanner.jsx
//
// DẢI CẢNH BÁO SỨC KHOẺ HỆ THỐNG (Khánh 6/8/2026: "nếu nó hư làm cảnh báo FULL lên hệ thống
// để mọi người biết rằng nó không chạy").
//
// Hiện TRÊN MỌI TRANG, ngay đầu vùng nội dung. Bình thường KHÔNG hiện gì (khỏi làm phiền);
// chỉ khi có việc tự động chết/trễ mới bung dải đỏ (hỏng) hoặc vàng (trễ).
//
// Nguồn: RPC system_health() — đo bằng DATA THẬT mà mỗi việc đẻ ra (không tin trạng thái job
// bên ngoài, vì cron-job.org từng báo "Failed (timeout)" trong khi việc vẫn chạy xong).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const CHU_KY_MS = 5 * 60 * 1000;   // hỏi lại mỗi 5 phút

const dinhDangTre = (phut) => {
  if (phut == null) return 'chưa từng chạy';
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.floor(phut / 60);
  if (gio < 24) return `${gio} tiếng${phut % 60 ? ` ${phut % 60} phút` : ''} trước`;
  return `${Math.floor(gio / 24)} ngày ${gio % 24} tiếng trước`;
};

export default function SystemHealthBanner() {
  const [rows, setRows] = useState(null);
  const [moRong, setMoRong] = useState(false);
  const [an, setAn] = useState(false);          // người dùng bấm ẩn — chỉ ẩn trong phiên này

  const tai = useCallback(async () => {
    const { data, error } = await supabase.rpc('system_health');
    if (error) return;                          // lỗi mạng thì im, đừng doạ người dùng
    setRows(data || []);
  }, []);

  useEffect(() => {
    tai();
    const id = setInterval(tai, CHU_KY_MS);
    return () => clearInterval(id);
  }, [tai]);

  if (!rows || an) return null;
  const hong = rows.filter(r => r.trang_thai === 'hong');
  const tre = rows.filter(r => r.trang_thai === 'tre');
  if (hong.length === 0 && tre.length === 0) return null;   // mọi thứ chạy ngon → không hiện gì

  const nang = hong.length > 0;
  const mau = nang
    ? { nen: '#fef2f2', vien: '#fecaca', chu: '#b91c1c', dam: '#dc2626' }
    : { nen: '#fffbeb', vien: '#fde68a', chu: '#92400e', dam: '#b45309' };
  const danhSach = [...hong, ...tre];

  return (
    <div style={{
      background: mau.nen, border: `1.5px solid ${mau.vien}`, borderRadius: 12,
      padding: '11px 14px', marginBottom: 14, fontFamily: "'Outfit', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.1rem' }}>{nang ? '🚨' : '⚠️'}</span>
        <b style={{ color: mau.dam, fontSize: '0.92rem' }}>
          {nang
            ? `${hong.length} việc tự động ĐANG KHÔNG CHẠY`
            : `${tre.length} việc tự động đang chạy trễ`}
          {nang && tre.length > 0 ? ` · ${tre.length} việc chạy trễ` : ''}
        </b>
        <span style={{ color: mau.chu, fontSize: '0.82rem' }}>
          {nang ? '— số liệu trên web có thể thiếu/cũ, báo Khánh gấp' : '— theo dõi thêm, chưa cần lo'}
        </span>
        <button onClick={() => setMoRong(v => !v)}
          style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${mau.vien}`, background: '#fff', color: mau.dam, fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          {moRong ? 'Thu gọn' : 'Xem chi tiết'}
        </button>
        <button onClick={() => setAn(true)} title="Ẩn tới khi tải lại trang"
          style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: mau.chu, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>✕</button>
      </div>

      {moRong && (
        <div style={{ marginTop: 10, borderTop: `1px dashed ${mau.vien}`, paddingTop: 9 }}>
          {danhSach.map(r => (
            <div key={r.viec} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0' }}>
              <span style={{ fontSize: '0.78rem' }}>{r.trang_thai === 'hong' ? '🔴' : '🟡'}</span>
              <b style={{ color: '#0f172a', fontSize: '0.84rem', minWidth: 190 }}>{r.viec}</b>
              <span style={{ color: r.trang_thai === 'hong' ? '#dc2626' : '#b45309', fontSize: '0.82rem', fontWeight: 700 }}>
                chạy lần cuối {dinhDangTre(r.tre_phut)}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>
                (đáng lẽ tối đa {r.han_phut >= 60 ? `${Math.round(r.han_phut / 60)} tiếng` : `${r.han_phut} phút`}) · {r.ghi_chu}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 7, fontSize: '0.75rem', color: mau.chu }}>
            Đo bằng dữ liệu thật mà mỗi việc đẻ ra — không phải theo trạng thái báo của cron.
          </div>
        </div>
      )}
    </div>
  );
}
