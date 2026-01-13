import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { read, utils } from 'xlsx';
import SearchableDropdown from './SearchableDropdown';

const COLORS = ['#FF6600', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1'];
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
        // Excel base date: Dec 30 1899
        // 25569 is offset to Jan 1 1970
        const date = new Date(Math.round((input - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    // Nếu là string
    const str = String(input).trim();
    // Regex check YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // Try standard parse
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
                fontWeight: '700',
                fill: '#374151',
                fontFamily: 'Inter, sans-serif',
                pointerEvents: 'none',
                textAnchor: 'middle'
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
            fill="#555"
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
        sortedAirReportRows, totalsRowAirReport
    } = useAppData();

    const [newLink, setNewLink] = useState({
        link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '',
        ngay_air: '',
        ngay_booking: new Date().toISOString().split('T')[0],
        cast: '', cms_brand: '', view_count: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImportUnlocked, setIsImportUnlocked] = useState(false);

    // --- STATE CHO INLINE EDITING (SỬA TRỰC TIẾP) ---
    const [editingRowId, setEditingRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // --- STATE CHO BULK DELETE ---
    const [selectedRowIds, setSelectedRowIds] = useState([]);

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
                    const extraProducts = ['Bodymist', 'Bodymist nhũ'];
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
        filtered.forEach(item => { const key = item.san_pham || 'Khác'; counts[key] = (counts[key] || 0) + 1; });
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
        filtered.forEach(item => { const key = item.san_pham || 'Khác'; counts[key] = (counts[key] || 0) + 1; });
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
    }, [airLinks, chart3StaffId, nhanSus]);

    const dataChart4 = useMemo(() => {
        let filtered = chart4Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart4Brand);
        const costMap = {};
        filtered.forEach(item => { const key = item.san_pham || 'Khác'; const cost = parseMoney(item.cast); costMap[key] = (costMap[key] || 0) + cost; });
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
        setIsSubmitting(true);
        try {
            // Logic CMS: Mặc định 10%
            let finalCMS = newLink.cms_brand;
            if (!finalCMS || finalCMS.trim() === '') finalCMS = '10%';

            // Logic Cast: Parse về số, nếu rỗng thì là 0
            const finalCast = parseMoney(newLink.cast);

            const dataToInsert = {
                ...newLink,
                cms_brand: finalCMS,
                cast: finalCast, // Đảm bảo lưu số 0 nếu không điền
                ngay_air: newLink.ngay_air ? newLink.ngay_air : null
            };

            const { error } = await supabase.from('air_links').insert([dataToInsert]);
            if (error) throw error;
            alert("Đã thêm link thành công! 🎉");
            setNewLink({ link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '', ngay_air: '', ngay_booking: new Date().toISOString().split('T')[0], cast: '', cms_brand: '', view_count: 0 });
            loadAirLinks(); handleGenerateAirLinksReport();
        } catch (error) { alert("Lỗi khi lưu: " + error.message); } finally { setIsSubmitting(false); }
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

    const handleBulkDelete = async () => {
        if (selectedRowIds.length === 0) return;
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
                        san_pham: sp,
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
                    // UPSERT: Nếu trùng link_air_koc thì CẬP NHẬT thông tin mới
                    const { error } = await supabase.from('air_links').upsert(uniqueValidRows, { onConflict: 'link_air_koc' });
                    if (error) throw error;
                    successCount = uniqueValidRows.length;
                    const duplicatesInFile = validRows.length - uniqueValidRows.length;
                    alert(`Xử lý thành công: ${successCount} dòng.\n(Đã tự động lọc bỏ ${duplicatesInFile} dòng trùng trong file).\nThất bại/Bỏ qua: ${failCount} dòng.`);
                    loadAirLinks(); handleGenerateAirLinksReport();
                } else {
                    alert("Không tìm thấy dòng dữ liệu hợp lệ nào (Kiểm tra chính xác Tên Brand/Nhân sự trong file).");
                }

            } catch (error) {
                console.error(error);
                alert("Lỗi xử lý file: " + error.message);
            } finally {
                e.target.value = ''; // Reset input
            }
        };
        reader.readAsBinaryString(file);
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
    const handleEditClick = (link) => {
        setEditingRowId(link.id);
        setEditFormData({
            id: link.id,
            link_air_koc: link.link_air_koc,
            id_kenh: link.id_kenh,
            id_video: link.id_video,
            brand_id: link.brand_id,
            san_pham: link.san_pham,
            nhansu_id: link.nhansu_id,
            cast: formatCurrency(link.cast),
            cms_brand: link.cms_brand
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
                    nhansu_id: editFormData.nhansu_id
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

                    {!isImportUnlocked ? (
                        <div style={{ padding: '20px', backgroundColor: '#fff7ed', borderRadius: '12px' }}>
                            <p style={{ color: '#ea580c', marginBottom: '10px' }}>🔒 Khu vực này đã bị khóa.</p>
                            <button
                                onClick={() => {
                                    const password = prompt('🔑 Nhập mật khẩu để mở khóa:');
                                    if (password === 'Khanh8255') {
                                        setIsImportUnlocked(true);
                                    } else if (password) {
                                        alert('❌ Mật khẩu sai!');
                                    }
                                }}
                                className="btn-secondary"
                                style={{ fontWeight: 'bold' }}
                            >
                                🔓 MỞ KHÓA IMPORT
                            </button>
                        </div>
                    ) : (
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
                    )}
                </div>
            </div>

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
                                            <Pie data={dataChart1} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="#000" strokeWidth={2}>
                                                {dataChart1.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart1} position="center" fill="#000" style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'Inter', textAnchor: 'middle' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: '3px solid #000', boxShadow: '4px 4px 0 #000' }} />
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
                                            <Pie data={dataChart2} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="#000" strokeWidth={2}>
                                                {dataChart2.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart2} position="center" fill="#000" style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'Inter', textAnchor: 'middle' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: '3px solid #000', boxShadow: '4px 4px 0 #000' }} />
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
                                            <Pie data={dataChart3} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="#000" strokeWidth={2}>
                                                {dataChart3.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={totalChart3} position="center" fill="#000" style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'Inter', textAnchor: 'middle' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} link`} contentStyle={{ borderRadius: '12px', border: '3px solid #000', boxShadow: '4px 4px 0 #000' }} />
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
                                            <Pie data={dataChart4} cx="50%" cy="50%" outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value" stroke="#000" strokeWidth={2}>
                                                {dataChart4.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                <Label value={formatCompactNumber(totalChart4)} position="center" fill="#000" style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'Inter', textAnchor: 'middle' }} />
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value) + ' đ'} contentStyle={{ borderRadius: '12px', border: '3px solid #000', boxShadow: '4px 4px 0 #000' }} />
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
                    <input type="text" placeholder="Lọc ID Kênh..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} style={{ flex: '1 1 150px' }} />
                    <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)} style={{ flex: '1 1 200px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                    <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)} style={{ flex: '1 1 180px' }}><option value="">Tất cả Nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                    <button onClick={clearAirLinkFilters} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>Xóa Lọc</button>
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
                                    <th style={{ padding: '12px', textAlign: 'center' }}>CAST</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>CMS</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Nhân Sự</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Hành Động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {airLinks.map((link, index) => {
                                    const isEditing = editingRowId === link.id;

                                    return (
                                        <tr key={link.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isEditing ? '#fefce8' : 'transparent' }}>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <input type="checkbox" checked={selectedRowIds.includes(link.id)} onChange={() => handleSelectRow(link.id)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                            </td>
                                            <td style={{ textAlign: 'center', padding: '12px' }}>{airLinksTotalCount - ((airLinksCurrentPage - 1) * 500 + index)}</td>

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
                                                ) : link.san_pham}
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
                                                            <button onClick={() => handleDeleteAirLink(link.id, link.link_air_koc)} style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #D42426', color: '#D42426', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Xóa</button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div style={{ textAlign: 'center', marginTop: '25px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                    <button onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))} disabled={airLinksCurrentPage === 1} className="btn-pagination btn-pagination-text">Trước</button>
                    <span style={{ margin: '0 10px', fontWeight: 'bold' }}>Trang {airLinksCurrentPage} / {totalPagesAirLinks}</span>
                    <button onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPagesAirLinks, prev + 1))} disabled={airLinksCurrentPage === totalPagesAirLinks} className="btn-pagination btn-pagination-text">Sau</button>
                </div>
            </div>
        </>
    );
};

export default AirLinksTab;