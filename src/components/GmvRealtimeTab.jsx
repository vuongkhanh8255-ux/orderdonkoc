// src/components/GmvRealtimeTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const BLUECORE_PATH = '/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&sectionName=GMV_API&size=4247&replaceUnicode=false';
const DEV_URL = '/bluecore-api' + BLUECORE_PATH;
const PROD_URL = 'https://corsproxy.io/?' + encodeURIComponent('https://admin-apis.bluecore.vn' + BLUECORE_PATH);

const COLORS = ['#ea580c', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#6366f1', '#84cc16'];

const formatCurrency = (value) => {
    if (!value && value !== 0) return '0';
    const num = Number(value);
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + ' tỷ';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + ' tr';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
    return num.toLocaleString('vi-VN');
};

const formatNumber = (value) => {
    if (!value && value !== 0) return '0';
    return Number(value).toLocaleString('vi-VN');
};

const getGrowthPercent = (current, previous) => {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
};

const GrowthBadge = ({ current, previous }) => {
    const pct = getGrowthPercent(current, previous);
    const isUp = pct >= 0;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            padding: '3px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700',
            background: isUp ? '#ecfdf5' : '#fef2f2',
            color: isUp ? '#059669' : '#dc2626'
        }}>
            {isUp ? '▲' : '▼'} {Math.abs(pct)}%
        </span>
    );
};

// Custom label cho Pie chart
const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null;
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
            {(percent * 100).toFixed(0)}%
        </text>
    );
};

