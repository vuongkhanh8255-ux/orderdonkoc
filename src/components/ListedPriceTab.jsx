import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppDataContext } from '../context/AppDataContext';
import * as XLSX from 'xlsx-js-style';

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'stella_listed_price_rows_v1';
const BRANDS_KEY     = 'stella_listed_price_brands_v1';
const PROMOTIONS_KEY = 'stella_listed_price_promotions_v1';
const PLATFORMS_KEY  = 'stella_listed_price_platforms_v1';

const DEFAULT_BRANDS     = ['Body Miss', 'Stella Kinetics'];
const DEFAULT_PROMOTIONS = ['M1T1', 'M2G50%', 'M2G30%', 'BÁN LẺ'];
const DEFAULT_PLATFORMS  = ['TikTok', 'Shopee'];

// ── Columns: A–J ──────────────────────────────────────────────────────────────
const columns = [
  { key: 'productName', label: 'Tên sản phẩm', minWidth: 240 },
  { key: 'barcode',     label: 'Barcode',       minWidth: 150 },
  { key: 'brand',       label: 'Brand',         minWidth: 150, type: 'brand' },
  { key: 'platform',   label: 'Sàn',            minWidth: 130, type: 'platform' },
  { key: 'listedPrice', label: 'Giá Niêm yết',  minWidth: 150 },
  { key: 'promotion',   label: 'Promotion',     minWidth: 150, type: 'promotion' },
  { key: 'regularPrice',label: 'Giá regular',   minWidth: 150 },
  { key: 'fsPrice',     label: 'Giá FS',        minWidth: 130 },
  { key: 'voucher',     label: 'Voucher',       minWidth: 130 },
  { key: 'finalPrice',  label: 'Giá final',     minWidth: 150 },
];

// A=productName B=barcode C=brand D=platform E=listedPrice F=promotion G=regularPrice H=fsPrice I=voucher J=finalPrice
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
  productName: '', barcode: '', brand: '', platform: '', listedPrice: '',
  promotion: '', regularPrice: '', fsPrice: '', voucher: '', finalPrice: '',
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

const isFormula   = (v) => String(v || '').trim().startsWith('=');
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
const fmtResult = (v) =>
  !Number.isFinite(v) ? 'Lỗi' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);

const evaluateFormula = (formula, row, rowIndex, allRows, currentKey) => {
  const stack = new Set([`${rowIndex}:${currentKey}`]);
  const getValue = (ri, key) => {
    const r = allRows[ri]; if (!r) return 0;
    const sk = `${ri}:${key}`; if (stack.has(sk)) return 0;
    const rv = r[key];
    if (isFormula(rv)) { stack.add(sk); const res = run(rv, r, ri); stack.delete(sk); return res; }
    return parseNumber(rv);
  };
  const run = (raw, _activeRow, activeIdx) => {
    let expr = String(raw || '').trim().replace(/^=/, '');
    expr = expr.replace(/(\d+(?:[.,]\d+)?)%/g, '($1/100)');
    expr = expr.replace(/\b([A-Ja-j])(\d+)\b/g, (_, l, n) => {
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

// ── Shift row numbers in a formula when dragging down ─────────────────────────
const shiftFormula = (formula, offset) => {
  if (!offset) return formula;
  return formula.replace(/\b([A-Ja-j])(\d+)\b/g, (_, col, rowNum) =>
    `${col.toUpperCase()}${parseInt(rowNum) + offset}`
  );
};

// ── Excel export ──────────────────────────────────────────────────────────────
const exportExcel = (rows) => {
  const headers = ['Tên sản phẩm','Barcode','Brand','Sàn','Giá Niêm yết','Promotion','Giá regular','Giá FS','Voucher','Giá final'];
  const data = [
    headers,
    ...rows.map(r => [r.productName, r.barcode, r.brand, r.platform, r.listedPrice, r.promotion, r.regularPrice, r.fsPrice, r.voucher, r.finalPrice])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  headers.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[cellRef]) ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'EA580C' } },
      alignment: { horizontal: 'center' },
    };
  });
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
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
      .map(r => ({ ...createRow(),
        productName:  String(r[0] || ''), barcode:      String(r[1] || ''),
        brand:        String(r[2] || ''), platform:     String(r[3] || ''),
        listedPrice:  String(r[4] || ''), promotion:    String(r[5] || ''),
        regularPrice: String(r[6] || ''), fsPrice:      String(r[7] || ''),
        voucher:      String(r[8] || ''), finalPrice:   String(r[9] || ''),
      }))
      .filter(r => r.productName || r.barcode || r.brand);
    onSuccess(newRows.length ? newRows : [createRow()]);
  };
  reader.readAsArrayBuffer(file);
};

