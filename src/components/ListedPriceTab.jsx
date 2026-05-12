import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx-js-style';

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'stella_listed_price_rows_v1';
const BRANDS_KEY     = 'stella_listed_price_brands_v1';
const PROMOTIONS_KEY = 'stella_listed_price_promotions_v1';

const DEFAULT_BRANDS     = ['Body Miss', 'Stella Kinetics'];
const DEFAULT_PROMOTIONS = ['M1T1', 'M2G50%', 'M2G30%', 'BÁN LẺ'];

// ── Columns ───────────────────────────────────────────────────────────────────
const columns = [
  { key: 'productName', label: 'Tên sản phẩm', minWidth: 240 },
  { key: 'barcode',     label: 'Barcode',       minWidth: 150 },
  { key: 'brand',       label: 'Brand',         minWidth: 150, type: 'brand' },
  { key: 'listedPrice', label: 'Giá Niêm yết',  minWidth: 150 },
  { key: 'promotion',   label: 'Promotion',     minWidth: 150, type: 'promotion' },
  { key: 'regularPrice',label: 'Giá regular',   minWidth: 150 },
  { key: 'fsPrice',     label: 'Giá FS',        minWidth: 130 },
  { key: 'voucher',     label: 'Voucher',       minWidth: 130 },
  { key: 'platform',    label: 'Sàn',           minWidth: 130 },
  { key: 'finalPrice',  label: 'Giá final',     minWidth: 150 },
];

const columnLetters = columns.reduce((acc, col, i) => {
  acc[String.fromCharCode(65 + i)] = col.key;
  return acc;
}, {});

const formulaAliases = {
  listedPrice: 'listedPrice', giaNiemYet: 'listedPrice',
  regularPrice: 'regularPrice', giaRegular: 'regularPrice',
  fsPrice: 'fsPrice', giaFS: 'fsPrice',
  voucher: 'voucher', finalPrice: 'finalPrice', giaFinal: 'finalPrice',
  promotion: 'promotion',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const createRow = () => ({
  id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  productName: '', barcode: '', brand: '', listedPrice: '',
  promotion: '', regularPrice: '', fsPrice: '',
  voucher: '', platform: '', finalPrice: '',
});

const loadArray = (key, def) => {
  try {
    const r = localStorage.getItem(key);
    const p = r ? JSON.parse(r) : null;
    return Array.isArray(p) && p.length ? p : def;
  } catch { return def; }
};

const loadRows = () => {
  const rows = loadArray(STORAGE_KEY, null);
  return rows || [createRow(), createRow(), createRow()];
};

const isFormula  = (v) => String(v || '').trim().startsWith('=');
const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.endsWith('%')) return parseNumber(raw.slice(0, -1)) / 100;
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const p = Number(normalized);
  return Number.isFinite(p) ? p : 0;
};
const fmtResult = (v) => !Number.isFinite(v) ? 'Lỗi' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);

const evaluateFormula = (formula, row, rowIndex, allRows, currentKey) => {
  const stack = new Set([`${rowIndex}:${currentKey}`]);
  const getValue = (ri, key) => {
    const r = allRows[ri]; if (!r) return 0;
    const sk = `${ri}:${key}`; if (stack.has(sk)) return 0;
    const rv = r[key];
    if (isFormula(rv)) { stack.add(sk); const res = run(rv, r, ri); stack.delete(sk); return res; }
    return parseNumber(rv);
  };
  const run = (raw, activeRow, activeIdx) => {
    let expr = String(raw || '').trim().replace(/^=/, '');
    expr = expr.replace(/(\d+(?:[.,]\d+)?)%/g, '($1/100)');
    expr = expr.replace(/\b([A-J])(\d+)\b/gi, (_, l, n) => {
      const k = columnLetters[l.toUpperCase()]; return k ? String(getValue(Number(n) - 1, k)) : '0';
    });
    Object.entries(formulaAliases).forEach(([alias, key]) => {
      expr = expr.replace(new RegExp(`\\b${alias}\\b`, 'gi'), String(getValue(activeIdx, key)));
    });
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return NaN;
    try { const r = Function(`"use strict"; return (${expr});`)(); return Number.isFinite(r) ? r : NaN; }
    catch { return NaN; }
  };
  return run(formula, row, rowIndex);
};

// ── Excel export ──────────────────────────────────────────────────────────────
const exportExcel = (rows) => {
  const headers = ['Tên sản phẩm','Barcode','Brand','Giá Niêm yết','Promotion','Giá regular','Giá FS','Voucher','Sàn','Giá final'];
  const data = [
    headers,
    ...rows.map(r => [r.productName, r.barcode, r.brand, r.listedPrice, r.promotion, r.regularPrice, r.fsPrice, r.voucher, r.platform, r.finalPrice])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Style header row
  headers.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[cellRef]) ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'EA580C' } },
      alignment: { horizontal: 'center' },
    };
  });

  // Column widths
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang Gia Niem Yet');
  XLSX.writeFile(wb, 'bang-gia-niem-yet.xlsx');
};

