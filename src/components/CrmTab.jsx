// src/components/CrmTab.jsx — Redesigned to match Claude Design mockups
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */
const SALES_PERSONS = ['HUỆ', 'KỲ ANH', 'HẠNH'];
const BUSINESS_TYPES = ['SPA - CLINIC', 'GỘI ĐẦU DƯỠNG SINH', 'MINI MART', 'WAXING/TRIỆT', 'CÔNG TY'];
// Loại hình bị ẩn khỏi dashboard/charts (data rác, ít record)
const HIDDEN_BIZ_TYPES = ['Sỉ Oil eHerb'];
const DATA_SOURCES = ['Zalo SPA', 'TT MILA', 'TT MOAW', 'Tiktok eHerb', 'Shopee MP', 'TT eHERB'];
const ORDER_SOURCES = ['Zalo Group', 'Zalo OA', 'Zalo Sỉ', 'CRM', 'FB Ads', 'Google Ads', 'SMS', 'Đơn Bán Lẻ', 'Quà tặng'];
const PAY_METHODS   = ['COD', 'Chuyển khoản'];
const PROVINCES = [
  'An Giang','Bà Rịa–Vũng Tàu','Bắc Giang','Bắc Kạn','Bạc Liêu','Bắc Ninh',
  'Bến Tre','Bình Định','Bình Dương','Bình Phước','Bình Thuận','Cà Mau',
  'Cần Thơ','Cao Bằng','Đà Nẵng','Đắk Lắk','Đắk Nông','Điện Biên',
  'Đồng Nai','Đồng Tháp','Gia Lai','Hà Giang','Hà Nam','Hà Nội',
  'Hà Tĩnh','Hải Dương','Hải Phòng','Hậu Giang','Hòa Bình','Hưng Yên',
  'Khánh Hòa','Kiên Giang','Kon Tum','Lai Châu','Lâm Đồng','Lạng Sơn',
  'Lào Cai','Long An','Nam Định','Nghệ An','Ninh Bình','Ninh Thuận',
  'Phú Thọ','Phú Yên','Quảng Bình','Quảng Nam','Quảng Ngãi','Quảng Ninh',
  'Quảng Trị','Sóc Trăng','Sơn La','Tây Ninh','Thái Bình','Thái Nguyên',
  'Thanh Hóa','Thừa Thiên Huế','Tiền Giang','TP. Hồ Chí Minh','Trà Vinh',
  'Tuyên Quang','Vĩnh Long','Vĩnh Phúc','Yên Bái',
];

const TAG_CONFIG = {
  VIP:      { label:'VIP',        bg:'#fef2f2', color:'#dc2626' },
  loyal:    { label:'Khách thân', bg:'#fff7ed', color:'#ea580c' },
  regular:  { label:'Thường',     bg:'#eff6ff', color:'#2563eb' },
  new:      { label:'KH mới',    bg:'#fefce8', color:'#ca8a04' },
  inactive: { label:'Không HĐ',  bg:'#f1f5f9', color:'#64748b' },
};
const DONUT_COLORS = ['#dc2626','#ea580c','#2563eb','#ca8a04','#94a3b8'];
const OA_CHANNELS = [
  { key:'zalo',     name:'Zalo OA',  icon:'💬', color:'#0068ff', connected:true },
  { key:'facebook', name:'Facebook', icon:'📘', color:'#1877f2', connected:true },
  { key:'tiktok',   name:'TikTok',   icon:'🎵', color:'#010101', connected:true },
  { key:'telegram', name:'Telegram', icon:'✈️', color:'#0088cc', connected:false },
];
const AVATAR_COLORS = ['#ea580c','#2563eb','#16a34a','#7c3aed','#dc2626','#0891b2','#d97706','#ec4899'];

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtNum = v => {
  const n = Number(v||0);
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'tr';
  if (n >= 1e4) return (n/1e3).toFixed(1) + 'K';
  return String(n);
};
const fmtMoney = v => {
  const n = Number(v||0);
  if (n >= 1e9)  return `${(n/1e9).toFixed(2)} tỷ`;
  if (n >= 1e6)  return `${(n/1e6).toFixed(1)}tr`;
  if (n >= 1e3)  return `${(n/1e3).toFixed(0)}K`;
  return fmtNum(n);
};
const fmtMoneyK = v => {
  const n = Number(v||0);
  if (n >= 1e6) return `${(n/1e6).toFixed(0)}tr`;
  if (n >= 1e3) return `${Math.round(n/1e3)}K`;
  return fmtNum(n);
};
const today    = () => new Date().toISOString().slice(0,10);
const daysAgo  = d => { const t = new Date(); t.setDate(t.getDate()-d); return t; };
const genCode  = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `CRM-${ymd}-${Math.floor(Math.random()*9000+1000)}`;
};
const getInitials = n => {
  if (!n) return '?';
  const p = n.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : n.slice(0,2).toUpperCase();
};
const avatarColor = n => AVATAR_COLORS[Math.abs([...(n||'X')].reduce((s,c)=>s+c.charCodeAt(0),0)) % AVATAR_COLORS.length];

const extractProvince = addr => {
  if (!addr) return 'Khác';
  const rules = [
    [/tp\.?\s*h[oồ]\s*ch[ií]\s*minh|tphcm|\bhcm\b|sài gòn/i, 'TP HCM'],
    [/đà nẵng/i, 'Đà Nẵng'], [/hà nội|ha noi/i, 'Hà Nội'],
    [/nha trang|khánh h[oò]a/i, 'Nha Trang'], [/phú quốc|kiên giang/i, 'Phú Quốc'],
    [/đà lạt|lâm đồng/i, 'Đà Lạt'], [/cần thơ/i, 'Cần Thơ'],
    [/bắc ninh/i, 'Bắc Ninh'], [/hải phòng/i, 'Hải Phòng'],
    [/bình dương/i, 'Bình Dương'], [/đồng nai/i, 'Đồng Nai'],
    [/long an/i, 'Long An'], [/tiền giang/i, 'Tiền Giang'],
    [/nghệ an/i, 'Nghệ An'], [/thanh h[oó]a/i, 'Thanh Hóa'],
    [/thừa thiên|huế/i, 'Huế'], [/quảng nam/i, 'Quảng Nam'],
    [/quảng ninh/i, 'Quảng Ninh'], [/bình thuận|phan thiết/i, 'Bình Thuận'],
    [/vũng tàu|bà rịa/i, 'Vũng Tàu'], [/tây ninh/i, 'Tây Ninh'],
    [/cam ranh/i, 'Nha Trang'], [/hóc môn|bình chánh|thủ đức|gò vấp|tân bình|quận/i, 'TP HCM'],
    [/sơn trà|hải châu|liên chiểu|ngũ hành sơn/i, 'Đà Nẵng'],
    [/điện biên/i, 'Điện Biên'], [/sóc trăng/i, 'Sóc Trăng'],
    [/bến tre/i, 'Bến Tre'], [/an giang/i, 'An Giang'],
  ];
  for (const [re, prov] of rules) { if (re.test(addr)) return prov; }
  return 'Khác';
};

const classifyCustomer = (cust, custOrders) => {
  // Use DB order_count (from Excel import) + live orders
  const liveCount = custOrders.length;
  const dbCount = cust.order_count || 0;
  const count = Math.max(liveCount, dbCount);
  const gmv = custOrders.reduce((s,o) => s + Number(o.total_amount||0), 0);
  if (cust.is_blacklisted) return 'inactive';
  if (gmv >= 5_000_000 || count >= 5) return 'VIP';
  if (count >= 3 || cust.customer_type === 'Cũ') return 'loyal';
  if (cust.customer_type === 'Mới' && count <= 1) return 'new';
  if (count === 0 && cust.contact_status === 'Chưa liên hệ') return 'inactive';
  return 'regular';
};

const pctChange = (cur, prev) => {
  if (!prev || prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev * 100);
};

const EMPTY_ORDER = {
  order_source:'', products:[{ name:'', quantity:1, is_gift:false }],
  payment_method:'COD', total_amount:'',
  recipient_name:'', recipient_phone:'', recipient_address:'',
  sales_person:'', notes:'', freeship:false, vat_invoice:false,
};
const EMPTY_CUSTOMER = {
  phone:'', full_name:'', province:'', business_type:'', customer_type:'Mới',
  data_source:'', created_date:today(), sales_person:'', notes:'',
};

/* ═══════════════════════════════════════════════════════════════════════════
   Inline style objects
   ═══════════════════════════════════════════════════════════════════════════ */
