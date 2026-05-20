// src/components/CostingTab.jsx
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const AUTH_KEY  = 'costing_admin_auth';
const DATA_KEY  = 'costing_data_v1';
const ADMIN_PW  = 'STELLA8255@';

/* ── helpers ──────────────────────────────────────────────────────── */
function findHeaderRowIdx(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const vals = (rows[i] || []).map(v => String(v ?? '').trim().toLowerCase());
    if (vals.includes('stt') && vals.some(v => v === 'mã' || v === 'mã hàng' || v === 'ma')) return i;
  }
  return 1;
}

function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // Tìm sheet có cột BRAND hoặc Nhóm VTHH + Mã + Tên
  let chosenSheet = null, chosenName = '';
  const priority = ['COSTING SKU STELLA', 'MASTER2026', 'SUMMARY 2026'];
  const ordered  = [
    ...priority.filter(n => wb.SheetNames.includes(n)),
    ...wb.SheetNames.filter(n => !priority.includes(n)),
  ];

  for (const sn of ordered) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    const hIdx = findHeaderRowIdx(raw);
    const hdrs = (raw[hIdx] || []).map(v => String(v ?? '').trim());
    const hasBrand = hdrs.some(h => /brand|nhóm/i.test(h));
    const hasMa    = hdrs.some(h => /^mã/i.test(h));
    const hasTen   = hdrs.some(h => /^tên/i.test(h));
    if (hasBrand && hasMa && hasTen) { chosenSheet = raw; chosenName = sn; break; }
  }

  if (!chosenSheet) {
    const sn = wb.SheetNames[0];
    chosenSheet = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    chosenName  = sn;
  }

  const hIdx   = findHeaderRowIdx(chosenSheet);
  const headers = (chosenSheet[hIdx] || []).map(v => String(v ?? '').trim());

  // Data rows: bỏ qua hàng số thứ tự cột (row hIdx+1) và hàng trống
  const rows = [];
  for (let i = hIdx + 2; i < chosenSheet.length; i++) {
    const row = chosenSheet[i] || [];
    const sttRaw = String(row[0] ?? '').trim();
    if (!sttRaw || isNaN(parseFloat(sttRaw))) continue; // bỏ hàng trống / tiêu đề
    const obj = {};
    headers.forEach((h, ci) => { obj[h] = row[ci] ?? ''; });
    rows.push(obj);
  }

  return { sheetName: chosenName, headers, rows, importedAt: new Date().toISOString() };
}

function fmt(v) {
  if (v === '' || v === null || v === undefined) return '-';
  const n = parseFloat(String(v).replace(/,/g, ''));
  if (!isNaN(n) && n !== 0) return n.toLocaleString('vi-VN');
  if (String(v) === '0' || n === 0) return '-';
  return String(v);
}

const COL_PREFS_KEY = 'costing_hidden_cols_v1';