// ── Inline AddOption ──────────────────────────────────────────────────────────
const AddOptionInline = ({ placeholder, onAdd, onClose }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); onClose(); } if (e.key === 'Escape') onClose(); }}
        placeholder={placeholder}
        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ea580c', fontSize: 12, outline: 'none' }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); onClose(); } }}
        style={{ padding: '4px 10px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
      <button onClick={onClose}
        style={{ padding: '4px 8px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ListedPriceTab = () => {
  const { brands: ctxBrands = [] } = useContext(AppDataContext) || {};

  const [rows, setRows]             = useState(loadRows);
  const [brands, setBrands]         = useState(() => loadArray(BRANDS_KEY, DEFAULT_BRANDS));
  const [promotions, setPromotions] = useState(() => loadArray(PROMOTIONS_KEY, DEFAULT_PROMOTIONS));
  const [platforms, setPlatforms]   = useState(() => loadArray(PLATFORMS_KEY, DEFAULT_PLATFORMS));

  // Filter state
  const [filterText,      setFilterText]      = useState('');
  const [filterBrand,     setFilterBrand]     = useState('');
  const [filterPromotion, setFilterPromotion] = useState('');
  const [filterPlatform,  setFilterPlatform]  = useState('');
  const [filterBarcode,   setFilterBarcode]   = useState('');

  // Add-option toggles
  const [addingBrand,     setAddingBrand]     = useState(false);
  const [addingPromotion, setAddingPromotion] = useState(false);
  const [addingPlatform,  setAddingPlatform]  = useState(false);

  // Cell currently in edit mode
  const [editingCell, setEditingCell] = useState(null); // { id, key }

  // Drag-to-fill state
  const [fillDrag, setFillDrag] = useState(null); // { fromIndex, colKey, sourceValue }
  const [fillOver, setFillOver] = useState(null); // rowIndex hovered during drag

  const importRef = useRef(null);

  // ── Persist ──
  useEffect(() => { localStorage.setItem(STORAGE_KEY,    JSON.stringify(rows));       }, [rows]);
  useEffect(() => { localStorage.setItem(BRANDS_KEY,     JSON.stringify(brands));     }, [brands]);
  useEffect(() => { localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem(PLATFORMS_KEY,  JSON.stringify(platforms));  }, [platforms]);

  // Sync brands from Supabase
  useEffect(() => {
    if (!ctxBrands?.length) return;
    const ctxNames = ctxBrands.map(b => b.ten_brand).filter(Boolean);
    setBrands(prev => [...new Set([...ctxNames, ...prev])]);
  }, [ctxBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global mouseup: finish drag-to-fill ──
  useEffect(() => {
    if (!fillDrag) return;
    const handleMouseUp = () => {
      if (fillOver !== null && fillOver !== fillDrag.fromIndex) {
        const { fromIndex, colKey, sourceValue } = fillDrag;
        const lo = Math.min(fromIndex, fillOver);
        const hi = Math.max(fromIndex, fillOver);
        setRows(prev => prev.map((r, i) => {
          if (i === fromIndex || i < lo || i > hi) return r;
          const offset = i - fromIndex;
          const newVal = isFormula(sourceValue) ? shiftFormula(sourceValue, offset) : sourceValue;
          return { ...r, [colKey]: newVal };
        }));
      }
      setFillDrag(null);
      setFillOver(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [fillDrag, fillOver]);

  const addBrand     = (v) => { if (!brands.includes(v))     setBrands(p     => [...p, v]); };
  const addPromotion = (v) => { if (!promotions.includes(v)) setPromotions(p => [...p, v]); };
  const addPlatform  = (v) => { if (!platforms.includes(v))  setPlatforms(p  => [...p, v]); };

  // ── Filtered rows ──
  const filteredRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (filterBrand     && row.brand     !== filterBrand)     return false;
      if (filterPromotion && row.promotion !== filterPromotion) return false;
      if (filterPlatform  && row.platform  !== filterPlatform)  return false;
      if (filterBarcode   && !String(row.barcode || '').toLowerCase().includes(filterBarcode.toLowerCase())) return false;
      if (filterText      && !columns.some(c => String(row[c.key] || '').toLowerCase().includes(filterText.toLowerCase()))) return false;
      return true;
    });
  }, [rows, filterBrand, filterPromotion, filterPlatform, filterBarcode, filterText]);

  const hasFilter = filterBrand || filterPromotion || filterPlatform || filterBarcode || filterText;

  // ── CRUD ──
  const updateCell   = (id, key, value) => setRows(p => p.map(r => r.id === id ? { ...r, [key]: value } : r));
  const addRow       = () => setRows(p => [...p, createRow()]);
  const duplicateRow = (row) => setRows(p => [...p, { ...row, id: createRow().id }]);
  const deleteRow    = (id) => setRows(p => p.length <= 1 ? [createRow()] : p.filter(r => r.id !== id));
  const clearAll     = () => { if (window.confirm('Xóa toàn bộ bảng giá niêm yết?')) setRows([createRow()]); };
  const clearFilter  = () => { setFilterText(''); setFilterBrand(''); setFilterPromotion(''); setFilterPlatform(''); setFilterBarcode(''); };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    importExcel(file, (newRows) => {
      if (window.confirm(`Import ${newRows.length} dòng?\n\nOK = Ghi đè\nCancel = Thêm vào cuối`)) {
        setRows(newRows);
      } else {
        setRows(p => [...p.filter(r => r.productName || r.barcode || r.brand), ...newRows]);
      }
    });
    e.target.value = '';
  };

  // ── Styles ──
  const selectStyle = {
    width: '100%', padding: '5px 6px', border: 'none', background: 'transparent',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
    color: '#0f172a', fontFamily: 'inherit',
  };
  const filterSelectStyle = {
    padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer', background: '#fff',
    color: '#374151', minWidth: 130,
  };
  const addBtnStyle = (active) => ({
    padding: '6px 10px', background: active ? '#ea580c' : '#fff7ed',
    border: '1.5px solid #fed7aa', borderRadius: 8,
    color: active ? '#fff' : '#ea580c', fontWeight: 700, cursor: 'pointer', fontSize: 14,
  });

  // ── Cell renderer ─────────────────────────────────────────────────────────
  const renderCell = (col, row, index) => {
    const rawValue   = row[col.key] || '';
    const hasFormula = isFormula(rawValue);
    const isEditing  = editingCell?.id === row.id && editingCell?.key === col.key;
    const isDragSrc  = fillDrag?.fromIndex === index && fillDrag?.colKey === col.key;

    // Dropdown: brand
    if (col.type === 'brand') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
          <option value="">— chọn brand —</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );

    // Dropdown: platform
    if (col.type === 'platform') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
          <option value="">— chọn sàn —</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );

    // Dropdown: promotion
    if (col.type === 'promotion') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
          <option value="">— chọn —</option>
          {promotions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );

    // Text / formula cell
    const formulaResult = hasFormula
      ? evaluateFormula(rawValue, row, index, rows, col.key)
      : null;

    // What to show in the input:
    // - editing → raw formula / raw text
    // - not editing + formula → computed result (formatted)
    const displayValue = (!isEditing && hasFormula)
      ? (Number.isFinite(formulaResult) ? fmtResult(formulaResult) : 'Lỗi')
      : rawValue;

    const isError = hasFormula && !Number.isFinite(formulaResult);

    return (
      <td key={col.key}
        style={{
          position: 'relative',
          outline: isDragSrc ? '2px solid #ea580c' : undefined,
        }}
      >
        <input
          type="text"
          value={displayValue}
          placeholder={isEditing || !hasFormula ? col.label : ''}
          onChange={e => updateCell(row.id, col.key, e.target.value)}
          onFocus={() => setEditingCell({ id: row.id, key: col.key })}
          onBlur={() => setEditingCell(null)}
          style={{
            color: !isEditing && hasFormula
              ? (isError ? '#dc2626' : '#1d4ed8')
              : '#0f172a',
            fontStyle: !isEditing && hasFormula ? 'italic' : 'normal',
          }}
        />
        {/* Live preview while editing a formula */}
        {isEditing && hasFormula && (
          <div style={{
            fontSize: 10, color: Number.isFinite(formulaResult) ? '#16a34a' : '#dc2626',
            paddingLeft: 6, paddingBottom: 2, lineHeight: 1.2,
          }}>
            → {Number.isFinite(formulaResult) ? fmtResult(formulaResult) : 'Lỗi công thức'}
          </div>
        )}
        {/* Fill handle */}
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );
  };

  // ── Fill handle helpers ──
  const startFill = (e, fromIndex, colKey, sourceValue) => {
    e.preventDefault();
    e.stopPropagation();
    setFillDrag({ fromIndex, colKey, sourceValue });
  };

  // highlight range during drag
  const getFillHighlight = (index) => {
    if (!fillDrag || fillOver === null) return false;
    const lo = Math.min(fillDrag.fromIndex, fillOver);
    const hi = Math.max(fillDrag.fromIndex, fillOver);
    return index > lo && index <= hi && index !== fillDrag.fromIndex;
  };

  // ── Render ──
  return (
    <div className="listed-price-page" style={fillDrag ? { userSelect: 'none', cursor: 'crosshair' } : {}}>

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
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <button onClick={() => importRef.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📥 Import Excel
          </button>
          <button onClick={() => exportExcel(rows)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📤 Export Excel
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', flex: '1 1 180px', minWidth: 160 }}>
          <span style={{ color: '#94a3b8', fontSize: 15 }}>⌕</span>
          <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
            placeholder="Tìm tên SP, barcode..."
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%' }} />
        </div>
        {/* Barcode */}
        <input type="text" value={filterBarcode} onChange={e => setFilterBarcode(e.target.value)}
          placeholder="Lọc Barcode..." style={{ ...filterSelectStyle, minWidth: 130 }} />
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả brand</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={() => setAddingBrand(v => !v)} style={addBtnStyle(addingBrand)}>+</button>
          </div>
          {addingBrand && <AddOptionInline placeholder="Tên brand mới..." onAdd={addBrand} onClose={() => setAddingBrand(false)} />}
        </div>
        {/* Sàn */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả sàn</option>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setAddingPlatform(v => !v)} style={addBtnStyle(addingPlatform)}>+</button>
          </div>
          {addingPlatform && <AddOptionInline placeholder="Tên sàn mới..." onAdd={addPlatform} onClose={() => setAddingPlatform(false)} />}
        </div>
        {/* Promotion */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterPromotion} onChange={e => setFilterPromotion(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả promotion</option>
              {promotions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setAddingPromotion(v => !v)} style={addBtnStyle(addingPromotion)}>+</button>
          </div>
          {addingPromotion && <AddOptionInline placeholder="Tên promotion mới..." onAdd={addPromotion} onClose={() => setAddingPromotion(false)} />}
        </div>
        {/* Clear */}
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
        Nhập công thức bằng dấu <strong>=</strong>. Ví dụ: <code>=E1-G1-I1</code>, <code>=regularPrice-voucher</code>, <code>=listedPrice*0.9</code>.
        &nbsp;Cell hiển thị kết quả — click vào để xem/sửa công thức.
        &nbsp;<strong>Kéo ô cam</strong> ở góc phải để áp dụng công thức cho các dòng bên dưới.
      </div>

      {/* ── Table ── */}
      <div className="listed-price-table-card">
        <div className="listed-price-table-wrap">
          <table className="listed-price-table"
            onMouseLeave={() => { if (fillDrag) setFillOver(null); }}>
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
              {filteredRows.map(({ row, index }) => {
                const isHighlighted = getFillHighlight(index);
                return (
                  <tr key={row.id}
                    onMouseEnter={() => { if (fillDrag) setFillOver(index); }}
                    style={isHighlighted ? { background: '#fff7ed', outline: '1px dashed #ea580c' } : undefined}
                  >
                    <td className="listed-price-table__index">{index + 1}</td>
                    {columns.map(col => renderCell(col, row, index))}
                    <td className="listed-price-table__actions">
                      <button type="button" title="Nhân bản" onClick={() => duplicateRow(row)}>⧉</button>
                      <button type="button" title="Xóa dòng"  onClick={() => deleteRow(row.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Fill Handle widget ────────────────────────────────────────────────────────
const FillHandle = ({ onMouseDown, active }) => (
  <div
    onMouseDown={onMouseDown}
    title="Kéo xuống để áp dụng"
    style={{
      position: 'absolute', bottom: 1, right: 1,
      width: 9, height: 9,
      background: active ? '#c2410c' : '#ea580c',
      border: '1.5px solid #fff',
      borderRadius: 2,
      cursor: 'crosshair',
      zIndex: 10,
      opacity: 0.85,
      transition: 'opacity 0.1s',
    }}
    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1)'; }}
  />
);

export default ListedPriceTab;
