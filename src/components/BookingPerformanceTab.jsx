import { supabase } from '../supabaseClient';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import * as XLSX from 'xlsx';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';

// --- LIGHT THEME CONSTANTS ---
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

// --- REUSABLE DATA TABLE COMPONENT WITH SORT & FILTER ---
const DataTable = ({ columns, data = [], title }) => {
    // STATES
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

                // Handle numbers vs strings
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

            <div style={{ overflowX: 'auto', maxHeight: '500px', border: '1px solid #eee', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            {columns.map((col, idx) => (
                                <th key={idx} style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #eee', minWidth: '120px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {/* HEADER TITLE + SORT */}
                                        <div
                                            onClick={() => handleSort(col.accessor)}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#ea580c', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase' }}
                                        >
                                            {col.header}
                                            {sortConfig.key === col.accessor && (
                                                <span>{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                                            )}
                                        </div>

                                        {/* EXCEL-LIKE FILTER INPUT */}
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

const BookingPerformanceTab = () => {
    const { brands, nhanSus, airLinks, loadAirLinks } = useAppData();
    const fileInputRef = useRef(null);

    // FILTERS
    const [month, setMonth] = useState(new Date().getMonth() + 1); // Default to current month immediately
    const [year, setYear] = useState(new Date().getFullYear()); // Default to current year immediately
    const [filterBrand, setFilterBrand] = useState('');
    const [filterStaff, setFilterStaff] = useState('');
    const [filterKoc, setFilterKoc] = useState('');
    const [isUnlocked, setIsUnlocked] = useState(false); // Password protection

    const [uploadBrandId, setUploadBrandId] = useState('');
    const [importedData, setImportedData] = useState([]); // This will now be fetched from DB
    const [isLoadingData, setIsLoadingData] = useState(false); // Track loading DB state
    const currentFetchRef = useRef(0); // Track latest fetch to prevent race conditions
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 }); // Track DB fetch progress

    // HELPERS
    const formatNumber = (val) => new Intl.NumberFormat('vi-VN').format(val || 0);

    // (Removed slow hasAutoDetected logic because it causes Month/Year to be null while waiting for 100k AirLinks to load)

    // Auto-load performance data from DB when month/year changes
    useEffect(() => {
        if (month && year) {
            const fetchId = Date.now();
            currentFetchRef.current = fetchId;
            loadPerformanceData(parseInt(month), parseInt(year), fetchId);
        }
    }, [month, year]);

    // --- DB IMPORT SYSTEM (New) ---
    const [sheetUrl, setSheetUrl] = useState(localStorage.getItem('booking_sheet_url') || '');
    const [sheetMonth, setSheetMonth] = useState(new Date().getMonth() + 1);
    const [sheetYear, setSheetYear] = useState(new Date().getFullYear());
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

    // Load data from    // Unique Kênh list for filter
    const uniqueKenhList = useMemo(() => {
        const set = new Set();
        airLinks?.forEach(l => {
            if (l.id_kenh) set.add(l.id_kenh);
        });
        return Array.from(set).sort();
    }, [airLinks]);

    // LOAD DATA DIRECTLY FROM SUPABASE
    const loadPerformanceData = async (targetMonth, targetYear, fetchId = null) => {
        try {
            if (!fetchId || currentFetchRef.current === fetchId) {
                setIsLoadingData(true);
                setLoadProgress({ current: 0, total: 0 });
            }

            console.log(`📊 Loading performance data for ${targetMonth}/${targetYear}...`);

            // 1. Get total count first to show progress
            const { count, error: countErr } = await supabase
                .from('tiktok_performance')
                .select('*', { count: 'exact', head: true })
                .eq('month', targetMonth)
                .eq('year', targetYear);

            if (countErr) throw countErr;
            const totalRecords = count || 0;

            if (!fetchId || currentFetchRef.current === fetchId) {
                setLoadProgress({ current: 0, total: totalRecords });
            }

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

                if (!fetchId || currentFetchRef.current === fetchId) {
                    setLoadProgress({ current: allData.length, total: totalRecords });
                }

                if (data.length < step) break; // Finished fetching all records
                from += step;
            }

            console.log(`✅ Loaded ${allData.length} performance records`);

            if (allData.length > 0) {
                console.log('Sample data:', allData.slice(0, 3));
                console.log('Total GMV in DB:', allData.reduce((sum, d) => sum + (d.gmv || 0), 0));
            }

            // ONLY update state if this is still the most recent fetch
            if (!fetchId || currentFetchRef.current === fetchId) {
                setImportedData(allData);
                setIsLoadingData(false);
            } else {
                console.log(`⚠️ Discarding stale data for ${targetMonth}/${targetYear}`);
            }
        } catch (err) {
            console.error('Failed to load performance data:', err);
            // ONLY update state if this is still the most recent fetch
            if (!fetchId || currentFetchRef.current === fetchId) {
                setIsLoadingData(false);
            }
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

            // 3. Parse CSV rows with a robust function (handles commas inside quotes, empty values)
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
            console.log('✅ Headers:', headers);

            // 5. Map columns with STRICT matching
            const findIdx = (keywords) => headers.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                return keywords.some(k => str.includes(k));
            });

            let iID = headers.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                return str === 'id video' || str === 'video id' || str === 'id';
            });

            if (iID === -1) {
                iID = findIdx(['id video', 'video id']);
            }

            const iGMV = findIdx(['gmv', 'tổng giá trị', 'doanh thu']);
            const iView = findIdx(['vv', 'lượt xem', 'view']);
            const iOrder = findIdx(['đơn hàng', 'số lượng bán', 'sold']);
            const iAirDate = findIdx(['thời gian', 'ngày phát']);
            const iCreatorName = findIdx(['tên', 'creator', 'nhà sáng tạo']);
            const iCreatorId = findIdx(['id nhà sáng tạo', 'creator id']);

            if (iID === -1) {
                throw new Error("Không tìm thấy cột 'ID Video'!");
            }

            console.log('📊 Column mapping:', { iID, iGMV, iView, iOrder, iAirDate });

            // 6. Parse rows and prepare for DB
            const parseVNNumber = (v) => {
                if (!v) return 0;
                // Remove spaces, letters, and currency symbols (₫, $, etc). Keep only digits, dots, commas, negative sign.
                let str = String(v).replace(/[^0-9.,-]/g, '');

                if ((str.match(/\./g) || []).length > 1) {
                    str = str.replace(/\./g, '');
                } else if (/\.\d{3}$/.test(str) && !str.includes(',')) {
                    str = str.replace(/\./g, '');
                } else {
                    str = str.replace(/,/g, '');
                }
                return parseFloat(str) || 0;
            };

            const dataToImport = [];
            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[iID]) continue;

                const videoID = String(row[iID] || '').replace(/'/g, '').replace(/"/g, '').trim();
                if (!videoID || videoID.length < 10) continue;

                // Parse air date
                let airDate = null;
                try {
                    const date = new Date(row[iAirDate]);
                    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
                        airDate = date.toISOString();
                    }
                } catch { }

                dataToImport.push({
                    video_id: videoID,
                    month: parseInt(sheetMonth),
                    year: parseInt(sheetYear),
                    gmv: parseVNNumber(row[iGMV]),
                    views: parseInt(row[iView]) || 0,
                    orders: parseInt(row[iOrder]) || 0,
                    air_date: airDate,
                    creator_name: row[iCreatorName] || null,
                    creator_id: row[iCreatorId] || null
                });
            }

            console.log(`📦 Prepared ${dataToImport.length} rows for import`);

            // [FIX] Deduplicate by video_id - Keep last occurrence (most recent data)
            const uniqueData = [];
            const seen = new Set();

            for (let i = dataToImport.length - 1; i >= 0; i--) {
                const key = `${dataToImport[i].video_id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueData.unshift(dataToImport[i]);
                }
            }

            const duplicatesRemoved = dataToImport.length - uniqueData.length;
            if (duplicatesRemoved > 0) {
                console.log(`⚠️ Removed ${duplicatesRemoved} duplicates from import data`);
            }

            console.log(`✅ Final data to import: ${uniqueData.length} unique rows`);
            setImportProgress({ current: 0, total: uniqueData.length });

            // 7. Batch upsert to database
            const BATCH_SIZE = 5000;
            let imported = 0;

            for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
                const batch = uniqueData.slice(i, i + BATCH_SIZE);

                const { error } = await supabase
                    .from('tiktok_performance')
                    .upsert(batch, {
                        onConflict: 'video_id,month,year',
                        ignoreDuplicates: false
                    });

                if (error) {
                    console.error('Batch error:', error);
                    throw error;
                }

                imported += batch.length;
                setImportProgress({ current: imported, total: uniqueData.length });
                console.log(`✅ Imported ${imported} / ${uniqueData.length}`);
            }


            console.log(`🎉 Import complete! ${imported} rows imported.`);

            // 8. Auto-update ngay_air in air_links using BATCH approach (100k+ rows support)
            console.log(`📅 Updating ngay_air for imported videos (batch mode)...`);

            let airDatesUpdated = 0;
            const videosWithDates = uniqueData.filter(d => d.air_date);

            if (videosWithDates.length > 0) {
                // BATCH UPDATE: Process 50 videos at a time (smaller to avoid rate limits)
                const UPDATE_BATCH_SIZE = 50;

                for (let i = 0; i < videosWithDates.length; i += UPDATE_BATCH_SIZE) {
                    const batch = videosWithDates.slice(i, i + UPDATE_BATCH_SIZE);

                    // Build batch updates - use Promise.all for parallel execution
                    const updatePromises = batch.map(video =>
                        supabase
                            .from('air_links')
                            .update({ ngay_air: video.air_date })
                            .eq('id_video', video.video_id)
                            .then(res => res)
                            .catch(() => ({ error: true }))
                    );

                    // Execute batch in parallel with timeout
                    try {
                        const results = await Promise.race([
                            Promise.all(updatePromises),
                            new Promise((_, reject) => setTimeout(() => reject('timeout'), 30000))
                        ]);
                        const successCount = results.filter(r => !r.error).length;
                        airDatesUpdated += successCount;
                    } catch (e) {
                        console.warn(`⚠️ Batch timeout at ${i}`);
                    }

                    // Progress update every 500 videos
                    if (i % 500 === 0) {
                        console.log(`📅 Synced ngay_air: ${Math.min(i + UPDATE_BATCH_SIZE, videosWithDates.length)}/${videosWithDates.length}`);
                    }

                    // Small delay to prevent rate limiting
                    await new Promise(r => setTimeout(r, 50));
                }

                console.log(`✅ Updated ngay_air for ${airDatesUpdated}/${videosWithDates.length} videos`);
            } else {
                console.warn('⚠️ No air dates found in sheet!');
            }

            const missingIDsCount = importProgress.total - imported;
            alert(`✅ Import thành công ${imported.toLocaleString()} dòng!\n📅 Đã sync ${airDatesUpdated} ngày air từ sheet.\nℹ️ Có ${missingIDsCount} video trong hệ thống không tìm thấy trong file đã ghép.`);

            // 9. Load data from DB to display
            await loadPerformanceData(parseInt(month), parseInt(year));


        } catch (err) {
            console.error('Import failed:', err);
            alert(`❌ Import thất bại: ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    // Export Video IDs for TikTok One
    const handleExportVideoIDs = () => {
        if (!airLinks || airLinks.length === 0) {
            alert("Không có video nào trong hệ thống!");
            return;
        }

        // Filter videos for selected month (if month is selected)
        let videosToExport = airLinks;

        if (month && year) {
            videosToExport = airLinks.filter(link => {
                if (!link.ngay_air) return false;
                const linkDate = new Date(link.ngay_air);
                if (isNaN(linkDate.getTime())) return false;

                const linkMonth = linkDate.getMonth() + 1;
                const linkYear = linkDate.getFullYear();

                return linkMonth === parseInt(month) && linkYear === parseInt(year);
            });
        }

        if (videosToExport.length === 0) {
            alert(`Không có video nào air trong tháng ${month}/${year}!`);
            return;
        }

        // Get unique video IDs
        const videoIDs = [...new Set(videosToExport.map(l => l.id_video).filter(Boolean))];

        // Format as comma-separated for easy copy-paste into TikTok One
        const csvFormat = videoIDs.join(',');
        const txtFormat = videoIDs.join('\n');

        // Create downloadable file
        const content = `# Video IDs để export từ TikTok One
# Tháng: ${month}/${year}
# Tổng: ${videoIDs.length} videos
# 
# FORMAT 1: Copy dòng dưới (comma-separated)
${csvFormat}

# FORMAT 2: Hoặc copy list này (mỗi ID 1 dòng)
${txtFormat}
`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_ids_${month}_${year}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        alert(`✅ Đã export ${videoIDs.length} video IDs!\n\nMở file TXT → Copy danh sách → Paste vào TikTok One để export data!`);
    };

    // Delete imported data for selected month
    const handleDeleteMonthData = async () => {
        if (!month || !year) {
            alert("Vui lòng chọn tháng/năm cần xóa!");
            return;
        }

        const confirmMsg = `⚠️ BẠN CHẮC CHẮN MUỐN XÓA?\n\nCHỈ xóa DATA IMPORT (GMV, Views, Orders) tháng ${month}/${year}\nKHÔNG xóa Link Air mà mấy bạn đã điền!\n\nBấm OK để xác nhận xóa.`;

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const { error, count } = await supabase
                .from('tiktok_performance')
                .delete()
                .eq('month', parseInt(month))
                .eq('year', parseInt(year));

            if (error) throw error;

            alert(`✅ Đã xóa data tháng ${month}/${year}!`);

            // Reload to refresh display
            await loadPerformanceData(parseInt(month), parseInt(year));

        } catch (err) {
            console.error('Delete failed:', err);
            alert(`❌ Xóa thất bại: ${err.message}`);
        }
    };

    // OLD: Keep for backward compatibility or remove later
    const handleSyncSheet = async () => {
        if (!sheetUrl) {
            alert("Vui lòng nhập Link Google Sheet (Publish to CSV)!");
            return;
        }

        // Save URL for next time
        localStorage.setItem('booking_sheet_url', sheetUrl);
        setIsProcessing(true);

        try {
            // 1. Convert to CSV URL if needed
            let fetchUrl = sheetUrl;
            if (sheetUrl.includes('docs.google.com/spreadsheets')) {
                const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                if (match && match[1]) {
                    const sheetId = match[1];
                    // Try to find gid
                    let gid = '0';
                    const gidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/);
                    if (gidMatch && gidMatch[1]) gid = gidMatch[1];

                    // [FIX] Use GVIZ endpoint (better for CORS/Shared sheets than /export)
                    fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
                }
            }

            // 2. Fetch CSV
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error("Không thể tải file CSV. Kiểm tra lại Link!");

            const csvText = await response.text();

            // 2. Parse CSV (Handling Quoted fields and VN Number format)
            const rows = csvText.split('\n').map(row => {
                // Simple regex to handle quoted fields containing commas
                const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
                return matches.map(m => m.replace(/^"|"$/g, '').trim()); // Strip quotes
            });

            // Clean rows
            const cleanedRows = rows;

            // Helper: Robust VN Number Parser
            const parseNum = (str) => {
                if (!str) return 0;
                // If format is like "100.000" (VN) -> Remove dots, then parse
                // If format is like "100,000" (US) -> Remove commas, then parse
                // Heuristic: If string contains dots AND commas, or dots but no commas and length > 3 blocks

                let cleanStr = String(str);

                // Case: 104.955.915 (VN Integer) or 104.955,5 (VN Decimal)
                if (cleanStr.includes('.') && !cleanStr.includes(',')) {
                    // Ambiguous: 100.500 (100k) vs 100.5 (100.5)
                    // If multiple dots, definitely thousands separator
                    if ((cleanStr.match(/\./g) || []).length > 1) {
                        cleanStr = cleanStr.replace(/\./g, '');
                    }
                    // If one dot and 3 digits after -> Likely thousands
                    else if (/\.\d{3}$/.test(cleanStr)) {
                        cleanStr = cleanStr.replace(/\./g, '');
                    }
                } else if (cleanStr.includes('.')) {
                    // Mixed: Remove dots (thousands), replace comma with dot (decimal) if exists?
                    // Actually GVIZ CSV usually follows US format OR User Locale.
                    // Let's assume standard normalization: Remove all non-numeric chars except last separator?

                    // Simple fix for "104.955.915":
                    // Remove dots if they look like thousands separators
                    cleanStr = cleanStr.replaceAll('.', '');
                }

                // Handle comma as decimal if needed (though GVIZ CSV usually gives dot decimal)
                // But user screenshot shows "104.955.915" in Sheet. 
                // In CSV it might come as "104955915" or "104.955.915".

                return parseFloat(cleanStr) || 0;
            };

            // 3. Find Headers
            let headerRowIndex = -1;
            let headers = [];

            for (let i = 0; i < Math.min(cleanedRows.length, 20); i++) {
                const row = cleanedRows[i];
                const rowStr = row.join(' ').toLowerCase();
                if (rowStr.includes('id video') || rowStr.includes('video id')) {
                    headerRowIndex = i;
                    headers = row;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                alert("❌ Không tìm thấy tiêu đề 'ID Video' trong Sheet!");
                console.error("Header detection failed. First 5 rows:", cleanedRows.slice(0, 5));
                setIsProcessing(false);
                return;
            }

            console.log(`✅ Header found at row ${headerRowIndex}:`, headers);

            // 4. Map Columns with STRICT matching for ID
            const findIdx = (keywords) => headers.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                return keywords.some(k => str.includes(k));
            });

            // [CRITICAL FIX] Be MORE STRICT with ID Video matching
            // Look for EXACT match first, then fallback to partial
            let iID = headers.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                // Exact matches first
                if (str === 'id video' || str === 'video id' || str === 'id') return true;
                return false;
            });

            // If no exact match, try partial but log warning
            if (iID === -1) {
                iID = findIdx(['id video', 'video id']);
                if (iID > -1) {
                    console.warn(`⚠️ Using partial match for ID column: "${headers[iID]}"`);
                }
            }

            const iGMV = findIdx(['gmv', 'tổng giá trị', 'doanh thu']);
            const iView = findIdx(['vv', 'lượt xem', 'view']);
            const iOrder = findIdx(['đơn hàng', 'số lượng bán', 'sold']);
            // iAirDate not critical for analytics if we just trust the Sheet contents for the month
            const iAirDate = findIdx(['thời gian', 'ngày phát']);

            console.log('📊 Column mapping:', { iID, iGMV, iView, iOrder, iAirDate });
            console.log('📋 Detected columns:');
            console.log(`  ID Video (${iID}): "${headers[iID]}"`);
            console.log(`  GMV (${iGMV}): "${headers[iGMV]}"`);
            console.log(`  View (${iView}): "${headers[iView]}"`);
            console.log(`  Order (${iOrder}): "${headers[iOrder]}"`);

            if (iID === -1) {
                alert("❌ Không tìm thấy cột 'ID Video'!");
                console.error("Headers available:", headers);
                setIsProcessing(false);
                return;
            }

            // 5. Transform Data
            const newMetrics = [];

            console.log(`📝 Processing ${cleanedRows.length - headerRowIndex - 1} data rows...`);
            let sampleCount = 0;

            for (let i = headerRowIndex + 1; i < cleanedRows.length; i++) {
                const row = cleanedRows[i];
                if (!row || !row[iID]) continue;

                // FIX: ID Video in CSV might be scientific notation "7.5E+18" if Excel messed up. 
                // But GSheet CSV usually keeps full text if formatted as text.
                // [CRITICAL] Normalize to string and remove any quotes/apostrophes
                let videoID = String(row[iID] || '').replace(/'/g, '').replace(/"/g, '').trim();

                // [DEBUG] Log first 3 rows to verify correct column
                if (sampleCount < 3) {
                    console.log(`  Row ${i}: ID="${videoID}" (from column ${iID}, raw: "${row[iID]}")`);
                    sampleCount++;
                }

                // Value Parsing (Robust for VN/US formats)
                const parseVal = (v) => {
                    if (!v) return 0;
                    let str = String(v).trim();
                    // Handle VN format: 104.955.915 (remove dots)
                    // If multiple dots, definitely thousands
                    if ((str.match(/\./g) || []).length > 1) {
                        str = str.replace(/\./g, '');
                    }
                    // If one dot and 3 digits at end (100.000) -> likely thousands
                    else if (/\.\d{3}$/.test(str) && !str.includes(',')) {
                        str = str.replace(/\./g, '');
                    }
                    // Handle US/Standard: 104,955 (remove comas)
                    else {
                        str = str.replace(/,/g, '');
                    }
                    return parseFloat(str) || 0;
                };

                newMetrics.push({
                    video_id: videoID, // Already normalized to string
                    gmv: iGMV > -1 ? parseVal(row[iGMV]) : 0,
                    views: iView > -1 ? parseVal(row[iView]) : 0,
                    orders: iOrder > -1 ? parseVal(row[iOrder]) : 0,
                    // Store the SHEET's month/year provenance
                    sheet_month: sheetMonth,
                    sheet_year: sheetYear
                });
            }

            console.log(`Loaded ${newMetrics.length} rows from Sheet.`);
            console.log(`Sample data (first 3 rows):`, newMetrics.slice(0, 3));
            console.log(`Unique video IDs: ${new Set(newMetrics.map(m => m.video_id)).size}`);
            console.log(`Total AirLinks available: ${airLinks?.length || 0}`);

            setImportedData(newMetrics); // Direct State Update (Live Mode)
            alert(`✅ Đã đồng bộ ${newMetrics.length} dòng dữ liệu từ Google Sheet!`);

        } catch (error) {
            console.error(error);
            alert("Lỗi Sync Sheet: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };









    // 1. Filter AirLinks first (Show all videos in selected month OR those with data)
    const processedAirLinks = useMemo(() => {
        if (!airLinks || !month || !year) return [];

        // [OPTIMIZATION] Keep links that are:
        // Case 1: Aired in the selected month (even without imported data)
        // Case 2: Has data in the imported report (for cumulative GMV from old videos)
        const activeVideoIds = new Set(importedData.map(d => String(d.video_id).trim()));

        const filtered = airLinks.filter(link => {
            // Filter by Brand/Staff/Kenh
            if (filterBrand && String(link.brand_id) !== String(filterBrand)) return false;
            if (filterStaff && String(link.nhansu_id) !== String(filterStaff)) return false;
            if (filterKoc && String(link.id_kenh) !== String(filterKoc)) return false;

            // [CRITICAL FIX] 1. Do not return early if no date. 
            // A link might not have a date but STILL generate GMV in the report!
            let isAiredInMonth = false;
            if (link.ngay_air) {
                const linkDate = new Date(link.ngay_air);
                if (!isNaN(linkDate.getTime())) {
                    const linkMonth = linkDate.getMonth() + 1;
                    const linkYear = linkDate.getFullYear();
                    isAiredInMonth = (linkMonth === parseInt(month) && linkYear === parseInt(year));
                }
            }

            // Check Case 2: Has GMV data (for old videos or videos missing dates)
            const hasDataInReport = activeVideoIds.has(String(link.id_video || '').trim());

            return isAiredInMonth || hasDataInReport;
        });

        // [DEBUG] Log matching statistics
        console.log(`[ProcessedAirLinks] Total airLinks: ${airLinks.length}`);
        console.log(`[ProcessedAirLinks] Imported data videos: ${activeVideoIds.size}`);
        console.log(`[ProcessedAirLinks] Matched airLinks: ${filtered.length}`);

        if (filtered.length === 0 && importedData.length > 0) {
            console.warn(`⚠️ No airLinks matched! Possible reasons:`);
            console.warn(`  1. Video IDs in sheet don't exist in air_links table`);
            console.warn(`  2. Videos don't have ngay_air set`);
            console.warn(`  3. Month filter (${month}/${year}) excludes all videos`);
            console.warn(`Sample sheet video IDs:`, Array.from(activeVideoIds).slice(0, 5));
            console.warn(`Sample airLink video IDs:`, airLinks.slice(0, 5).map(l => l.id_video));
        }

        return filtered;
    }, [airLinks, filterBrand, filterStaff, month, year, importedData]);

    // 2. Calculate Stats
    const { brandStats, kocStats, staffStats, kocBrandPivot, calculatedStats, chartData } = useMemo(() => {
        const brandMap = {}; const kocMap = {}; const staffMap = {};
        const pivotObj = {};
        let tGMV = 0; let tGMVMonth = 0; let tVideo = 0; let tOrders = 0; let tCast = 0; let tViews = 0;

        // [FIX] Initialize Staff Map with ALL staff from DB to ensure everyone appears
        nhanSus?.forEach(n => {
            staffMap[n.ten_nhansu] = {
                name: n.ten_nhansu,
                gmvCum: 0,
                gmvMonth: 0,
                videoMonth: 0,
                viewsCum: 0,
                ordersAff: 0
            };
        });

        const perfMap = new Map();
        importedData.forEach(item => perfMap.set(String(item.video_id).trim(), item));

        console.log(`[Stats Calc] perfMap size: ${perfMap.size}`);
        console.log(`[Stats Calc] processedAirLinks count: ${processedAirLinks.length}`);

        // [DEBUG] Print ACTUAL ID values to compare formats
        const samplePerfIDs = Array.from(perfMap.keys()).slice(0, 3);
        const sampleAirIDs = processedAirLinks.slice(0, 3).map(l => l.id_video);

        console.log(`[Stats Calc] Sample perfMap IDs (RAW):`, samplePerfIDs);
        console.log(`[Stats Calc]   ID[0] type: ${typeof samplePerfIDs[0]}, value: "${samplePerfIDs[0]}"`);
        console.log(`[Stats Calc] Sample airLink IDs (RAW):`, sampleAirIDs);
        console.log(`[Stats Calc]   ID[0] type: ${typeof sampleAirIDs[0]}, value: "${sampleAirIDs[0]}"`);

        // Test if they match after normalization
        if (sampleAirIDs.length > 0 && samplePerfIDs.length > 0) {
            const normalizedAir = String(sampleAirIDs[0] || '').trim();
            const hasPerfMap = perfMap.has(normalizedAir);
            console.log(`[Stats Calc] TEST: Does perfMap have "${normalizedAir}"? ${hasPerfMap}`);
            if (!hasPerfMap) {
                console.warn(`[Stats Calc] MISMATCH! perfMap has "${samplePerfIDs[0]}" but airLink has "${normalizedAir}"`);
            }
        }

        // [FIX] Track processed videos to prevent double counting if air_links has duplicates
        let mismatchedIDs = []; // Track IDs that don't match
        const processedVideoIds = new Set();

        let matchedCount = 0;
        let totalGMVFromMatches = 0;

        processedAirLinks.forEach(link => {
            // [CRITICAL FIX] Normalize video ID to string for matching
            const normalizedVideoID = String(link.id_video || '').trim();

            // Deduplicate by Video ID
            if (!normalizedVideoID || processedVideoIds.has(normalizedVideoID)) return;
            processedVideoIds.add(normalizedVideoID);

            const linkDate = new Date(link.ngay_air);
            // Safety check for date
            if (isNaN(linkDate.getTime())) return;

            const linkMonth = linkDate.getMonth() + 1;
            const linkYear = linkDate.getFullYear();

            // Check if VIDEO AIRED in selected month
            const isCurrentMonth = linkMonth === parseInt(month) && linkYear === parseInt(year);

            // Get metrics (GMV data from sheet)
            const metrics = perfMap.get(normalizedVideoID) || { gmv: 0, views: 0, orders: 0 };

            // [DEBUG] Log first 3 lookups
            if (matchedCount + mismatchedIDs.length < 3) {
                console.log(`[Lookup ${matchedCount + mismatchedIDs.length}] Looking for: "${normalizedVideoID}"`);
                console.log(`  Has in perfMap? ${perfMap.has(normalizedVideoID)}`);
                console.log(`  Found metrics:`, metrics);

                // Check if ID exists with different format
                const keys = Array.from(perfMap.keys());
                const similar = keys.find(k => k.includes(normalizedVideoID.slice(-10)));
                if (similar && similar !== normalizedVideoID) {
                    console.warn(`  ⚠️ Similar key found: "${similar}" vs "${normalizedVideoID}"`);
                }
            }

            if (metrics.gmv > 0) {
                matchedCount++;
                totalGMVFromMatches += metrics.gmv;
            } else if (mismatchedIDs.length < 5) {
                // Track first 5 mismatches for debugging
                mismatchedIDs.push({
                    airLinkID: normalizedVideoID,
                    inMap: perfMap.has(normalizedVideoID)
                });
            }

            // [FIXED LOGIC]
            // - gmvVideo = Total GMV for this video (cumulative, includes old videos)
            // - gmvMonth = GMV if video AIRED THIS MONTH (for "GMV Tháng Air")
            const gmvVideo = metrics.gmv;
            const gmvMonth = isCurrentMonth ? gmvVideo : 0; // Only count if aired this month
            const isVideoMonth = isCurrentMonth ? 1 : 0;
            const orders = metrics.orders;
            const views = metrics.views || 0;
            const cast = parseFloat(link.cast) || 0;

            // Totals
            tGMV += gmvVideo; // All GMV (including old videos with revenue)
            tGMVMonth += gmvMonth; // Only videos that aired this month
            tVideo += isVideoMonth;
            tOrders += orders;
            tViews += views;
            if (isCurrentMonth) tCast += cast;

            // Brand Stats
            const bName = link.brands?.ten_brand || 'Unknown';
            if (!brandMap[bName]) brandMap[bName] = { name: bName, gmvVideo: 0, gmvMonth: 0, videoMonth: 0, viewsCum: 0, viewsMonth: 0 };
            brandMap[bName].gmvVideo += gmvVideo;
            brandMap[bName].gmvMonth += gmvMonth;
            brandMap[bName].videoMonth += isVideoMonth;

            // KOC Stats
            const kId = link.id_kenh || 'Unknown';
            if (!kocMap[kId]) kocMap[kId] = { id: kId, gmvVideo: 0, gmvMonth: 0, videoMonth: 0 };
            kocMap[kId].gmvVideo += gmvVideo;
            kocMap[kId].gmvMonth += gmvMonth;
            kocMap[kId].videoMonth += isVideoMonth;

            // Staff Stats
            const sName = link.nhansu?.ten_nhansu || 'Unknown';
            if (!staffMap[sName]) staffMap[sName] = { name: sName, gmvCum: 0, gmvMonth: 0, videoMonth: 0, viewsCum: 0, ordersAff: 0 };
            staffMap[sName].gmvCum += gmvVideo;
            staffMap[sName].gmvMonth += gmvMonth;
            staffMap[sName].videoMonth += isVideoMonth;
            staffMap[sName].viewsCum += metrics.views; // [FIX] Add Views
            staffMap[sName].ordersAff += orders;

            // Pivot
            if (!pivotObj[kId]) pivotObj[kId] = { id: kId, gmv: 0, totalVideo: 0, brands: {} };
            pivotObj[kId].gmv += gmvVideo;
            pivotObj[kId].totalVideo += 1; // All time
            if (!pivotObj[kId].brands[bName]) pivotObj[kId].brands[bName] = 0;
            pivotObj[kId].brands[bName] += 1;
        });

        // Pivot Array Transform
        const pivotArray = Object.values(pivotObj); // Simple list for now

        console.log(`[Stats Calc] Videos with GMV > 0: ${matchedCount}`);
        console.log(`[Stats Calc] Total GMV from matches: ${totalGMVFromMatches}`);
        console.log(`[Stats Calc] Final calculated GMV: ${tGMV}`);
        console.log(`[Stats Calc] Final GMV Month Air: ${tGMVMonth}`);
        console.log(`[Stats Calc] Video count for month: ${tVideo}`);

        if (matchedCount === 0 && processedAirLinks.length > 0) {
            console.warn(`⚠️ NO GMV matches found!`);
            console.warn(`Sample airLink IDs without GMV:`, mismatchedIDs);
            console.warn(`Are these IDs in perfMap?`, mismatchedIDs.map(id => perfMap.has(id)));
        }

        return {
            brandStats: Object.values(brandMap),
            kocStats: Object.values(kocMap),
            staffStats: Object.values(staffMap),
            kocBrandPivot: pivotArray,
            calculatedStats: { gmv: tGMV, gmvMonthAir: tGMVMonth, videoAirMonth: tVideo, orders: tOrders, castMonth: tCast, totalViews: tViews },
            chartData: Object.values(staffMap).map(i => ({
                name: i.name,
                gmvMonth: i.gmvMonth,
                gmvRest: i.gmvCum > i.gmvMonth ? i.gmvCum - i.gmvMonth : 0,
                videoMonth: i.videoMonth
            }))
        };
    }, [processedAirLinks, importedData, month, year]);

    // COLUMNS
    const brandCols = [
        { header: 'Brand', accessor: 'name', isBold: true },
        { header: 'GMV Video', accessor: 'gmvVideo', formatter: formatNumber },
        { header: 'GMV Tháng Air', accessor: 'gmvMonth', formatter: formatNumber },
        { header: 'Video Trong Tháng', accessor: 'videoMonth', formatter: formatNumber },
    ];
    const kocCols = [
        { header: 'ID KOC', accessor: 'id', isBold: true },
        { header: 'GMV Video', accessor: 'gmvVideo', formatter: formatNumber },
        { header: 'GMV Tháng Air', accessor: 'gmvMonth', formatter: formatNumber },
        { header: 'Video Trong Tháng', accessor: 'videoMonth', formatter: formatNumber },
    ];
    const staffCols = [
        { header: 'Tên Nhân Sự', accessor: 'name', isBold: true },
        { header: 'Tổng GMV Lũy Kế', accessor: 'gmvCum', formatter: formatNumber },
        { header: 'GMV Tháng Air', accessor: 'gmvMonth', formatter: formatNumber },
        { header: 'Video Air Trong Tháng', accessor: 'videoMonth', formatter: formatNumber },
        { header: 'Tổng Lượt Xem', accessor: 'viewsCum', formatter: formatNumber }, // [FIX] Add Column
        { header: 'Đơn Hàng AFF', accessor: 'ordersAff', formatter: formatNumber },
    ];
    const pivotCols = [
        { header: 'ID Nhà Sáng Tạo', accessor: 'id', isBold: true },
        { header: 'Tổng GMV Lũy Kế', accessor: 'gmv', formatter: formatNumber },
        { header: 'Tổng SL Video Air', accessor: 'totalVideo', formatter: formatNumber },
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#333', marginBottom: '20px' }}>📊 DASHBOARD HIỆU SUẤT BOOKING</h2>

            {/* PASSWORD LOCK */}
            {!isUnlocked ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    background: '#f9fafb',
                    borderRadius: '20px',
                    padding: '60px',
                    border: '2px solid #ddd',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{ fontSize: '80px', marginBottom: '30px' }}>🔒</div>
                    <h3 style={{ color: '#ea580c', fontSize: '2rem', marginBottom: '20px', fontWeight: 'bold' }}>
                        Khu Vực Bảo Mật
                    </h3>
                    <p style={{ color: '#666', fontSize: '1.1rem', marginBottom: '40px', textAlign: 'center', maxWidth: '500px' }}>
                        Dashboard này chứa thông tin nhạy cảm về doanh thu và hiệu suất.<br />
                        Vui lòng nhập mật khẩu để truy cập.
                    </p>
                    <button
                        onClick={() => {
                            const password = prompt('🔑 Nhập mật khẩu:');
                            if (password === '8255') {
                                setIsUnlocked(true);
                            } else if (password) {
                                alert('❌ Mật khẩu sai! Vui lòng thử lại.');
                            }
                        }}
                        style={{
                            padding: '15px 50px',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            background: '#ea580c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.4)',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    >
                        🔓 MỞ KHÓA
                    </button>
                </div>
            ) : (
                <>
                    {/* NOTE: Import feature has been moved to the Data Archive Tab */}

                    {/* GLOBAL FILTER */}
                    <div style={{ background: '#fff', border: '1px solid #eee', padding: '20px', borderRadius: '16px', marginBottom: '30px', display: 'flex', gap: '20px', flexWrap: 'wrap', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px', borderRadius: '8px', color: '#333', background: '#f9fafb', border: '1px solid #ddd', minWidth: '100px' }}>
                            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1} style={{ color: 'black', backgroundColor: 'white' }}>Tháng {i + 1}</option>)}
                        </select>
                        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '8px', borderRadius: '8px', width: '90px', color: '#333', background: '#f9fafb', border: '1px solid #ddd' }}>
                            {Array.from({ length: 10 }, (_, i) => 2024 + i).map(y => (
                                <option key={y} value={y} style={{ color: 'black', backgroundColor: 'white' }}>{y}</option>
                            ))}
                        </select>
                        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '8px', borderRadius: '8px', flex: 1, color: '#333', background: '#f9fafb', border: '1px solid #ddd', minWidth: '150px' }}>
                            <option value="" style={{ color: 'black', backgroundColor: 'white' }}>Tất cả Brand</option>
                            {brands?.map(b => <option key={b.id} value={b.id} style={{ color: 'black', backgroundColor: 'white' }}>{b.ten_brand}</option>)}
                        </select>
                        <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)} style={{ padding: '8px', borderRadius: '8px', flex: 1, color: '#333', background: '#f9fafb', border: '1px solid #ddd', minWidth: '150px' }}>
                            <option value="" style={{ color: 'black', backgroundColor: 'white' }}>Tất cả Nhân sự</option>
                            {nhanSus?.map(n => <option key={n.id} value={n.id} style={{ color: 'black', backgroundColor: 'white' }}>{n.ten_nhansu}</option>)}
                        </select>
                        <select value={filterKoc} onChange={e => setFilterKoc(e.target.value)} style={{ padding: '8px', borderRadius: '8px', flex: 1, color: '#333', background: '#f9fafb', border: '1px solid #ddd', minWidth: '150px' }}>
                            <option value="" style={{ color: 'black', backgroundColor: 'white' }}>Tất cả ID Kênh</option>
                            {uniqueKenhList.map(k => <option key={k} value={k} style={{ color: 'black', backgroundColor: 'white' }}>{k}</option>)}
                        </select>
                    </div>

                    {/* LOADING OVERLAY OR STATS */}
                    {isLoadingData ? (
                        <div style={{ textAlign: 'center', padding: '50px', background: '#fff', borderRadius: '16px', marginBottom: '30px', border: '1px solid #eee' }}>
                            <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite', marginBottom: '15px' }}>⏳</div>
                            <h3 style={{ color: '#ea580c', margin: '0 0 10px 0' }}>Đang tải dữ liệu từ máy chủ ({month}/{year})</h3>

                            {loadProgress.total > 0 && (
                                <div style={{ maxWidth: '400px', margin: '20px auto' }}>
                                    <div style={{ width: '100%', background: '#eee', borderRadius: '10px', height: '12px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${Math.min(100, Math.round((loadProgress.current / loadProgress.total) * 100))}%`,
                                            background: '#ea580c',
                                            height: '100%',
                                            transition: 'width 0.3s'
                                        }}></div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginTop: '8px', fontWeight: 'bold' }}>
                                        <span>Đã tải: {formatNumber(loadProgress.current)} dòng</span>
                                        <span>Tổng: {formatNumber(loadProgress.total)} dòng ({Math.round((loadProgress.current / loadProgress.total) * 100)}%)</span>
                                    </div>
                                </div>
                            )}
                            <p style={{ color: '#888', fontSize: '14px', marginTop: '10px' }}>*Hệ thống đang đối soát chéo hàng chục nghìn dòng dữ liệu.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                            <div style={{ ...cardStyle, flex: 1, alignItems: 'center', borderColor: '#ea580c' }}>
                                <div style={{ color: '#666' }}>TỔNG GMV</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ea580c' }}>{formatNumber(calculatedStats.gmv)}</div>
                            </div>
                            <div style={{ ...cardStyle, flex: 1, alignItems: 'center', borderColor: '#3b82f6' }}>
                                <div style={{ color: '#666' }}>GMV THÁNG AIR</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{formatNumber(calculatedStats.gmvMonthAir)}</div>
                            </div>
                            <div style={{ ...cardStyle, flex: 1, alignItems: 'center', borderColor: '#10b981' }}>
                                <div style={{ color: '#666' }}>VIDEO AIR</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{formatNumber(calculatedStats.videoAirMonth)}</div>
                            </div>
                            <div style={{ ...cardStyle, flex: 1, alignItems: 'center', borderColor: '#f43f5e', boxShadow: 'none' }}>
                                <div style={{ color: '#666' }}>TỔNG VIEW</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f43f5e' }}>{formatNumber(calculatedStats.totalViews)}</div>
                            </div>
                        </div>
                    )}

                    {/* CHART */}
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
                        <div style={{ ...cardStyle, flex: 2, marginBottom: 0 }}>
                            <div style={{ color: '#ea580c', fontWeight: 'bold', marginBottom: '15px' }}>🏆 GMV Video Dựa Trên PFM Nhân Sự</div>
                            <div style={{ width: '100%', height: 400 }}>
                                <ResponsiveContainer>
                                    <ComposedChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: '#666', fontSize: 11 }}
                                            interval={0}
                                            angle={-20}
                                            textAnchor="end"
                                        />
                                        <YAxis yAxisId="left" tick={{ fill: '#666' }} tickFormatter={v => (v / 1000000).toFixed(0) + 'M'} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#3b82f6' }} />
                                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ddd' }} formatter={v => formatNumber(v)} />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="gmvMonth" name="GMV Air Trong Tháng" stackId="a" fill="#3b82f6" />
                                        <Bar yAxisId="left" dataKey="gmvRest" name="GMV Lũy Kế" stackId="a" fill="#ea580c" />
                                        <Line yAxisId="right" dataKey="videoMonth" name="Video Air" stroke="#10b981" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
                            <div style={{ color: '#ea580c', fontWeight: 'bold', marginBottom: '15px', textAlign: 'center' }}>🥧 Tỉ lệ Video Air theo Brand</div>
                            <div style={{ width: '100%', height: 400 }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={brandStats} dataKey="videoMonth" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} label={({ name, percent }) => percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}>
                                            {brandStats.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={['#ea580c', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'][index % 8]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ddd', color: '#333', borderRadius: '8px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* TABLES */}
                    <div style={{ opacity: isLoadingData ? 0.5 : 1, pointerEvents: isLoadingData ? 'none' : 'auto' }}>
                        <DataTable title="Performance theo Brand" columns={brandCols} data={brandStats} />
                        <DataTable title="Performance theo KOL/KOC" columns={kocCols} data={kocStats} />
                        <DataTable title="Performance theo Nhân sự" columns={staffCols} data={staffStats} />
                        <DataTable title="KOC Theo Brand (Pivot)" columns={pivotCols} data={kocBrandPivot} />
                    </div>

                </>
            )}
        </div>
    );
};

export default BookingPerformanceTab;
