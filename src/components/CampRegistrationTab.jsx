import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';

// ─── helpers ────────────────────────────────────────────────
const toInt = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const n = parseInt(String(val).replace(/,/g, '').trim(), 10);
    return isNaN(n) ? null : n;
};

const fmt = (n) => Number(n).toLocaleString('vi-VN');

const PRIORITY_LS_KEY = 'camp_priority_skus';   // nhớ bảng ID ưu tiên giữa các lần

// ─── core logic (ported from app.py + rule ƯU TIÊN) ─────────
function processFiles(tiktokRows, campainRows, prioritySet) {
    // Build tiktok_map: sku_id → { product_id, product_name, camp_price }
    const tiktokMap = {};
    for (const row of tiktokRows) {
        const productId   = row[0];
        const productName = row[1] ? String(row[1]) : '';
        const skuId       = row[2];
        const campPrice   = toInt(row[6]);
        if (skuId != null && campPrice !== null) {
            tiktokMap[String(skuId)] = {
                productId:   productId != null ? String(productId) : '',
                productName,
                campPrice,
            };
        }
    }

    const kept           = [];
    const removed        = [];
    const th2ByPid       = {};            // pid → list
    const keptPidsNormal = new Set();     // product có ≥1 SKU đạt điều kiện (TH1/TH3)
    const outSkus        = new Set();     // SKU đã đưa vào output (chống trùng)
    const campInfo       = {};            // skuId → {pidStr, myPrice, ttPrice, ttInfo, phanLoai}

    for (const row of campainRows) {
        const productIdCp = row[0];
        const skuIdCp     = row[1];
        const myPrice     = toInt(row[2]);
        const phanLoai    = (row[3] != null && String(row[3]).trim() !== '') ? String(row[3]).trim() : '';

        if (skuIdCp == null || myPrice === null) continue;

        const skuStr = String(skuIdCp);
        const pidStr = productIdCp != null ? String(productIdCp) : '';
        const ttInfo = tiktokMap[skuStr];

        if (!ttInfo) {
            removed.push({ sku: skuStr, pid: pidStr, reason: 'Không tìm thấy trong file TikTok' });
            continue;
        }

        const ttPrice = ttInfo.campPrice;
        const diff    = myPrice - ttPrice;
        campInfo[skuStr] = { pidStr, myPrice, ttPrice, ttInfo, phanLoai };

        if (diff > 1000) {
            // TH2: loại (trừ khi là SKU ưu tiên — xử lý ở pass dưới)
            removed.push({
                sku: skuStr, pid: pidStr, myPrice, ttPrice,
                reason: `TH2: Giá A (${fmt(myPrice)}) > Giá B (${fmt(ttPrice)}) + 1.000đ (hơn ${fmt(diff)}đ)`,
            });
            if (!th2ByPid[pidStr]) th2ByPid[pidStr] = [];
            th2ByPid[pidStr].push({
                skuId:       skuStr,
                productId:   ttInfo.productId,
                productName: ttInfo.productName,
                myPrice,
                ttPrice,
                phanLoai,
            });
        } else if (diff > 0) {
            // TH3: quay đầu → dùng giá B
            kept.push({ productId: ttInfo.productId, skuId: skuStr, campaignPrice: ttPrice, note: '' });
            keptPidsNormal.add(pidStr); outSkus.add(skuStr);
        } else {
            // TH1: giá A <= giá B → dùng giá A
            kept.push({ productId: ttInfo.productId, skuId: skuStr, campaignPrice: myPrice, note: '' });
            keptPidsNormal.add(pidStr); outSkus.add(skuStr);
        }
    }

    // TH4: tất cả SKU của product đều bị TH2 → pick SKU giá A cao nhất
    const special = [];
    for (const [pid, skuList] of Object.entries(th2ByPid)) {
        if (!keptPidsNormal.has(pid)) {
            const best = skuList.reduce((a, b) => a.myPrice > b.myPrice ? a : b);
            if (outSkus.has(best.skuId)) continue;
            const phanLoaiTxt = best.phanLoai ? ` | Phân loại: ${best.phanLoai}` : '';
            const note = `[TH4-ĐẶC BIỆT] Toàn bộ SKU vượt giá B.${phanLoaiTxt} | Giá A cao nhất: ${fmt(best.myPrice)}đ vs Giá B: ${fmt(best.ttPrice)}đ | Cần duyệt thủ công!`;
            special.push({
                productId:   best.productId,
                skuId:       best.skuId,
                productName: best.productName,
                campaignPrice: best.ttPrice,
                note,
                myPrice:     best.myPrice,
                ttPrice:     best.ttPrice,
                phanLoai:    best.phanLoai,
            });
            outSkus.add(best.skuId);
        }
    }

    // ƯU TIÊN: mọi SKU trong bảng ưu tiên đều PHẢI được đăng kí (đè TH2 nếu cần),
    // giá đăng kí = min(Giá A, Giá B). Vẫn giữ SKU giá cao nhất ở TH4 (đã thêm ở trên).
    const priorityRows   = [];   // dòng ưu tiên cần THÊM vào output (chưa có sẵn)
    const priorityReport = [];   // báo cáo MỌI SKU ưu tiên (kể cả đã có / không tìm thấy)
    for (const skuStr of prioritySet) {
        const info = campInfo[skuStr];
        if (!info) {
            const inTt = tiktokMap[skuStr];
            priorityReport.push({
                skuId: skuStr, productId: inTt?.productId || '', productName: inTt?.productName || '',
                phanLoai: '', allowedPrice: null, campaignPrice: inTt ? inTt.campPrice : null,
                found: false,
                status: inTt ? 'Có trong file TikTok nhưng THIẾU trong file giá của mình' : 'KHÔNG tìm thấy trong cả 2 file',
            });
            continue;
        }
        const { myPrice, ttPrice, ttInfo, phanLoai } = info;
        const cp      = Math.min(myPrice, ttPrice);
        const overB   = (myPrice - ttPrice) > 1000;
        const already = outSkus.has(skuStr);
        if (!already) {
            const note = `[ƯU TIÊN] Phân loại ưu tiên (điền tay).${phanLoai ? ' Phân loại: ' + phanLoai + '.' : ''} `
                + `Giá cho phép: ${fmt(myPrice)}đ · Giá đăng kí: ${fmt(cp)}đ`
                + (overB ? ' · (Giá A vượt Giá B nhưng VẪN đăng do ưu tiên)' : '');
            priorityRows.push({ productId: ttInfo.productId, skuId: skuStr, campaignPrice: cp, note });
            outSkus.add(skuStr);
        }
        priorityReport.push({
            skuId: skuStr, productId: ttInfo.productId, productName: ttInfo.productName, phanLoai,
            allowedPrice: myPrice, campaignPrice: cp, found: true,
            status: already ? 'Đã đạt điều kiện — đăng kí' : (overB ? 'Ưu tiên — đè TH2, đăng ở Giá B' : 'Ưu tiên — đăng kí'),
        });
    }

    return { kept, removed, special, priorityRows, priorityReport };
}