/* ── component ───────────────────────────────────────────────────── */
export default function CostingTab() {
  const [authed,      setAuthed]      = useState(() => sessionStorage.getItem(AUTH_KEY) === '1');
  const [pw,          setPw]          = useState('');
  const [pwErr,       setPwErr]       = useState('');
  const [data,        setData]        = useState(() => {
    try { return JSON.parse(localStorage.getItem(DATA_KEY)); } catch { return null; }
  });
  const [filterBrand, setFilterBrand] = useState('');
  const [filterText,  setFilterText]  = useState('');
  const [showAll,     setShowAll]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [sheetPicker, setSheetPicker] = useState(null); // { wb, sheetNames } — awaiting user pick
  // hiddenCols: Set of column names to hide — stored in localStorage (per-machine pref)
  const [hiddenCols, setHiddenCols]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COL_PREFS_KEY)) || []); }
    catch { return new Set(); }
  });
  const fileRef = useRef();

  /* Load from Supabase on mount (if no local cache or cache older than remote) */
  useEffect(() => {
    const loadFromSupabase = async () => {
      setSyncing(true);
      try {
        const { data: row } = await supabase
          .from('costing_data').select('*').eq('key', 'latest').maybeSingle();
        if (row?.rows) {
          const parsed = { sheetName: row.sheet_name, headers: row.headers, rows: row.rows, importedAt: row.imported_at };
          localStorage.setItem(DATA_KEY, JSON.stringify(parsed));
          setData(parsed);
        }
      } catch { /* silent — fall back to localStorage */ }
      finally { setSyncing(false); }
    };
    loadFromSupabase();
  }, []);

  /* auth */
  const handleAuth = () => {
    if (pw === ADMIN_PW) { sessionStorage.setItem(AUTH_KEY, '1'); setAuthed(true); }
    else setPwErr('Sai mật khẩu. Thử lại.');
  };

  /* toggle hidden col */
  const toggleCol = useCallback((col) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      localStorage.setItem(COL_PREFS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  /* import — step 1: read file → show sheet picker */
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        setSheetPicker({ wb, sheetNames: wb.SheetNames });
      } catch (err) {
        alert('Lỗi đọc file: ' + err.message);
      } finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  /* import — step 2: user chọn sheet → parse + save */
  const handlePickSheet = async (sheetName) => {
    if (!sheetPicker) return;
    setSheetPicker(null);
    setSyncing(true);
    try {
      const raw = XLSX.utils.sheet_to_json(sheetPicker.wb.Sheets[sheetName], { header: 1, defval: '' });
      const hIdx = findHeaderRowIdx(raw);
      const headers = (raw[hIdx] || []).map(v => String(v ?? '').trim());
      const rows = [];
      for (let i = hIdx + 2; i < raw.length; i++) {
        const row = raw[i] || [];
        const sttRaw = String(row[0] ?? '').trim();
        if (!sttRaw || isNaN(parseFloat(sttRaw))) continue;
        const obj = {};
        headers.forEach((h, ci) => { obj[h] = row[ci] ?? ''; });
        rows.push(obj);
      }
      const parsed = { sheetName, headers, rows, importedAt: new Date().toISOString() };
      localStorage.setItem(DATA_KEY, JSON.stringify(parsed));
      setData(parsed);
      setFilterBrand(''); setFilterText('');
      await supabase.from('costing_data').upsert({
        key: 'latest', sheet_name: sheetName,
        headers: parsed.headers, rows: parsed.rows, imported_at: parsed.importedAt,
      }, { onConflict: 'key' });
    } catch (err) {
      alert('Lỗi import sheet: ' + err.message);
    } finally { setSyncing(false); }
  };

  /* ── derive columns (must be before any early return — Rules of Hooks) ── */
  const { headers = [], rows = [] } = data || {};
  const brandCol = headers.find(h => /brand/i.test(h)) || headers.find(h => /nhóm/i.test(h)) || '';
  const maCol    = headers.find(h => /^mã hàng$/i.test(h)) || headers.find(h => /^mã$/i.test(h)) || '';
  const tenCol   = headers.find(h => /^tên hàng/i.test(h)) || headers.find(h => /^tên$/i.test(h)) || '';
  const dvtCol   = headers.find(h => /^đvt$/i.test(h)) || '';
  const fixedCols = ['STT', brandCol, maCol, tenCol, dvtCol].filter(Boolean);
  const costingCols = headers.filter(h => /^COSTING/i.test(h) && !fixedCols.includes(h));
  const allCostingCols = showAll ? costingCols : costingCols.filter(h => !/chênh|tỷ lệ/i.test(h));
  const visibleCostingCols = allCostingCols.filter(h => !hiddenCols.has(h));
  // All non-fixed, non-COSTING cols (for picker)
  const allPickerCols = [...costingCols];

  const brands = useMemo(() => {
    if (!brandCol) return [];
    return [...new Set(rows.map(r => String(r[brandCol] || '').trim()).filter(Boolean))].sort();
  }, [rows, brandCol]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterBrand && String(r[brandCol] || '').trim() !== filterBrand) return false;
      if (filterText) {
        const hay = [r[maCol], r[tenCol]].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(filterText.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterBrand, filterText, brandCol, maCol, tenCol]);

  /* export Excel — toàn bộ cột gốc, áp filter hiện tại */
  const handleExport = useCallback(() => {
    if (!data) return;
    const exportRows = filtered.length < rows.length ? filtered : rows;
    const wsData = [
      headers,
      ...exportRows.map(r => headers.map(h => r[h] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, data.sheetName || 'Costing');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb2, `costing_${(data.sheetName || 'data').replace(/\s+/g, '_')}_${date}.xlsx`);
  }, [data, filtered, rows, headers]);

  /* ── PASSWORD GATE ─────────────────────────────────────────────── */
  if (!authed) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'65vh' }}>
      <div style={{ width:360, background:'#fff', borderRadius:18, padding:'36px 32px', boxShadow:'0 24px 72px rgba(15,23,42,0.13)', border:'1.5px solid #fed7aa', fontFamily:"'Outfit',sans-serif" }}>
        <div style={{ textAlign:'center', marginBottom:26 }}>
          <div style={{ fontSize:'2.4rem', marginBottom:10 }}>🔒</div>
          <h2 style={{ margin:0, fontSize:'1.15rem', fontWeight:900, color:'#0f172a' }}>Giá Cost</h2>
          <p style={{ margin:'6px 0 0', fontSize:'0.8rem', color:'#94a3b8' }}>Khu vực dành riêng cho Admin</p>
        </div>
        <input
          type="password" value={pw} autoFocus
          onChange={e => { setPw(e.target.value); setPwErr(''); }}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          placeholder="Nhập mật khẩu..."
          style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`2px solid ${pwErr ? '#fca5a5' : '#e5e7eb'}`, fontSize:'0.9rem', boxSizing:'border-box', outline:'none', fontFamily:'inherit', transition:'border 0.2s' }}
          onFocus={e => e.target.style.borderColor = '#ea580c'}
          onBlur={e  => e.target.style.borderColor = pwErr ? '#fca5a5' : '#e5e7eb'}
        />
        {pwErr && <p style={{ color:'#dc2626', fontSize:'0.77rem', margin:'6px 0 0' }}>⚠️ {pwErr}</p>}
        <button onClick={handleAuth}
          style={{ width:'100%', marginTop:14, padding:'12px', borderRadius:10, background:'#ea580c', color:'#fff', fontWeight:800, border:'none', cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit', boxShadow:'0 6px 16px rgba(234,88,12,0.28)' }}>
          Xác nhận →
        </button>
      </div>
    </div>
  );

  /* ── MAIN UI ─────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily:"'Outfit',sans-serif", maxWidth:'100%' }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#ea580c', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:4 }}>Ecom</div>
        <h1 style={{ margin:0, fontSize:'1.6rem', fontWeight:900, color:'#0f172a', letterSpacing:'-0.3px' }}>GIÁ COST</h1>
        <p style={{ margin:'4px 0 0', fontSize:'0.82rem', color:'#64748b', display:'flex', alignItems:'center', gap:6 }}>
          Bảng costing sản phẩm LABCOS — chỉ Admin.
          {syncing && <span style={{ fontSize:'0.72rem', color:'#92400e', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:999, padding:'2px 8px', fontWeight:700 }}>⟳ Đang đồng bộ...</span>}
          {data && !syncing && <span style={{ fontSize:'0.72rem', color:'#166534', background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:999, padding:'2px 8px', fontWeight:700 }}>✓ Đã đồng bộ</span>}
          {data && <> &nbsp;Sheet: <strong>{data.sheetName}</strong> &nbsp;|&nbsp; {rows.length} dòng &nbsp;|&nbsp; {new Date(data.importedAt).toLocaleString('vi-VN')}</>}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:16, background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 14px' }}>
        {/* Import Excel */}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} disabled={loading || syncing}
          style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #3b82f6', background:'#eff6ff', color:'#1d4ed8', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          {loading ? '⏳ Đang đọc...' : '📥 Import Excel'}
        </button>

        {/* Export Excel */}
        {data && (
          <button onClick={handleExport}
            style={{ padding:'8px 14px', borderRadius:8, border:'1.5px solid #16a34a', background:'#f0fdf4', color:'#15803d', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            📤 Export Excel {filtered.length < rows.length ? `(${filtered.length} SP)` : ''}
          </button>
        )}

        {/* Xóa data */}
        {data && (
          <button onClick={async () => {
            if (!confirm('Xóa toàn bộ data costing? Hành động này không thể hoàn tác.')) return;
            localStorage.removeItem(DATA_KEY);
            setData(null);
            setSyncing(true);
            await supabase.from('costing_data').delete().eq('key', 'latest');
            setSyncing(false);
          }}
            style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #fca5a5', background:'#fef2f2', color:'#dc2626', fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
            🗑 Xóa data
          </button>
        )}

        {data && <>
          {/* Brand filter */}
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
            style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', fontSize:'0.82rem', cursor:'pointer', color: filterBrand ? '#0f172a' : '#9ca3af', minWidth:140 }}>
            <option value="">Tất cả brand</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Text search */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f8fafc', border:'1.5px solid #e5e7eb', borderRadius:9, padding:'6px 10px', flex:'1 1 200px', minWidth:180 }}>
            <span style={{ color:'#94a3b8', fontSize:14 }}>⌕</span>
            <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Tìm mã / tên SP..."
              style={{ border:'none', background:'transparent', outline:'none', fontSize:'0.82rem', width:'100%' }} />
          </div>

          {/* Toggle CHÊNH LỆCH cols */}
          <button onClick={() => setShowAll(s => !s)}
            style={{ padding:'7px 12px', borderRadius:8, border:`1.5px solid ${showAll ? '#c4b5fd' : '#e5e7eb'}`, background: showAll ? '#ede9fe' : '#fff', color: showAll ? '#6d28d9' : '#94a3b8', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', whiteSpace:'nowrap' }}>
            {showAll ? '▾ Ẩn chênh lệch' : '▸ Hiện chênh lệch'}
          </button>

          {/* Column picker button */}
          <button onClick={() => setColPickerOpen(s => !s)}
            title="Tùy chỉnh hiển thị cột"
            style={{ padding:'7px 11px', borderRadius:8, border:`1.5px solid ${hiddenCols.size > 0 ? '#fed7aa' : '#e5e7eb'}`, background: hiddenCols.size > 0 ? '#fff7ed' : '#fff', color: hiddenCols.size > 0 ? '#ea580c' : '#94a3b8', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', whiteSpace:'nowrap' }}>
            ⚙ Cột {hiddenCols.size > 0 ? `(ẩn ${hiddenCols.size})` : ''}
          </button>

          {/* Stats */}
          <div style={{ marginLeft:'auto', fontSize:'0.78rem', color:'#94a3b8', whiteSpace:'nowrap' }}>
            <strong style={{ color:'#ea580c' }}>{filtered.length}</strong> / {rows.length} SP
          </div>

          {/* Clear filter */}
          {(filterBrand || filterText) && (
            <button onClick={() => { setFilterBrand(''); setFilterText(''); }}
              style={{ padding:'6px 12px', background:'#fee2e2', border:'1.5px solid #fca5a5', borderRadius:8, color:'#dc2626', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>
              ✕ Xóa lọc
            </button>
          )}
        </>}
      </div>

      {/* Column Picker Panel */}
      {colPickerOpen && data && (
        <div style={{ background:'#fff', border:'1.5px solid #fed7aa', borderRadius:14, padding:'16px 18px', marginBottom:16, boxShadow:'0 8px 24px rgba(15,23,42,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontWeight:800, fontSize:'0.88rem', color:'#0f172a' }}>⚙ Tùy chỉnh cột hiển thị</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setHiddenCols(new Set()); localStorage.setItem(COL_PREFS_KEY, '[]'); }}
                style={{ padding:'4px 10px', borderRadius:7, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
                Hiện tất cả
              </button>
              <button onClick={() => { const all = new Set(allPickerCols); setHiddenCols(all); localStorage.setItem(COL_PREFS_KEY, JSON.stringify([...all])); }}
                style={{ padding:'4px 10px', borderRadius:7, border:'1px solid #fca5a5', background:'#fef2f2', color:'#dc2626', fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
                Ẩn tất cả
              </button>
              <button onClick={() => setColPickerOpen(false)}
                style={{ padding:'4px 10px', borderRadius:7, border:'1px solid #e5e7eb', background:'#f8fafc', color:'#64748b', fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
                ✕ Đóng
              </button>
            </div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px' }}>
            {allPickerCols.map(col => {
              const isHidden = hiddenCols.has(col);
              return (
                <label key={col} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', padding:'4px 10px', borderRadius:8, border:`1px solid ${isHidden ? '#e5e7eb' : '#fed7aa'}`, background: isHidden ? '#f8fafc' : '#fff7ed', fontSize:'0.75rem', fontWeight: isHidden ? 400 : 600, color: isHidden ? '#9ca3af' : '#92400e', userSelect:'none', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={!isHidden} onChange={() => toggleCol(col)}
                    style={{ accentColor:'#ea580c', cursor:'pointer' }} />
                  {col}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !syncing && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#94a3b8', background:'#fff', borderRadius:16, border:'2px dashed #e5e7eb' }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>📂</div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#374151', marginBottom:6 }}>Chưa có dữ liệu</div>
          <div style={{ fontSize:'0.84rem' }}>Nhấn <strong>Import Excel</strong> để tải lên file costing (tự đồng bộ mọi máy)</div>
        </div>
      )}
      {!data && syncing && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#94a3b8', background:'#fff', borderRadius:16, border:'2px dashed #e5e7eb' }}>
          <div style={{ fontSize:'2rem', marginBottom:8 }}>⟳</div>
          <div style={{ fontSize:'0.9rem' }}>Đang tải dữ liệu từ server...</div>
        </div>
      )}

      {/* Table */}
      {data && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e5e7eb', overflow:'hidden', boxShadow:'0 2px 12px rgba(15,23,42,0.05)' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', tableLayout:'auto' }}>
              <thead>
                <tr>
                  {/* Fixed cols */}
                  {fixedCols.map(h => (
                    <th key={h} style={{
                      position:'sticky', top:0, zIndex:20,
                      padding:'10px 10px', background:'linear-gradient(180deg,#fff7ed 0%,#ffedd5 100%)',
                      color:'#c2410c', fontWeight:900, fontSize:'0.72rem', textTransform:'uppercase',
                      whiteSpace:'nowrap', borderBottom:'2px solid #fed7aa', borderRight:'1px solid #fdba74',
                      textAlign: h === 'STT' ? 'center' : 'left', minWidth: h === tenCol ? 260 : h === maCol ? 130 : 80,
                    }}>{h}</th>
                  ))}
                  {/* Costing cols — grouped by month */}
                  {visibleCostingCols.map(h => {
                    const isChenhLech = /chênh|tỷ lệ/i.test(h);
                    return (
                      <th key={h} style={{
                        position:'sticky', top:0, zIndex:20,
                        padding:'10px 8px', whiteSpace:'nowrap', minWidth:110,
                        background: isChenhLech ? 'linear-gradient(180deg,#f0fdf4 0%,#dcfce7 100%)' : 'linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%)',
                        color: isChenhLech ? '#15803d' : '#1d4ed8',
                        fontWeight:900, fontSize:'0.68rem', textTransform:'uppercase',
                        borderBottom:'2px solid #bfdbfe', borderRight:'1px solid #dde6f5',
                        textAlign:'center',
                      }}>{h}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, ri) => {
                  const brand = String(row[brandCol] || '').trim();
                  const isEven = ri % 2 === 1;
                  return (
                    <tr key={ri} style={{ background: isEven ? '#f8fafc' : '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                      onMouseLeave={e => e.currentTarget.style.background = isEven ? '#f8fafc' : '#fff'}>
                      {/* Fixed cols */}
                      {fixedCols.map(h => (
                        <td key={h} style={{
                          padding:'7px 10px', borderBottom:'1px solid #e5e7eb', borderRight:'1px solid #e5e7eb',
                          whiteSpace: h === tenCol ? 'normal' : 'nowrap',
                          textAlign: h === 'STT' ? 'center' : 'left',
                          fontWeight: h === tenCol ? 600 : 400,
                          color: h === brandCol ? '#ea580c' : h === maCol ? '#3b82f6' : '#0f172a',
                          fontSize: h === brandCol ? '0.73rem' : '0.78rem',
                        }}>
                          {h === brandCol
                            ? <span style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:999, padding:'2px 8px', fontWeight:800 }}>{brand || '—'}</span>
                            : h === maCol || h === 'STT'
                              ? String(row[h] ?? '')
                              : fmt(row[h])
                          }
                        </td>
                      ))}
                      {/* Costing cols */}
                      {visibleCostingCols.map(h => {
                        const v     = row[h];
                        const isChenhLech = /chênh|tỷ lệ/i.test(h);
                        const numV  = parseFloat(String(v || '0').replace(/,/g,''));
                        const isNeg = !isNaN(numV) && numV < 0;
                        const isPos = !isNaN(numV) && numV > 0 && isChenhLech;
                        return (
                          <td key={h} style={{
                            padding:'7px 8px', borderBottom:'1px solid #e5e7eb', borderRight:'1px solid #e5e7eb',
                            textAlign:'right', whiteSpace:'nowrap',
                            color: isNeg ? '#dc2626' : isPos ? '#16a34a' : '#374151',
                            fontWeight: isChenhLech && numV !== 0 ? 700 : 400,
                            background: isChenhLech && numV !== 0 ? (isNeg ? '#fef2f2' : '#f0fdf4') : undefined,
                          }}>
                            {fmt(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={fixedCols.length + visibleCostingCols.length}
                    style={{ textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:'0.9rem' }}>
                    Không có kết quả phù hợp
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sheet Picker Modal */}
      {sheetPicker && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' }}
          onClick={() => setSheetPicker(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width:'min(480px,92vw)', background:'#fff', borderRadius:16, padding:'24px 26px', boxShadow:'0 30px 80px rgba(15,23,42,0.25)', border:'1px solid #fed7aa', fontFamily:"'Outfit',sans-serif" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <h3 style={{ margin:0, fontSize:'1rem', fontWeight:900, color:'#0f172a' }}>📋 Chọn sheet để import</h3>
              <button onClick={() => setSheetPicker(null)} style={{ border:'none', background:'none', fontSize:'1.4rem', cursor:'pointer', color:'#94a3b8' }}>×</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {sheetPicker.sheetNames.map(name => (
                <button key={name} onClick={() => handlePickSheet(name)}
                  style={{ padding:'12px 16px', borderRadius:10, border:'1.5px solid #e5e7eb', background:'#f8fafc', color:'#0f172a', fontWeight:600, fontSize:'0.88rem', cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='#fff7ed'; e.currentTarget.style.borderColor='#fed7aa'; e.currentTarget.style.color='#ea580c'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.color='#0f172a'; }}>
                  📄 {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
