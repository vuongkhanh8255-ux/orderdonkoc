import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';

const cardStyle = {
    background: '#fff',
    borderRadius: '16px',
    border: '1px solid #eee',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '24px',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column'
};

const formatNumber = (val) => new Intl.NumberFormat('vi-VN').format(val || 0);

// --- REUSABLE DATA TABLE COMPONENT WITH SORT & FILTER ---
const DataTable = ({ columns, data = [], title }) => {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
    const [filters, setFilters] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    // Reset to page 1 on search or sort
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, sortConfig, data]);

    // SORT HANDLER
    const handleSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // FILTER HANDLER
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // DATA PROCESSING
    const processedData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        let sortedData = [...data];

        // 1. Filter
        Object.keys(filters).forEach(key => {
            if (filters[key]) {
                const lowerVal = filters[key].toLowerCase();
                sortedData = sortedData.filter(item => {
                    const itemVal = String(item[key] || '').toLowerCase();
                    return itemVal.includes(lowerVal);
                });
            }
        });

        // 2. Sort
        if (sortConfig.key) {
            sortedData.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortedData;
    }, [data, sortConfig, filters]);

    const totalPages = Math.ceil(processedData.length / pageSize) || 1;
    const paginatedData = processedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div style={cardStyle}>
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#ea580c', fontWeight: 'bold', fontSize: '1.1rem', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>Hiển thị {paginatedData.length} / Tổng {processedData.length} kết quả</div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '600px', border: '1px solid #eee', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            {columns.map((col, idx) => (
                                <th key={idx} style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #eee', minWidth: '120px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <div
                                            onClick={() => handleSort(col.accessor)}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#ea580c', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase' }}
                                        >
                                            {col.header}
                                            {sortConfig.key === col.accessor && (
                                                <span>{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="..."
                                            value={filters[col.accessor] || ''}
                                            onChange={(e) => handleFilterChange(col.accessor, e.target.value)}
                                            style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: '0.75rem' }}
                                        />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, rowIdx) => (
                            <tr key={rowIdx} style={{ backgroundColor: rowIdx % 2 === 0 ? '#f9fafb' : 'transparent' }}>
                                {columns.map((col, colIdx) => (
                                    <td key={colIdx} style={{ padding: '12px 16px', borderBottom: '1px solid #eee', color: col.isBold ? '#333' : '#666', fontSize: '0.9rem' }}>
                                        {col.formatter ? col.formatter(row[col.accessor], row) : row[col.accessor]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* PAGINATION CONTROLS */}
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', color: '#666' }}>
                <div>
                    Trang <strong style={{ color: '#ea580c' }}>{currentPage}</strong> / {totalPages}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ padding: '6px 16px', background: currentPage === 1 ? '#f3f4f6' : '#fff', color: currentPage === 1 ? '#999' : '#ea580c', border: '1px solid #ddd', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                        ◀ TRƯỚC
                    </button>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ padding: '6px 16px', background: currentPage === totalPages ? '#f3f4f6' : '#ea580c', color: currentPage === totalPages ? '#999' : '#fff', border: '1px solid #ddd', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                        SAU ▶
                    </button>
                </div>
            </div>
        </div>
    );
};

const DataArchiveTab = () => {
    const { airLinks } = useAppData();

    // FILTERS
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [importedData, setImportedData] = useState([]);

    // UPLOAD STATE
    const [sheetUrl, setSheetUrl] = useState(localStorage.getItem('booking_sheet_url') || '');
    const [sheetMonth, setSheetMonth] = useState(new Date().getMonth() + 1);
    const [sheetYear, setSheetYear] = useState(new Date().getFullYear());
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [testParseResults, setTestParseResults] = useState([]); // Array to hold raw vs parsed samples

    useEffect(() => {
        loadPerformanceData(parseInt(month), parseInt(year));
    }, [month, year]);

    const loadPerformanceData = async (targetMonth, targetYear) => {
        try {
            let allData = [];
            let from = 0;
            const step = 1000;

            while (true) {
                const { data, error } = await supabase
                    .from('tiktok_performance')
                    .select('*')
                    .eq('month', targetMonth)
                    .eq('year', targetYear)
                    .range(from, from + step - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;

                allData = [...allData, ...data];
                if (data.length < step) break; // Finished fetching all records
                from += step;
            }

            setImportedData(allData);
        } catch (err) {
            console.error('Failed to load DB data:', err);
        }
    };

    const handleImportToDatabase = async () => {
        if (!sheetUrl) {
            alert("Vui lòng nhập Link Google Sheet!");
            return;
        }

        localStorage.setItem('booking_sheet_url', sheetUrl);
        setIsImporting(true);
        setImportProgress({ current: 0, total: 0 });
        setTestParseResults([]); // Reset debug logs

        try {
            console.log(`📥 Starting import for ${sheetMonth}/${sheetYear}...`);

            // 1. Convert to CSV URL
            let fetchUrl = sheetUrl;
            if (sheetUrl.includes('docs.google.com/spreadsheets')) {
                const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                if (match && match[1]) {
                    const sheetId = match[1];
                    let gid = '0';
                    const gidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/);
                    if (gidMatch && gidMatch[1]) gid = gidMatch[1];
                    fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
                }
            }

            // 2. Fetch CSV
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error("Không thể tải CSV!");
            const csvText = await response.text();

            // 3. Parse CSV rows
            const parseCSVLine = (text) => {
                const result = [];
                let cur = '';
                let inQuotes = false;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '"' && text[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(cur.trim());
                        cur = '';
                    } else {
                        cur += char;
                    }
                }
                result.push(cur.trim());
                return result;
            };

            const rows = csvText.split('\n').filter(r => r.trim()).map(row => parseCSVLine(row));

            // 4. Find header row
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(20, rows.length); i++) {
                const rowStr = rows[i].join(' ').toLowerCase();
                if (rowStr.includes('id video')) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                throw new Error("Không tìm thấy header 'ID Video'!");
            }

            const headers = rows[headerRowIndex];

            // 5. Map columns exactly as before, but with better prioritization
            const findIdx = (keywords) => {
                const hStrs = headers.map(h => String(h).toLowerCase().trim());
                // Exact match first
                let idx = hStrs.findIndex(str => keywords.some(k => str === k));
                if (idx !== -1) return idx;
                // Includes match
                return hStrs.findIndex(str => keywords.some(k => str.includes(k)));
            };

            let iID = headers.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                return str === 'id video' || str === 'video id' || str === 'id';
            });
            if (iID === -1) iID = findIdx(['id video', 'video id']);

            // Special handling for GMV to avoid a custom user column containing "#N/A"
            const findGMVIdx = () => {
                const hStrs = headers.map(h => String(h).toLowerCase().trim());
                let idx = hStrs.findIndex(str => ['tổng giá trị', 'doanh thu', 'gmv'].includes(str));
                if (idx !== -1) return idx;

                idx = hStrs.findIndex(str => str.includes('tổng giá trị') || str.includes('doanh thu'));
                if (idx !== -1) return idx;

                // Fallback to 'gmv' but ignore 'gmv quy ra'
                idx = hStrs.findIndex(str => str.includes('gmv') && !str.includes('quy ra'));
                if (idx !== -1) return idx;

                return hStrs.findIndex(str => str.includes('gmv'));
            };

            const iGMV = findGMVIdx();
            const iView = findIdx(['vv', 'lượt xem', 'view']);
            const iOrder = findIdx(['đơn hàng', 'số lượng bán', 'sold']);
            const iAirDate = findIdx(['thời gian', 'ngày phát']);
            const iCreatorName = findIdx(['tên', 'creator', 'nhà sáng tạo']);
            const iCreatorId = findIdx(['id nhà sáng tạo', 'creator id']);

            if (iID === -1) throw new Error("Không tìm thấy cột 'ID Video'!");

            // 6. Updated Robust parseVNNumber
            const parseVNNumber = (v, originalValueForDebug = null) => {
                if (!v) return 0;
                let rawString = String(v).trim();
                // Retain numeric chars, dot, comma, minus, and also 'e' or 'E' for scientific!
                let str = rawString.replace(/[^0-9.,\-eE]/g, '');

                // If it contains 'e' or 'E', assume it's scientific and let parseFloat handle it directly
                // (Though usually money shouldn't be scientific unless it's huge or exported weirdly)
                if (str.toLowerCase().includes('e')) {
                    // Do nothing, let parseFloat handle scientific
                }
                // Handle VN format (multiple dots or ends with dot + 3 digits)
                else if ((str.match(/\./g) || []).length > 1) {
                    str = str.replace(/\./g, '');
                } else if (/\.\d{3}$/.test(str) && !str.includes(',')) {
                    str = str.replace(/\./g, '');
                }
                // If it has BOTH comma and dot (e.g. 100,000.50), remove comma
                else if (str.includes(',') && str.includes('.')) {
                    str = str.replace(/,/g, '');
                }
                // If it ONLY has commas (e.g. 100,000), remove comma
                else if (str.includes(',') && !str.includes('.')) {
                    // Check if comma is used as decimal (VN locale like 100000,50)
                    if (/(,\d{1,2})$/.test(str)) {
                        str = str.replace(/,/g, '.'); // Convert decimal comma to dot
                    } else {
                        str = str.replace(/,/g, ''); // Assume thousands separator
                    }
                }

                const parsed = parseFloat(str) || 0;

                if (originalValueForDebug !== null) {
                    originalValueForDebug.raw = rawString;
                    originalValueForDebug.cleaned = str;
                    originalValueForDebug.parsed = parsed;
                }

                return parsed;
            };

            const dataToImport = [];
            const debugSamples = [];

            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[iID]) continue;

                const videoID = String(row[iID] || '').replace(/'/g, '').replace(/"/g, '').trim();
                if (!videoID || videoID.length < 10) continue;

                let airDate = null;
                try {
                    const date = new Date(row[iAirDate]);
                    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
                        airDate = date.toISOString();
                    }
                } catch { }

                let debugObj = {};
                const parsedGmv = parseVNNumber(row[iGMV], debugObj);

                // Collect first 20 records for debug preview
                if (debugSamples.length < 20) {
                    debugSamples.push({
                        id: videoID,
                        raw: debugObj.raw,
                        cleaned: debugObj.cleaned,
                        parsed: debugObj.parsed
                    });
                }

                dataToImport.push({
                    video_id: videoID,
                    month: parseInt(sheetMonth),
                    year: parseInt(sheetYear),
                    gmv: parsedGmv,
                    views: parseInt(row[iView]) || 0,
                    orders: parseInt(row[iOrder]) || 0,
                    air_date: airDate,
                    creator_name: row[iCreatorName] || null,
                    creator_id: row[iCreatorId] || null
                });
            }

            setTestParseResults(debugSamples);

            // Aggregate duplicates (Sum GMV, views, orders)
            const aggregatedMap = new Map();
            for (let i = 0; i < dataToImport.length; i++) {
                const item = dataToImport[i];
                const key = String(item.video_id).trim();
                if (!aggregatedMap.has(key)) {
                    aggregatedMap.set(key, { ...item });
                } else {
                    const existing = aggregatedMap.get(key);
                    existing.gmv += (item.gmv || 0);
                    existing.views += (item.views || 0);
                    existing.orders += (item.orders || 0);
                    // Keep the latest air_date if previous was missing
                    if (!existing.air_date && item.air_date) existing.air_date = item.air_date;
                }
            }
            const uniqueData = Array.from(aggregatedMap.values());

            setImportProgress({ current: 0, total: uniqueData.length });

            // Batch upsert to database
            const BATCH_SIZE = 5000;
            let imported = 0;

            for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
                const batch = uniqueData.slice(i, i + BATCH_SIZE);
                const { error } = await supabase
                    .from('tiktok_performance')
                    .upsert(batch, { onConflict: 'video_id,month,year' });

                if (error) throw error;
                imported += batch.length;
                setImportProgress({ current: imported, total: uniqueData.length });
            }

            // Optional: update air dates
            const videosWithDates = uniqueData.filter(d => d.air_date);
            if (videosWithDates.length > 0) {
                const UPDATE_BATCH_SIZE = 50;
                for (let i = 0; i < videosWithDates.length; i += UPDATE_BATCH_SIZE) {
                    const batch = videosWithDates.slice(i, i + UPDATE_BATCH_SIZE);
                    const updatePromises = batch.map(async (video) => {
                        try {
                            return await supabase.from('air_links').update({ ngay_air: video.air_date }).eq('id_video', video.video_id);
                        } catch (err) {
                            return {};
                        }
                    });
                    await Promise.all(updatePromises);
                }
            }

            alert(`✅ Import thành công ${imported.toLocaleString()} dòng!`);
            await loadPerformanceData(parseInt(sheetMonth), parseInt(sheetYear));
            setMonth(sheetMonth);
            setYear(sheetYear);
        } catch (err) {
            console.error('Import failed:', err);
            alert(`❌ Import thất bại: ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleDeleteMonthData = async () => {
        if (!confirm(`BẠN CHẮC CHẮN MUỐN XÓA DATA IMPORT (GMV, Views, Orders) tháng ${month}/${year}?`)) return;

        try {
            let deletedCount = 0;
            // Delete in chunks to avoid Supabase PostgREST timeout/limits
            while (true) {
                const { data: toDelete, error: fetchErr } = await supabase
                    .from('tiktok_performance')
                    .select('video_id')
                    .eq('month', parseInt(month))
                    .eq('year', parseInt(year))
                    .limit(1000);

                if (fetchErr) throw fetchErr;
                if (!toDelete || toDelete.length === 0) break;

                const ids = toDelete.map(d => d.video_id);
                const { error: delErr } = await supabase
                    .from('tiktok_performance')
                    .delete()
                    .in('video_id', ids)
                    .eq('month', parseInt(month))
                    .eq('year', parseInt(year));

                if (delErr) throw delErr;
                deletedCount += ids.length;
            }

            alert(`✅ Đã xóa ${deletedCount.toLocaleString()} dòng data tháng ${month}/${year}!`);
            await loadPerformanceData(parseInt(month), parseInt(year));
        } catch (err) {
            alert(`❌ Xóa thất bại: ${err.message}`);
        }
    };

    const handleExportDataCSV = () => {
        if (!importedData.length) {
            alert("Không có data để export!");
            return;
        }

        const csvContent = "data:text/csv;charset=utf-8,"
            + "ID Video,Lượt Xem,Đơn Hàng,GMV,Nhân sự\n"
            + importedData.map(e => `${e.video_id},${e.views},${e.orders},${e.gmv},${e.creator_name || ''}`).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Data_thang_${month}_${year}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const totalGMV = importedData.reduce((sum, item) => sum + (item.gmv || 0), 0);
    const totalViews = importedData.reduce((sum, item) => sum + (item.views || 0), 0);
    const totalOrders = importedData.reduce((sum, item) => sum + (item.orders || 0), 0);

    const columns = [
        { header: 'ID Video', accessor: 'video_id', isBold: true },
        { header: 'Tên Nhân Sự', accessor: 'creator_name' },
        { header: 'Lượt Xem (Views)', accessor: 'views', formatter: formatNumber },
        { header: 'Đơn Hàng', accessor: 'orders', formatter: formatNumber },
        { header: 'GMV (Parsed)', accessor: 'gmv', formatter: formatNumber },
        { header: 'Ngày Phát', accessor: 'air_date', formatter: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '-' }
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
            <h1 className="page-header">LƯU TRỮ VÀ KIỂM TRA DATA</h1>

            {/* COMPONENT IMPORT */}
            <div style={{ ...cardStyle }}>
                <h3 className="section-title">IMPORT DATA TỪ GOOGLE SHEET</h3>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f9fafb', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <span style={{ color: '#666', fontWeight: '600' }}>Import cho Tháng:</span>
                        <select value={sheetMonth} onChange={e => setSheetMonth(e.target.value)} style={{ background: '#fff', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px' }}>
                            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>T{i + 1}</option>)}
                        </select>
                        <span style={{ color: '#999' }}>/</span>
                        <input type="number" value={sheetYear} onChange={e => setSheetYear(e.target.value)} style={{ width: '80px', background: '#fff', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px', textAlign: 'center' }} />
                    </div>

                    <input
                        type="text"
                        placeholder="Dán Link Google Sheet (Publish to Web -> CSV)..."
                        value={sheetUrl}
                        onChange={e => setSheetUrl(e.target.value)}
                        style={{ flex: 1, minWidth: '300px', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />

                    <button onClick={handleImportToDatabase} disabled={isImporting} className={isImporting ? 'btn-secondary' : 'btn-primary'} style={{ padding: '12px 24px' }}>
                        {isImporting ? 'ĐANG IMPORT...' : '📥 BẮT ĐẦU IMPORT'}
                    </button>
                    <button onClick={handleExportDataCSV} className="btn-secondary" style={{ padding: '12px 24px', background: '#fff' }}>
                        📋 EXPORT DATA HIỆN TẠI
                    </button>
                    <button onClick={handleDeleteMonthData} className="btn-secondary" style={{ padding: '12px 24px', color: '#ef4444', borderColor: '#ef4444', background: '#fff' }}>
                        🗑️ XÓA DATA THÁNG
                    </button>
                </div>

                {isImporting && importProgress.total > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ea580c', marginBottom: '8px', fontWeight: '600' }}>
                            <span>Tiến độ Import...</span>
                            <span>{importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} rows</span>
                        </div>
                        <div style={{ width: '100%', height: '10px', background: '#eee', borderRadius: '5px', overflow: 'hidden' }}>
                            <div style={{ width: `${(importProgress.current / importProgress.total * 100)}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s' }}></div>
                        </div>
                    </div>
                )}
            </div>

            {/* DEBUG PARSE RESULT PANE */}
            {testParseResults.length > 0 && (
                <div style={{ ...cardStyle, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <h3 style={{ color: '#ea580c', marginBottom: '10px', fontSize: '1rem' }}>🐛 CHẾ ĐỘ XEM THỬ 20 DÒNG (Để sếp dễ kiểm tra hệ thống đọc số có tính sai không)</h3>
                    <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
                        *Lưu ý quan trọng: Đây chỉ là 20 dòng trích điểm danh làm mẫu, <strong>không phải là hệ thống chỉ import 20 dòng</strong>. Hệ thống vẫn đang import toàn bộ <strong>{importProgress.total > 0 ? importProgress.total.toLocaleString() : 'tất cả'}</strong> dòng dữ liệu ở tiến trình bên trên.
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#ffedd5', color: '#9a3412', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>Video ID</th>
                                <th style={{ padding: '8px' }}>Raw String (Từ file)</th>
                                <th style={{ padding: '8px' }}>Cleaned String</th>
                                <th style={{ padding: '8px' }}>Parsed Value (Hệ thống hiểu)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {testParseResults.map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #fed7aa' }}>
                                    <td style={{ padding: '8px' }}>{r.id}</td>
                                    <td style={{ padding: '8px' }}>"{r.raw}"</td>
                                    <td style={{ padding: '8px' }}>{r.cleaned}</td>
                                    <td style={{ padding: '8px', fontWeight: 'bold', color: r.parsed > 0 ? '#10b981' : '#ef4444' }}>{formatNumber(r.parsed)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* DATA VIEW FILTER */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px' }}>
                <h3 className="section-title" style={{ margin: 0 }}>XEM DATA:</h3>
                <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '140px' }}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                </select>
                <input type="number" value={year} onChange={e => setYear(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100px' }} />
            </div>

            {/* DATA SUMMARY TICKERS */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #eee', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '8px' }}>TỔNG GMV TRONG DB</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ea580c' }}>{formatNumber(totalGMV)}</div>
                </div>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #eee', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '8px' }}>TỔNG LƯỢT XEM</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10b981' }}>{formatNumber(totalViews)}</div>
                </div>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #eee', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '8px' }}>TỔNG ĐƠN HÀNG</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#3b82f6' }}>{formatNumber(totalOrders)}</div>
                </div>
            </div>

            {/* MAIN DATA TABLE */}
            <DataTable
                title={`CHI TIẾT 100% RAW DATA IMPORT THÁNG ${month}/${year}`}
                columns={columns}
                data={importedData}
            />

        </div>
    );
};

export default DataArchiveTab;
