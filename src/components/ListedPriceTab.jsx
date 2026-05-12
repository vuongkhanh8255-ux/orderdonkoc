import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'stella_listed_price_rows_v1';

const columns = [
  { key: 'productName', label: 'Tên sản phẩm', minWidth: 240 },
  { key: 'barcode', label: 'Barcode', minWidth: 150 },
  { key: 'brand', label: 'Brand', minWidth: 150 },
  { key: 'listedPrice', label: 'Giá Niêm yết', minWidth: 150 },
  { key: 'promotion', label: 'Promotion', minWidth: 150 },
  { key: 'regularPrice', label: 'Giá regular', minWidth: 150 },
  { key: 'fsPrice', label: 'Giá FS', minWidth: 130 },
  { key: 'voucher', label: 'Voucher', minWidth: 130 },
  { key: 'platform', label: 'Sàn', minWidth: 130 },
  { key: 'finalPrice', label: 'Giá final', minWidth: 150 },
];

const columnLetters = columns.reduce((acc, col, index) => {
  acc[String.fromCharCode(65 + index)] = col.key;
  return acc;
}, {});

const formulaAliases = {
  listedPrice: 'listedPrice',
  giaNiemYet: 'listedPrice',
  regularPrice: 'regularPrice',
  giaRegular: 'regularPrice',
  fsPrice: 'fsPrice',
  giaFS: 'fsPrice',
  voucher: 'voucher',
  finalPrice: 'finalPrice',
  giaFinal: 'finalPrice',
  promotion: 'promotion',
};

const createRow = () => ({
  id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  productName: '',
  barcode: '',
  brand: '',
  listedPrice: '',
  promotion: '',
  regularPrice: '',
  fsPrice: '',
  voucher: '',
  platform: '',
  finalPrice: '',
});

const loadRows = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const rows = raw ? JSON.parse(raw) : null;
    return Array.isArray(rows) && rows.length ? rows : [createRow(), createRow(), createRow()];
  } catch (error) {
    console.warn('Cannot load listed price rows', error);
    return [createRow(), createRow(), createRow()];
  }
};

const isFormula = (value) => String(value || '').trim().startsWith('=');

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.endsWith('%')) return parseNumber(raw.slice(0, -1)) / 100;

  const normalized = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatFormulaResult = (value) => {
  if (!Number.isFinite(value)) return 'Lỗi công thức';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
};

const evaluateFormula = (formula, row, rowIndex, allRows, currentKey) => {
  const stack = new Set([`${rowIndex}:${currentKey}`]);

  const getValue = (targetRowIndex, key) => {
    const targetRow = allRows[targetRowIndex];
    if (!targetRow) return 0;
    const stackKey = `${targetRowIndex}:${key}`;
    if (stack.has(stackKey)) return 0;

    const rawValue = targetRow[key];
    if (isFormula(rawValue)) {
      stack.add(stackKey);
      const result = runFormula(rawValue, targetRow, targetRowIndex);
      stack.delete(stackKey);
      return result;
    }
    return parseNumber(rawValue);
  };

  const runFormula = (rawFormula, activeRow, activeRowIndex) => {
    let expression = String(rawFormula || '').trim().replace(/^=/, '');
    expression = expression.replace(/(\d+(?:[.,]\d+)?)%/g, '($1/100)');
    expression = expression.replace(/\b([A-J])(\d+)\b/gi, (_, letter, rowNumber) => {
      const key = columnLetters[letter.toUpperCase()];
      return key ? String(getValue(Number(rowNumber) - 1, key)) : '0';
    });
    Object.entries(formulaAliases).forEach(([alias, key]) => {
      expression = expression.replace(new RegExp(`\\b${alias}\\b`, 'gi'), String(getValue(activeRowIndex, key)));
    });
    if (!/^[\d+\-*/().\s]+$/.test(expression)) return NaN;
    try {
      const result = Function(`"use strict"; return (${expression});`)();
      return Number.isFinite(result) ? result : NaN;
    } catch {
      return NaN;
    }
  };

  return runFormula(formula, row, rowIndex);
};

const ListedPriceTab = () => {
  const [rows, setRows] = useState(loadRows);
  const [search, setSearch] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const rowsWithIndex = useMemo(() => rows.map((row, index) => ({ row, index })), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rowsWithIndex;
    return rowsWithIndex.filter(({ row }) => columns.some(col => String(row[col.key] || '').toLowerCase().includes(term)));
  }, [rowsWithIndex, search]);

  const updateCell = (rowId, key, value) => {
    setRows(prev => prev.map(row => row.id === rowId ? { ...row, [key]: value } : row));
  };

  const addRow = () => {
    setRows(prev => [...prev, createRow()]);
  };

  const duplicateRow = (row) => {
    setRows(prev => [...prev, { ...row, id: createRow().id }]);
  };

  const deleteRow = (rowId) => {
    setRows(prev => prev.length <= 1 ? [createRow()] : prev.filter(row => row.id !== rowId));
  };

  const clearAll = () => {
    if (!window.confirm('Xóa toàn bộ bảng giá niêm yết hiện tại?')) return;
    setRows([createRow()]);
  };

  return (
    <div className="listed-price-page">
      <div className="listed-price-page__header">
        <div>
          <div className="listed-price-page__eyebrow">Ecom</div>
          <h1>Bảng giá niêm yết</h1>
          <p>Listing full giá niêm yết theo sản phẩm, brand và sàn.</p>
        </div>
        <div className="listed-price-page__actions">
          <button type="button" className="listed-price-page__button is-muted" onClick={clearAll}>Xóa bảng</button>
          <button type="button" className="listed-price-page__button is-primary" onClick={addRow}>+ Thêm dòng</button>
        </div>
      </div>

      <div className="listed-price-page__toolbar">
        <div className="listed-price-page__search">
          <span>⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Lọc tên sản phẩm, barcode, brand, sàn..."
          />
        </div>
        <div className="listed-price-page__status">
          Hiển thị <strong>{filteredRows.length}</strong> / {rows.length} dòng
        </div>
      </div>

      <div className="listed-price-formula-help">
        Nhập công thức bằng dấu <strong>=</strong>. Ví dụ: <code>=D2-F2-H2</code>, <code>=regularPrice-voucher</code>, <code>=listedPrice*0.9</code>.
      </div>

      <div className="listed-price-table-card">
        <div className="listed-price-table-wrap">
          <table className="listed-price-table">
            <thead>
              <tr>
                <th className="listed-price-table__index">#</th>
                {columns.map((col, index) => (
                  <th key={col.key} style={{ minWidth: col.minWidth }}>
                    <span>{String.fromCharCode(65 + index)}</span>
                    {col.label}
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
                    return (
                      <td key={col.key} className={formula ? 'is-formula' : ''}>
                        <input
                          type="text"
                          value={row[col.key] || ''}
                          onChange={(event) => updateCell(row.id, col.key, event.target.value)}
                          placeholder={col.label}
                        />
                        {formula && (
                          <div className={`listed-price-table__formula-result ${Number.isFinite(formulaResult) ? '' : 'is-error'}`}>
                            = {formatFormulaResult(formulaResult)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="listed-price-table__actions">
                    <button type="button" title="Nhân bản dòng" onClick={() => duplicateRow(row)}>⧉</button>
                    <button type="button" title="Xóa dòng" onClick={() => deleteRow(row.id)}>×</button>
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
