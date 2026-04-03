import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { read, utils, writeFile } from 'xlsx';
import SearchableDropdown from './SearchableDropdown';
import { normalizeProductName } from '../utils/productMapping';

const COLORS = ['#ea580c', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];
const CHART_HEIGHT = 500;
const PIE_CY = "45%";
const PIE_CX = "50%";
const INNER_R = 80;
const OUTER_R = 120;

// --- HÀM HELPER ---
const formatCurrency = (value) => {
    if (!value && value !== 0) return '';
    const number = String(value).replace(/\D/g, '');
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatCompactNumber = (number) => {
    if (!number) return '0';
    if (number >= 1000000000) return (number / 1000000000).toFixed(1).replace('.0', '') + ' tỷ';
    if (number >= 1000000) return (number / 1000000).toFixed(1).replace('.0', '') + 'tr';
    return formatCurrency(number);
};

const parseMoney = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^\d]/g, '')) || 0;
};

// --- HÀM HELPER XỬ LÝ DATE EXCEL ---
const processExcelDate = (input) => {
    if (!input) return null;
    // Nếu là số (Excel Serial Date)
    if (typeof input === 'number') {
        const date = new Date(Math.round((input - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    const str = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];

    return null;
};

// --- COMPONENT TEXT Ở GIỮA ---
const HardcodedCenterText = ({ value, isMoney = false }) => {
    return (
        <text
            x="50%"
            y={PIE_CY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
                fontSize: isMoney ? '28px' : '40px',
                fontWeight: '800',
                fill: '#ea580c',
                fontFamily: "'Outfit', sans-serif"
            }}
        >
            {value}
        </text>
    );
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value, unit = "" }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 1.4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent === 0) return null;
    return (
        <text
            x={x}
            y={y}
            fill="#333"
            textAnchor={x > cx ? 'start' : 'end'}
            dominantBaseline="central"
            fontSize="12px"
            fontWeight="600"
        >
            {`${name}: ${unit === 'đ' ? formatCurrency(value) + 'đ' : value + unit} (${(percent * 100).toFixed(0)}%)`}
        </text>
    );
};



