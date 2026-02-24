// src/components/DashboardTab.jsx

import React, { useMemo, useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, LabelList, Legend, Label } from 'recharts';
import { normalizeProductName } from '../utils/productMapping';

// LIGHT THEME PALETTE (Orange)
const COLORS = ['#ea580c', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];
const ITEMS_PER_PAGE = 10;

// --- HELPER COMPONENT: SEARCHABLE DROPDOWN (MULTI-SELECT SUPPORT) ---
const SearchableDropdown = ({ options, value, onChange, placeholder, style, isMulti = false, showSearch = true }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = React.useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (selectedValue) => {
        if (isMulti) {
            const newValue = value.includes(selectedValue)
                ? value.filter(v => v !== selectedValue)
                : [...value, selectedValue];
            onChange(newValue);
        } else {
            onChange(selectedValue);
            setIsOpen(false);
            setSearchTerm('');
        }
    };

    const getDisplayValue = () => {
        if (isMulti) {
            if (!value || value.length === 0) return placeholder;
            if (value.length === 1) return value[0];
            return `${value.length} sản phẩm đã chọn`;
        }
        return value ? options.find(o => o.value === value)?.label || value : placeholder;
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', ...style, padding: 0, border: 'none', background: 'transparent' }}>
            {/* TRIGGER AREA */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #ddd',
                    backgroundColor: '#fff',
                    color: (isMulti ? value.length > 0 : value) ? '#333' : '#999',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '40px'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', fontWeight: (isMulti ? value.length > 0 : value) ? '600' : '400' }}>
                    {getDisplayValue()}
                </span>
                <span style={{ fontSize: '10px', color: '#ea580c' }}>▼</span>
            </div>

            {/* DROPDOWN MENU */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    width: '100%',
                    minWidth: '250px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #eee',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s'
                }}>
                    {showSearch && (
                        <div style={{ position: 'sticky', top: 0, padding: '10px', backgroundColor: '#f9fafb', borderBottom: '1px solid #eee' }}>
                            <input
                                type="text"
                                placeholder="🔍 Tìm..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #ddd',
                                    backgroundColor: '#fff',
                                    color: '#333',
                                    fontSize: '13px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}
                    <div>
                        {!isMulti && (
                            <div
                                onClick={() => handleSelect('')}
                                style={{
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    color: '#999',
                                    borderBottom: '1px dashed #eee',
                                    fontStyle: 'italic'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                -- {placeholder} --
                            </div>
                        )}
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                            const isSelected = isMulti ? value.includes(opt.value) : value === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    onClick={() => handleSelect(opt.value)}
                                    style={{
                                        padding: '10px 6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        color: isSelected ? '#ea580c' : '#333',
                                        backgroundColor: isSelected ? 'rgba(234, 88, 12, 0.05)' : 'transparent',
                                        fontWeight: isSelected ? '600' : '400',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(234, 88, 12, 0.05)'}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                    {isMulti && (
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => { }}
                                            style={{ cursor: 'pointer', accentColor: '#ea580c' }}
                                        />
                                    )}
                                    {opt.label}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                                Không tìm thấy
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const DashboardTab = () => {
    const { brands, nhanSus, airReportMonth, setAirReportMonth, airReportYear, setAirReportYear } = useAppData();

    // STATE
    const [rawBookings, setRawBookings] = useState([]);
    const [rawAirLinks, setRawAirLinks] = useState([]);
    const [dashboardSanPhams, setDashboardSanPhams] = useState([]); // [FIX] Fetch riêng cho Dashboard
    const [loading, setLoading] = useState(false);

    // PAGINATION STATE
    const [bookingPage, setBookingPage] = useState(1);
    const [airPage, setAirPage] = useState(1);

    // FILTER
    const [filterBrand, setFilterBrand] = useState('');
    const [filterSanPham, setFilterSanPham] = useState('');
    const [filterNhanSu, setFilterNhanSu] = useState('');

    // RESET PAGINATION WHEN FILTER CHANGES
    useEffect(() => {
        setBookingPage(1);
        setAirPage(1);
    }, [airReportMonth, airReportYear, filterBrand, filterSanPham, filterNhanSu]);

    // LOAD DATA
    useEffect(() => {
        const fetchBookings = async () => {
            setLoading(true);

            // Calculate Date Range for Server-Side Filtering
            // This prevents fetching 11k+ rows and hitting the 1000 limit (which hides recent data).
            const startDate = `${airReportYear}-${String(airReportMonth).padStart(2, '0')}-01T00:00:00.000Z`;
            // Calculate end date (last day of month)
            const nextMonth = airReportMonth === 12 ? 1 : airReportMonth + 1;
            const nextYear = airReportMonth === 12 ? airReportYear + 1 : airReportYear;
            const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;

            // [REFACTOR] Fetch from 'chitiettonguis' with Server-Side Filtering
            const { data: detailData, error } = await supabase
                .from('chitiettonguis')
                .select(`
                    id,
                    donguis!inner ( ngay_gui, koc_ho_ten, nhansu_id, koc_id_kenh ),
                    sanphams ( ten_sanpham, brand_id )
                `)
                .gte('donguis.ngay_gui', startDate)
                .lt('donguis.ngay_gui', endDate)
                .limit(5000); // Safety limit, but monthly data should fit

            if (detailData) {
                const mappedBookings = detailData.map(item => ({
                    id: item.id,
                    ngay_gui_don: item.donguis?.ngay_gui,
                    created_at: item.donguis?.ngay_gui, // Fallback to ngay_gui
                    ho_ten: item.donguis?.koc_ho_ten,
                    id_kenh: item.donguis?.koc_id_kenh,
                    nhansu_id: item.donguis?.nhansu_id,
                    brand_id: item.sanphams?.brand_id,
                    san_pham: item.sanphams?.ten_sanpham
                }));
                setRawBookings(mappedBookings);
            } else if (error) {
                console.error("Error fetching dashboard data:", error);
            }

            setLoading(false);
        };
        fetchBookings();
    }, [airReportMonth, airReportYear]);

    // [OPTIMIZATION] FETCH ALL AIR LINKS ONCE (Prevent Refetch on Month Change)
    useEffect(() => {
        const fetchAllAirLinks = async () => {
            let allAirLinks = [];
            let from = 0;
            const size = 1000; // Increased chunk size
            let more = true;

            while (more) {
                const { data, error } = await supabase
                    .from('air_links')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(from, from + size - 1);

                if (error || !data || data.length === 0) {
                    more = false;
                } else {
                    allAirLinks = [...allAirLinks, ...data];
                    from += size;
                    if (data.length < size) more = false;
                }
                if (allAirLinks.length > 50000) more = false;
            }
            console.log("Loaded All AirLinks:", allAirLinks.length);
            setRawAirLinks(allAirLinks);

            // Load products for filtering
            const { data: spData } = await supabase.from('sanphams').select('id, ten_sanpham, brand_id');
            if (spData) setDashboardSanPhams(spData);
        };

        fetchAllAirLinks();
    }, []); // Empty dependency = Run once on mount

    // --- HELPER FORMAT ---
    const getBrandName = (id) => brands.find(b => String(b.id) === String(id))?.ten_brand || 'Khác';
    const getNhanSuName = (id) => nhanSus.find(n => String(n.id) === String(id))?.ten_nhansu || 'Khác';
    const formatMoney = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    const formatNumber = (val) => new Intl.NumberFormat('vi-VN').format(val);

    // Format tiền rút gọn (10.2tr)
    const formatMoneyShort = (val) => {
        if (!val) return '0';
        if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace('.', ',') + ' tỷ';
        if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'tr';
        return new Intl.NumberFormat('vi-VN').format(val);
    };

    // --- HÀM LỌC ---
    // --- HÀM LỌC ---
    const filterData = (data, dateField) => {
        return data.filter(item => {
            let dateStr = item[dateField];
            // Fallback to created_at if dateField is null/empty
            if (!dateStr) dateStr = item.created_at;
            if (!dateStr) return false;

            let d = new Date(dateStr);
            // Support DD/MM/YYYY format if ISO parse fails or gives wrong result for non-US
            // Example: 01/05/2026 -> May 1st? or Jan 5th? In VN usually DD/MM.
            // If dateStr has '/', parse manually
            if (typeof dateStr === 'string' && dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    // Assume DD/MM/YYYY
                    d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }

            if (isNaN(d.getTime())) return false;

            // Check Month & Year
            // Note: airReportMonth is 1-12, getMonth() is 0-11
            // [FIX] Ensure type safety (String vs Number)
            if (d.getMonth() + 1 !== Number(airReportMonth) || d.getFullYear() !== Number(airReportYear)) return false;

            if (filterBrand && String(item.brand_id) !== String(filterBrand)) return false;
            if (filterSanPham && item.san_pham !== filterSanPham) return false;
            if (filterNhanSu && String(item.nhansu_id) !== String(filterNhanSu)) return false;
            return true;
        });
    };

    const filteredBookings = useMemo(() => {
        let data = filterData(rawBookings, 'ngay_gui_don');

        // [FIX] Deduplicate logic: Group by [Date + KOC + Brand] to count as 1 Booking
        // BUT if filtering by Product, we want to see exact counts (Orders), so SKIP deduplication.
        // BUT if filtering by Product, we want to see exact counts (Orders), so SKIP deduplication.
        if (filterSanPham) {
            return data;
        }

        const uniqueMap = new Map();
        data.forEach(item => {
            const key = `${item.ngay_gui_don}_${item.ho_ten}_${item.brand_id}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        });
        return Array.from(uniqueMap.values());
    }, [rawBookings, airReportMonth, airReportYear, filterBrand, filterSanPham, filterNhanSu]);

    const filteredAirLinks = useMemo(() => filterData(rawAirLinks, 'ngay_air'), [rawAirLinks, airReportMonth, airReportYear, filterBrand, filterSanPham, filterNhanSu]);

    // PAGINATION LOGIC
    const getPaginatedData = (data, page) => {
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        return data.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    };

    const totalBookingPages = Math.ceil(filteredBookings.length / ITEMS_PER_PAGE);
    const totalAirPages = Math.ceil(filteredAirLinks.length / ITEMS_PER_PAGE);

    // --- CHART DATA ---
    // --- CHART DATA ---

    // Inside DashboardTab:
    const chart1Data = useMemo(() => {
        const map = {};
        // Chart 1 is Top Products (Air Links)
        // [FIX] Apply normalization here
        // (Force HMR update)
        filteredAirLinks.forEach(i => {
            const rawName = i.san_pham || 'SP Khác';
            const k = normalizeProductName(rawName);
            map[k] = (map[k] || 0) + 1;
        });
        return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a, b) => b.value - a.value);
    }, [filteredAirLinks]);

    const chart2Data = useMemo(() => {
        const map = {};
        filteredBookings.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + 1; });
        return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a, b) => b.value - a.value);
    }, [filteredBookings, brands]);

    const chart3Data = useMemo(() => {
        const map = {};
        filteredAirLinks.forEach(i => { const k = getNhanSuName(i.nhansu_id); map[k] = (map[k] || 0) + 1; });
        return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a, b) => b.value - a.value);
    }, [filteredAirLinks, nhanSus]);

    const chart5Data = useMemo(() => {
        const map = {};
        filteredAirLinks.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + parseFloat(i.cast || 0); });
        return Object.keys(map).map(k => ({ name: k, value: map[k] })).filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    }, [filteredAirLinks, brands]);

    const chart6Data = useMemo(() => {
        let tCast = 0;
        let tVid = filteredAirLinks.length;
        filteredAirLinks.forEach(i => tCast += parseFloat(i.cast || 0));
        const avg = tVid > 0 ? tCast / tVid : 0;
        return [{ name: 'DỰ KIẾN', value: 200000, fill: '#FFDDC1' }, { name: 'THỰC TẾ', value: avg, fill: '#FF6B6B' }];
    }, [filteredAirLinks]);


    // --- CHART BOX - MIRINDA STYLE ---
    const ChartBox = ({ data, title, unit, isMoney = false, showLegend = true }) => {
        // [ĐÃ SỬA] KHÔNG GỘP NHÓM "KHÁK" THEO YÊU CẦU
        return (
            <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ textAlign: 'center', marginBottom: '10px' }}><span className="section-title">{title}</span></h4>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data} // Dùng data gốc
                                cx="50%"
                                cy="50%"
                                innerRadius={85}
                                outerRadius={115}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                                cornerRadius={8}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                                {/* HIỆN TỔNG SỐ Ở GIỮA - DÙNG LABEL CHUẨN KHI PIE Ở GIỮA (50%) */}
                                <Label
                                    value={data.reduce((acc, cur) => acc + cur.value, 0)}
                                    position="center"
                                    fill="#ea580c"
                                    style={{ fontSize: '26px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", textAnchor: 'middle' }}
                                />
                            </Pie>

                            <Tooltip
                                formatter={(val) => isMoney ? formatMoney(val) : val + ' ' + unit}
                                contentStyle={{ borderRadius: '12px', border: '1px solid #eee', backgroundColor: '#FFFFFF', color: '#1f2937', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                                wrapperStyle={{ zIndex: 1000 }} // Ensure it floats on top
                            />
                            {showLegend && <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', width: '100%', marginBottom: '10px', color: '#666' }} />}
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div >
        );
    };


    // --- STYLE --- LIGHT THEME
    const filterContainerStyle = {
        marginBottom: '30px', padding: '20px 24px',
        background: '#fff',
        borderRadius: '16px',
        display: 'flex', alignItems: 'center', gap: '20px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        border: '1px solid #eee',
        flexWrap: 'wrap'
    };
    const inputStyle = {
        padding: '10px 14px', borderRadius: '10px',
        border: '1px solid #ddd',
        backgroundColor: '#f9fafb',
        color: '#333', fontSize: '14px', outline: 'none', cursor: 'pointer'
    };
    const labelStyle = { fontWeight: '600', color: '#666', fontSize: '0.85rem', whiteSpace: 'nowrap', letterSpacing: '0.5px' };

    // Pagination Controls Component
    const PaginationControls = ({ page, totalPages, setPage }) => (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '10px' }}>
            <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="btn-pagination btn-pagination-text"
            >
                Prev
            </button>
            <span style={{ fontWeight: '500', color: '#666', fontSize: '0.95rem', padding: '0 10px' }}>trang {page} / {totalPages || 1}</span>
            <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages || totalPages === 0}
                className="btn-pagination btn-pagination-text"
            >
                Next
            </button>
        </div>
    );

    return (
        <div style={{ padding: '0 20px 40px 20px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>

            {/* FILTER BAR */}
            <div style={filterContainerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={labelStyle}>📅 Thời gian:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ ...inputStyle, width: '130px' }}>
                            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                        </select>
                        <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ ...inputStyle, width: '100px', textAlign: 'center' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, borderLeft: '2px solid #eee', paddingLeft: '15px' }}>
                    <span style={labelStyle}>🛍️ Brand:</span>
                    <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setFilterSanPham(''); }} style={{ ...inputStyle, flex: 1 }}>
                        <option value="">Tất cả Brand</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, borderLeft: '1px solid rgba(0, 212, 255, 0.2)', paddingLeft: '15px', position: 'relative', zIndex: 10 }}>
                    <span style={labelStyle}>📦 Sản phẩm:</span>
                    <SearchableDropdown
                        showSearch={false}
                        options={dashboardSanPhams
                            .filter(sp => !filterBrand || String(sp.brand_id) === String(filterBrand))
                            .map(sp => ({ value: sp.ten_sanpham, label: sp.ten_sanpham }))}
                        value={filterSanPham}
                        onChange={setFilterSanPham}
                        placeholder="Tất cả Sản phẩm"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, borderLeft: '2px solid #eee', paddingLeft: '15px' }}>
                    <span style={labelStyle}>👤 Nhân sự:</span>
                    <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                        <option value="">Tất cả Nhân sự</option>
                        {nhanSus.map(n => <option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}
                    </select>
                </div>

                {loading && <span style={{ color: '#ea580c', fontWeight: 'bold', fontSize: '13px', marginLeft: 'auto' }}>⏳ Đang tải...</span>}
            </div>

            {/* HEADER */}
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 20px 0', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>
                TỔNG QUAN HIỆU SUẤT (Tháng {airReportMonth}/{airReportYear})
            </h3>

            {/* HÀNG 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', marginBottom: '25px' }}>
                <ChartBox data={chart1Data} title="🔥 Top Sản Phẩm (Air Links)" unit="Air" showLegend={false} />
                <ChartBox data={chart2Data} title="🏷️ Tỷ trọng Brand (Booking)" unit="Job" />
                <ChartBox data={chart3Data} title="🏆 Top Nhân Sự (Air Links)" unit="Link" />
            </div>

            {/* HÀNG 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px' }}>
                <div className="mirinda-card" style={{ height: '450px', display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '15px' }}><span className="section-title">💸 Ngân Sách Đã Chi</span></h4>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: '900', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            {formatMoney(chart5Data.reduce((acc, cur) => acc + cur.value, 0))}
                        </div>
                        <div style={{ marginTop: '20px', width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chart5Data} margin={{ top: 20, right: 10, left: 10, bottom: 60 }}>
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        interval={0}
                                        tick={{ fontSize: 11, fontWeight: '600', fill: '#666', textAnchor: 'end' }}
                                        angle={-25}
                                        dy={10}
                                    />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #eee', backgroundColor: '#FFFFFF', color: '#1f2937', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontWeight: 'bold' }} cursor={{ fill: '#f9fafb' }} />
                                    <Bar dataKey="value" fill="#fb923c" radius={[6, 6, 0, 0]}>
                                        <LabelList
                                            dataKey="value"
                                            position="top"
                                            formatter={(val) => {
                                                if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B';
                                                if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                                                if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
                                                return val;
                                            }}
                                            style={{ fontWeight: '800', fontSize: '11px', fill: '#ea580c' }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="mirinda-card" style={{ height: '450px', display: 'flex', flexDirection: 'column', gridColumn: 'span 2' }}>
                    <h4 style={{ textAlign: 'center', marginBottom: '15px' }}><span className="section-title">💰 Chi Phí Trung Bình / 1 Video</span></h4>
                    <div style={{ flex: 1 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chart6Data} barCategoryGap="20%" margin={{ top: 30, right: 10, left: 10, bottom: 20 }}>
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '600', dy: 10, fill: '#666' }} />
                                <Tooltip formatter={(value) => formatMoney(value)} cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: '1px solid #eee', backgroundColor: '#FFFFFF', color: '#1f2937', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                    {chart6Data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.value > 2000000 ? '#ef4444' : '#10b981'} stroke="#fff" strokeWidth={1} />)}
                                    <LabelList dataKey="value" position="top" formatter={(val) => formatMoney(val)} style={{ fontWeight: '800', fontSize: '12px', fill: '#ea580c' }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* BOOKING TABLE */}
            <div className="mirinda-card" style={{ marginTop: '40px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                    <span className="section-title">📄 Danh Sách Booking Chi Tiết</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', marginLeft: '15px', color: '#ea580c' }}>({filteredBookings.length} đơn)</span>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #eee' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#fff7ed', color: '#ea580c', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                            <tr>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Ngày gửi</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>KOC</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Brand</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Nhân sự</th>
                                <th style={{ padding: '12px 15px', textAlign: 'center' }}>Trạng thái</th>
                                <th style={{ padding: '12px 15px', textAlign: 'center' }}>Chi phí</th>

                            </tr>
                        </thead>
                        <tbody>
                            {filteredBookings.length === 0 ? (
                                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>Không có booking nào trong tháng này.</td></tr>
                            ) : (
                                getPaginatedData(filteredBookings, bookingPage).map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '12px 15px' }}>{item.ngay_gui_don ? new Date(item.ngay_gui_don).toLocaleDateString('vi-VN') : '-'}</td>
                                        <td style={{ padding: '12px 15px', fontWeight: 'bold' }}>{item.id_kenh}</td>
                                        <td style={{ padding: '12px 15px' }}>
                                            <span className="badge" style={{ backgroundColor: '#e3f2fd', color: '#1565c0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{getBrandName(item.brand_id)}</span>
                                        </td>
                                        <td style={{ padding: '12px 15px' }}>{getNhanSuName(item.nhansu_id)}</td>
                                        <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                                            <span className="badge" style={{
                                                backgroundColor: item.trang_thai === 'Đã đóng đơn' || item.status === 'done' ? '#00CC00' : '#FFCC00',
                                                color: '#000',
                                                padding: '6px 12px',
                                            }}>
                                                {item.status === 'done' ? 'Đã xong' : (item.trang_thai || 'Pending')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 15px', textAlign: 'center', fontWeight: 'bold' }}>{formatMoneyShort(item.chi_phi_du_kien)}</td>

                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <PaginationControls page={bookingPage} totalPages={totalBookingPages} setPage={setBookingPage} />
            </div>

            {/* AIR LINK TABLE */}
            <div className="mirinda-card" style={{ marginTop: '40px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                    <span className="section-title">📽️ Danh Sách Link Air Chi Tiết</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', marginLeft: '15px' }}>({filteredAirLinks.length} link)</span>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #eee' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#fff7ed', color: '#ea580c', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                            <tr>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Ngày Air</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>KOC</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Brand / Sản phẩm</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Nhân sự</th>
                                <th style={{ padding: '12px 15px', textAlign: 'left' }}>Link Air</th>
                                <th style={{ padding: '12px 15px', textAlign: 'center' }}>Cast (VNĐ)</th>
                                <th style={{ padding: '12px 15px', textAlign: 'center' }}>Nền tảng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAirLinks.length > 0 ? (
                                getPaginatedData(filteredAirLinks, airPage).map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '12px 15px' }}>{item.ngay_air ? new Date(item.ngay_air).toLocaleDateString('vi-VN') : '-'}</td>
                                        <td style={{ padding: '12px 15px', fontWeight: 'bold' }}>{item.id_kenh}</td>
                                        <td style={{ padding: '12px 15px' }}>
                                            <div style={{ fontWeight: 'bold' }}>{getBrandName(item.brand_id)}</div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>{item.san_pham}</div>
                                        </td>
                                        <td style={{ padding: '12px 15px' }}>{getNhanSuName(item.nhansu_id)}</td>
                                        <td style={{ padding: '12px 15px' }}>
                                            <a href={item.link_air_koc} target="_blank" rel="noopener noreferrer" style={{ color: '#D42426', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}>
                                                👀 Video
                                            </a>
                                        </td>
                                        <td style={{ padding: '12px 15px', textAlign: 'center' }}>{formatMoneyShort(item.cast)}</td>
                                        <td style={{ padding: '12px 15px', textAlign: 'center' }}>{item.cms_brand}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>Không có dữ liệu link air nào trong tháng này.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <PaginationControls page={airPage} totalPages={totalAirPages} setPage={setAirPage} />
            </div>
        </div>
    );
};

export default DashboardTab;