const GmvRealtimeTab = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [platformFilter, setPlatformFilter] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [yearFilter, setYearFilter] = useState(null);
    const [monthFilter, setMonthFilter] = useState(null);
    const [dayFilter, setDayFilter] = useState(null);
    const [viewMode, setViewMode] = useState('day'); // 'day' or 'week'

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const url = isDev ? DEV_URL : PROD_URL;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            if (json.success && json.result) {
                setData(json.result.map(item => item._source));
                setLastUpdated(new Date());
            } else {
                throw new Error('API trả về lỗi');
            }
        } catch (err) {
            setError(err.message);
            console.error('Bluecore API error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Extract unique dates as Date objects
    const allDates = useMemo(() => {
        const dateSet = new Set();
        data.forEach(d => { if (d.period_day) dateSet.add(d.period_day); });
        return Array.from(dateSet).sort((a, b) => b - a).map(ts => ({ ts, date: new Date(ts) }));
    }, [data]);

    // Year list
    const yearList = useMemo(() => {
        const years = new Set();
        allDates.forEach(d => years.add(d.date.getFullYear()));
        return Array.from(years).sort((a, b) => b - a);
    }, [allDates]);

    // Month list (filtered by selected year)
    const monthList = useMemo(() => {
        if (!yearFilter) return [];
        const months = new Set();
        allDates.filter(d => d.date.getFullYear() === yearFilter)
            .forEach(d => months.add(d.date.getMonth() + 1));
        return Array.from(months).sort((a, b) => b - a);
    }, [allDates, yearFilter]);

    // Day list (filtered by selected year + month)
    const dayList = useMemo(() => {
        if (!yearFilter || !monthFilter) return [];
        const days = new Set();
        allDates.filter(d => d.date.getFullYear() === yearFilter && d.date.getMonth() + 1 === monthFilter)
            .forEach(d => days.add(d.date.getDate()));
        return Array.from(days).sort((a, b) => b - a);
    }, [allDates, yearFilter, monthFilter]);

    // Auto-select latest date on data load
    useEffect(() => {
        if (allDates.length > 0 && !yearFilter) {
            const latest = allDates[0].date;
            setYearFilter(latest.getFullYear());
            setMonthFilter(latest.getMonth() + 1);
            setDayFilter(latest.getDate());
        }
    }, [allDates]);

    // Reset month/day when year changes
    useEffect(() => {
        if (monthList.length > 0 && !monthList.includes(monthFilter)) {
            setMonthFilter(monthList[0]);
        }
    }, [monthList]);

    useEffect(() => {
        if (dayList.length > 0 && !dayList.includes(dayFilter)) {
            setDayFilter(dayList[0]);
        }
    }, [dayList]);

    // Get selected timestamp(s)
    const selectedTimestamp = useMemo(() => {
        if (!yearFilter || !monthFilter || !dayFilter) return null;
        const match = allDates.find(d =>
            d.date.getFullYear() === yearFilter &&
            d.date.getMonth() + 1 === monthFilter &&
            d.date.getDate() === dayFilter
        );
        return match ? match.ts : null;
    }, [allDates, yearFilter, monthFilter, dayFilter]);

    // Get timestamps for N days from selected date
    const weekTimestamps = useMemo(() => {
        if (!selectedTimestamp) return [];
        const selectedIdx = allDates.findIndex(d => d.ts === selectedTimestamp);
        if (selectedIdx === -1) return [selectedTimestamp];
        const count = viewMode === 'month' ? 30 : 7;
        return allDates.slice(selectedIdx, selectedIdx + count).map(d => d.ts);
    }, [allDates, selectedTimestamp, viewMode]);

    // Normalize brand name from org_name
    const getBrand = (orgName) => {
        if (!orgName) return 'Khác';
        const lower = orgName.toLowerCase();
        if (lower.includes('eherb')) return 'eHerb';
        if (lower.includes('moaw')) return 'Moaw Moaws';
        if (lower.includes('body miss') || lower.includes('bodymiss')) return 'Body Miss';
        if (lower.includes('milaganics')) return 'Milaganics';
        if (lower.includes('healmi')) return 'Healmii';
        return orgName.split(' - ')[1] || orgName;
    };

    // Danh sách brands unique
    const brandList = useMemo(() => {
        const brands = new Set();
        data.forEach(d => brands.add(getBrand(d.org_name)));
        return ['All', ...Array.from(brands).sort()];
    }, [data]);

    // Filtered data
    const filteredData = useMemo(() => {
        return data.filter(d => {
            const matchDate = viewMode !== 'day'
                ? weekTimestamps.includes(d.period_day)
                : (!selectedTimestamp || d.period_day === selectedTimestamp);
            const matchPlatform = platformFilter === 'All'
                || (platformFilter === 'TikTok' && d.order_sources === 'Tiktokshop')
                || (platformFilter === 'Shopee' && d.order_sources === 'Shopee');
            const matchBrand = brandFilter === 'All' || getBrand(d.org_name) === brandFilter;
            return matchDate && matchPlatform && matchBrand;
        });
    }, [data, selectedTimestamp, weekTimestamps, viewMode, platformFilter, brandFilter]);

    // Summary stats
    const stats = useMemo(() => {
        const totalGMV = filteredData.reduce((s, d) => s + (d.GMV || 0), 0);
        const totalOrders = filteredData.reduce((s, d) => s + (d.total_orders || 0), 0);
        const totalGMV_lastMonth = filteredData.reduce((s, d) => s + (d.GMV_same_day_last_month || 0), 0);
        const totalGMV_lastYear = filteredData.reduce((s, d) => s + (d.GMV_same_day_last_year || 0), 0);
        const totalOrders_lastMonth = filteredData.reduce((s, d) => s + (d.orders_same_day_last_month || 0), 0);
        const totalOrders_lastYear = filteredData.reduce((s, d) => s + (d.orders_same_day_last_year || 0), 0);
        return { totalGMV, totalOrders, totalGMV_lastMonth, totalGMV_lastYear, totalOrders_lastMonth, totalOrders_lastYear };
    }, [filteredData]);

    // Pie chart data: GMV by brand (merged TikTok + Shopee)
    const pieData = useMemo(() => {
        const brandMap = {};
        filteredData.forEach(d => {
            const brand = getBrand(d.org_name);
            brandMap[brand] = (brandMap[brand] || 0) + (d.GMV || 0);
        });
        return Object.entries(brandMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredData]);

    // Bar chart data: GMV comparison by brand
    const barData = useMemo(() => {
        const brandMap = {};
        filteredData.forEach(d => {
            const brand = getBrand(d.org_name);
            if (!brandMap[brand]) brandMap[brand] = { name: brand, today: 0, lastMonth: 0 };
            brandMap[brand].today += d.GMV || 0;
            brandMap[brand].lastMonth += d.GMV_same_day_last_month || 0;
        });
        return Object.values(brandMap).sort((a, b) => b.today - a.today);
    }, [filteredData]);

    // Multi-day trend data for line chart (works for both 7-day and 30-day)
    const trendData = useMemo(() => {
        if (viewMode === 'day' || weekTimestamps.length === 0) return [];
        return weekTimestamps.map(ts => {
            const dayData = data.filter(d => {
                if (d.period_day !== ts) return false;
                const matchPlatform = platformFilter === 'All'
                    || (platformFilter === 'TikTok' && d.order_sources === 'Tiktokshop')
                    || (platformFilter === 'Shopee' && d.order_sources === 'Shopee');
                const matchBrand = brandFilter === 'All' || getBrand(d.org_name) === brandFilter;
                return matchPlatform && matchBrand;
            });
            const gmv = dayData.reduce((s, d) => s + (d.GMV || 0), 0);
            const orders = dayData.reduce((s, d) => s + (d.total_orders || 0), 0);
            const date = new Date(ts);
            return {
                name: `${date.getDate()}/${date.getMonth() + 1}`,
                fullDate: date.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }),
                GMV: gmv,
                orders: orders
            };
        }).reverse(); // oldest first for chart
    }, [data, weekTimestamps, viewMode, platformFilter, brandFilter]);

    const cardStyle = {
        background: '#fff', borderRadius: '16px', padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6'
    };

    return (
        <>
            {/* HEADER */}
            <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h1 className="page-header">📊 GMV REALTIME</h1>
                    <p style={{ color: '#6B7280', marginTop: '8px', fontSize: '1.05rem', fontWeight: '500' }}>
                        Dữ liệu doanh thu real-time từ TikTok Shop & Shopee — Powered by Bluecore
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>
                        {lastUpdated ? `🕐 Cập nhật: ${lastUpdated.toLocaleTimeString('vi-VN')}` : ''}
                    </span>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="btn-primary"
                        style={{ padding: '10px 24px', borderRadius: '30px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? '⏳ Đang tải...' : '🔄 Làm mới'}
                    </button>
                </div>
            </div>

            {/* ERROR STATE */}
            {error && (
                <div style={{ ...cardStyle, borderColor: '#fca5a5', background: '#fef2f2', marginBottom: '20px', textAlign: 'center', padding: '30px' }}>
                    <p style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '1.1rem' }}>❌ Không thể kết nối API Bluecore</p>
                    <p style={{ color: '#9CA3AF', marginTop: '8px' }}>{error}</p>
                    <button onClick={fetchData} className="btn-primary" style={{ marginTop: '15px', padding: '10px 30px', borderRadius: '30px' }}>
                        🔄 Thử lại
                    </button>
                </div>
            )}

            {/* LOADING STATE */}
            {loading && !error && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px', animation: 'spin 1s linear infinite' }}>⏳</div>
                    <p style={{ color: '#6B7280', fontSize: '1.1rem', fontWeight: '600' }}>Đang lấy dữ liệu từ Bluecore...</p>
                </div>
            )}

            {/* MAIN CONTENT */}
            {!loading && !error && data.length > 0 && (
                <>
                    {/* DATE SELECTOR - Split Year/Month/Day + View Mode */}
                    <div style={{ ...cardStyle, marginBottom: '20px', padding: '16px 20px', background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', border: '1px solid #fed7aa' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: '600', color: '#ea580c' }}>📅</span>
                            {/* Year */}
                            <select value={yearFilter || ''} onChange={(e) => { setYearFilter(Number(e.target.value)); setMonthFilter(null); setDayFilter(null); }}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.85rem', fontWeight: '700', color: '#ea580c', background: '#fff', outline: 'none', cursor: 'pointer', minWidth: '80px' }}>
                                {yearList.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            {/* Month */}
                            <select value={monthFilter || ''} onChange={(e) => { setMonthFilter(Number(e.target.value)); setDayFilter(null); }}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.85rem', fontWeight: '700', color: '#ea580c', background: '#fff', outline: 'none', cursor: 'pointer', minWidth: '70px' }}>
                                {monthList.map(m => <option key={m} value={m}>Th{m}</option>)}
                            </select>
                            {/* Day */}
                            <select value={dayFilter || ''} onChange={(e) => setDayFilter(Number(e.target.value))}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.85rem', fontWeight: '700', color: '#ea580c', background: '#fff', outline: 'none', cursor: 'pointer', minWidth: '65px' }}>
                                {dayList.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '28px', background: '#fed7aa' }} />

                            {/* View Mode Toggle */}
                            {['day', 'week', 'month'].map(m => (
                                <button key={m} onClick={() => setViewMode(m)}
                                    style={{
                                        padding: '6px 14px', borderRadius: '20px', fontWeight: '700', fontSize: '0.8rem',
                                        cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                                        background: viewMode === m ? '#ea580c' : '#fff',
                                        color: viewMode === m ? '#fff' : '#ea580c',
                                        boxShadow: viewMode === m ? '0 2px 8px rgba(234,88,12,0.3)' : '0 1px 3px rgba(0,0,0,0.1)'
                                    }}>
                                    {m === 'day' ? '1 Ngày' : m === 'week' ? '7 Ngày' : '30 Ngày'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* FILTERS ROW */}
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Platform Filter */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {['All', 'TikTok', 'Shopee'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPlatformFilter(p)}
                                    style={{
                                        padding: '10px 24px', borderRadius: '30px', fontWeight: '700', fontSize: '0.9rem',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        border: platformFilter === p ? 'none' : '1px solid #d1d5db',
                                        background: platformFilter === p ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : '#fff',
                                        color: platformFilter === p ? '#fff' : '#374151',
                                        boxShadow: platformFilter === p ? '0 4px 10px rgba(234, 88, 12, 0.25)' : 'none'
                                    }}
                                >
                                    {p === 'All' ? '🌐 Tất cả' : p === 'TikTok' ? '🎵 TikTok Shop' : '🛒 Shopee'}
                                </button>
                            ))}
                        </div>
                        {/* Brand/Shop Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#6B7280' }}>🏢 Shop:</span>
                            <select
                                value={brandFilter}
                                onChange={(e) => setBrandFilter(e.target.value)}
                                style={{
                                    padding: '10px 16px', borderRadius: '10px', border: '1px solid #d1d5db',
                                    fontSize: '0.9rem', fontWeight: '600', color: '#374151',
                                    background: brandFilter !== 'All' ? '#fff7ed' : '#fff',
                                    outline: 'none', cursor: 'pointer', minWidth: '180px',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                            >
                                {brandList.map(b => (
                                    <option key={b} value={b}>{b === 'All' ? 'Tất cả Shop' : b}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
                        {/* Total GMV */}
                        <div style={{ ...cardStyle, borderLeft: '4px solid #ea580c' }}>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Tổng GMV</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: '900', color: '#ea580c', marginBottom: '8px' }}>{formatCurrency(stats.totalGMV)}</p>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>vs Tháng trước:</span>
                                <GrowthBadge current={stats.totalGMV} previous={stats.totalGMV_lastMonth} />
                            </div>
                        </div>
                        {/* Total Orders */}
                        <div style={{ ...cardStyle, borderLeft: '4px solid #3b82f6' }}>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📦 Tổng Đơn Hàng</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: '900', color: '#3b82f6', marginBottom: '8px' }}>{formatNumber(stats.totalOrders)}</p>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>vs Tháng trước:</span>
                                <GrowthBadge current={stats.totalOrders} previous={stats.totalOrders_lastMonth} />
                            </div>
                        </div>
                        {/* GMV vs Last Year */}
                        <div style={{ ...cardStyle, borderLeft: '4px solid #10b981' }}>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📈 GMV vs Năm trước</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: '900', color: '#10b981', marginBottom: '8px' }}>{formatCurrency(stats.totalGMV_lastYear)}</p>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Tăng trưởng:</span>
                                <GrowthBadge current={stats.totalGMV} previous={stats.totalGMV_lastYear} />
                            </div>
                        </div>
                        {/* Average GMV per shop */}
                        <div style={{ ...cardStyle, borderLeft: '4px solid #8b5cf6' }}>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏪 TB / Gian hàng</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: '900', color: '#8b5cf6', marginBottom: '8px' }}>
                                {formatCurrency(filteredData.length > 0 ? stats.totalGMV / filteredData.length : 0)}
                            </p>
                            <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>{filteredData.length} gian hàng</span>
                        </div>
                    </div>

                    {/* TREND CHART (7-day or 30-day mode) */}
                    {viewMode !== 'day' && trendData.length > 0 && (
                        <div style={{ ...cardStyle, marginBottom: '30px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>📈 Biểu đồ GMV & Đơn hàng {viewMode === 'month' ? '30' : '7'} ngày</h3>
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={trendData} margin={{ top: 25, right: 30, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                    <XAxis dataKey="name" tick={{ fontSize: viewMode === 'month' ? 9 : 12, fontWeight: '600' }} />
                                    <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(val, name) => [name === 'GMV' ? formatCurrency(val) : formatNumber(val), name === 'GMV' ? 'GMV' : 'Đơn hàng']} />
                                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                                    <Line yAxisId="left" type="monotone" dataKey="GMV" name="GMV" stroke="#ea580c" strokeWidth={3}
                                        dot={viewMode === 'week' ? { r: 4, fill: '#ea580c' } : { r: 2, fill: '#ea580c' }}
                                        activeDot={{ r: 7 }}
                                        label={viewMode === 'week' ? ({ x, y, value }) => (
                                            <text x={x} y={y - 12} textAnchor="middle" fontSize={10} fontWeight="700" fill="#ea580c">{formatCurrency(value)}</text>
                                        ) : false}
                                    />
                                    <Line yAxisId="right" type="monotone" dataKey="orders" name="Đơn hàng" stroke="#3b82f6" strokeWidth={2}
                                        dot={viewMode === 'week' ? { r: 3, fill: '#3b82f6' } : false}
                                        strokeDasharray="5 5"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* CHARTS ROW */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px', marginBottom: '30px' }}>
                        {/* Pie Chart */}
                        <div style={cardStyle}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>🍩 Phân bổ GMV theo Brand</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} labelLine={false} label={renderCustomLabel} dataKey="value">
                                        {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(val) => formatCurrency(val)} />
                                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Bar Chart */}
                        <div style={cardStyle}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>📊 So sánh GMV: Hôm nay vs Tháng trước</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(val) => formatCurrency(val)} />
                                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                                    <Bar dataKey="today" name="Hôm nay" fill="#ea580c" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="lastMonth" name="Tháng trước" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* DATA TABLE */}
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>📋 Chi tiết từng Gian hàng</h3>
                        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff' }}>
                                        <th style={{ padding: '14px 12px', textAlign: 'left', fontWeight: '700' }}>#</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'left', fontWeight: '700' }}>Gian hàng</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '700' }}>Ngày</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '700' }}>Nền tảng</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700' }}>Đơn hàng</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700' }}>GMV</th>
                                        <th style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '700' }}>vs Tháng trước</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData
                                        .sort((a, b) => (b.GMV || 0) - (a.GMV || 0))
                                        .map((d, idx) => (
                                        <tr key={idx} style={{
                                            borderBottom: '1px solid #f3f4f6',
                                            backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa',
                                            transition: 'background 0.15s'
                                        }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#fff7ed'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}
                                        >
                                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#9CA3AF' }}>{idx + 1}</td>
                                            <td style={{ padding: '10px 12px', fontWeight: '600', color: '#111827' }}>
                                                {d.org_name?.split(' - ')[1] || d.org_name}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.8rem', color: '#6B7280' }}>
                                                {d.period_day ? new Date(d.period_day).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : ''}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700',
                                                    background: d.order_sources === 'Tiktokshop' ? '#111827' : '#ee4d2d',
                                                    color: '#fff'
                                                }}>
                                                    {d.order_sources === 'Tiktokshop' ? 'TikTok' : 'Shopee'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>
                                                {formatNumber(d.total_orders)}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#ea580c', fontSize: '1rem' }}>
                                                {formatCurrency(d.GMV)}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <GrowthBadge current={d.GMV} previous={d.GMV_same_day_last_month} />
                                            </td>
                                        </tr>
                                    ))}
                                    {/* TOTAL ROW */}
                                    <tr style={{ background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', fontWeight: '800', borderTop: '2px solid #ea580c' }}>
                                        <td style={{ padding: '12px' }}></td>
                                        <td style={{ padding: '12px', color: '#ea580c', fontSize: '1rem' }}>TỔNG CỘNG</td>
                                        <td style={{ padding: '12px', textAlign: 'center', color: '#6B7280', fontSize: '0.8rem' }}></td>
                                        <td style={{ padding: '12px', textAlign: 'center', color: '#6B7280', fontSize: '0.8rem' }}>{filteredData.length} dòng</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#111827', fontSize: '1rem' }}>
                                            {formatNumber(stats.totalOrders)}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#ea580c', fontSize: '1.1rem' }}>
                                            {formatCurrency(stats.totalGMV)}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <GrowthBadge current={stats.totalGMV} previous={stats.totalGMV_lastMonth} />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* NO DATA STATE */}
            {!loading && !error && data.length === 0 && (
                <div style={{ ...cardStyle, textAlign: 'center', padding: '80px 20px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📭</div>
                    <p style={{ color: '#6B7280', fontSize: '1.1rem', fontWeight: '600' }}>Không có dữ liệu nào từ API</p>
                </div>
            )}
        </>
    );
};

export default GmvRealtimeTab;