// --- MAIN CONTENT ---
const AirLinksTab = () => {
    const {
        brands, nhanSus,
        airLinks, isLoadingAirLinks, loadAirLinks,
        filterAlKenh, setFilterAlKenh,
        filterAlBrand, setFilterAlBrand,
        filterAlNhanSu, setFilterAlNhanSu,
        handleDeleteAirLink,
        clearAirLinkFilters,
        airLinksCurrentPage, setAirLinksCurrentPage,
        airLinksTotalCount, totalPagesAirLinks,
        airReportMonth, setAirReportMonth, airReportYear, setAirReportYear,
        airReportData, isAirReportLoading, handleGenerateAirLinksReport, requestAirSort,
        sortedAirReportRows, totalsRowAirReport,
        filterAlLinkAir, setFilterAlLinkAir,
        filterAlMonth, setFilterAlMonth
    } = useAppData();

    const [newLink, setNewLink] = useState({
        link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '',
        ngay_air: '',
        ngay_booking: new Date().toISOString().split('T')[0],
        cast: '', cms_brand: '', view_count: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Custom Secure Password Modal for Delete Operations
    const [passwordModal, setPasswordModal] = useState({ isOpen: false, type: null, data: null, input: '' });

    // Blacklist state
    const [blacklistChannels, setBlacklistChannels] = useState(() => {
        try { return JSON.parse(localStorage.getItem('koc_blacklist_channels') || '[]'); } catch { return []; }
    });
    const [blacklistModal, setBlacklistModal] = useState({ isOpen: false, unlocked: false, pwInput: '', newChannel: '' });
    const [kocOrderSet, setKocOrderSet] = useState(new Set());

    const openDeleteModal = (type, data = null) => {
        setPasswordModal({ isOpen: true, type, data, input: '' });
    };

    useEffect(() => {
        const loadKocOrders = async () => {
            try {
                const { data } = await supabase.from('donguis').select('koc_id_kenh').not('koc_id_kenh', 'is', null);
                if (data) setKocOrderSet(new Set(data.map(r => (r.koc_id_kenh || '').trim()).filter(Boolean)));
            } catch (e) { console.error('Failed to load koc orders:', e); }
        };
        loadKocOrders();
    }, []);

    const saveBlacklist = (list) => {
        setBlacklistChannels(list);
        localStorage.setItem('koc_blacklist_channels', JSON.stringify(list));
    };
    const addToBlacklist = (channelId) => {
        const trimmed = channelId.trim();
        if (!trimmed || blacklistChannels.includes(trimmed)) return;
        const updated = [...blacklistChannels, trimmed];
        saveBlacklist(updated);
    };
    const removeFromBlacklist = (channelId) => {
        saveBlacklist(blacklistChannels.filter(c => c !== channelId));
    };

    // Get password based on brand
    const getBrandPassword = (brandName) => {
        if (!brandName) return null;
        const lowerBrand = brandName.toLowerCase();
        if (lowerBrand.includes('eherb') || lowerBrand.includes('masube')) return 'eherb345';
        if (lowerBrand.includes('bodymiss') || lowerBrand.includes('real steel')) return 'bodymiss8255';
        if (lowerBrand.includes('milaganics')) return 'Mila123';
        if (lowerBrand.includes('moawmoawws') || lowerBrand.includes('healmi')) return 'MM101';
        return null;
    };

    const handleConfirmSecureDelete = () => {
        let isAuthorized = false;

        // Master Admin Password
        if (passwordModal.input === 'QUOCKHANH8255' || passwordModal.input === 'bichhue123') {
            isAuthorized = true;
        }
        // Brand-specific Password (for single delete only)
        else if (passwordModal.type === 'single' && passwordModal.data?.brandName) {
            const brandPass = getBrandPassword(passwordModal.data.brandName);
            if (brandPass && passwordModal.input === brandPass) {
                isAuthorized = true;
            }
        }
        // Thêm rule: Xóa trùng lặp chéo người phân quyền
        else if (passwordModal.type === 'duplicate') {
            if (passwordModal.input === 'bichhue123') {
                isAuthorized = true;
            }
        }

        if (isAuthorized) {
            if (passwordModal.type === 'bulk') {
                handleBulkDeleteInternal();
            } else if (passwordModal.type === 'single' || passwordModal.type === 'duplicate') {
                handleDeleteAirLink(passwordModal.data.id, passwordModal.data.link);
            }
            setPasswordModal({ isOpen: false, type: null, data: null, input: '' });
        } else {
            alert('❌ Mật khẩu sai!');
            setPasswordModal({ ...passwordModal, input: '' });
        }
    };

    // --- STATE CHO INLINE EDITING (SỬA TRỰC TIẾP) ---
    const [editingRowId, setEditingRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // --- STATE CHO BULK DELETE ---
    const [selectedRowIds, setSelectedRowIds] = useState([]);

    // --- STATE CHO DUPLICATE FILTERS ---
    const [dupFilterStaff, setDupFilterStaff] = useState('');
    const [dupFilterLink, setDupFilterLink] = useState('');

    // State bộ lọc biểu đồ
    const [chart1Brand, setChart1Brand] = useState('All');
    const [chart2Brand, setChart2Brand] = useState('All');
    const [chart3StaffId, setChart3StaffId] = useState('');
    const [chart4Brand, setChart4Brand] = useState('All');

    // --- STATE SẢN PHẨM ĐỘNG ---
    const [availableProducts, setAvailableProducts] = useState([]);

    // [FIX] Load sản phẩm theo Brand đã chọn
    useEffect(() => {
        const loadProducts = async () => {
            if (!newLink.brand_id) {
                // Nếu chưa chọn brand, có thể load tất cả hoặc để trống.
                // Để consistent với Order Tab, nên yêu cầu chọn Brand trước.
                // Tuy nhiên, nếu muốn load hết đề phòng, có thể bỏ check này.
                // Ở đây mình sẽ để trống cho gọn, ép user chọn Brand.
                setAvailableProducts([]);
                return;
            }
            // [FIX] Nếu là eHerb HCM, lấy ID của brand chính "eHerb" để load full sản phẩm
            let searchBrandId = newLink.brand_id;
            const selectedBrandName = brands.find(b => String(b.id) === String(newLink.brand_id))?.ten_brand?.toLowerCase() || '';

            if (selectedBrandName === 'eherb hcm') {
                const mainEherb = brands.find(b => b.ten_brand.toLowerCase() === 'eherb');
                if (mainEherb) {
                    searchBrandId = mainEherb.id;
                }
            }

            const { data, error } = await supabase
                .from('sanphams')
                .select('ten_sanpham, brand_id')
                .eq('brand_id', searchBrandId);

            if (!error && data) {
                let productList = data.map(d => d.ten_sanpham);

                // [FIX] Thêm Bodymist thủ công cho các Brand này
                const currentBrandName = brands.find(b => String(b.id) === String(newLink.brand_id))?.ten_brand?.toLowerCase() || '';
                if (currentBrandName.includes('bodymiss') || currentBrandName.includes('eherb')) {
                    const extraProducts = ['Bodymist', 'Bodymist nhũ', 'Nước hoa sáp'];
                    productList = [...new Set([...productList, ...extraProducts])];
                }

                setAvailableProducts(productList);
            } else {
                setAvailableProducts([]);
            }
        };
        loadProducts();
    }, [newLink.brand_id]);

    // --- LOGIC TÍNH TOÁN DỮ LIỆU ---
    const dataChart1 = useMemo(() => {
        let filtered = chart1Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart1Brand);
        const counts = {};
        // [FIX] Apply normalization here
        filtered.forEach(item => {
            const rawName = item.san_pham || 'Khác';
            const key = normalizeProductName(rawName);
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
    }, [airLinks, chart1Brand]);

    const dataChart2 = useMemo(() => {
        let filtered = chart2Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart2Brand);
        const counts = {};
        filtered.forEach(item => { const key = item.nhansu?.ten_nhansu || 'Ẩn danh'; counts[key] = (counts[key] || 0) + 1; });
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
    }, [airLinks, chart2Brand]);

    const dataChart3 = useMemo(() => {
        if (!chart3StaffId) return [];
        const selectedStaffObj = nhanSus.find(ns => String(ns.id) === String(chart3StaffId));
        if (!selectedStaffObj) return [];
        const staffName = selectedStaffObj.ten_nhansu;
        let filtered = airLinks.filter(d => (d.nhansu?.ten_nhansu === staffName) || String(d.nhansu_id) === String(chart3StaffId));
        const counts = {};
        // [FIX] Convert to normalized name
        filtered.forEach(item => {
            const raw = item.san_pham || 'Khác';
            const key = normalizeProductName(raw);
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
    }, [airLinks, chart3StaffId, nhanSus]);

    const dataChart4 = useMemo(() => {
        let filtered = chart4Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart4Brand);
        const costMap = {};
        // [FIX] Convert to normalized name
        filtered.forEach(item => {
            const raw = item.san_pham || 'Khác';
            const key = normalizeProductName(raw);
            const cost = parseMoney(item.cast);
            costMap[key] = (costMap[key] || 0) + cost;
        });
        return Object.keys(costMap).map(key => ({ name: key, value: costMap[key] }));
    }, [airLinks, chart4Brand]);

    const totalChart1 = useMemo(() => dataChart1.reduce((a, b) => a + b.value, 0), [dataChart1]);
    const totalChart2 = useMemo(() => dataChart2.reduce((a, b) => a + b.value, 0), [dataChart2]);
    const totalChart3 = useMemo(() => dataChart3.reduce((a, b) => a + b.value, 0), [dataChart3]);
    const totalChart4 = useMemo(() => dataChart4.reduce((a, b) => a + b.value, 0), [dataChart4]);

    // --- HANDLERS CHO FORM THÊM MỚI ---
    const handleLinkChange = async (e) => {
        const url = e.target.value;
        let extractedKenh = ''; let extractedVideo = '';
        try {
            if (url.includes('tiktok.com')) {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                const kenhPart = pathParts.find(p => p.startsWith('@'));
                if (kenhPart) extractedKenh = kenhPart.replace('@', '');
                const videoIndex = pathParts.indexOf('video');
                if (videoIndex !== -1 && pathParts[videoIndex + 1]) {
                    extractedVideo = pathParts[videoIndex + 1];
                }
            }
        } catch (error) { }
        setNewLink(prev => ({ ...prev, link_air_koc: url, id_kenh: extractedKenh, id_video: extractedVideo }));
        if (extractedKenh) {
            try {
                const { data, error } = await supabase.from('air_links').select('brand_id, nhansu_id, "cast", cms_brand').eq('id_kenh', extractedKenh).order('created_at', { ascending: false }).limit(1).single();
                if (data && !error) {
                    setNewLink(prev => ({ ...prev, brand_id: data.brand_id || '', nhansu_id: data.nhansu_id || '', cast: formatCurrency(data.cast) || '', cms_brand: data.cms_brand || '' }));
                }
            } catch (err) {
                console.error("Lỗi auto-fill:", err);
            }
        }
    };

    const handleCastChange = (e) => { setNewLink({ ...newLink, cast: formatCurrency(e.target.value) }); };

    const handleAddLink = async (e) => {
        e.preventDefault();
        if (!newLink.link_air_koc || !newLink.brand_id || !newLink.nhansu_id || !newLink.san_pham) {
            alert("Vui lòng điền đủ thông tin!"); return;
        }
        // Blacklist check
        if (newLink.id_kenh && blacklistChannels.includes(newLink.id_kenh.trim())) {
            alert(`🚫 Kênh "${newLink.id_kenh}" đang trong danh sách Black List!\nKhông thể nhập link air cho kênh này.`);
            return;
        }
        setIsSubmitting(true);
        try {
            // Logic CMS: Mặc định 10%
            let finalCMS = newLink.cms_brand;
            if (!finalCMS || finalCMS.trim() === '') finalCMS = '10%';

            // Logic Cast: Parse về số, nếu rỗng thì là 0
            const finalCast = parseMoney(newLink.cast);

            const dataToInsert = {
                ...newLink,
                san_pham: normalizeProductName(newLink.san_pham), // [FIX] Auto-normalize on Save (Manual Input)
                cms_brand: finalCMS,
                cast: finalCast, // Đảm bảo lưu số 0 nếu không điền
                ngay_air: newLink.ngay_air ? newLink.ngay_air : null
            };

            // [NEW] Auto-map `ngay_air` from Data Archive if not provided
            if (!dataToInsert.ngay_air && dataToInsert.id_video) {
                try {
                    const { data: perfData } = await supabase
                        .from('tiktok_performance')
                        .select('air_date')
                        .eq('video_id', dataToInsert.id_video)
                        .limit(1)
                        .maybeSingle();

                    if (perfData && perfData.air_date) {
                        dataToInsert.ngay_air = perfData.air_date;
                        console.log(`Auto-mapped ngay_air to ${perfData.air_date} for video ${dataToInsert.id_video}`);
                    }
                } catch (e) {
                    console.error("Failed to auto-map air_date:", e);
                }
            }

            const { error } = await supabase.from('air_links').insert([dataToInsert]);
            if (error) throw error;
            alert(`Đã thêm link thành công! 🎉${dataToInsert.ngay_air ? '\n(Đã tự động check và cập nhật thông số từ Lưu Trữ Data)' : ''}`);
            setNewLink({ link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '', ngay_air: '', ngay_booking: new Date().toISOString().split('T')[0], cast: '', cms_brand: '', view_count: 0 });
            loadAirLinks();
            handleGenerateAirLinksReport();
        } catch (error) {
            if (error.code === '23505') {
                alert("⛔ HIỆN TẠI DATABASE ĐANG CHẶN TRÙNG LINK!\n\nĐể nhập được nhiều dòng cùng 1 link (để tính KPI), bạn cần:\n1. Vào Supabase > Table 'air_links'\n2. Bấm Edit cột 'link_air_koc'\n3. Bỏ tích ô 'Is Unique'\n4. Lưu lại là xong!");
            } else {
                alert("Lỗi khi lưu: " + error.message);
            }
        } finally { setIsSubmitting(false); }
    };

    // --- BULK DELETE HANDLERS ---
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all on current page
            const ids = airLinks.map(item => item.id);
            setSelectedRowIds(ids);
        } else {
            setSelectedRowIds([]);
        }
    };

    const handleSelectRow = (id) => {
        if (selectedRowIds.includes(id)) {
            setSelectedRowIds(selectedRowIds.filter(itemId => itemId !== id));
        } else {
            setSelectedRowIds([...selectedRowIds, id]);
        }
    };

    const handleBulkDelete = () => {
        if (selectedRowIds.length === 0) return;
        openDeleteModal('bulk');
    };

    const handleBulkDeleteInternal = async () => {
        if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedRowIds.length} dòng đã chọn?`)) return;

        try {
            const { error } = await supabase.from('air_links').delete().in('id', selectedRowIds);
            if (error) throw error;
            alert("Đã xóa thành công!");
            setSelectedRowIds([]);
            loadAirLinks(); handleGenerateAirLinksReport();
        } catch (err) {
            alert("Lỗi khi xóa: " + err.message);
        }
    };

    // --- BULK UPLOAD HANDLER ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = utils.sheet_to_json(ws);

                if (data.length === 0) { alert("File trống!"); return; }

                const validRows = [];
                let successCount = 0;
                let failCount = 0;

                for (let row of data) {
                    // Mapping
                    const linkAir = row['Link Air (URL)'] || '';
                    const brandName = row['Brand (Tên)'];
                    const sp = row['Sản Phẩm'];
                    const nsName = row['Nhân Sự (Tên)'];
                    const dateAir = processExcelDate(row['Ngày Air (YYYY-MM-DD)']);
                    const dateBook = processExcelDate(row['Ngày Booking (YYYY-MM-DD)']);
                    const castVal = row['Cast (VND)'];


                    // Xử lý CMS: Nếu Excel đọc là số (vd 0.1) thì chuyển về string %
                    let cmsRaw = row['CMS (%)'];
                    if (typeof cmsRaw === 'number') {
                        // Nếu nhỏ hơn hoặc bằng 1, giả định là dạng thập phân (0.1 = 10%)
                        if (cmsRaw <= 1) {
                            cmsRaw = (Math.round(cmsRaw * 100)) + '%';
                        } else {
                            // Nếu lớn hơn 1, giả định là số nguyên (10 = 10%)
                            cmsRaw = cmsRaw + '%';
                        }
                    } else if (cmsRaw && !String(cmsRaw).includes('%')) {
                        cmsRaw = cmsRaw + '%';
                    }
                    const cmsVal = cmsRaw || '10%';

                    // Optional IDs
                    let kId = row['Kênh (ID - Optional)'];
                    let vId = row['Video (ID - Optional)'];

                    // Auto-extract ID if URL provided and IDs missing
                    if (linkAir && (!kId || !vId)) {
                        try {
                            if (linkAir.includes('tiktok.com')) {
                                const urlObj = new URL(linkAir);
                                const pathParts = urlObj.pathname.split('/').filter(p => p);
                                const kenhPart = pathParts.find(p => p.startsWith('@'));
                                if (kenhPart && !kId) kId = kenhPart.replace('@', '');
                                const videoIndex = pathParts.indexOf('video');
                                if (videoIndex !== -1 && pathParts[videoIndex + 1] && !vId) {
                                    vId = pathParts[videoIndex + 1];
                                }
                            }
                        } catch (err) { }
                    }

                    // Find IDs
                    const foundBrand = brands.find(b => b.ten_brand?.toLowerCase() === brandName?.toLowerCase());
                    const foundNS = nhanSus.find(n => n.ten_nhansu?.toLowerCase() === nsName?.toLowerCase());

                    if (!foundBrand || !foundNS || !sp) {
                        console.warn("Skipping row due to missing data/match:", row);
                        failCount++;
                        continue;
                    }

                    validRows.push({
                        link_air_koc: linkAir,
                        brand_id: foundBrand.id,
                        nhansu_id: foundNS.id,
                        san_pham: normalizeProductName(sp), // [FIX] Auto-normalize Excel Data
                        id_kenh: kId || '',
                        id_video: vId || '',
                        ngay_air: dateAir || null,
                        ngay_booking: dateBook || new Date().toISOString().split('T')[0],
                        cast: parseMoney(castVal),
                        cms_brand: cmsVal,
                        view_count: 0
                    });
                }

                // DEDUPLICATE: Lọc trùng link trong chính file Excel (chỉ lấy dòng cuối cùng cho mỗi link)
                const uniqueRowsMap = new Map();
                for (const item of validRows) {
                    uniqueRowsMap.set(item.link_air_koc, item);
                }
                const uniqueValidRows = Array.from(uniqueRowsMap.values());

                if (uniqueValidRows.length > 0) {
                    // [NEW] Auto-map `ngay_air` from Data Archive for bulk upload
                    const videoIdsToMap = uniqueValidRows.filter(r => r.id_video && !r.ngay_air).map(r => r.id_video);
                    if (videoIdsToMap.length > 0) {
                        try {
                            const { data: perfData } = await supabase
                                .from('tiktok_performance')
                                .select('video_id, air_date')
                                .in('video_id', videoIdsToMap);

                            if (perfData && perfData.length > 0) {
                                const perfMap = new Map();
                                perfData.forEach(d => perfMap.set(d.video_id, d.air_date));
                                uniqueValidRows.forEach(row => {
                                    if (!row.ngay_air && row.id_video && perfMap.has(row.id_video)) {
                                        row.ngay_air = perfMap.get(row.id_video);
                                    }
                                });
                            }
                        } catch (e) {
                            console.error("Failed to auto-map air_date bulk:", e);
                        }
                    }

                    // [MODIFIED] INSERT INSTEAD OF UPSERT (Allow Duplicates)
                    // We now insert ALL valid rows, even if they share the same link
                    const { error } = await supabase.from('air_links').insert(uniqueValidRows);
                    if (error) throw error;
                    successCount = uniqueValidRows.length;

                    // Warning about internal file duplicates (we still dedup within the file itself to prevent accidental double-paste)
                    const duplicatesInFile = validRows.length - uniqueValidRows.length;
                    alert(`Xử lý thành công: ${successCount} dòng.\n(Đã tự động lọc bỏ ${duplicatesInFile} dòng trùng trong chính file excel này).\nThất bại/Bỏ qua: ${failCount} dòng.`);
                    loadAirLinks(); handleGenerateAirLinksReport();
                    alert(`Xử lý thành công: ${successCount} dòng.\n(Đã tự động lọc bỏ ${duplicatesInFile} dòng trùng trong chính file excel này).\nThất bại/Bỏ qua: ${failCount} dòng.`);
                    loadAirLinks(); handleGenerateAirLinksReport();
                } else {
                    alert("Không tìm thấy dòng dữ liệu hợp lệ nào (Kiểm tra chính xác Tên Brand/Nhân sự trong file).");
                }

            } catch (error) {
                console.error(error);
                if (error.code === '23505') {
                    alert("⛔ LỖI IMPORT: DATABASE ĐANG CHẶN TRÙNG LINK!\n\nBạn cần vào Supabase bỏ tích 'Is Unique' ở cột 'link_air_koc' thì mới import đè hoặc import trùng được nhé!");
                } else {
                    alert("Lỗi xử lý file: " + error.message);
                }
            } finally {
                e.target.value = ''; // Reset input
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- EXPORT EXCEL (FULL DATA) ---
    const handleExportExcel = async () => {
        const confirmExport = window.confirm(`Bạn có muốn xuất toàn bộ dữ liệu đã lọc không? \n(Quá trình này có thể mất vài giây nếu dữ liệu lớn)`);
        if (!confirmExport) return;

        try {
            let allData = [];
            let from = 0;
            const size = 1000;
            let more = true;

            while (more) {
                // Replicate Filter Logic but use RANGE
                let query = supabase.from('air_links').select(`
                    id, created_at, link_air_koc, id_kenh, id_video,
                    "cast", cms_brand, 
                    ngay_air, san_pham, ngay_booking,
                    brands ( ten_brand ),
                    nhansu ( ten_nhansu )
                `);

                if (filterAlKenh) query = query.ilike('id_kenh', `%${filterAlKenh}%`);
                if (filterAlLinkAir) query = query.ilike('link_air_koc', `%${filterAlLinkAir}%`);
                if (filterAlBrand) query = query.eq('brand_id', filterAlBrand);
                if (filterAlNhanSu) query = query.eq('nhansu_id', filterAlNhanSu);
                if (filterAlMonth) {
                    const targetYear = parseInt(filterAlMonth.split('-')[0]);
                    const targetMonth = parseInt(filterAlMonth.split('-')[1]);
                    const startDate = `${filterAlMonth}-01T00:00:00.000Z`;
                    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
                    const endDate = `${filterAlMonth}-${lastDay}T23:59:59.999Z`;
                    query = query.gte('ngay_air', startDate).lte('ngay_air', endDate);
                }

                const { data, error } = await query
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, from + size - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    from += size;
                    if (data.length < size) more = false;
                } else {
                    more = false;
                }
                if (allData.length > 50000) more = false; // Safety break
            }

            if (allData.length === 0) {
                alert("Không tìm thấy dữ liệu nào để xuất!");
                return;
            }

            const dataToExport = allData.map((item, index) => ({
                "STT": allData.length - index,
                "Link Air": item.link_air_koc || '',
                "ID Kênh": item.id_kenh || '',
                "ID Video": item.id_video || '',
                "Brand": item.brands?.ten_brand || '',
                "Sản Phẩm": item.san_pham || '',
                "Cast": item.cast ? Number(item.cast) : 0,
                "CMS": item.cms_brand || '',
                "Nhân Sự": item.nhansu?.ten_nhansu || '',
                "Ngày Air": item.ngay_air || '',
                "Ngày Booking": item.ngay_booking || ''
            }));

            const ws = utils.json_to_sheet(dataToExport);
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "AirLinks_Full");
            writeFile(wb, `Air_Links_Full_${new Date().toISOString().split('T')[0]}.xlsx`);
            alert(`Đã xuất thành công ${data.length} dòng!`);

        } catch (err) {
            console.error(err);
            alert("Lỗi khi xuất Excel: " + err.message);
        }
    };

    useEffect(() => { handleGenerateAirLinksReport(); }, [airReportMonth, airReportYear]);

    // --- LOGIC HIỂN THỊ VÀ EDIT TRỰC TIẾP ---

    // 1. Render text CMS (Logic cũ)
    const renderCMS = (val) => {
        let str = val ? String(val).trim() : '';
        if (str === '' || str === '0') str = '10%';
        if (!str.includes('%')) str = str + '%';
        const isStandard = str === '10%';
        return (
            <span style={{ color: isStandard ? 'inherit' : '#D42426', fontWeight: isStandard ? 'normal' : 'bold' }}>
                {str}
            </span>
        );
    };

    // 2. Render CAST (Logic MỚI: Highlight đỏ nếu > 0, mặc định 0)
    const renderCast = (val) => {
        const numVal = parseMoney(val);
        if (numVal > 0) {
            // Có tiền -> Highlight ĐỎ
            return <span style={{ color: '#D42426', fontWeight: 'bold' }}>{formatCurrency(numVal)}</span>;
        } else {
            // Không có tiền (0 hoặc rỗng) -> Hiện số 0 màu thường
            return <span>0</span>;
        }
    };

    // START EDIT
    // START EDIT (Fixed for Crash: Default to empty string)
    const handleEditClick = (link) => {
        setEditingRowId(link.id);
        setEditFormData({
            id: link.id,
            link_air_koc: link.link_air_koc || '',
            id_kenh: link.id_kenh || '',
            id_video: link.id_video || '',
            brand_id: link.brand_id || '',
            san_pham: link.san_pham || '',
            nhansu_id: link.nhansu_id || '',
            cast: link.cast || '', // Will be stored as string for input
            cms_brand: link.cms_brand || '',
            ngay_air: link.ngay_air || '',
        });
    };

    // CHANGE INPUT
    const handleEditFormChange = (e, field) => {
        let value = e.target.value;
        if (field === 'cast') value = formatCurrency(value);
        setEditFormData({ ...editFormData, [field]: value });
    };

    // CANCEL
    const handleCancelClick = () => {
        setEditingRowId(null);
        setEditFormData({});
    };

    // SAVE
    const handleSaveClick = async () => {
        try {
            let finalCMS = editFormData.cms_brand;
            if (!finalCMS || String(finalCMS).trim() === '') finalCMS = '10%';

            // Xử lý Cast khi lưu: Parse về số để lưu DB
            const finalCast = parseMoney(editFormData.cast);

            const { error } = await supabase
                .from('air_links')
                .update({
                    link_air_koc: editFormData.link_air_koc,
                    id_kenh: editFormData.id_kenh,
                    id_video: editFormData.id_video,
                    brand_id: editFormData.brand_id,
                    san_pham: editFormData.san_pham,
                    cast: finalCast,
                    cms_brand: finalCMS,
                    nhansu_id: editFormData.nhansu_id,
                    ngay_air: editFormData.ngay_air || null,
                })
                .eq('id', editFormData.id);

            if (error) throw error;

            alert("Đã cập nhật thành công! ✅");
            setEditingRowId(null);
            loadAirLinks();
            handleGenerateAirLinksReport();
        } catch (err) {
            alert("Lỗi khi cập nhật: " + err.message);
        }
    };

    // STYLES

    // STYLES
    const inputStyle = { width: '100%' }; // Removed padding/border to let global CSS handle it
    const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.95rem', color: '#333' };
    const tableInputStyle = { width: '100%' }; // Let global CSS handle it

    return (
        <>
            {/* HEADER */}
            <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-header">
                        QUẢN LÝ AIR LINKS
                    </h1>
                    <p style={{ color: '#4B5563', marginTop: '8px', fontSize: '1.1rem', fontWeight: '500' }}>
                        Theo dõi hiệu suất và nhập liệu link air hàng ngày.
                    </p>
                </div>
                <div style={{ backgroundColor: '#fff', padding: '12px 25px', borderRadius: '30px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', color: '#D42426', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    📅 Hôm nay: {new Date().toLocaleDateString('vi-VN')}
                </div>
            </div>

            {/* FORM THÊM MỚI - FIX GRID ALIGNMENT */}
            <div className="mirinda-card" style={{ marginBottom: '2rem', padding: '25px' }}>
                <h3 style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '15px', marginBottom: '25px', color: '#ea580c', fontSize: '1.25rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    ✏️ THÊM LINK AIR MỚI
                </h3>
                {/* ── BLACKLIST KOC ── */}
                <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fef2f2', cursor: 'pointer' }}
                        onClick={() => setBlacklistModal(m => ({ ...m, isOpen: !m.isOpen }))}>
                        <span style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.88rem' }}>🚫 Black List KOC ({blacklistChannels.length} kênh)</span>
                        <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>{blacklistModal.isOpen ? '▲ Thu gọn' : '▼ Mở rộng'}</span>
                    </div>
                    {blacklistModal.isOpen && (
                        <div style={{ padding: '16px' }}>
                            {!blacklistModal.unlocked ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="password" placeholder="Nhập mật khẩu để quản lý blacklist..." value={blacklistModal.pwInput}
                                        onChange={e => setBlacklistModal(m => ({ ...m, pwInput: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') { if (blacklistModal.pwInput === 'Blacklist8255') setBlacklistModal(m => ({ ...m, unlocked: true, pwInput: '' })); else alert('Sai mật khẩu!'); }}}
                                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', fontSize: '0.85rem' }} />
                                    <button type="button" onClick={() => { if (blacklistModal.pwInput === 'Blacklist8255') setBlacklistModal(m => ({ ...m, unlocked: true, pwInput: '' })); else alert('Sai mật khẩu!'); }}
                                        style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                                        Xác nhận
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                        <input type="text" placeholder="Nhập ID Kênh cần chặn (vd: @tenkenh hoặc 123456789)..." value={blacklistModal.newChannel}
                                            onChange={e => setBlacklistModal(m => ({ ...m, newChannel: e.target.value }))}
                                            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', fontSize: '0.85rem' }} />
                                        <button type="button" onClick={() => { addToBlacklist(blacklistModal.newChannel); setBlacklistModal(m => ({ ...m, newChannel: '' })); }}
                                            style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                                            + Thêm
                                        </button>
                                    </div>
                                    {blacklistChannels.length === 0 ? (
                                        <p style={{ color: '#9ca3af', fontSize: '0.82rem', textAlign: 'center', padding: '12px 0' }}>Chưa có kênh nào trong blacklist</p>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr style={{ background: '#fef2f2' }}>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#dc2626' }}>ID Kênh</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#dc2626', width: 80 }}>Xoá</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {blacklistChannels.map((ch, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{ch}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            <button type="button" onClick={() => removeFromBlacklist(ch)}
                                                                style={{ padding: '3px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                                                Xoá
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                    <button type="button" onClick={() => setBlacklistModal(m => ({ ...m, unlocked: false }))}
                                        style={{ marginTop: 10, padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', color: '#64748b' }}>
                                        🔒 Khoá lại
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <form onSubmit={handleAddLink}>
                    {/* Consistent 2-column Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '25px' }}>
                        {/* LEFT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <div>
                                <label style={labelStyle}>Link Video TikTok (*)</label>
                                <input type="text" placeholder="Dán link vào đây..." value={newLink.link_air_koc} onChange={handleLinkChange} required style={inputStyle} />
                            </div>

                            <div style={{ display: 'flex', gap: '15px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ ...labelStyle, color: '#666' }}>ID Kênh</label>
                                    <input type="text" value={newLink.id_kenh} readOnly style={{ ...inputStyle, backgroundColor: '#f9f9f9', color: '#555' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ ...labelStyle, color: '#666' }}>ID Video</label>
                                    <input type="text" value={newLink.id_video} readOnly style={{ ...inputStyle, backgroundColor: '#f9f9f9', color: '#555' }} />
                                </div>
                            </div>

                            <div>
                                <label style={labelStyle}>Sản Phẩm (*)</label>
                                <SearchableDropdown
                                    options={availableProducts.length > 0
                                        ? availableProducts.map(prod => ({ value: prod, label: prod }))
                                        : []}
                                    value={newLink.san_pham}
                                    onChange={(val) => setNewLink({ ...newLink, san_pham: val })}
                                    placeholder={availableProducts.length > 0 ? "-- Chọn Sản Phẩm --" : "Vui lòng chọn Brand trước"}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Brand (*)</label>
                                <select value={newLink.brand_id} onChange={e => setNewLink({ ...newLink, brand_id: e.target.value })} required style={inputStyle}>
                                    <option value="">-- Chọn Brand --</option>
                                    {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={labelStyle}>Nhân sự Booking (*)</label>
                                <select value={newLink.nhansu_id} onChange={e => setNewLink({ ...newLink, nhansu_id: e.target.value })} required style={inputStyle}>
                                    <option value="">-- Chọn Nhân sự --</option>
                                    {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '30px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>CAST (VND)</label>
                                    <input type="text" value={newLink.cast} onChange={handleCastChange} placeholder="Ví dụ: 500.000" style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>CMS (%)</label>
                                    <input type="text" value={newLink.cms_brand} onChange={e => setNewLink({ ...newLink, cms_brand: e.target.value })} placeholder="10%" style={inputStyle} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '25px' }}>
                        <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ padding: '12px 60px', borderRadius: '50px', fontSize: '1.2rem' }}>
                            {isSubmitting ? 'ĐANG LƯU...' : 'LƯU LINK AIR'}
                        </button>
                    </div>
                </form>

                {/* BULK UPLOAD SECTION */}
                <div style={{ marginTop: '20px', padding: '20px', borderTop: '1px dashed #e5e7eb', textAlign: 'center' }}>
                    <h5 style={{ marginBottom: '15px', fontWeight: 'bold' }}>📂 IMPORT NHANH TỪ FILE EXCEL</h5>

                    <div style={{ animation: 'fadeIn 0.5s' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
                            <a href="/Mau_Nhap_Link_Air.xlsx" download="Mau_Nhap_Link_Air.xlsx" className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                ⬇️ Tải File Mẫu
                            </a>
                            <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                                <button className="btn-primary" style={{ padding: '8px 20px' }}>📤 Upload Excel</button>
                                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} style={{ position: 'absolute', left: 0, top: 0, opacity: 0, height: '100%', width: '100%', cursor: 'pointer' }} />
                            </div>
                        </div>
                        <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#666' }}>*Lưu ý: Điền chính xác "Tên Brand" và "Tên Nhân Sự" khớp với trên hệ thống.</p>
                    </div>
                </div>
            </div>

            {/* DUPLICATE WARNING TABLE */}
            {(() => {
                const dupMap = {};
                airLinks.forEach(item => {
                    let key = item.id_video ? item.id_video.trim() : null;
                    if (!key && item.link_air_koc) key = item.link_air_koc.trim();

                    if (key) {
                        if (!dupMap[key]) dupMap[key] = [];
                        dupMap[key].push(item);
                    }
                });

                const duplicates = Object.values(dupMap).filter(group => group.length > 1);

                if (duplicates.length === 0) return null;

                // Apply filters - Show WHOLE GROUP if ANY item matches
                let filteredDuplicates = duplicates;
                if (dupFilterStaff || dupFilterLink) {
                    filteredDuplicates = duplicates.filter(group => {
                        // Keep whole group if ANY item matches the filter
                        return group.some(item => {
                            const matchStaff = !dupFilterStaff ||
                                (item.nhansu?.ten_nhansu || '') === dupFilterStaff;
                            const matchLink = !dupFilterLink ||
                                (item.link_air_koc || '').toLowerCase().includes(dupFilterLink.toLowerCase()) ||
                                (item.id_video || '').toLowerCase().includes(dupFilterLink.toLowerCase());
                            return matchStaff && matchLink;
                        });
                    });
                }

                // Export function
                const handleExportDuplicates = () => {
                    const exportData = [];
                    filteredDuplicates.forEach(group => {
                        group.forEach((item, idx) => {
                            exportData.push({
                                'Video ID': item.id_video || 'N/A',
                                'Link': item.link_air_koc || 'N/A',
                                'Nhân Sự': item.nhansu?.ten_nhansu || 'N/A',
                                'Brand': item.brands?.ten_brand || 'N/A',
                                'Sản Phẩm': item.san_pham || 'N/A',
                                'Số lần trùng': group.length,
                                'Bản sao thứ': idx + 1
                            });
                        });
                    });

                    const ws = utils.json_to_sheet(exportData);
                    const wb = utils.book_new();
                    utils.book_append_sheet(wb, ws, 'Duplicates');
                    writeFile(wb, `Link_Trung_${new Date().toISOString().split('T')[0]}.xlsx`);
                };

                return (
                    <div className="mirinda-card" style={{
                        marginBottom: '2rem',
                        padding: '25px',
                        border: '3px solid #F59E0B',
                        backgroundColor: '#FFF7ED',
                        borderRadius: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '32px' }}>⚠️</span>
                                <h3 style={{ margin: 0, color: '#EA580C', fontSize: '1.4rem', fontWeight: 'bold' }}>
                                    CẢNH BÁO NHẬP TRÙNG ({filteredDuplicates.length}/{duplicates.length} video)
                                </h3>
                            </div>
                            <button
                                onClick={handleExportDuplicates}
                                style={{
                                    padding: '10px 20px',
                                    background: 'linear-gradient(90deg, #10B981, #059669)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: '0.95rem'
                                }}
                            >
                                📥 Xuất Excel
                            </button>
                        </div>

                        {/* Filters */}
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                            <select
                                value={dupFilterStaff}
                                onChange={(e) => setDupFilterStaff(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '10px 15px',
                                    border: '2px solid #F59E0B',
                                    borderRadius: '8px',
                                    fontSize: '0.95rem',
                                    backgroundColor: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">-- Tất cả nhân sự --</option>
                                {/* Get unique staff names from duplicates */}
                                {[...new Set(duplicates.flatMap(g => g.map(i => i.nhansu?.ten_nhansu)).filter(Boolean))].sort().map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                placeholder="🔍 Tìm theo Video ID / Link..."
                                value={dupFilterLink}
                                onChange={(e) => setDupFilterLink(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '10px 15px',
                                    border: '2px solid #F59E0B',
                                    borderRadius: '8px',
                                    fontSize: '0.95rem'
                                }}
                            />
                            {(dupFilterStaff || dupFilterLink) && (
                                <button
                                    onClick={() => {
                                        setDupFilterStaff('');
                                        setDupFilterLink('');
                                    }}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#6B7280',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    ✖ Xóa lọc
                                </button>
                            )}
                        </div>

                        <p style={{ color: '#92400E', marginBottom: '20px', fontSize: '1rem' }}>
                            Những video dưới đây bị nhập nhiều lần. Chọn 1 để giữ lại, xóa các bản còn lại.
                        </p>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '2px solid #F59E0B', borderRadius: '8px', backgroundColor: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                                <thead style={{ backgroundColor: '#FEF3C7', position: 'sticky', top: 0, borderBottom: '2px solid #F59E0B' }}>
                                    <tr>
                                        <th style={{ padding: '14px', textAlign: 'left', color: '#000', fontWeight: 'bold' }}>Video ID / Link</th>
                                        <th style={{ padding: '14px', textAlign: 'center', color: '#000', fontWeight: 'bold' }}>Trùng</th>
                                        <th style={{ padding: '14px', textAlign: 'left', color: '#000', fontWeight: 'bold' }}>Chi tiết</th>
                                        <th style={{ padding: '14px', textAlign: 'center', color: '#000', fontWeight: 'bold' }}>Hành động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDuplicates.map((group, groupIdx) => (
                                        <React.Fragment key={groupIdx}>
                                            {/* Group Header - Shows the link info */}
                                            <tr style={{ backgroundColor: '#FEF3C7', borderTop: groupIdx > 0 ? '3px solid #F59E0B' : 'none' }}>
                                                <td colSpan={4} style={{ padding: '12px 14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                        <span style={{ fontWeight: 'bold', color: '#DC2626', fontSize: '1.1rem' }}>
                                                            🔗 Trùng {group.length}x
                                                        </span>
                                                        <span style={{ fontWeight: 'bold', color: '#000', fontSize: '0.95rem' }}>
                                                            {group[0]?.id_video || 'No ID'}
                                                        </span>
                                                        <a href={group[0]?.link_air_koc} target="_blank" rel="noopener noreferrer"
                                                            style={{ fontSize: '0.85rem', color: '#1976D2', textDecoration: 'underline', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {group[0]?.link_air_koc}
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* Items in this group */}
                                            {group.map((item, subIdx) => (
                                                <tr key={item.id} style={{
                                                    borderBottom: '1px solid #FDE68A',
                                                    backgroundColor: subIdx % 2 === 0 ? '#FFFBEB' : '#fff'
                                                }}>
                                                    <td style={{ padding: '10px 14px', paddingLeft: '30px' }}>
                                                        <span style={{ color: '#666', fontSize: '0.85rem' }}>Bản sao #{subIdx + 1}</span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#888' }}>
                                                        —
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#000' }}>
                                                        <div style={{ marginBottom: '4px' }}>
                                                            <strong style={{ color: '#EA580C' }}>👤 {item.nhansu?.ten_nhansu || 'Unknown'}</strong>
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                                            🏢 {item.brands?.ten_brand || 'N/A'} • 📦 {item.san_pham || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => {
                                                                const allSamePerson = group.every(g => g.nhansu_id && g.nhansu_id === group[0].nhansu_id);
                                                                if (allSamePerson) {
                                                                    if (window.confirm('Xác nhận xóa bản ghi trùng lặp này?')) {
                                                                        handleDeleteAirLink(item.id, item.link_air_koc);
                                                                    }
                                                                } else {
                                                                    openDeleteModal('duplicate', { id: item.id, link: item.link_air_koc });
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '8px 16px',
                                                                backgroundColor: '#DC2626',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                fontSize: '0.9rem'
                                                            }}
                                                        >
                                                            🗑️ Xóa
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* CHARTS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
                <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px' }}><span className="section-title">📦 Tỷ Trọng (Link Air) - Sản phẩm</span></h4>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}><select value={chart1Brand} onChange={e => setChart1Brand(e.target.value)} style={{ padding: '8px', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid #ddd' }}><option value="All">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {dataChart1.length > 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                                <div style={{ width: '60%', height: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dataChart1} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="none" cornerRadius={6}>
                                                {dataChart1.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart1} position="center" fill="#00D4FF" style={{ fontSize: '28px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", textAnchor: 'middle', filter: 'drop-shadow(0px 0px 8px rgba(0, 212, 255, 0.5))' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#FFFFFF', color: '#0f172a', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontWeight: 'bold' }} wrapperStyle={{ zIndex: 1000 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ width: '40%', paddingLeft: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                                    {dataChart1.map((entry, index) => (
                                        <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                                            <div style={{ width: '12px', height: '12px', backgroundColor: COLORS[index % COLORS.length], marginRight: '8px', border: '1px solid #000' }}></div>
                                            <span style={{ fontWeight: '500' }}>{entry.name}: {entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <p style={{ textAlign: 'center', color: '#999', marginTop: '150px' }}>Không có dữ liệu</p>}
                    </div>
                </div>
                <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px' }}><span className="section-title">👤 Năng Suất Nhân Sự - Tổng Link</span></h4>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}><select value={chart2Brand} onChange={e => setChart2Brand(e.target.value)} style={{ padding: '8px', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid #ddd' }}><option value="All">Theo tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {dataChart2.length > 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                                <div style={{ width: '60%', height: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dataChart2} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="none" cornerRadius={6}>
                                                {dataChart2.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart2} position="center" fill="#00D4FF" style={{ fontSize: '28px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", textAnchor: 'middle', filter: 'drop-shadow(0px 0px 8px rgba(0, 212, 255, 0.5))' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#FFFFFF', color: '#0f172a', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontWeight: 'bold' }} wrapperStyle={{ zIndex: 1000 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ width: '40%', paddingLeft: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                                    {dataChart2.map((entry, index) => (
                                        <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                                            <div style={{ width: '12px', height: '12px', backgroundColor: COLORS[index % COLORS.length], marginRight: '8px', border: '1px solid #000' }}></div>
                                            <span style={{ fontWeight: '500' }}>{entry.name}: {entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <p style={{ textAlign: 'center', color: '#999', marginTop: '150px' }}>Không có dữ liệu</p>}
                    </div>
                </div>
                <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px' }}><span className="section-title">👤 Chi Tiết Nhân Sự - Sản phẩm</span></h4>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}><select value={chart3StaffId} onChange={e => setChart3StaffId(e.target.value)} style={{ padding: '8px', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid #ddd' }}><option value="">-- Chọn Nhân Sự Để Xem --</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select></div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {dataChart3.length > 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                                <div style={{ width: '60%', height: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dataChart3} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="none" cornerRadius={6}>
                                                {dataChart3.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart3} position="center" fill="#00D4FF" style={{ fontSize: '28px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", textAnchor: 'middle', filter: 'drop-shadow(0px 0px 8px rgba(0, 212, 255, 0.5))' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#FFFFFF', color: '#0f172a', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontWeight: 'bold' }} wrapperStyle={{ zIndex: 1000 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ width: '40%', paddingLeft: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                                    {dataChart3.map((entry, index) => (
                                        <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                                            <div style={{ width: '12px', height: '12px', backgroundColor: COLORS[index % COLORS.length], marginRight: '8px', border: '1px solid #000' }}></div>
                                            <span style={{ fontWeight: '500' }}>{entry.name}: {entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <div style={{ textAlign: 'center', color: '#999', marginTop: '150px', fontSize: '1rem' }}>👈 Vui lòng chọn nhân sự</div>}
                    </div>
                </div>
                <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '10px' }}><span className="section-title">💸 Ngân Sách Cast (VNĐ) - Tổng Chi</span></h4>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}><select value={chart4Brand} onChange={e => setChart4Brand(e.target.value)} style={{ padding: '8px', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid #ddd' }}><option value="All">Theo tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {dataChart4.length > 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                                <div style={{ width: '60%', height: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dataChart4} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="none" cornerRadius={6}>
                                                {dataChart4.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={formatCompactNumber(totalChart4)} position="center" fill="#00D4FF" style={{ fontSize: '28px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", textAnchor: 'middle', filter: 'drop-shadow(0px 0px 8px rgba(0, 212, 255, 0.5))' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value) + ' đ'} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#FFFFFF', color: '#0f172a', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontWeight: 'bold' }} wrapperStyle={{ zIndex: 1000 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ width: '40%', paddingLeft: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                                    {dataChart4.map((entry, index) => (
                                        <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                                            <div style={{ width: '12px', height: '12px', backgroundColor: COLORS[index % COLORS.length], marginRight: '8px', border: '1px solid #000' }}></div>
                                            <span style={{ fontWeight: '500' }}>{entry.name}: {formatCompactNumber(entry.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <p style={{ textAlign: 'center', color: '#999', marginTop: '150px' }}>Không có dữ liệu</p>}
                    </div>
                </div>
            </div>

            {/* BÁO CÁO HIỆU SUẤT */}
            <div className="mirinda-card" style={{ marginBottom: '2rem', padding: '25px', borderRadius: '12px', border: '2px solid #000', boxShadow: '4px 4px 0px #000', backgroundColor: '#fff' }}>
                <h2 style={{ textAlign: 'center', color: '#333', fontSize: '1.4rem', marginBottom: '1.5rem', fontWeight: '800' }}>BÁO CÁO HIỆU SUẤT AIR LINKS</h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem' }}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</select>
                    <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ width: '90px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem' }} />
                    <button onClick={handleGenerateAirLinksReport} disabled={isAirReportLoading} style={{ backgroundColor: '#165B33', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>{isAirReportLoading ? '...' : 'Xem Báo Cáo'}</button>
                </div>
                {airReportData.reportRows.length > 0 ? (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                            <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                                <tr><th onClick={() => requestAirSort('ten_nhansu')} style={{ cursor: 'pointer', padding: '14px', textAlign: 'left' }}>Nhân Sự</th><th onClick={() => requestAirSort('sl_video_air')} style={{ cursor: 'pointer', textAlign: 'center', padding: '14px' }}>SL Video</th><th onClick={() => requestAirSort('chi_phi_cast')} style={{ cursor: 'pointer', textAlign: 'center', padding: '14px' }}>Chi Phí Cast</th>{airReportData.brandHeaders.map(brand => (<th key={brand} style={{ textAlign: 'center', padding: '14px' }}>{brand}</th>))}</tr>
                            </thead>
                            <tbody>{sortedAirReportRows.map((item) => (<tr key={item.nhansu_id} style={{ borderBottom: '1px solid #f0f0f0' }}><td style={{ fontWeight: 'bold', color: '#165B33', padding: '14px' }}>{item.ten_nhansu}</td><td style={{ textAlign: 'center', padding: '14px' }}>{item.sl_video_air}</td><td style={{ textAlign: 'center', padding: '14px' }}>{Math.round(item.chi_phi_cast).toLocaleString('vi-VN')} đ</td>{airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center', padding: '14px' }}>{item.brand_counts_air[brand] || 0}</td>))}</tr>))}</tbody>
                            <tfoot>{totalsRowAirReport && (<tr style={{ backgroundColor: '#fff5f5', fontWeight: 'bold', color: '#D42426' }}><td style={{ padding: '14px' }}>TỔNG CỘNG</td><td style={{ textAlign: 'center', padding: '14px' }}>{totalsRowAirReport.sl_video_air}</td><td style={{ textAlign: 'center', padding: '14px' }}>{Math.round(totalsRowAirReport.chi_phi_cast).toLocaleString('vi-VN')} đ</td>{airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center', padding: '14px' }}>{totalsRowAirReport.brand_counts_air[brand] || 0}</td>))}</tr>)}</tfoot>
                        </table>
                    </div>
                ) : <p style={{ textAlign: 'center', color: '#999' }}>Chưa có dữ liệu báo cáo.</p>}
            </div>

            {/* DANH SÁCH LINK - TABLE ĐÃ UPDATE INLINE EDIT */}
            {/* DANH SÁCH LINK - TABLE ĐÃ UPDATE INLINE EDIT */}
            <div className="mirinda-card" style={{ marginBottom: '2rem', padding: '1.5rem', position: 'relative', zIndex: 20 }}>
                <h2 className="section-title" style={{ textAlign: 'left' }}>DANH SÁCH LINK ĐÃ NHẬP</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '1.5rem', alignItems: 'center' }}>
                    {selectedRowIds.length > 0 && (
                        <button onClick={handleBulkDelete} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 20px' }}>
                            🗑️ XÓA {selectedRowIds.length} MỤC ĐÃ CHỌN
                        </button>
                    )}
                    <input type="text" placeholder="Tìm Link Air..." value={filterAlLinkAir} onChange={e => setFilterAlLinkAir(e.target.value)} style={{ flex: '1 1 200px' }} />
                    <input type="text" placeholder="Lọc ID Kênh / Video..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} style={{ flex: '1 1 150px' }} />
                    <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)} style={{ flex: '1 1 200px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                    <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)} style={{ flex: '1 1 180px' }}><option value="">Tất cả Nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                    <div style={{ display: 'flex', gap: '5px', flex: '1 1 180px' }}>
                        <select
                            value={filterAlMonth ? parseInt(filterAlMonth.split('-')[1], 10) : ''}
                            onChange={e => {
                                const m = e.target.value;
                                if (!m) { setFilterAlMonth(''); return; }
                                const y = filterAlMonth ? filterAlMonth.split('-')[0] : new Date().getFullYear();
                                setFilterAlMonth(`${y}-${String(m).padStart(2, '0')}`);
                            }}
                            style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                        >
                            <option value="">Tất cả Tháng</option>
                            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                        </select>
                        <select
                            value={filterAlMonth ? filterAlMonth.split('-')[0] : ''}
                            onChange={e => {
                                const y = e.target.value;
                                if (!y && !filterAlMonth) return;
                                const m = filterAlMonth ? filterAlMonth.split('-')[1] : String(new Date().getMonth() + 1).padStart(2, '0');
                                setFilterAlMonth(y ? `${y}-${m}` : '');
                            }}
                            style={{ width: '90px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center' }}
                        >
                            <option value="">Năm</option>
                            {Array.from({ length: 10 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button onClick={clearAirLinkFilters} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>Xóa Lọc</button>
                    <button onClick={handleExportExcel} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#10B981', border: 'none' }}>
                        📥 Xuất Excel
                    </button>
                </div>
                {isLoadingAirLinks ? <p>Đang tải...</p> : (
                    <div style={{ width: '100%', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                            <thead style={{ backgroundColor: '#f0f0f0' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>
                                        <input type="checkbox" onChange={handleSelectAll} checked={airLinks.length > 0 && selectedRowIds.length === airLinks.length} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                    </th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>STT</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Link Air</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>ID Kênh</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>ID Video</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Brand</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Sản Phẩm</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Ngày Air</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Trạng Thái</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>CAST</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>CMS</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Nhân Sự</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Đã order?</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Hành Động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    // [MODIFIED] Client-side Pagination Logic
                                    const PAGE_SIZE = 100; // Smaller size for smooth DOM
                                    const startIndex = (airLinksCurrentPage - 1) * PAGE_SIZE;
                                    const paginatedLinks = airLinks.slice(startIndex, startIndex + PAGE_SIZE);

                                    return paginatedLinks.map((link, index) => {
                                        const globalIndex = startIndex + index; // Correct global index
                                        const isEditing = String(editingRowId) === String(link.id);
                                        return (
                                            <tr key={link.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isEditing ? '#fefce8' : 'transparent' }}>
                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                    <input type="checkbox" checked={selectedRowIds.includes(link.id)} onChange={() => handleSelectRow(link.id)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '12px' }}>{airLinks.length - globalIndex}</td>

                                                {/* LINK */}
                                                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <input type="text" value={editFormData.link_air_koc} onChange={(e) => handleEditFormChange(e, 'link_air_koc')} style={tableInputStyle} />
                                                    ) : (
                                                        <a href={link.link_air_koc} target="_blank" rel="noopener noreferrer" style={{ color: '#D42426' }}>{link.link_air_koc}</a>
                                                    )}
                                                </td>

                                                {/* ID KÊNH */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? <input type="text" value={editFormData.id_kenh} onChange={(e) => handleEditFormChange(e, 'id_kenh')} style={tableInputStyle} /> : link.id_kenh}
                                                </td>

                                                {/* ID VIDEO */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? <input type="text" value={editFormData.id_video} onChange={(e) => handleEditFormChange(e, 'id_video')} style={tableInputStyle} /> : link.id_video}
                                                </td>

                                                {/* BRAND */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <select value={editFormData.brand_id} onChange={(e) => handleEditFormChange(e, 'brand_id')} style={tableInputStyle}>
                                                            <option value="">--Brand--</option>
                                                            {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                                                        </select>
                                                    ) : link.brands?.ten_brand}
                                                </td>

                                                {/* SẢN PHẨM */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <select value={editFormData.san_pham} onChange={(e) => handleEditFormChange(e, 'san_pham')} style={tableInputStyle}>
                                                            <option value="">--SP--</option>
                                                            {PRODUCT_OPTIONS.map(prod => (<option key={prod} value={prod}>{prod}</option>))}
                                                        </select>
                                                    ) : normalizeProductName(link.san_pham)}
                                                </td>

                                                {/* NGÀY AIR */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <input type="date" value={editFormData.ngay_air ? editFormData.ngay_air.substring(0, 10) : ''} onChange={(e) => handleEditFormChange(e, 'ngay_air')} style={tableInputStyle} />
                                                    ) : (
                                                        link.ngay_air ? new Date(link.ngay_air).toLocaleDateString('vi-VN') : '-'
                                                    )}
                                                </td>

                                                {/* TRẠNG THÁI ON-AIR */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {link.ngay_air ? (
                                                        <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>🟢 Đã On-air</span>
                                                    ) : (
                                                        <span style={{ backgroundColor: '#F3F4F6', color: '#6B7280', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>⚪ Chưa On-air</span>
                                                    )}
                                                </td>



                                                {/* CAST (Đã áp dụng Highlight đỏ nếu có tiền) */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? <input type="text" value={editFormData.cast} onChange={(e) => handleEditFormChange(e, 'cast')} style={tableInputStyle} /> : renderCast(link.cast)}
                                                </td>

                                                {/* CMS */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <input type="text" value={editFormData.cms_brand} onChange={(e) => handleEditFormChange(e, 'cms_brand')} style={tableInputStyle} placeholder="10%" />
                                                    ) : (
                                                        renderCMS(link.cms_brand)
                                                    )}
                                                </td>

                                                {/* NHÂN SỰ */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {isEditing ? (
                                                        <select value={editFormData.nhansu_id} onChange={(e) => handleEditFormChange(e, 'nhansu_id')} style={tableInputStyle}>
                                                            <option value="">--Nhân sự--</option>
                                                            {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
                                                        </select>
                                                    ) : link.nhansu?.ten_nhansu}
                                                </td>

                                                {/* ĐÃ ORDER? */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    {kocOrderSet.has((link.id_kenh || '').trim()) ? '✅' : '????'}
                                                </td>

                                                {/* HÀNH ĐỘNG */}
                                                <td style={{ textAlign: 'center', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                                                        {isEditing ? (
                                                            <>
                                                                <button onClick={handleSaveClick} style={{ padding: '6px 12px', backgroundColor: '#165B33', border: 'none', color: 'white', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Lưu</button>
                                                                <button onClick={handleCancelClick} style={{ padding: '6px 12px', backgroundColor: '#777', border: 'none', color: 'white', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Hủy</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => handleEditClick(link)} style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #1976D2', color: '#1976D2', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sửa</button>
                                                                <button onClick={() => openDeleteModal('single', { id: link.id, link: link.link_air_koc, brandName: link.brands?.ten_brand })} style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #D42426', color: '#D42426', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Xóa</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}
                <div style={{ textAlign: 'center', marginTop: '25px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                    {(() => {
                        const PAGE_SIZE = 100;
                        const totalPages = Math.ceil(airLinks.length / PAGE_SIZE);
                        return (
                            <>
                                <button onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))} disabled={airLinksCurrentPage === 1} className="btn-pagination btn-pagination-text">Trước</button>
                                <span style={{ margin: '0 10px', fontWeight: 'bold' }}>Trang {airLinksCurrentPage} / {totalPages || 1}</span>
                                <button onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={airLinksCurrentPage === totalPages} className="btn-pagination btn-pagination-text">Sau</button>
                            </>
                        )
                    })()}
                </div>
            </div>

            {/* SECURE PASSWORD MODAL FOR DELETE ACTIONS */}
            {passwordModal.isOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '16px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <span style={{ fontSize: '24px' }}>🔒</span>
                            <h3 style={{ margin: 0, color: '#111827', fontSize: '20px', fontWeight: 'bold' }}>Xác Thực Quyền Xóa</h3>
                        </div>
                        <p style={{ color: '#D42426', fontSize: '14.5px', marginBottom: '8px', lineHeight: '1.5' }}>
                            Hành động này sẽ <b>xóa vĩnh viễn</b> dữ liệu khỏi hệ thống.
                        </p>
                        <p style={{ color: '#6B7280', fontSize: '13.5px', marginBottom: '20px', lineHeight: '1.5' }}>
                            Vui lòng nhập mật khẩu Admin hoặc mật khẩu xóa của Brand để xác nhận.
                        </p>
                        <input
                            type="password"
                            autoFocus
                            placeholder="Nhập mật khẩu..."
                            value={passwordModal.input}
                            onChange={e => setPasswordModal({ ...passwordModal, input: e.target.value })}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleConfirmSecureDelete();
                                if (e.key === 'Escape') setPasswordModal({ isOpen: false, type: null, data: null, input: '' });
                            }}
                            style={{
                                width: '100%', padding: '12px 16px', boxSizing: 'border-box', border: '1px solid #d1d5db',
                                borderRadius: '8px', marginBottom: '25px', fontSize: '16px', outline: 'none',
                                transition: 'border-color 0.2s', fontFamily: 'monospace'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                        />
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPasswordModal({ isOpen: false, type: null, data: null, input: '' })}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: '500', transition: 'background 0.2s' }}
                                onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                                onMouseLeave={(e) => e.target.style.background = '#fff'}
                            >
                                Hủy Bỏ
                            </button>
                            <button
                                onClick={handleConfirmSecureDelete}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#D42426', color: 'white', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                                onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
                                onMouseLeave={(e) => e.target.style.background = '#D42426'}
                            >
                                Xác Nhận Xóa
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AirLinksTab;