const S = {
  font: "'Be Vietnam Pro','Inter',system-ui,-apple-system,sans-serif",
  primary: '#ea580c',
  card: {
    background:'#fff', borderRadius:14, border:'1px solid #e5e7eb',
    boxShadow:'0 1px 3px rgba(15,23,42,0.04)',
  },
  input: {
    width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e2e8f0',
    fontSize:'0.85rem', outline:'none', boxSizing:'border-box', color:'#1e293b',
    transition:'border-color 0.15s',
  },
  select: {
    width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e2e8f0',
    fontSize:'0.85rem', outline:'none', boxSizing:'border-box', background:'#fff', color:'#1e293b',
  },
  btnPrimary: {
    padding:'10px 20px', borderRadius:10, border:'none', background:'#ea580c', color:'#fff',
    fontWeight:600, fontSize:'0.88rem', cursor:'pointer', boxShadow:'0 2px 8px rgba(234,88,12,0.25)',
  },
  btnOutline: {
    padding:'9px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff',
    color:'#64748b', fontWeight:600, fontSize:'0.85rem', cursor:'pointer',
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   CrmTab Component
   ═══════════════════════════════════════════════════════════════════════════ */
const CrmTab = () => {
  const [subTab,    setSubTab]    = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [groups,    setGroups]    = useState([]);
  const [zaloOA,    setZaloOA]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  /* ── Filters ────────────────────────────────────────────────────────── */
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo,   setFDateTo]   = useState('');
  const [fProvince, setFProvince] = useState('');
  const [fCustType, setFCustType] = useState('');
  const [fPerson,   setFPerson]   = useState('');
  const [fBizType,  setFBizType]  = useState('');
  const [fSearch,   setFSearch]   = useState('');
  const [fOrderType, setFOrderType] = useState('');
  const [fContact,  setFContact]  = useState('');   // '', 'Đã liên hệ', 'Chưa liên hệ'

  /* ── Forms ──────────────────────────────────────────────────────────── */
  const [blacklist, setBlacklist] = useState([]);
  const [showCustForm, setShowCustForm] = useState(false);
  const [showGroupForm,setShowGroupForm]= useState(false);
  const [showOAForm,   setShowOAForm]   = useState(false);
  const [newCust,   setNewCust]   = useState(EMPTY_CUSTOMER);
  const [newOrder,  setNewOrder]  = useState(EMPTY_ORDER);
  const [newGroup,  setNewGroup]  = useState({ report_date:today(), group_name:'', total_members:'', new_joins:'' });
  const [editGroupId, setEditGroupId] = useState(null);   // id của group đang sửa (null = thêm mới)
  const [newOA,     setNewOA]     = useState({ report_date:today(), oa_scans:'', new_follows:'', menu_interactions:'' });
  const [phoneLoading, setPhoneLoading] = useState(false);

  /* ── Fetch (pagination để vượt giới hạn 1000 dòng) ──────────────── */
  const fetchPaged = useCallback(async (table, orderCol, asc = false) => {
    const all = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from(table).select('*')
        .order(orderCol, { ascending: asc })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [custData, orderData, g, z, bl] = await Promise.all([
      fetchPaged('crm_customers', 'created_at'),
      fetchPaged('crm_orders', 'created_at'),
      supabase.from('crm_groups').select('*').order('report_date', { ascending:false }),
      supabase.from('crm_zalo_oa').select('*').order('report_date', { ascending:false }),
      supabase.from('crm_blacklist').select('*').order('created_at', { ascending:false }),
    ]);
    setCustomers(custData);
    // Sort orders: order_date DESC, rồi created_at DESC
    orderData.sort((a,b) => {
      const da = a.order_date || '0000'; const db = b.order_date || '0000';
      if (da !== db) return db.localeCompare(da);
      return (b.created_at||'').localeCompare(a.created_at||'');
    });
    setOrders(orderData);
    if (g.data) setGroups(g.data);
    if (z.data) setZaloOA(z.data);
    if (bl.data) setBlacklist(bl.data);
    setLoading(false);
  }, [fetchPaged]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Phone lookup ───────────────────────────────────────────────────── */
  const lookupPhone = async phone => {
    if (!phone || phone.length < 9) return;
    setPhoneLoading(true);
    const { data } = await supabase.from('crm_customers').select('*').eq('phone', phone).maybeSingle();
    if (data) {
      setNewOrder(p => ({ ...p,
        recipient_name:  data.full_name || p.recipient_name,
        recipient_phone: phone,
        recipient_address: data.province || p.recipient_address,
        sales_person:    data.sales_person || p.sales_person,
        order_source:    data.data_source || p.order_source,
      }));
    }
    setPhoneLoading(false);
  };

  /* ── Enriched customers (with tags + order stats) ───────────────────── */
  const enriched = useMemo(() => {
    return customers.map(c => {
      const co = orders.filter(o => o.recipient_phone === c.phone);
      const gmv = co.reduce((s,o) => s + Number(o.total_amount||0), 0);
      const lastOrder = co.length ? co[0].created_at?.slice(0,10) : null;
      return { ...c, tag: classifyCustomer(c, co), orderCount: co.length, gmv, lastOrder };
    });
  }, [customers, orders]);

  /* ── Filtered data ──────────────────────────────────────────────────── */
  const filteredCustomers = useMemo(() => {
    // KHÔNG lọc theo created_date ở đây — tab Khách hàng không có bộ chọn ngày,
    // tránh việc filter ngày của Dashboard "rò rỉ" sang làm mất khách.
    return enriched.filter(c => {
      if (fProvince && c.province !== fProvince) return false;
      if (fBizType  && c.business_type !== fBizType) return false;
      if (fPerson   && c.sales_person !== fPerson) return false;
      if (fContact  && (c.contact_status || '') !== fContact) return false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        if (!(c.full_name||'').toLowerCase().includes(q) && !(c.phone||'').includes(q)) return false;
      }
      return true;
    });
  }, [enriched, fProvince, fBizType, fPerson, fContact, fSearch]);

  /* ── Tỉnh/TP options động (lấy từ data thật, vì DB lưu tên TP như "Nha Trang") ── */
  const provinceOptions = useMemo(() => {
    const map = {};
    customers.forEach(c => {
      const p = (c.province || '').trim();
      if (p) map[p] = (map[p] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).map(([p]) => p);
  }, [customers]);

  // Options cho form thêm KH: ưu tiên tên TP đang có trong data (vd "Nha Trang"),
  // rồi mới tới danh sách tỉnh chuẩn — để dữ liệu mới nhập thống nhất với data cũ.
  const provinceFormOptions = useMemo(() => {
    const seen = new Set(provinceOptions);
    return [...provinceOptions, ...PROVINCES.filter(p => !seen.has(p))];
  }, [provinceOptions]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      if (fDateFrom && d < fDateFrom) return false;
      if (fDateTo   && d > fDateTo) return false;
      if (fPerson   && o.sales_person !== fPerson) return false;
      return true;
    });
  }, [orders, fDateFrom, fDateTo, fPerson]);

  /* ── KPIs with trends (respects filters) ─────────────────────────── */
  const kpis = useMemo(() => {
    const hasDateFilter = !!(fDateFrom || fDateTo);
    // Mặc định = TOÀN BỘ thời gian (không giới hạn 30 ngày). Chỉ giới hạn khi user chọn ngày.
    const curStart = fDateFrom || '0000-01-01';
    const curEnd   = fDateTo   || '9999-12-31';

    // Khoảng kỳ trước (chỉ tính khi có filter ngày để so sánh trend)
    let prevS = '', prevE = '';
    if (hasDateFilter && fDateFrom && fDateTo) {
      const daysDiff = Math.round((new Date(curEnd) - new Date(curStart)) / 86400000) || 30;
      const prevEnd  = new Date(curStart); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart= new Date(prevEnd);  prevStart.setDate(prevStart.getDate() - daysDiff);
      prevS = prevStart.toISOString().slice(0,10);
      prevE = prevEnd.toISOString().slice(0,10);
    }

    // Apply non-date filters to customers
    const fc = enriched.filter(c => {
      if (fProvince && c.province !== fProvince) return false;
      if (fBizType  && c.business_type !== fBizType) return false;
      if (fPerson   && c.sales_person !== fPerson) return false;
      return true;
    });
    // Apply non-date filters to orders
    const fo = orders.filter(o => {
      if (fPerson && o.sales_person !== fPerson) return false;
      return true;
    });

    const totalCust   = fc.length;
    // KH mới: nếu có filter ngày thì đếm theo created_date trong kỳ; nếu không, đếm theo customer_type='Mới'
    const newCustCur  = hasDateFilter
      ? fc.filter(c => c.created_date >= curStart && c.created_date <= curEnd).length
      : fc.filter(c => c.customer_type === 'Mới').length;
    const newCustPrev = (hasDateFilter && prevS)
      ? fc.filter(c => c.created_date >= prevS && c.created_date <= prevE).length : 0;

    // Đã liên hệ = customers with contact_status = 'Đã liên hệ'
    const contactedCust = fc.filter(c => c.contact_status === 'Đã liên hệ').length;

    // Đơn doanh thu = đơn có total_amount > 0 (loại bỏ 1422 đơn Quà tặng 0đ)
    const ordersCur  = fo.filter(o => {
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      return d >= curStart && d <= curEnd && Number(o.total_amount||0) > 0;
    });
    const ordersPrev = (hasDateFilter && prevS)
      ? fo.filter(o => { const d = o.order_date || o.created_at?.slice(0,10) || ''; return d >= prevS && d <= prevE && Number(o.total_amount||0) > 0; })
      : [];
    const revCur     = ordersCur.reduce((s,o) => s + Number(o.total_amount||0), 0);
    const revPrev    = ordersPrev.reduce((s,o) => s + Number(o.total_amount||0), 0);
    const aovCur     = ordersCur.length ? Math.round(revCur / ordersCur.length) : 0;
    const aovPrev    = ordersPrev.length ? Math.round(revPrev / ordersPrev.length) : 0;

    // Tỷ lệ chuyển đổi = đơn doanh thu / khách đã liên hệ
    const convRate = contactedCust > 0 ? (ordersCur.length / contactedCust * 100) : 0;

    const showTrend = hasDateFilter && !!prevS;
    return [
      { label:'Tổng KH',          value: fmtNum(totalCust),        raw: totalCust,        trend: 0 },
      { label:'KH Mới',           value: fmtNum(newCustCur),       raw: newCustCur,       trend: showTrend ? pctChange(newCustCur, newCustPrev) : 0 },
      { label:'Đã liên hệ',       value: fmtNum(contactedCust),    raw: contactedCust,    trend: 0 },
      { label:'Đơn',              value: fmtNum(ordersCur.length), raw: ordersCur.length, trend: showTrend ? pctChange(ordersCur.length, ordersPrev.length) : 0 },
      { label:'Doanh thu',        value: fmtMoney(revCur),         raw: revCur,           trend: showTrend ? pctChange(revCur, revPrev) : 0 },
      { label:'AOV',              value: fmtMoneyK(aovCur),        raw: aovCur,           trend: showTrend ? pctChange(aovCur, aovPrev) : 0 },
      { label:'Tỷ lệ chuyển đổi', value:`${convRate.toFixed(1)}%`, raw: convRate,         trend: 0 },
    ];
  }, [enriched, orders, fDateFrom, fDateTo, fProvince, fBizType, fPerson]);

  /* ── Chart: customer growth (last 6 months) ─────────────────────────── */
  const growthChart = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = `T${d.getMonth()+1}`;
      const count = customers.filter(c => (c.created_date||'').startsWith(key)).length;
      const orderCount = orders.filter(o => (o.created_at||'').startsWith(key)).length;
      months.push({ name: label, 'KH mới': count, 'Đơn hàng': orderCount });
    }
    return months;
  }, [customers, orders]);

  /* ── Chart: donut — phân loại theo loại hình KD ─────────────────────── */
  const donutData = useMemo(() => {
    const counts = {};
    const fc = enriched.filter(c => {
      if (fProvince && c.province !== fProvince) return false;
      if (fBizType  && c.business_type !== fBizType) return false;
      if (fPerson   && c.sales_person !== fPerson) return false;
      return true;
    });
    fc.forEach(c => {
      const bt = c.business_type || 'Khác';
      if (HIDDEN_BIZ_TYPES.includes(bt)) return;   // ẩn Sỉ Oil eHerb
      counts[bt] = (counts[bt]||0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6).map(([name,value]) => ({ name, value }));
  }, [enriched, fProvince, fBizType, fPerson]);

  /* ── Chart: doanh thu theo khu vực (parse tỉnh từ address) ──────────── */
  const revenueByRegion = useMemo(() => {
    const curStart = fDateFrom || '0000-01-01';
    const curEnd   = fDateTo   || '9999-12-31';
    const map = {};
    orders.forEach(o => {
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      if (d < curStart || d > curEnd) return;
      if (fPerson && o.sales_person !== fPerson) return;
      const prov = extractProvince(o.recipient_address);
      map[prov] = (map[prov]||0) + Number(o.total_amount||0);
    });
    const sorted = Object.entries(map).filter(([k]) => k !== 'Khác').sort((a,b)=>b[1]-a[1]).slice(0,8);
    const max = sorted[0]?.[1] || 1;
    return sorted.map(([name,rev]) => ({ name, rev, pct: Math.round(rev/max*100) }));
  }, [orders, fDateFrom, fDateTo, fPerson]);

  /* ── Chart: data theo loại hình KD (từ crm_customers trực tiếp) ────── */
  const dataByBizType = useMemo(() => {
    const fc = enriched.filter(c => {
      if (fProvince && c.province !== fProvince) return false;
      if (fBizType  && c.business_type !== fBizType) return false;
      if (fPerson   && c.sales_person !== fPerson) return false;
      return true;
    });
    const map = {};
    fc.forEach(c => {
      const bt = c.business_type || 'Khác';
      if (HIDDEN_BIZ_TYPES.includes(bt)) return;   // ẩn Sỉ Oil eHerb
      if (!map[bt]) map[bt] = { custs:0, contacted:0, notContacted:0 };
      map[bt].custs++;
      if (c.contact_status === 'Đã liên hệ') map[bt].contacted++;
      else map[bt].notContacted++;
    });
    return Object.entries(map)
      .map(([name,v]) => ({ name, custs:v.custs, contacted:v.contacted, notContacted:v.notContacted,
        pct: v.custs ? Math.round(v.contacted / v.custs * 100) : 0 }))
      .sort((a,b) => b.custs - a.custs);
  }, [enriched, fProvince, fBizType, fPerson]);

  /* ── KH mới vs KH cũ (từ customer_type tag trong crm_customers) ──── */
  const newVsReturn = useMemo(() => {
    const fc = enriched.filter(c => {
      if (fProvince && c.province !== fProvince) return false;
      if (fBizType  && c.business_type !== fBizType) return false;
      if (fPerson   && c.sales_person !== fPerson) return false;
      return true;
    });
    const newCusts = fc.filter(c => c.customer_type === 'Mới');
    const retCusts = fc.filter(c => c.customer_type === 'Cũ');
    const newOrders = newCusts.reduce((s,c) => s + Math.max(c.orderCount, c.order_count||0), 0);
    const retOrders = retCusts.reduce((s,c) => s + Math.max(c.orderCount, c.order_count||0), 0);
    return { newCusts: newCusts.length, retCusts: retCusts.length, newOrders, retOrders };
  }, [enriched, fProvince, fBizType, fPerson]);

  /* ── Chart: province distribution ───────────────────────────────────── */
  const provinceData = useMemo(() => {
    const map = {};
    enriched.forEach(c => { const p = c.province || 'Khác'; map[p] = (map[p]||0)+1; });
    const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const max = sorted[0]?.[1] || 1;
    return sorted.map(([name,count]) => ({ name: name.replace('TP. ',''), count, pct: Math.round(count/max*100) }));
  }, [enriched]);

  /* ── Form handlers ──────────────────────────────────────────────────── */
  const addCustomer = async () => {
    if (!newCust.phone) return alert('Vui lòng nhập SĐT!');
    setSaving(true);
    const { error } = await supabase.from('crm_customers').upsert(
      { ...newCust, phone:newCust.phone.trim() }, { onConflict:'phone' }
    );
    setSaving(false);
    if (error) return alert('Lỗi: ' + error.message);
    setNewCust(EMPTY_CUSTOMER); setShowCustForm(false); fetchAll();
  };

  const submitOrder = async () => {
    if (!newOrder.recipient_name || !newOrder.recipient_phone)
      return alert('Vui lòng nhập tên và SĐT!');
    setSaving(true);
    const record = {
      ...newOrder, order_code:genCode(),
      total_amount: Number(newOrder.total_amount||0),
      products: newOrder.products.filter(p=>p.name),
      freeship: !!newOrder.freeship,
      vat_invoice: !!newOrder.vat_invoice,
      notes: [
        newOrder.freeship ? '[Freeship]' : '',
        newOrder.vat_invoice ? '[VAT]' : '',
        newOrder.notes || '',
      ].filter(Boolean).join(' '),
    };
    const { error } = await supabase.from('crm_orders').insert(record);
    setSaving(false);
    if (error) return alert('Lỗi: ' + error.message);
    if (newOrder.recipient_phone) {
      await supabase.from('crm_customers').upsert({
        phone:newOrder.recipient_phone, full_name:newOrder.recipient_name,
        sales_person:newOrder.sales_person,
      }, { onConflict:'phone', ignoreDuplicates:true });
    }
    setNewOrder(EMPTY_ORDER); fetchAll();
  };

  const addGroup = async () => {
    if (!newGroup.group_name) return alert('Vui lòng nhập tên group!');
    setSaving(true);
    const payload = {
      ...newGroup,
      total_members:Number(newGroup.total_members||0),
      new_joins:Number(newGroup.new_joins||0),
    };
    if (editGroupId) {
      await supabase.from('crm_groups').update(payload).eq('id', editGroupId);
    } else {
      await supabase.from('crm_groups').insert(payload);
    }
    setSaving(false);
    setNewGroup({ report_date:today(), group_name:'', total_members:'', new_joins:'' });
    setEditGroupId(null);
    setShowGroupForm(false); fetchAll();
  };

  // Mở form ở chế độ sửa, đổ sẵn data của group đang chọn
  const openEditGroup = g => {
    setNewGroup({
      report_date: g.report_date || today(),
      group_name:  g.group_name || '',
      total_members: g.total_members ?? '',
      new_joins:     g.new_joins ?? '',
    });
    setEditGroupId(g.id);
    setShowGroupForm(true);
  };

  const addOA = async () => {
    setSaving(true);
    await supabase.from('crm_zalo_oa').insert({
      ...newOA, oa_scans:Number(newOA.oa_scans||0),
      new_follows:Number(newOA.new_follows||0), menu_interactions:Number(newOA.menu_interactions||0),
    });
    setSaving(false);
    setNewOA({ report_date:today(), oa_scans:'', new_follows:'', menu_interactions:'' });
    setShowOAForm(false); fetchAll();
  };

  const resetFilters = () => {
    setFDateFrom(''); setFDateTo(''); setFProvince('');
    setFCustType(''); setFPerson(''); setFSearch(''); setFBizType('');
    setFContact('');
  };

  /* ══════════════════════════════════════════════════════════════════════
     Sub-components (render helpers)
     ══════════════════════════════════════════════════════════════════════ */

  /* ── KPI Card ────────────────────────────────────────────────────────── */
  const KpiCard = ({ label, value, trend }) => {
    const up = trend >= 0;
    return (
      <div style={{ ...S.card, padding:'16px 18px', flex:'1 1 130px', minWidth:130 }}>
        <div style={{ fontSize:'0.76rem', color:'#64748b', fontWeight:500, marginBottom:6 }}>{label}</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span style={{ fontSize:'1.5rem', fontWeight:800, color:'#0f172a', letterSpacing:'-0.5px' }}>{value}</span>
          {trend !== 0 && (
            <span style={{
              fontSize:'0.72rem', fontWeight:700, padding:'2px 7px', borderRadius:20,
              background: up ? '#dcfce7' : '#fef2f2', color: up ? '#16a34a' : '#dc2626',
            }}>
              {up ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    );
  };

  /* ── Tag Badge ───────────────────────────────────────────────────────── */
  const TagBadge = ({ tag }) => {
    const cfg = TAG_CONFIG[tag] || TAG_CONFIG.regular;
    return (
      <span style={{
        display:'inline-block', padding:'3px 10px', borderRadius:20,
        fontSize:'0.72rem', fontWeight:700, background:cfg.bg, color:cfg.color,
      }}>
        {cfg.label}
      </span>
    );
  };

  /* ── Avatar ──────────────────────────────────────────────────────────── */
  const Avatar = ({ name, size=34 }) => (
    <div style={{
      width:size, height:size, borderRadius:'50%', display:'flex',
      alignItems:'center', justifyContent:'center', flexShrink:0,
      background:avatarColor(name), color:'#fff',
      fontWeight:700, fontSize:size*0.38, letterSpacing:0.5,
    }}>
      {getInitials(name)}
    </div>
  );

  /* ── Filter bar (Dashboard) ─────────────────────────────────────────── */
  const FilterBar = () => (
    <div style={{
      display:'flex', gap:10, flexWrap:'wrap', marginBottom:20,
      background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:12, padding:'12px 16px',
      alignItems:'center',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', color:'#475569', fontWeight:600 }}>
        <span>📅</span> NGÀY
      </div>
      <input type='date' value={fDateFrom} onChange={e=>setFDateFrom(e.target.value)}
        style={{ ...S.input, width:140, padding:'7px 10px' }}/>
      <span style={{ color:'#94a3b8', fontSize:'0.82rem' }}>→</span>
      <input type='date' value={fDateTo} onChange={e=>setFDateTo(e.target.value)}
        style={{ ...S.input, width:140, padding:'7px 10px' }}/>

      <div style={{ width:1, height:24, background:'#e2e8f0', margin:'0 4px' }}/>

      <select value={fProvince} onChange={e=>setFProvince(e.target.value)}
        style={{ ...S.select, width:150, padding:'7px 10px' }}>
        <option value=''>Tỉnh/TP</option>
        {provinceOptions.map(p=><option key={p} value={p}>{p}</option>)}
      </select>

      <select value={fBizType} onChange={e=>setFBizType(e.target.value)}
        style={{ ...S.select, width:160, padding:'7px 10px' }}>
        <option value=''>Loại hình KD</option>
        {BUSINESS_TYPES.map(b=><option key={b} value={b}>{b}</option>)}
      </select>

      <select value={fPerson} onChange={e=>setFPerson(e.target.value)}
        style={{ ...S.select, width:130, padding:'7px 10px' }}>
        <option value=''>Nhân viên</option>
        {SALES_PERSONS.map(p=><option key={p} value={p}>{p}</option>)}
      </select>

      <div style={{ flex:1 }}/>

      <button onClick={resetFilters} style={{ ...S.btnOutline, padding:'7px 14px', fontSize:'0.82rem' }}>
        ↺ Reset
      </button>
      <button style={{ ...S.btnPrimary, padding:'7px 14px', fontSize:'0.82rem', boxShadow:'none' }}>
        Áp dụng
      </button>
    </div>
  );

  /* ── Modal wrapper ──────────────────────────────────────────────────── */
  const Modal = ({ children, onClose, title }) => (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:18, padding:28, width:'100%', maxWidth:560,
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <h3 style={{ margin:0, fontSize:'1.1rem', fontWeight:800, color:'#0f172a' }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
            fontSize:'1.5rem', color:'#94a3b8', lineHeight:1, padding:4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );

  const FieldLabel = ({ label, required }) => (
    <div style={{ fontSize:'0.78rem', fontWeight:600, color:'#475569', marginBottom:5 }}>
      {label}{required && <span style={{ color:'#dc2626' }}> *</span>}
    </div>
  );

  const orderStatusBadge = (order) => {
    const s = (order.status || '').toLowerCase();
    if (s.includes('giao') || s.includes('thành')) return { label: order.status || 'Đã giao', bg:'#dcfce7', color:'#16a34a' };
    if (s.includes('hoàn') || s.includes('hủy')) return { label: order.status, bg:'#fef2f2', color:'#dc2626' };
    if (s.includes('xử lý') || s.includes('chờ')) return { label: order.status, bg:'#fef9c3', color:'#a16207' };
    if (!order.status || s === 'mới') return { label:'Mới', bg:'#dbeafe', color:'#2563eb' };
    return { label: order.status, bg:'#f1f5f9', color:'#475569' };
  };

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */
  const tabItems = [
    { key:'dashboard', label:'Dashboard',   icon:'📊' },
    { key:'customers', label:'Khách hàng',  icon:'👥' },
    { key:'orders',    label:'Đơn hàng',    icon:'📋' },
    { key:'groups',    label:'Nhóm & OA',   icon:'📱' },
    { key:'blacklist', label:'Blacklist',    icon:'🚫' },
  ];

  return (
    <div style={{ fontFamily:S.font, color:'#111827' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
        marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:'0.7rem', fontWeight:800, color:S.primary, letterSpacing:2,
            textTransform:'uppercase', marginBottom:4 }}>CRM</div>
          <h1 style={{ margin:0, fontSize:'1.6rem', fontWeight:900, color:'#0f172a',
            letterSpacing:'-0.3px' }}>Quản lý khách hàng</h1>
          <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:'0.88rem' }}>
            Theo dõi, phân loại và chăm sóc khách hàng.
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>{ setSubTab('orders'); setNewOrder(EMPTY_ORDER); }}
            style={S.btnPrimary}>
            + Tạo đơn CRM
          </button>
          <button onClick={fetchAll} disabled={loading} style={S.btnOutline}>
            {loading ? '⏳ Đang tải...' : '↺ Làm mới'}
          </button>
        </div>
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:0, marginBottom:24, background:'#f1f5f9', borderRadius:12,
        padding:4, width:'fit-content' }}>
        {tabItems.map(t => (
          <button key={t.key} onClick={()=>setSubTab(t.key)} style={{
            padding:'9px 22px', borderRadius:9, border:'none', cursor:'pointer',
            fontWeight:700, fontSize:'0.85rem', fontFamily:S.font, transition:'all 0.15s',
            background: subTab===t.key ? '#fff' : 'transparent',
            color:      subTab===t.key ? '#0f172a' : '#64748b',
            boxShadow:  subTab===t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
         TAB: DASHBOARD
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'dashboard' && (
        <div>
          <FilterBar />

          {/* KPI Cards */}
          <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
            {kpis.map((k,i) => <KpiCard key={i} {...k} />)}
          </div>

          {/* Charts row: line + donut */}
          <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:20, marginBottom:24 }}>
            {/* Line chart — Tăng trưởng */}
            <div style={{ ...S.card, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a' }}>Tăng trưởng khách hàng</div>
                  <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>6 tháng gần đây</div>
                </div>
                <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
                  background:'#dcfce7', color:'#16a34a' }}>
                  Đang tăng
                </span>
              </div>
              {growthChart.length > 0 ? (
                <ResponsiveContainer width='100%' height={220}>
                  <LineChart data={growthChart} margin={{ top:4, right:12, bottom:4, left:0 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f1f5f9'/>
                    <XAxis dataKey='name' tick={{ fontSize:12, fill:'#94a3b8' }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}/>
                    <Line type='monotone' dataKey='KH mới' stroke='#ea580c' strokeWidth={2.5}
                      dot={{ r:4, fill:'#ea580c' }} activeDot={{ r:6 }}/>
                    <Line type='monotone' dataKey='Đơn hàng' stroke='#3b82f6' strokeWidth={2}
                      dot={{ r:3, fill:'#3b82f6' }} strokeDasharray='5 5'/>
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#94a3b8', fontSize:'0.85rem' }}>Chưa có dữ liệu</div>
              )}
            </div>

            {/* Donut chart — Phân loại theo loại hình */}
            <div style={{ ...S.card, padding:20 }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a', marginBottom:16 }}>
                Phân loại theo loại hình
              </div>
              {donutData.some(d=>d.value>0) ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <ResponsiveContainer width='100%' height={180}>
                    <PieChart>
                      <Pie data={donutData} dataKey='value' nameKey='name' cx='50%' cy='50%'
                        innerRadius={50} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                        {donutData.map((_,i) => <Cell key={i} fill={DONUT_COLORS[i]}/>)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e5e7eb' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginTop:4 }}>
                    {donutData.filter(d=>d.value>0).map((d,i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.76rem' }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:DONUT_COLORS[i] }}/>
                        <span style={{ color:'#475569', fontWeight:500 }}>{d.name}</span>
                        <span style={{ fontWeight:700, color:'#0f172a' }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#94a3b8', fontSize:'0.85rem' }}>Chưa có dữ liệu</div>
              )}
            </div>
          </div>

          {/* Row 3: Revenue by region + KH mới/cũ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
            {/* Doanh thu theo khu vực */}
            <div style={{ ...S.card, padding:20 }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a', marginBottom:16 }}>
                Doanh thu theo khu vực
              </div>
              {revenueByRegion.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {revenueByRegion.map((p,i) => (
                    <div key={i}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontSize:'0.82rem', fontWeight:600, color:'#334155' }}>{p.name}</span>
                        <span style={{ fontSize:'0.82rem', fontWeight:700, color:'#16a34a' }}>{fmtMoney(p.rev)}đ</span>
                      </div>
                      <div style={{ height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ width:`${p.pct}%`, height:'100%', background:
                          i===0?'#ea580c':i===1?'#f97316':i===2?'#fb923c':'#fdba74',
                          borderRadius:4, transition:'width 0.4s' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontSize:'0.85rem' }}>
                  Chưa có dữ liệu
                </div>
              )}
            </div>

            {/* KH mới vs KH cũ */}
            <div style={{ ...S.card, padding:20 }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a', marginBottom:16 }}>
                Khách mới vs Khách cũ
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div style={{ background:'#eff6ff', borderRadius:12, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:'0.72rem', color:'#3b82f6', fontWeight:600, marginBottom:6, textTransform:'uppercase' }}>KH Mới</div>
                  <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#1e40af' }}>{fmtNum(newVsReturn.newCusts)}</div>
                  <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:2 }}>khách</div>
                  <div style={{ fontSize:'0.82rem', color:'#475569', marginTop:4 }}>{fmtNum(newVsReturn.newOrders)} đơn</div>
                </div>
                <div style={{ background:'#fff7ed', borderRadius:12, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:'0.72rem', color:'#ea580c', fontWeight:600, marginBottom:6, textTransform:'uppercase' }}>KH Cũ</div>
                  <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#c2410c' }}>{fmtNum(newVsReturn.retCusts)}</div>
                  <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:2 }}>khách</div>
                  <div style={{ fontSize:'0.82rem', color:'#475569', marginTop:4 }}>{fmtNum(newVsReturn.retOrders)} đơn</div>
                </div>
              </div>
              {(newVsReturn.newCusts + newVsReturn.retCusts) > 0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:'flex', height:10, borderRadius:5, overflow:'hidden', background:'#f1f5f9' }}>
                    <div style={{ width:`${Math.round(newVsReturn.newCusts/(newVsReturn.newCusts+newVsReturn.retCusts)*100)}%`,
                      background:'#3b82f6', transition:'width 0.4s' }}/>
                    <div style={{ flex:1, background:'#ea580c', transition:'width 0.4s' }}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:'0.72rem', color:'#64748b' }}>
                    <span>{Math.round(newVsReturn.newCusts/(newVsReturn.newCusts+newVsReturn.retCusts)*100)}% mới</span>
                    <span>{Math.round(newVsReturn.retCusts/(newVsReturn.newCusts+newVsReturn.retCusts)*100)}% cũ</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 4: Data theo loại hình KD */}
          <div style={{ ...S.card, padding:20 }}>
            <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a', marginBottom:16 }}>
              Data theo loại hình kinh doanh
            </div>
            {dataByBizType.length > 0 ? (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['LOẠI HÌNH','SỐ KH','ĐÃ LIÊN HỆ','CHƯA LIÊN HỆ','% LIÊN HỆ'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700,
                          color:'#64748b', fontSize:'0.72rem', letterSpacing:'0.5px',
                          borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataByBizType.map((b,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'10px 14px', fontWeight:700, color:'#0f172a' }}>{b.name}</td>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:'#0f172a' }}>{fmtNum(b.custs)}</td>
                        <td style={{ padding:'10px 14px', fontWeight:700, color:'#16a34a' }}>{fmtNum(b.contacted)}</td>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:'#a16207' }}>{fmtNum(b.notContacted)}</td>
                        <td style={{ padding:'10px 14px', fontWeight:700, color:'#ea580c' }}>{b.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontSize:'0.85rem' }}>
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: KHÁCH HÀNG
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'customers' && (
        <div>
          {/* Search + filter chips */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', flex:'1 1 260px', maxWidth:340 }}>
              <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)',
                fontSize:'0.9rem', color:'#94a3b8' }}>🔍</span>
              <input value={fSearch} onChange={e=>setFSearch(e.target.value)}
                placeholder='Tìm theo tên hoặc SĐT...'
                style={{ ...S.input, paddingLeft:36 }}/>
            </div>

            {/* Business type filter chips */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['','Tất cả'], ...BUSINESS_TYPES.map(b=>[b,b])].map(([k,l]) => (
                <button key={k} onClick={()=>setFBizType(prev => prev===k ? '' : k)} style={{
                  padding:'6px 14px', borderRadius:20, border: fBizType===k ? '2px solid #ea580c' : '1.5px solid #e2e8f0',
                  background: fBizType===k ? '#fff7ed' : '#fff', color: fBizType===k ? '#ea580c' : '#64748b',
                  fontWeight:600, fontSize:'0.75rem', cursor:'pointer', fontFamily:S.font,
                }}>{l}</button>
              ))}
            </div>

            <div style={{ flex:1 }}/>

            <select value={fProvince} onChange={e=>setFProvince(e.target.value)}
              style={{ ...S.select, width:150, padding:'7px 10px' }}>
              <option value=''>Tỉnh/TP</option>
              {provinceOptions.map(p=><option key={p} value={p}>{p}</option>)}
            </select>

            <select value={fPerson} onChange={e=>setFPerson(e.target.value)}
              style={{ ...S.select, width:130, padding:'7px 10px' }}>
              <option value=''>Nhân sự</option>
              {SALES_PERSONS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>

            <select value={fContact} onChange={e=>setFContact(e.target.value)}
              style={{ ...S.select, width:150, padding:'7px 10px' }}>
              <option value=''>Trạng thái LH</option>
              <option value='Đã liên hệ'>Đã liên hệ</option>
              <option value='Chưa liên hệ'>Chưa liên hệ</option>
            </select>

            <button onClick={()=>setShowCustForm(true)} style={S.btnPrimary}>
              + Thêm KH
            </button>
          </div>

          {/* Count */}
          <div style={{ fontSize:'0.82rem', color:'#64748b', marginBottom:10, fontWeight:500 }}>
            Hiển thị <b style={{ color:'#0f172a' }}>{filteredCustomers.length}</b> khách hàng
          </div>

          {/* Customer table */}
          <div style={{ ...S.card, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['KHÁCH HÀNG','TAG','SĐT','TỈNH','LOẠI HÌNH','ĐƠN','TỔNG GMV','LIÊN HỆ','PHỤ TRÁCH'].map(h => (
                      <th key={h} style={{ padding:'11px 14px', textAlign:'left', fontWeight:700,
                        color:'#64748b', fontSize:'0.72rem', letterSpacing:'0.5px',
                        borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.slice(0,100).map((c,i) => (
                    <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9',
                      background: i%2 ? '#fafbfc' : '#fff', transition:'background 0.1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#fafbfc':'#fff'}>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <Avatar name={c.full_name} />
                          <div>
                            <div style={{ fontWeight:700, color:'#0f172a', fontSize:'0.85rem' }}>
                              {c.full_name || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px' }}><TagBadge tag={c.tag}/></td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#475569', fontFamily:'monospace' }}>
                        {c.phone}
                      </td>
                      <td style={{ padding:'10px 14px', color:'#475569', fontSize:'0.8rem' }}>{c.province || '—'}</td>
                      <td style={{ padding:'10px 14px', color:'#475569', fontSize:'0.78rem' }}>{c.business_type || '—'}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#0f172a' }}>
                        {Math.max(c.orderCount, c.order_count||0)}
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#16a34a' }}>
                        {c.gmv > 0 ? fmtMoney(c.gmv)+'đ' : '—'}
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:600,
                          background: c.contact_status === 'Đã liên hệ' ? '#dcfce7' : '#fef9c3',
                          color: c.contact_status === 'Đã liên hệ' ? '#16a34a' : '#a16207',
                        }}>{c.contact_status || '—'}</span>
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:S.primary }}>
                        {c.sales_person || '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                        <div style={{ fontSize:'2rem', marginBottom:8 }}>👥</div>
                        Chưa có khách hàng
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: ĐƠN HÀNG (split layout)
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'orders' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
          {/* LEFT — Order form */}
          <div style={{ ...S.card, padding:24 }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
              Tạo đơn hàng mới
            </h3>

            {/* Customer info */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <FieldLabel label='Tên khách hàng' required/>
                <input value={newOrder.recipient_name}
                  onChange={e=>setNewOrder(p=>({...p,recipient_name:e.target.value}))}
                  placeholder='Nhập tên KH' style={S.input}/>
              </div>
              <div>
                <FieldLabel label='Số điện thoại' required/>
                <div style={{ position:'relative' }}>
                  <input value={newOrder.recipient_phone}
                    onChange={e=>{setNewOrder(p=>({...p,recipient_phone:e.target.value})); lookupPhone(e.target.value);}}
                    placeholder='0xxx xxx xxx' style={S.input}/>
                  {phoneLoading && <span style={{ position:'absolute', right:10, top:'50%',
                    transform:'translateY(-50%)', fontSize:'0.75rem', color:'#94a3b8' }}>⏳</span>}
                </div>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <FieldLabel label='Tỉnh/TP'/>
              <select value={newOrder.recipient_address}
                onChange={e=>setNewOrder(p=>({...p,recipient_address:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn tỉnh/thành</option>
                {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <FieldLabel label='Kênh đặt hàng'/>
              <select value={newOrder.order_source}
                onChange={e=>setNewOrder(p=>({...p,order_source:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn kênh</option>
                {ORDER_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Products */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel label='Sản phẩm'/>
              {newOrder.products.map((p,i) => (
                <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <input value={p.name}
                    onChange={e=>{const ps=[...newOrder.products];ps[i]={...ps[i],name:e.target.value};setNewOrder(o=>({...o,products:ps}));}}
                    placeholder='Tên sản phẩm' style={{ ...S.input, flex:1 }}/>
                  <input type='number' value={p.quantity} min={1}
                    onChange={e=>{const ps=[...newOrder.products];ps[i]={...ps[i],quantity:e.target.value};setNewOrder(o=>({...o,products:ps}));}}
                    style={{ ...S.input, width:60, textAlign:'center' }}/>
                  <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', whiteSpace:'nowrap',
                    fontSize:'0.72rem', fontWeight:600, color: p.is_gift ? '#16a34a' : '#94a3b8',
                    background: p.is_gift ? '#dcfce7' : '#f8fafc', padding:'6px 10px', borderRadius:8,
                    border: p.is_gift ? '1.5px solid #86efac' : '1.5px solid #e2e8f0' }}>
                    <input type='checkbox' checked={!!p.is_gift}
                      onChange={e=>{const ps=[...newOrder.products];ps[i]={...ps[i],is_gift:e.target.checked};setNewOrder(o=>({...o,products:ps}));}}
                      style={{ width:14, height:14, accentColor:'#16a34a' }}/>
                    🎁 Quà
                  </label>
                  <button onClick={()=>{const ps=newOrder.products.filter((_,j)=>j!==i);setNewOrder(o=>({...o,products:ps.length?ps:[{name:'',quantity:1,is_gift:false}]}));}}
                    style={{ width:36, height:36, borderRadius:8, border:'1.5px solid #fca5a5',
                      background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700,
                      fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
              ))}
              <button onClick={()=>setNewOrder(o=>({...o,products:[...o.products,{name:'',quantity:1,is_gift:false}]}))}
                style={{ padding:'6px 14px', borderRadius:8, border:'1.5px dashed #d1d5db',
                  background:'#f8fafc', fontSize:'0.8rem', cursor:'pointer', color:'#64748b',
                  fontFamily:S.font, fontWeight:500 }}>
                + Thêm sản phẩm
              </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <FieldLabel label='Số lượng'/>
                <input value={newOrder.products.reduce((s,p)=>s+Number(p.quantity||0),0)}
                  disabled style={{ ...S.input, background:'#f8fafc', color:'#64748b' }}/>
              </div>
              <div>
                <FieldLabel label='Thanh toán'/>
                <select value={newOrder.payment_method}
                  onChange={e=>setNewOrder(p=>({...p,payment_method:e.target.value}))}
                  style={S.select}>
                  {PAY_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Lưu ý */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel label='Lưu ý'/>
              <div style={{ display:'flex', gap:12, marginBottom:10 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer',
                  padding:'8px 14px', borderRadius:8,
                  border: newOrder.freeship ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                  background: newOrder.freeship ? '#f0fdf4' : '#fff',
                  fontSize:'0.82rem', fontWeight:600, color: newOrder.freeship ? '#16a34a' : '#64748b' }}>
                  <input type='checkbox' checked={!!newOrder.freeship}
                    onChange={e=>setNewOrder(p=>({...p,freeship:e.target.checked}))}
                    style={{ width:16, height:16, accentColor:'#16a34a' }}/>
                  🚚 Freeship
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer',
                  padding:'8px 14px', borderRadius:8,
                  border: newOrder.vat_invoice ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                  background: newOrder.vat_invoice ? '#eff6ff' : '#fff',
                  fontSize:'0.82rem', fontWeight:600, color: newOrder.vat_invoice ? '#2563eb' : '#64748b' }}>
                  <input type='checkbox' checked={!!newOrder.vat_invoice}
                    onChange={e=>setNewOrder(p=>({...p,vat_invoice:e.target.checked}))}
                    style={{ width:16, height:16, accentColor:'#2563eb' }}/>
                  🧾 Xuất hoá đơn VAT
                </label>
              </div>
              <textarea value={newOrder.notes||''} rows={2}
                onChange={e=>setNewOrder(p=>({...p,notes:e.target.value}))}
                placeholder='Ghi chú đơn hàng...'
                style={{ ...S.input, resize:'vertical', minHeight:56 }}/>
            </div>

            {/* Total */}
            <div style={{ marginBottom:18 }}>
              <FieldLabel label='Tổng tiền (đ)'/>
              <input value={newOrder.total_amount}
                onChange={e=>setNewOrder(p=>({...p,total_amount:e.target.value}))}
                placeholder='0' type='number'
                style={{ ...S.input, fontSize:'1.1rem', fontWeight:700, letterSpacing:'-0.3px' }}/>
            </div>

            {/* Nhân sự */}
            <div style={{ marginBottom:18 }}>
              <FieldLabel label='Nhân sự chốt'/>
              <div style={{ display:'flex', gap:8 }}>
                {SALES_PERSONS.map(p => (
                  <button key={p} onClick={()=>setNewOrder(o=>({...o,sales_person:p}))}
                    style={{
                      flex:1, padding:'9px', borderRadius:8, cursor:'pointer', fontWeight:700,
                      fontSize:'0.85rem', fontFamily:S.font, transition:'all 0.15s',
                      border: newOrder.sales_person===p ? `2px solid ${S.primary}` : '1.5px solid #e2e8f0',
                      background: newOrder.sales_person===p ? '#fff7ed' : '#fff',
                      color: newOrder.sales_person===p ? S.primary : '#64748b',
                    }}>{p}</button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setNewOrder(EMPTY_ORDER)}
                style={{ ...S.btnOutline, flex:1 }}>Lưu nháp</button>
              <button onClick={submitOrder} disabled={saving}
                style={{ ...S.btnPrimary, flex:1.5 }}>
                {saving ? '⏳ Đang lưu...' : 'Tạo đơn →'}
              </button>
            </div>
          </div>

          {/* RIGHT — Recent orders */}
          <div>
            {/* Filter chips by order type */}
            <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
              {[['','Tất cả'], ['ĐƠN WEB','Đơn Web'], ['Đơn sỉ','Đơn Sỉ'], ['ZALO SPA','Zalo SPA'],
                ['Đơn quà tặng','Quà tặng'], ['KHÁCH ZALO','Khách Zalo']].map(([k,l]) => (
                <button key={k} onClick={()=>setFOrderType(k)} style={{
                  padding:'5px 12px', borderRadius:20,
                  border: fOrderType===k ? '2px solid #ea580c' : '1.5px solid #e2e8f0',
                  background: fOrderType===k ? '#fff7ed' : '#fff',
                  color: fOrderType===k ? '#ea580c' : '#64748b',
                  fontWeight:600, fontSize:'0.75rem', cursor:'pointer', fontFamily:S.font,
                }}>{l}</button>
              ))}
            </div>

            {(() => {
              const filtered = fOrderType
                ? orders.filter(o => o.order_type === fOrderType)
                : orders;
              const totalRev = filtered.reduce((s,o) => s + Number(o.total_amount||0), 0);

              return (<>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                    Đơn hàng {fOrderType || ''}
                  </h3>
                  <span style={{ fontSize:'0.82rem', color:'#64748b', fontWeight:500 }}>
                    {filtered.length} đơn {totalRev > 0 ? `· ${fmtMoney(totalRev)}đ` : ''}
                  </span>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:'calc(100vh - 300px)',
                  overflowY:'auto', paddingRight:4 }}>
                  {filtered.slice(0,50).map(o => {
                    const status = orderStatusBadge(o);
                    const displayDate = o.order_date || o.created_at?.slice(0,10) || '';
                    return (
                      <div key={o.id} style={{ ...S.card, padding:'14px 18px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontWeight:700, fontSize:'0.82rem', color:'#0891b2', fontFamily:'monospace' }}>
                              {o.order_code || '—'}
                            </span>
                            {o.order_type && (
                              <span style={{ padding:'2px 8px', borderRadius:4, fontSize:'0.68rem',
                                fontWeight:600, background:'#f1f5f9', color:'#475569' }}>
                                {o.order_type}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
                            background:status.bg, color:status.color }}>{status.label}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#0f172a' }}>
                              {o.recipient_name}
                            </div>
                            <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>
                              {o.recipient_phone} {o.recipient_address ? `· ${o.recipient_address}` : ''}
                            </div>
                            {o.product_name && (
                              <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:3 }}>
                                SP: <b>{o.product_name}</b>
                              </div>
                            )}
                            {(o.products||[]).length > 0 && !o.product_name && (
                              <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:3 }}>
                                {o.products.filter(p=>p.name).map(p => `${p.name} ×${p.quantity}`).join(', ')}
                              </div>
                            )}
                            {o.campaign && (
                              <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:2 }}>
                                Nguồn: {o.campaign}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                            <div style={{ fontWeight:800, fontSize:'0.95rem',
                              color: Number(o.total_amount||0) > 0 ? '#16a34a' : '#94a3b8' }}>
                              {Number(o.total_amount||0) > 0
                                ? Number(o.total_amount).toLocaleString('vi-VN')+'đ'
                                : '0đ'}
                            </div>
                            <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:2 }}>
                              {displayDate}
                            </div>
                          </div>
                        </div>
                        {(o.sales_person || o.shipping_code) && (
                          <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f1f5f9',
                            fontSize:'0.78rem', color:'#64748b', display:'flex', justifyContent:'space-between' }}>
                            {o.sales_person && <span>Phụ trách: <b style={{ color:S.primary }}>{o.sales_person}</b></span>}
                            {o.shipping_code && <span style={{ fontFamily:'monospace', fontSize:'0.72rem' }}>MVĐ: {o.shipping_code}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>
                      <div style={{ fontSize:'2rem', marginBottom:8 }}>📋</div>
                      {fOrderType ? `Không có đơn "${fOrderType}"` : 'Chưa có đơn hàng'}
                    </div>
                  )}
                </div>
              </>);
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: NHÓM & OA (split layout)
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'groups' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>

          {/* LEFT — Nhóm khách hàng */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                Nhóm khách hàng
              </h3>
              <button onClick={()=>{ setEditGroupId(null);
                  setNewGroup({ report_date:today(), group_name:'', total_members:'', new_joins:'' });
                  setShowGroupForm(true); }}
                style={{ ...S.btnPrimary, background:'#2563eb', boxShadow:'0 2px 8px rgba(37,99,235,0.25)',
                  padding:'8px 16px', fontSize:'0.82rem' }}>
                + Thêm nhóm
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {(() => {
                // Group by group_name, show latest entry per group
                const nameMap = {};
                groups.forEach(g => {
                  if (!nameMap[g.group_name]) nameMap[g.group_name] = g;
                });
                const uniqueGroups = Object.values(nameMap);

                if (uniqueGroups.length === 0) return (
                  <div style={{ textAlign:'center', padding:48, color:'#94a3b8', ...S.card }}>
                    <div style={{ fontSize:'2rem', marginBottom:8 }}>👥</div>
                    Chưa có nhóm nào
                  </div>
                );

                return uniqueGroups.map((g,i) => {
                  const isZalo = (g.group_name||'').toLowerCase().includes('zalo');
                  const isFb   = (g.group_name||'').toLowerCase().includes('fb') || (g.group_name||'').toLowerCase().includes('facebook');
                  const platform = isZalo ? { icon:'💬', color:'#0068ff', name:'Zalo' }
                    : isFb ? { icon:'📘', color:'#1877f2', name:'Facebook' }
                    : { icon:'👥', color:'#7c3aed', name:'Group' };

                  return (
                    <div key={i} style={{ ...S.card, padding:'16px 20px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                          <div style={{ width:42, height:42, borderRadius:10, display:'flex',
                            alignItems:'center', justifyContent:'center',
                            background:platform.color+'18', fontSize:'1.3rem' }}>
                            {platform.icon}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#0f172a' }}>
                              {g.group_name}
                            </div>
                            <div style={{ fontSize:'0.76rem', color:'#94a3b8', marginTop:2 }}>
                              {platform.name} · Cập nhật {g.report_date}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
                            background:'#dcfce7', color:'#16a34a' }}>Hoạt động</span>
                          <button onClick={()=>openEditGroup(g)} title='Sửa số thành viên'
                            style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8,
                              cursor:'pointer', fontSize:'0.85rem', padding:'3px 8px', lineHeight:1, color:'#475569' }}>
                            ✏️
                          </button>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:20, marginTop:14, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
                        <div>
                          <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:500 }}>THÀNH VIÊN</div>
                          <div style={{ fontWeight:800, fontSize:'1.1rem', color:'#0f172a' }}>
                            {fmtNum(g.total_members)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:500 }}>MỚI THAM GIA</div>
                          <div style={{ fontWeight:800, fontSize:'1.1rem', color:'#16a34a' }}>
                            +{fmtNum(g.new_joins)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* RIGHT — Kênh OA */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                Kênh OA
              </h3>
              <button onClick={()=>setShowOAForm(true)}
                style={{ ...S.btnPrimary, background:'#0891b2', boxShadow:'0 2px 8px rgba(8,145,178,0.25)',
                  padding:'8px 16px', fontSize:'0.82rem' }}>
                + Cập nhật
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {OA_CHANNELS.map(ch => {
                // Use real Zalo OA data for zalo channel
                const latestOA = ch.key === 'zalo' && zaloOA[0];
                const totalFollows = ch.key === 'zalo' ? zaloOA.reduce((s,z) => s + (z.new_follows||0), 0) : 0;
                const msgs30 = ch.key === 'zalo' && latestOA ? (latestOA.menu_interactions||0) : 0;
                const connected = ch.key === 'zalo' ? zaloOA.length > 0 : ch.connected;

                return (
                  <div key={ch.key} style={{ ...S.card, padding:'16px 20px',
                    opacity: connected ? 1 : 0.55 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <div style={{ width:42, height:42, borderRadius:10, display:'flex',
                          alignItems:'center', justifyContent:'center',
                          background:ch.color+'18', fontSize:'1.3rem' }}>
                          {ch.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#0f172a' }}>{ch.name}</div>
                          <div style={{ fontSize:'0.76rem', color:'#94a3b8' }}>
                            {connected ? 'Đã kết nối' : 'Chưa kết nối'}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
                        background: connected ? '#dcfce7' : '#f1f5f9',
                        color: connected ? '#16a34a' : '#94a3b8',
                      }}>
                        {connected ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {connected && (
                      <div style={{ display:'flex', gap:16, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
                        <div style={{ flex:1, textAlign:'center' }}>
                          <div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>THEO DÕI</div>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>
                            {ch.key === 'zalo' ? fmtNum(totalFollows) : '—'}
                          </div>
                        </div>
                        <div style={{ width:1, background:'#f1f5f9' }}/>
                        <div style={{ flex:1, textAlign:'center' }}>
                          <div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>TIN 30D</div>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>
                            {ch.key === 'zalo' ? fmtNum(msgs30) : '—'}
                          </div>
                        </div>
                        <div style={{ width:1, background:'#f1f5f9' }}/>
                        <div style={{ flex:1, textAlign:'center' }}>
                          <div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>PHẢN HỒI %</div>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>
                            {ch.key === 'zalo' && latestOA ? '95%' : '—'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: BLACKLIST
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'blacklist' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                Danh sách Blacklist
              </h3>
              <div style={{ fontSize:'0.82rem', color:'#64748b', marginTop:4 }}>
                {blacklist.length} khách hàng bị chặn
              </div>
            </div>
          </div>

          <div style={{ ...S.card, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                <thead>
                  <tr style={{ background:'#fef2f2' }}>
                    {['#','HỌ TÊN','SĐT','ĐỊA CHỈ','LÝ DO'].map(h => (
                      <th key={h} style={{ padding:'11px 14px', textAlign:'left', fontWeight:700,
                        color:'#991b1b', fontSize:'0.72rem', letterSpacing:'0.5px',
                        borderBottom:'1px solid #fecaca', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blacklist.map((b,i) => (
                    <tr key={b.id} style={{ borderBottom:'1px solid #f1f5f9',
                      background: i%2 ? '#fffbfb' : '#fff' }}>
                      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'0.78rem' }}>{i+1}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', display:'flex',
                            alignItems:'center', justifyContent:'center', flexShrink:0,
                            background:'#fef2f2', color:'#dc2626', fontWeight:700, fontSize:12 }}>
                            {getInitials(b.full_name)}
                          </div>
                          <span style={{ fontWeight:700, color:'#0f172a' }}>{b.full_name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#dc2626', fontFamily:'monospace' }}>
                        {b.phone}
                      </td>
                      <td style={{ padding:'10px 14px', color:'#475569', maxWidth:300 }}>
                        {b.address || '—'}
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem',
                          fontWeight:700, background:'#fef2f2', color:'#dc2626' }}>
                          {b.reason || 'Blacklisted'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {blacklist.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                        <div style={{ fontSize:'2rem', marginBottom:8 }}>🚫</div>
                        Chưa có ai trong blacklist
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         MODAL: Thêm khách hàng
         ════════════════════════════════════════════════════════════════════ */}
      {showCustForm && (
        <Modal onClose={()=>setShowCustForm(false)} title='Thêm khách hàng'>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <FieldLabel label='SĐT' required/>
              <input value={newCust.phone} onChange={e=>setNewCust(p=>({...p,phone:e.target.value}))}
                placeholder='0xxx xxx xxx' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Họ tên'/>
              <input value={newCust.full_name} onChange={e=>setNewCust(p=>({...p,full_name:e.target.value}))}
                placeholder='Nhập họ tên' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Tỉnh/thành'/>
              <select value={newCust.province} onChange={e=>setNewCust(p=>({...p,province:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn tỉnh/thành</option>
                {provinceFormOptions.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel label='Loại hình KD'/>
              <select value={newCust.business_type} onChange={e=>setNewCust(p=>({...p,business_type:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn loại hình</option>
                {BUSINESS_TYPES.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel label='Loại KH'/>
              <select value={newCust.customer_type} onChange={e=>setNewCust(p=>({...p,customer_type:e.target.value}))}
                style={S.select}>
                <option value='Mới'>Mới</option>
                <option value='Cũ'>Cũ</option>
              </select>
            </div>
            <div>
              <FieldLabel label='Nguồn data'/>
              <select value={newCust.data_source} onChange={e=>setNewCust(p=>({...p,data_source:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn nguồn</option>
                {DATA_SOURCES.map(s=>
                  <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel label='Nhân sự phụ trách'/>
              <select value={newCust.sales_person} onChange={e=>setNewCust(p=>({...p,sales_person:e.target.value}))}
                style={S.select}>
                <option value=''>Chọn nhân sự</option>
                {SALES_PERSONS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop:14, marginBottom:14 }}>
            <FieldLabel label='Ghi chú'/>
            <textarea value={newCust.notes||''} rows={2}
              onChange={e=>setNewCust(p=>({...p,notes:e.target.value}))}
              placeholder='Ghi chú thêm...'
              style={{ ...S.input, resize:'vertical', minHeight:56 }}/>
          </div>
          <button onClick={addCustomer} disabled={saving}
            style={{ ...S.btnPrimary, width:'100%', padding:12, fontSize:'0.9rem' }}>
            {saving ? '⏳ Đang lưu...' : 'Lưu khách hàng'}
          </button>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         MODAL: Nhập liệu Group
         ════════════════════════════════════════════════════════════════════ */}
      {showGroupForm && (
        <Modal
          onClose={()=>{ setShowGroupForm(false); setEditGroupId(null);
            setNewGroup({ report_date:today(), group_name:'', total_members:'', new_joins:'' }); }}
          title={editGroupId ? 'Cập nhật số thành viên' : 'Nhập liệu nhóm'}>
          <div style={{ marginBottom:14 }}>
            <FieldLabel label='Ngày báo cáo'/>
            <input type='date' value={newGroup.report_date}
              onChange={e=>setNewGroup(p=>({...p,report_date:e.target.value}))} style={S.input}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <FieldLabel label='Tên group' required/>
            <input value={newGroup.group_name}
              onChange={e=>setNewGroup(p=>({...p,group_name:e.target.value}))}
              placeholder='VD: Zalo Spa VIP' style={S.input}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
            <div>
              <FieldLabel label='Tổng thành viên'/>
              <input type='number' value={newGroup.total_members}
                onChange={e=>setNewGroup(p=>({...p,total_members:e.target.value}))}
                placeholder='0' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Tham gia mới'/>
              <input type='number' value={newGroup.new_joins}
                onChange={e=>setNewGroup(p=>({...p,new_joins:e.target.value}))}
                placeholder='0' style={S.input}/>
            </div>
          </div>
          <button onClick={addGroup} disabled={saving}
            style={{ ...S.btnPrimary, width:'100%', background:'#2563eb', padding:12,
              boxShadow:'0 2px 8px rgba(37,99,235,0.25)', fontSize:'0.9rem' }}>
            {saving ? '⏳ Đang lưu...' : (editGroupId ? 'Cập nhật nhóm' : 'Lưu dữ liệu nhóm')}
          </button>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         MODAL: Nhập liệu Zalo OA
         ════════════════════════════════════════════════════════════════════ */}
      {showOAForm && (
        <Modal onClose={()=>setShowOAForm(false)} title='Cập nhật kênh OA'>
          <div style={{ marginBottom:14 }}>
            <FieldLabel label='Ngày báo cáo'/>
            <input type='date' value={newOA.report_date}
              onChange={e=>setNewOA(p=>({...p,report_date:e.target.value}))} style={S.input}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:18 }}>
            <div>
              <FieldLabel label='Lượt quét OA'/>
              <input type='number' value={newOA.oa_scans}
                onChange={e=>setNewOA(p=>({...p,oa_scans:e.target.value}))}
                placeholder='0' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Follow mới'/>
              <input type='number' value={newOA.new_follows}
                onChange={e=>setNewOA(p=>({...p,new_follows:e.target.value}))}
                placeholder='0' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Tương tác menu'/>
              <input type='number' value={newOA.menu_interactions}
                onChange={e=>setNewOA(p=>({...p,menu_interactions:e.target.value}))}
                placeholder='0' style={S.input}/>
            </div>
          </div>
          <button onClick={addOA} disabled={saving}
            style={{ ...S.btnPrimary, width:'100%', background:'#0891b2', padding:12,
              boxShadow:'0 2px 8px rgba(8,145,178,0.25)', fontSize:'0.9rem' }}>
            {saving ? '⏳ Đang lưu...' : 'Lưu dữ liệu OA'}
          </button>
        </Modal>
      )}

    </div>
  );
};

export default CrmTab;
