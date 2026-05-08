import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

// ─── helpers ────────────────────────────────────────────────
const toInt = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const n = parseInt(String(val).replace(/,/g, '').trim(), 10);
    return isNaN(n) ? null : n;
};

const fmt = (n) => Number(n).toLocaleString('vi-VN');

// ─── core logic (ported from app.py) ────────────────────────
function processFiles(tiktokRows, campainRows) {
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

    const kept      = [];
    const removed   = [];
    const th2ByPid  = {};   // pid → list
    const keptPids  = new Set();

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

        if (diff > 1000) {
            // TH2: loại
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
            keptPids.add(pidStr);
        } else {
            // TH1: giá A <= giá B → dùng giá A
            kept.push({ productId: ttInfo.productId, skuId: skuStr, campaignPrice: myPrice, note: '' });
            keptPids.add(pidStr);
        }
    }

    // TH4: tất cả SKU của product đều bị TH2
    const special = [];
    for (const [pid, skuList] of Object.entries(th2ByPid)) {
        if (!keptPids.has(pid)) {
            const best = skuList.reduce((a, b) => a.myPrice > b.myPrice ? a : b);
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
        }
    }

    return { kept, removed, special };
}

function buildOutputXlsx(kept, special) {
    const allRows = [
        ['Product ID', 'SKU ID', 'Campaign price', 'Note'],
        ...kept.map(r => [r.productId, r.skuId, r.campaignPrice, r.note]),
        ...special.map(r => [r.productId, r.skuId, r.campaignPrice, r.note]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Column widths
    ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(wb, ws, 'KET_QUA');
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
    const [result,      setResult]      = useState(null); // { kept, removed, special }
    const [error,       setError]       = useState('');
    const [outputData,  setOutputData]  = useState(null);
    const tiktokRef  = useRef();
    const campainRef = useRef();

    const handleProcess = async () => {
        if (!tiktokFile || !campainFile) { setError('Vui lòng chọn đủ 2 file!'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const [tiktokRows, campainRows] = await Promise.all([
                readExcelRows(tiktokFile, 2),   // skip row 0 (tip) + row 1 (header)
                readExcelRows(campainFile, 2),
            ]);

            const { kept, removed, special } = processFiles(tiktokRows, campainRows);

            // Sanity check: all removed + no kept/special → likely swapped files
            if (kept.length === 0 && special.length === 0 && removed.length > 0) {
                const notFound = removed.filter(r => r.reason.includes('Không tìm thấy')).length;
                if (notFound === removed.length) {
                    setError('⚠️ Có thể bạn upload nhầm thứ tự file! Ô trái = File TikTok gửi, ô phải = File giá của mình.');
                    setLoading(false); return;
                }
            }

            const xlsxData = buildOutputXlsx(kept, special);
            setOutputData(xlsxData);
            setResult({ kept, removed, special });
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

    return (
        <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 760, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🛒</div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>APP ĐĂNG KÍ CAMP TIKTOK</h1>
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
                </ul>
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