const MEO_TEXT =
    'Mẹo: Kiểm tra các yêu cầu của chiến dịch trước khi tải tệp lên\r\n\r\n' +
    '    1,Hiệu suất cửa hàng: Đáp ứng các tiêu chí đăng ký chiến dịch TikTok Shop.\r\n' +
    '    2,Cửa hàng được chỉ định: Chỉ những cửa hàng được chỉ định mới có thể đăng ký cho chiến dịch này.\r\n' +
    '    3,Chất lượng sản phẩm: Đáp ứng tiêu chí đăng ký sản phẩm cho chiến dịch TikTok Shop.\r\n' +
    'Các trường bắt buộc: ID sản phẩm, ID SKU, giá chiến dịch.';

const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFF00' }, bgColor: { rgb: 'FFFF00' } };
const BLUE_FILL   = { patternType: 'solid', fgColor: { rgb: 'CCE5FF' }, bgColor: { rgb: 'CCE5FF' } };

function buildOutputXlsx(kept, special, priorityRows) {
    const keptRows    = kept.map(r => [r.productId, r.skuId, r.campaignPrice, r.note || '']);
    const specialRows = special.map(r => [r.productId, r.skuId, r.campaignPrice, r.note || '']);
    const prioRows    = priorityRows.map(r => [r.productId, r.skuId, r.campaignPrice, r.note || '']);

    // Row 0 = TikTok "Mẹo:" template header  |  Row 1 = column headers
    const allRows = [
        [MEO_TEXT, null, null, null],
        ['Product ID', 'SKU ID', 'Campaign price', null],
        ...keptRows,
        ...specialRows,
        ...prioRows,
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // ── Column widths ──
    ws['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 95 }];

    // ── Merge A1:D1 for the Mẹo title row ──
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

    // ── Row heights ──
    ws['!rows'] = [
        { hpt: 85 },   // row 1 — Mẹo text (tall for multi-line)
        { hpt: 22 },   // row 2 — headers
        ...Array(keptRows.length).fill({ hpt: 20 }),     // normal data rows
        ...Array(specialRows.length).fill({ hpt: 38 }),  // TH4 rows (longer note text)
        ...Array(prioRows.length).fill({ hpt: 38 }),     // priority rows
    ];

    // ── Style: Mẹo title cell ──
    ws['A1'].s = {
        font: { sz: 11 },
        alignment: { wrapText: true, vertical: 'top', horizontal: 'left' },
    };

    // ── Style: Header row — bold, light grey bg ──
    ['A2', 'B2', 'C2', 'D2'].forEach(ref => {
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = {
            font:      { sz: 12, bold: true },
            fill:      { patternType: 'solid', fgColor: { rgb: 'F2F2F2' }, bgColor: { rgb: 'F2F2F2' } },
            alignment: { horizontal: 'center', vertical: 'center' },
        };
    });

    // ── Style: Normal data rows — font 12 ──
    for (let ri = 0; ri < keptRows.length; ri++) {
        const excelRow = ri + 3; // rows start at Excel row 3
        ['A', 'B', 'C', 'D'].forEach(col => {
            const ref = col + excelRow;
            if (ws[ref]) ws[ref].s = { font: { sz: 12 } };
        });
    }

    // ── Style: TH4 rows — yellow fill + font 12 ──
    const specialStartExcelRow = 2 + keptRows.length + 1; // 1-indexed
    for (let i = 0; i < specialRows.length; i++) {
        const excelRow = specialStartExcelRow + i;
        ['A', 'B', 'C', 'D'].forEach(col => {
            const ref = col + excelRow;
            if (!ws[ref]) ws[ref] = { t: 's', v: '' };
            ws[ref].s = {
                fill:      YELLOW_FILL,
                font:      { sz: 12 },
                alignment: col === 'D' ? { wrapText: true, vertical: 'top' } : { vertical: 'center' },
            };
        });
    }

    // ── Style: ƯU TIÊN rows — blue fill + font 12 ──
    const prioStartExcelRow = 2 + keptRows.length + specialRows.length + 1; // 1-indexed
    for (let i = 0; i < prioRows.length; i++) {
        const excelRow = prioStartExcelRow + i;
        ['A', 'B', 'C', 'D'].forEach(col => {
            const ref = col + excelRow;
            if (!ws[ref]) ws[ref] = { t: 's', v: '' };
            ws[ref].s = {
                fill:      BLUE_FILL,
                font:      { sz: 12 },
                alignment: col === 'D' ? { wrapText: true, vertical: 'top' } : { vertical: 'center' },
            };
        });
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

function downloadBlob(data, filename) {
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function readExcelRows(file, startRow = 2) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
                resolve(allRows.slice(startRow)); // skip tip + header rows
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ─── styles ─────────────────────────────────────────────────
const card = {
    background: '#fff', borderRadius: 16, border: '1px solid #eee',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', padding: 28, marginBottom: 20,
};
const uploadBoxBase = {
    border: '2px dashed #ddd', borderRadius: 12, padding: 24, textAlign: 'center',
    cursor: 'pointer', transition: 'all 0.25s', position: 'relative', flex: 1,
};
const btnPrimary = {
    width: '100%', padding: '14px 0', background: 'linear-gradient(135deg,#ee1d52,#ff6b6b)',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};
const btnGreen = {
    width: '100%', padding: '13px 0', background: 'linear-gradient(135deg,#28a745,#20c997)',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};
const statCard = (type) => {
    const colors = {
        success: { bg: '#d4edda', text: '#155724' },
        warning: { bg: '#fff3cd', text: '#856404' },
        danger:  { bg: '#f8d7da', text: '#721c24' },
        info:    { bg: '#cce5ff', text: '#004085' },
    }[type];
    return {
        background: colors.bg, borderRadius: 10, padding: '16px 12px', textAlign: 'center', flex: 1,
    };
};

// ─── Component ──────────────────────────────────────────────
export default function CampRegistrationTab() {
    const [tiktokFile,  setTiktokFile]  = useState(null);
    const [campainFile, setCampainFile] = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [result,      setResult]      = useState(null); // { kept, removed, special, priorityRows, priorityReport }
    const [error,       setError]       = useState('');
    const [outputData,  setOutputData]  = useState(null);
    const [priorityInput, setPriorityInput] = useState(() => {
        try { return localStorage.getItem(PRIORITY_LS_KEY) || ''; } catch { return ''; }
    });
    const tiktokRef  = useRef();
    const campainRef = useRef();

    // nhớ bảng ID ưu tiên
    useEffect(() => {
        try { localStorage.setItem(PRIORITY_LS_KEY, priorityInput); } catch { /* ignore */ }
    }, [priorityInput]);

    // ID ưu tiên: tách theo dòng / dấu phẩy / khoảng trắng
    const prioritySet = useMemo(
        () => new Set(priorityInput.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean)),
        [priorityInput],
    );

    const handleProcess = async () => {
        if (!tiktokFile || !campainFile) { setError('Vui lòng chọn đủ 2 file!'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const [tiktokRows, campainRows] = await Promise.all([
                readExcelRows(tiktokFile, 2),   // skip row 0 (tip) + row 1 (header)
                readExcelRows(campainFile, 2),
            ]);

            const res = processFiles(tiktokRows, campainRows, prioritySet);
            const { kept, removed, special, priorityRows } = res;

            // Sanity check: all removed + no kept/special → likely swapped files
            if (kept.length === 0 && special.length === 0 && priorityRows.length === 0 && removed.length > 0) {
                const notFound = removed.filter(r => r.reason.includes('Không tìm thấy')).length;
                if (notFound === removed.length) {
                    setError('⚠️ Có thể bạn upload nhầm thứ tự file! Ô trái = File TikTok gửi, ô phải = File giá của mình.');
                    setLoading(false); return;
                }
            }

            const xlsxData = buildOutputXlsx(kept, special, priorityRows);
            setOutputData(xlsxData);
            setResult(res);
        } catch (e) {
            setError('Lỗi xử lý: ' + e.message);
        } finally { setLoading(false); }
    };

    const handleDownload = () => {
        if (outputData) downloadBlob(outputData, 'KET_QUA_DANG_KI_CAMP.xlsx');
    };

    const buildProposal = (specialList) => {
        if (!specialList?.length) return '';
        let lines = ['Dạ cho em đề xuất các sku sau nha\n'];
        specialList.forEach(s => {
            lines.push(`* Tên: ${s.productName || s.productId}`);
            lines.push(`* Phân loại: ${s.phanLoai || '(chưa có)'}`);
            lines.push(`* Giá đề xuất: ${fmt(s.ttPrice)}đ (Thấp hơn giá cho phép: ${fmt(s.myPrice)}đ)`);
            lines.push('');
        });
        return lines.join('\n');
    };

    const [copied, setCopied] = useState(false);
    const copyProposal = () => {
        const text = buildProposal(result?.special);
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 2000);
        });
    };

    const UploadBox = ({ file, inputRef, onChange, label, sub, icon, color }) => (
        <div
            style={{ ...uploadBoxBase, borderColor: file ? '#28a745' : '#ddd', background: file ? '#f0fff4' : '#fff' }}
            onClick={() => inputRef.current?.click()}
        >
            <input ref={inputRef} type="file" accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => onChange(e.target.files[0] || null)} />
            <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#333', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 11, color, fontWeight: 600 }}>{sub}</div>
            {file && <div style={{ fontSize: 12, color: '#28a745', fontWeight: 600, marginTop: 8, wordBreak: 'break-all' }}>✅ {file.name}</div>}
        </div>
    );

    const priorityCount = prioritySet.size;
    const priorityRegistered = result?.priorityReport?.filter(p => p.found).length || 0;
    const priorityNotFound   = result?.priorityReport?.filter(p => !p.found) || [];

    return (
        <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 760, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🛒</div>
                <h1 className="page-header" style={{ margin: 0 }}>APP ĐĂNG KÍ CAMP TIKTOK</h1>
                <p style={{ color: '#888', marginTop: 6, fontSize: 14 }}>Tự động lọc & tạo file đăng kí chiến dịch</p>
            </div>

            {/* Logic box */}
            <div style={{ ...card, background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e', marginBottom: 10 }}>📋 Quy tắc xử lý:</div>
                <ul style={{ paddingLeft: 18, fontSize: 13, color: '#555', lineHeight: 1.9 }}>
                    <li><span style={{ color: '#28a745', fontWeight: 700 }}>✅ TH1:</span> Giá A ≤ Giá B → lấy <b>Giá A</b></li>
                    <li><span style={{ color: '#28a745', fontWeight: 700 }}>✅ TH3:</span> Giá A &gt; Giá B trong 0–1.000đ (quay đầu) → lấy <b>Giá B</b></li>
                    <li><span style={{ color: '#dc3545', fontWeight: 700 }}>❌ TH2:</span> Giá A &gt; Giá B hơn 1.000đ → <b>XÓA</b></li>
                    <li><span style={{ color: '#856404', fontWeight: 700 }}>⚠️ TH4:</span> Toàn bộ SKU của 1 Product đều bị TH2 → <b>Pick SKU giá A cao nhất, highlight vàng để duyệt</b></li>
                    <li><span style={{ color: '#004085', fontWeight: 700 }}>🎯 ƯU TIÊN:</span> ID phân loại điền trong bảng ưu tiên → <b>luôn được đăng kí</b> (đè TH2, đăng ở Giá B), <b>kèm</b> SKU giá cao nhất. Highlight xanh để biết.</li>
                </ul>
            </div>

            {/* Bảng ID phân loại ưu tiên */}
            <div style={{ ...card, border: '2px solid #b8daff', background: '#f5faff' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#004085', marginBottom: 6 }}>
                    🎯 Bảng ID phân loại ưu tiên (điền tay)
                </div>
                <div style={{ fontSize: 12.5, color: '#5b6b7b', marginBottom: 12, lineHeight: 1.6 }}>
                    Mỗi dòng <b>1 ID phân loại (SKU ID)</b> cần ưu tiên đăng kí trong camp. Những SKU này <b>luôn được fill vào file</b> dù vượt giá (đăng ở Giá B), kèm SKU giá cao nhất như cũ. Bỏ trống = chạy theo rule cũ.
                    <span style={{ color: '#004085', fontWeight: 700 }}> Đang có {priorityCount} ID ưu tiên.</span>
                </div>
                <textarea
                    value={priorityInput}
                    onChange={e => setPriorityInput(e.target.value)}
                    placeholder={'Dán / gõ ID phân loại, mỗi dòng 1 ID. Ví dụ:\n1729412345678901234\n1729498765432109876'}
                    style={{
                        width: '100%', minHeight: 96, padding: '12px 14px', fontSize: 13,
                        fontFamily: "'Outfit', sans-serif", lineHeight: 1.7, borderRadius: 10,
                        border: '1px solid #b8daff', background: '#fff', color: '#333',
                        boxSizing: 'border-box', outline: 'none', resize: 'vertical',
                    }}
                />
                {priorityCount > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {[...prioritySet].slice(0, 40).map(id => (
                            <span key={id} style={{ fontSize: 11.5, fontWeight: 700, color: '#004085', background: '#cce5ff', borderRadius: 14, padding: '3px 10px' }}>{id}</span>
                        ))}
                        {priorityCount > 40 && <span style={{ fontSize: 11.5, color: '#5b6b7b' }}>… +{priorityCount - 40}</span>}
                        <button onClick={() => setPriorityInput('')} style={{ fontSize: 11.5, fontWeight: 700, color: '#721c24', background: '#f8d7da', border: 'none', borderRadius: 14, padding: '3px 12px', cursor: 'pointer' }}>✕ Xoá hết</button>
                    </div>
                )}
            </div>

            {/* Upload area */}
            <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#333', marginBottom: 16 }}>📂 Upload file</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                    <UploadBox
                        file={tiktokFile} inputRef={tiktokRef} onChange={setTiktokFile}
                        label="① File TikTok gửi" sub="Processing_result_Campaign_prefill_template..."
                        icon="📥" color="#ee1d52"
                    />
                    <UploadBox
                        file={campainFile} inputRef={campainRef} onChange={setCampainFile}
                        label="② File giá của mình" sub="FILE CAMPAIN (Product ID, SKU ID, giá)"
                        icon="📊" color="#1a7f37"
                    />
                </div>

                <button style={{ ...btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                    onClick={handleProcess} disabled={loading}>
                    {loading
                        ? <><span style={{ width: 18, height: 18, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Đang xử lý...</>
                        : '⚡ Xử lý ngay'
                    }
                </button>

                {error && (
                    <div style={{ background: '#f8d7da', color: '#721c24', padding: '12px 16px', borderRadius: 8, marginTop: 14, fontSize: 14 }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Result */}
            {result && (
                <div style={card}>
                    {/* Stat cards */}
                    <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                        <div style={statCard('success')}>
                            <div style={{ fontSize: 34, fontWeight: 800, color: '#155724' }}>{result.kept.length}</div>
                            <div style={{ fontSize: 13, color: '#155724', marginTop: 4 }}>✅ Đăng kí được</div>
                        </div>
                        <div style={statCard('info')}>
                            <div style={{ fontSize: 34, fontWeight: 800, color: '#004085' }}>{priorityRegistered}</div>
                            <div style={{ fontSize: 13, color: '#004085', marginTop: 4 }}>🎯 Ưu tiên</div>
                        </div>
                        <div style={statCard('warning')}>
                            <div style={{ fontSize: 34, fontWeight: 800, color: '#856404' }}>{result.special.length}</div>
                            <div style={{ fontSize: 13, color: '#856404', marginTop: 4 }}>⚠️ TH4 - Cần duyệt</div>
                        </div>
                        <div style={statCard('danger')}>
                            <div style={{ fontSize: 34, fontWeight: 800, color: '#721c24' }}>{result.removed.length}</div>
                            <div style={{ fontSize: 13, color: '#721c24', marginTop: 4 }}>❌ Bị loại</div>
                        </div>
                    </div>

                    {/* Download */}
                    <button style={btnGreen} onClick={handleDownload}>
                        📥 Tải file kết quả (.xlsx)
                    </button>

                    {/* Bảng thông báo PHÂN LOẠI ƯU TIÊN */}
                    {result.priorityReport.length > 0 && (
                        <div style={{ marginTop: 16, border: '2px solid #b8daff', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ padding: '10px 16px', background: '#cce5ff', color: '#004085', fontWeight: 700, fontSize: 13 }}>
                                🎯 Camp này ưu tiên {result.priorityReport.filter(p => p.found).length} phân loại (highlight xanh trong file):
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#eaf4ff', color: '#004085' }}>
                                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700 }}>Tên SP / Phân loại</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700 }}>ID phân loại</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>Giá cho phép</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>Giá đăng kí camp</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700 }}>Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.priorityReport.map((p, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid #eef', background: p.found ? '#fff' : '#fff6f6' }}>
                                                <td style={{ padding: '7px 10px', color: '#333' }}>{p.productName || '—'}{p.phanLoai ? ` · ${p.phanLoai}` : ''}</td>
                                                <td style={{ padding: '7px 10px', color: '#666', fontFamily: 'monospace' }}>{p.skuId}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#333' }}>{p.allowedPrice != null ? fmt(p.allowedPrice) + 'đ' : '—'}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#004085' }}>{p.campaignPrice != null ? fmt(p.campaignPrice) + 'đ' : '—'}</td>
                                                <td style={{ padding: '7px 10px', color: p.found ? '#155724' : '#721c24', fontWeight: 600 }}>{p.found ? '✅ ' : '⚠️ '}{p.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {priorityNotFound.length > 0 && (
                                <div style={{ padding: '8px 16px', background: '#fff6f6', color: '#721c24', fontSize: 12 }}>
                                    ⚠️ {priorityNotFound.length} ID ưu tiên không đăng kí được (xem cột trạng thái) — kiểm tra lại ID hoặc 2 file đầu vào.
                                </div>
                            )}
                        </div>
                    )}

                    {/* TH4 special items */}
                    {result.special.length > 0 && (
                        <div style={{ marginTop: 16, border: '2px solid #ffc107', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ padding: '10px 16px', background: '#fff3cd', color: '#856404', fontWeight: 700, fontSize: 13 }}>
                                ⚠️ TH4 — {result.special.length} product cần duyệt thủ công (highlight vàng trong file):
                            </div>
                            {result.special.map((s, i) => (
                                <div key={i} style={{ padding: '8px 16px', fontSize: 12, color: '#555', borderBottom: '1px solid #fff3cd', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                    <span><b style={{ color: '#856404' }}>Tên:</b> {s.productName || s.productId}</span>
                                    <span><b style={{ color: '#856404' }}>Phân loại:</b> {s.phanLoai || '—'}</span>
                                    <span><b style={{ color: '#856404' }}>Giá A:</b> {fmt(s.myPrice)}đ</span>
                                    <span><b style={{ color: '#856404' }}>Giá B:</b> {fmt(s.ttPrice)}đ</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Mẫu đề xuất */}
                    {result.special.length > 0 && (
                        <div style={{ marginTop: 14, border: '2px solid #ffc107', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#fff3cd', color: '#856404', fontWeight: 700, fontSize: 13 }}>
                                <span>📋 Mẫu đề xuất sếp (TH4)</span>
                                <button onClick={copyProposal} style={{ padding: '5px 14px', background: copied ? '#28a745' : '#856404', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                    {copied ? '✅ Đã copy!' : '📋 Copy'}
                                </button>
                            </div>
                            <textarea readOnly value={buildProposal(result.special)}
                                style={{ width: '100%', minHeight: 150, padding: '14px 16px', fontSize: 13, fontFamily: "'Outfit', sans-serif", lineHeight: 1.7, border: 'none', resize: 'vertical', background: '#fffdf0', color: '#333', boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                    )}

                    {/* Danh sách bị loại TH2 */}
                    {result.removed.filter(r => r.reason?.includes('TH2')).length > 0 && (
                        <div style={{ marginTop: 14, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                            <div style={{ padding: '10px 16px', background: '#f8d7da', color: '#721c24', fontSize: 13, fontWeight: 700, position: 'sticky', top: 0 }}>
                                Danh sách bị loại TH2 (giá A vượt B quá 1.000đ) — {result.removed.filter(r => r.reason?.includes('TH2')).length} SKU
                            </div>
                            {result.removed.filter(r => r.reason?.includes('TH2')).slice(0, 30).map((r, i) => (
                                <div key={i} style={{ padding: '6px 16px', fontSize: 12, color: '#666', borderBottom: '1px solid #f5f5f5' }}>
                                    SKU: {r.sku} — {r.reason}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
