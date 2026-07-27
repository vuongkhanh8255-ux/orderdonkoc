// src/components/EvidenceUploader.jsx
// Ô "bằng chứng" cho CS: BẤM CHỌN FILE hoặc KÉO-THẢ ảnh/video là up thẳng lên web.
// Trước đây CS phải up lên Google Drive rồi copy link dán vào — feedback 27/7 bỏ bước đó.
// Vẫn LƯU DẠNG CHUỖI NHIỀU DÒNG (mỗi dòng 1 link) y như cũ → không phải đổi cột DB,
// dữ liệu cũ (link Drive nhân viên đã dán) vẫn hiện bình thường; dán link tay vẫn được.

import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

const BUCKET = 'cs-evidence';
const MAX_MB = 100;

const isImg = (u) => /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(u);
const isVid = (u) => /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u);

/**
 * @param value    chuỗi nhiều dòng, mỗi dòng 1 link
 * @param onChange nhận chuỗi mới
 * @param folder   thư mục con trong kho (vd 'khieu-nai' / 'sp-loi')
 */
export default function EvidenceUploader({ value, onChange, folder = 'chung' }) {
  const [busy, setBusy] = useState(0);        // số file đang up
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const links = String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const setLinks = (arr) => onChange(arr.join('\n'));

  const uploadFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const tooBig = list.find(f => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { alert(`File "${tooBig.name}" nặng hơn ${MAX_MB}MB — nén bớt hoặc cắt ngắn video giùm.`); return; }
    setBusy(list.length);
    const added = [];
    try {
      for (const f of list) {
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
        // Tên file để dấu/khoảng trắng sẽ hỏng link → chỉ giữ chữ-số, thêm mốc thời gian cho khỏi trùng.
        const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
          .replace(/[^a-zA-Z0-9._/-]/g, '_');
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false });
        if (error) throw error;
        added.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
        setBusy(b => b - 1);
      }
      setLinks([...links, ...added]);
    } catch (e) {
      alert('Lỗi tải file lên: ' + e.message);
      if (added.length) setLinks([...links, ...added]);   // giữ file đã up được, khỏi up lại từ đầu
    } finally { setBusy(0); }
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); uploadFiles(e.dataTransfer.files); };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? '#ff6a2c' : '#cbd5e1'}`, borderRadius: 10, padding: '14px 12px',
          background: drag ? '#fff7ed' : '#f8fafc', textAlign: 'center', cursor: 'pointer',
        }}>
        <div style={{ fontSize: '1.3rem', marginBottom: 2 }}>{busy ? '⏳' : '📤'}</div>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
          {busy ? `Đang tải lên... (còn ${busy} file)` : 'Bấm để chọn ảnh/video — hoặc kéo thả vào đây'}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Chọn được nhiều file · tối đa {MAX_MB}MB mỗi file</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
        onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }} />

      {!!links.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {links.map((u, i) => (
            <div key={u + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 9, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f1f5f9' }}>
              <a href={u} target="_blank" rel="noreferrer" title={u} style={{ display: 'block', width: '100%', height: '100%' }}>
                {isImg(u)
                  ? <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1.5rem' }}>{isVid(u) ? '🎬' : '📎'}</div>}
              </a>
              <button onClick={(e) => { e.preventDefault(); setLinks(links.filter((_, j) => j !== i)); }}
                title="Bỏ file này khỏi hồ sơ"
                style={{ position: 'absolute', top: 2, right: 2, width: 19, height: 19, borderRadius: '50%', border: 'none', background: 'rgba(15,23,42,0.72)', color: '#fff', fontSize: 12, lineHeight: '19px', cursor: 'pointer', padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: '0.74rem', color: '#94a3b8', cursor: 'pointer' }}>Hoặc dán link tay (mỗi dòng 1 link)</summary>
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 52, resize: 'vertical', padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit' }}
          placeholder="https://..." />
      </details>
    </div>
  );
}