// ── Excel import ──────────────────────────────────────────────────────────────
const importExcel = (file, onSuccess) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const firstRow = raw[0] || [];
    const isHeader = String(firstRow[0] || '').toLowerCase().includes('tên') ||
                     String(firstRow[0] || '').toLowerCase().includes('san') ||
                     String(firstRow[0] || '').toLowerCase().includes('product');
    const start = isHeader ? 1 : 0;
    const newRows = raw.slice(start)
      .map(r => ({ ...createRow(), productName: String(r[0]||''), barcode: String(r[1]||''), brand: String(r[2]||''), listedPrice: String(r[3]||''), promotion: String(r[4]||''), regularPrice: String(r[5]||''), fsPrice: String(r[6]||''), voucher: String(r[7]||''), platform: String(r[8]||''), finalPrice: String(r[9]||'') }))
      .filter(r => r.productName || r.barcode || r.brand);
    onSuccess(newRows.length ? newRows : [createRow()]);
  };
  reader.readAsArrayBuffer(file);
};

// ── Inline AddOption modal ────────────────────────────────────────────────────
const AddOptionInline = ({ placeholder, onAdd, onClose }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); onClose(); } if (e.key === 'Escape') onClose(); }}
        placeholder={placeholder}
        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ea580c', fontSize: 12, outline: 'none' }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); onClose(); } }}
        style={{ padding: '4px 10px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
      <button onClick={onClose}
        style={{ padding: '4px 8px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ListedPriceTab = () => {
  const [rows, setRows]             = useState(loadRows);
  const [brands, setBrands]         = useState(() => loadArray(BRANDS_KEY, DEFAULT_BRANDS));
  const [promotions, setPromotions] = useState(() => loadArray(PROMOTIONS_KEY, DEFAULT_PROMOTIONS));

  // Filter state
  const [filterText,      setFilterText]      = useState('');
  const [filterBrand,     setFilterBrand]     = useState('');
  const [filterPromotion, setFilterPromotion] = useState('');
  const [filterBarcode,   setFilterBarcode]   = useState('');

  // Add option UI
  const [addingBrand,     setAddingBrand]     = useState(false);
  const [addingPromotion, setAddingPromotion] = useState(false);

  const importRef = useRef(null);

  // Persist
  useEffect(() => { localStorage.setItem(STORAGE_KEY,    JSON.stringify(rows));       }, [rows]);
  useEffect(() => { localStorage.setItem(BRANDS_KEY,     JSON.stringify(brands));     }, [brands]);
  useEffect(() => { localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(promotions)); }, [promotions]);

  const addBrand     = (v) => { if (!brands.includes(v))     setBrands(p => [...p, v]); };
  const addPromotion = (v) => { if (!promotions.includes(v)) setPromotions(p => [...p, v]); };

  // Filter
  const filteredRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (filterBrand     && row.brand     !== filterBrand)     return false;
      if (filterPromotion && row.promotion !== filterPromotion) return false;
      if (filterBarcode   && !String(row.barcode     || '').toLowerCase().includes(filterBarcode.toLowerCase()))   return false;
      if (filterText      && !columns.some(c => String(row[c.key] || '').toLowerCase().includes(filterText.toLowerCase()))) return false;
      return true;
    });
  }, [rows, filterBrand, filterPromotion, filterBarcode, filterText]);

  const hasFilter = filterBrand || filterPromotion || filterBarcode || filterText;

  // CRUD
  const updateCell  = (id, key, value) => setRows(p => p.map(r => r.id === id ? { ...r, [key]: value } : r));
  const addRow      = () => setRows(p => [...p, createRow()]);
  const duplicateRow = (row) => setRows(p => [...p, { ...row, id: createRow().id }]);
  const deleteRow   = (id) => setRows(p => p.length <= 1 ? [createRow()] : p.filter(r => r.id !== id));
  const clearAll    = () => { if (window.confirm('Xóa toàn bộ bảng giá niêm yết?')) setRows([createRow()]); };
  const clearFilter = () => { setFilterText(''); setFilterBrand(''); setFilterPromotion(''); setFilterBarcode(''); };

  // Import handler
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importExcel(file, (newRows) => {
      if (window.confirm(`Import ${newRows.length} dòng từ Excel?\n\nChọn OK = Ghi đè toàn bộ\nChọn Cancel = Thêm vào cuối`)) {
        setRows(newRows);
      } else {
        setRows(p => [...p.filter(r => r.productName || r.barcode || r.brand), ...newRows]);
      }
    });
    e.target.value = '';
  };

  // ── Render ──
  const selectStyle = {
    width: '100%', padding: '5px 6px', border: 'none', background: 'transparent',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
    color: '#0f172a', fontFamily: 'inherit',
  };

  const filterSelectStyle = {
    padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer', background: '#fff',
    color: '#374151', minWidth: 150,
  };

  return (
    <div className="listed-price-page">
      {/* ── Header ── */}
      <div className="listed-price-page__header">
        <div>
          <div className="listed-price-page__eyebrow">Ecom</div>
          <h1>Bảng giá niêm yết</h1>
          <p>Listing full giá niêm yết theo sản phẩm, brand và sàn.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={clearAll} className="listed-price-page__button is-muted">Xóa bảng</button>
          <button onClick={addRow}   className="listed-price-page__button is-primary">+ Thêm dòng</button>

          {/* Import Excel */}
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <button onClick={() => importRef.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📥 Import Excel
          </button>

          {/* Export Excel */}
          <button onClick={() => exportExcel(rows)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📤 Export Excel
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>

        {/* Search text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', flex: '1 1 200px', minWidth: 180 }}>
          <span style={{ color: '#94a3b8', fontSize: 15 }}>⌕</span>
          <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
            placeholder="Tìm tên SP, barcode, sàn..."
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%' }} />
        </div>

        {/* Filter barcode */}
        <input type="text" value={filterBarcode} onChange={e => setFilterBarcode(e.target.value)}
          placeholder="Lọc Barcode..."
          style={{ ...filterSelectStyle, minWidth: 140 }} />

        {/* Filter brand */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả brand</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={() => setAddingBrand(v => !v)} title="Thêm brand"
              style={{ padding: '6px 10px', background: addingBrand ? '#ea580c' : '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 8, color: '#ea580c', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+</button>
          </div>
          {addingBrand && <AddOptionInline placeholder="Tên brand mới..." onAdd={addBrand} onClose={() => setAddingBrand(false)} />}
        </div>

        {/* Filter promotion */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterPromotion} onChange={e => setFilterPromotion(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả promotion</option>
              {promotions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setAddingPromotion(v => !v)} title="Thêm promotion"
              style={{ padding: '6px 10px', background: addingPromotion ? '#ea580c' : '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 8, color: '#ea580c', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+</button>
          </div>
          {addingPromotion && <AddOptionInline placeholder="Tên promotion mới..." onAdd={addPromotion} onClose={() => setAddingPromotion(false)} />}
        </div>

        {/* Clear filter */}
        {hasFilter && (
          <button onClick={clearFilter}
            style={{ padding: '7px 12px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ✕ Xóa lọc
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', alignSelf: 'center' }}>
          Hiển thị <strong style={{ color: '#ea580c' }}>{filteredRows.length}</strong> / {rows.length} dòng
        </div>
      </div>

      {/* ── Formula hint ── */}
      <div className="listed-price-formula-help">
        Nhập công thức bằng dấu <strong>=</strong>. Ví dụ: <code>=D2-F2-H2</code>, <code>=regularPrice-voucher</code>, <code>=listedPrice*0.9</code>.
      </div>

      {/* ── Table ── */}
      <div className="listed-price-table-card">
        <div className="listed-price-table-wrap">
          <table className="listed-price-table">
            <thead>
              <tr>
                <th className="listed-price-table__index">#</th>
                {columns.map((col, i) => (
                  <th key={col.key} style={{ minWidth: col.minWidth }}>
                    <span>{String.fromCharCode(65 + i)}</span>{col.label}
                  </th>
                ))}
                <th className="listed-price-table__actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ row, index }) => (
                <tr key={row.id}>
                  <td className="listed-price-table__index">{index + 1}</td>
                  {columns.map(col => {
                    const formula = isFormula(row[col.key]);
                    const formulaResult = formula ? evaluateFormula(row[col.key], row, index, rows, col.key) : null;

                    // Brand dropdown
                    if (col.type === 'brand') return (
                      <td key={col.key}>
                        <select value={row[col.key] || ''} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
                          <option value="">— chọn brand —</option>
                          {brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                    );

                    // Promotion dropdown
                    if (col.type === 'promotion') return (
                      <td key={col.key}>
                        <select value={row[col.key] || ''} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
                          <option value="">— chọn —</option>
                          {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                    );

                    // Default: text input with optional formula
                    return (
                      <td key={col.key} className={formula ? 'is-formula' : ''}>
                        <input type="text" value={row[col.key] || ''} onChange={e => updateCell(row.id, col.key, e.target.value)} placeholder={col.label} />
                        {formula && (
                          <div className={`listed-price-table__formula-result ${Number.isFinite(formulaResult) ? '' : 'is-error'}`}>
                            = {fmtResult(formulaResult)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="listed-price-table__actions">
                    <button type="button" title="Nhân bản" onClick={() => duplicateRow(row)}>⧉</button>
                    <button type="button" title="Xóa dòng"  onClick={() => deleteRow(row.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ListedPriceTab;
