// src/components/CrmTab.jsx — Redesigned to match Claude Design mockups
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import CrmPricingTab from './CrmPricingTab';   // Module 4: chính sách giá + material
import CrmCareTab from './CrmCareTab';         // Module 5: quy trình chăm sóc

/* ── Bulk Excel import: parse a (messy) exported sheet → customer rows ──────────
   Tìm dòng tiêu đề (chứa SĐT/TÊN) rồi map cột theo tên (bỏ dấu, không phân biệt hoa thường). */
const _norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const parseCustomerSheet = (rows2d) => {
  let h = -1;
  for (let i = 0; i < Math.min(rows2d.length, 20); i++) {
    const cells = (rows2d[i] || []).map(_norm);
    const hasPhone = cells.some(c => c.includes('sdt') || c.includes('so dien thoai') || c.includes('dien thoai') || c === 'phone');
    const hasName  = cells.some(c => c === 'ten' || c.includes('ho ten') || c.includes('ten kh') || c.includes('ten spa') || c.includes('ten khach'));
    if (hasPhone || hasName) { h = i; break; }
  }
  if (h === -1) return { headerRow: -1, customers: [] };
  const header = (rows2d[h] || []).map(_norm);
  const findIdx = (pred) => header.findIndex(pred);
  const has = (...keys) => (c) => keys.some(k => c.includes(k));
  const idx = {
    phone:   findIdx(has('sdt', 'so dien thoai', 'dien thoai', 'phone')),
    name:    findIdx(c => c === 'ten' || c.includes('ho ten') || c.includes('ten kh') || c.includes('ten spa') || c.includes('ten khach') || c === 'name'),
    province:findIdx(has('tinh', 'province')),
    biz:     findIdx(has('loai hinh', 'lhkd')),
    address: findIdx(has('dia chi', 'address')),
    region:  findIdx(has('khu vuc')),
    contact: findIdx(c => c === 'dlh' || c.includes('lien he')),
    email:   findIdx(has('email', 'mail')),
  };
  const cleanPhone = (v) => String(v ?? '').replace(/[^\d]/g, '');
  const customers = [];
  for (let i = h + 1; i < rows2d.length; i++) {
    const r = rows2d[i]; if (!r) continue;
    const phone = cleanPhone(idx.phone >= 0 ? r[idx.phone] : '');
    if (phone.length < 8 || phone.length > 12) continue;
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
    customers.push({
      phone, full_name: get('name'), province: get('province'), business_type: get('biz'),
      address: get('address'), region: get('region'), email: get('email'), _contact: get('contact'),
    });
  }
  return { headerRow: h, customers };
};

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */
const SALES_PERSONS = ['HUỆ', 'KỲ ANH', 'HẠNH'];
// Phân loại tệp — brief yêu cầu: spa, minimart, cosmetic, khách lẻ, công ty, nhà thuốc.
// GIỮ nguyên các giá trị cũ đang có trong data (SPA - CLINIC / GỘI ĐẦU DƯỠNG SINH / WAXING) rồi THÊM 3 tệp brief còn thiếu,
// nếu thay hẳn thì 3038 KH cũ mất phân loại.
const BUSINESS_TYPES = ['SPA - CLINIC', 'GỘI ĐẦU DƯỠNG SINH', 'MINI MART', 'WAXING/TRIỆT', 'CÔNG TY', 'COSMETIC', 'NHÀ THUỐC', 'KHÁCH LẺ'];
// Loại hình bị ẩn khỏi dashboard/charts (data rác, ít record)
const HIDDEN_BIZ_TYPES = ['Sỉ Oil eHerb'];
const DATA_SOURCES = ['Zalo SPA', 'TT MILA', 'TT MOAW', 'Tiktok eHerb', 'Shopee MP', 'TT eHERB'];
// Nguồn khách — brief: Zalo Sỉ, Website, Khách sàn, Zalo group (4 nguồn đầu). Các nguồn sau là của data cũ, giữ lại.
const ORDER_SOURCES = ['Zalo Sỉ', 'Website', 'Khách sàn', 'Zalo Group', 'Zalo OA', 'CRM', 'FB Ads', 'Google Ads', 'SMS', 'Đơn Bán Lẻ', 'Quà tặng'];
const PAY_METHODS   = ['COD', 'Chuyển khoản'];
// Module 6 — Blacklist (theo brief)
const BL_REASONS  = ['Không liên hệ được', 'Sai địa chỉ', 'Đổi ý', 'Sản phẩm lỗi', 'Khác'];
const BL_STATUSES = ['Blacklist', 'Xem xét', 'Loại bỏ'];
const BL_STATUS_STYLE = {
  'Blacklist': { bg:'#fef2f2', color:'#dc2626' },
  'Xem xét':   { bg:'#fff7ed', color:'#ea580c' },
  'Loại bỏ':   { bg:'#f1f5f9', color:'#64748b' },
};
const BL_REASON_COLORS = ['#ef4444', '#3b82f6', '#a855f7', '#f59e0b', '#94a3b8'];
const EMPTY_BL = {
  nhanh_id:'', order_date:'', full_name:'', phone:'', source:'', product_name:'',
  total_amount:'', reason:'Không liên hệ được', shipping_code:'', status:'Blacklist',
  sales_person:'', address:'',
};
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
  loyal:    { label:'Khách thân', bg:'#fff7ed', color:'#ff6a2c' },
  regular:  { label:'Thường',     bg:'#eff6ff', color:'#2563eb' },
  new:      { label:'KH mới',    bg:'#fefce8', color:'#ca8a04' },
  inactive: { label:'Không HĐ',  bg:'#f1f5f9', color:'#64748b' },
};
const DONUT_COLORS = ['#dc2626','#ff6a2c','#2563eb','#ca8a04','#94a3b8'];
const OA_CHANNELS = [
  { key:'zalo',     name:'Zalo OA',  icon:'💬', color:'#0068ff', connected:true },
  { key:'facebook', name:'Facebook', icon:'📘', color:'#1877f2', connected:true },
  { key:'tiktok',   name:'TikTok',   icon:'🎵', color:'#010101', connected:true },
  { key:'telegram', name:'Telegram', icon:'✈️', color:'#0088cc', connected:false },
];
const AVATAR_COLORS = ['#ff6a2c','#2563eb','#16a34a','#7c3aed','#dc2626','#0891b2','#d97706','#ec4899'];

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
  primary: '#ff6a2c',
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
    padding:'10px 20px', borderRadius:10, border:'none', background:'#ff6a2c', color:'#fff',
    fontWeight:600, fontSize:'0.88rem', cursor:'pointer', boxShadow:'0 2px 8px rgba(255,106,44,0.25)',
  },
  btnOutline: {
    padding:'9px 16px', borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff',
    color:'#64748b', fontWeight:600, fontSize:'0.85rem', cursor:'pointer',
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   CrmTab Component
   ═══════════════════════════════════════════════════════════════════════════ */
const CrmTab = ({ currentUser } = {}) => {
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
  const [fCustType, setFCustType] = useState('');   // Dashboard: phân loại KH (Mới/Mua lại/VIP)
  const [fProduct,  setFProduct]  = useState('');   // Dashboard: phân loại sản phẩm
  const [fPerson,   setFPerson]   = useState('');
  const [fBizType,  setFBizType]  = useState('');
  const [fSearch,   setFSearch]   = useState('');
  const [fOrderType, setFOrderType] = useState('');
  const [fOrderMonth, setFOrderMonth] = useState('');
  const [fOrderBiz,   setFOrderBiz]   = useState('');
  const [fContact,  setFContact]  = useState('');   // '', 'Đã liên hệ', 'Chưa liên hệ'
  /* ── Module 2: phân loại KH theo brief + phân trang + chi tiết KH ── */
  const [fBriefTag,  setFBriefTag]  = useState(''); // '', 'Mới', 'Mua lại', 'VIP'
  const [custPage,   setCustPage]   = useState(1);
  const [detailCust, setDetailCust] = useState(null);  // KH đang mở chi tiết (null = đóng)
  const CUST_PER_PAGE = 25;
  /* ── Module 3: bảng đơn (theo mockup) — form tạo đơn thu gọn + lọc + phân trang ── */
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [fOrdSource, setFOrdSource] = useState('');
  const [fOrdPerson, setFOrdPerson] = useState('');
  const [fOrdSearch, setFOrdSearch] = useState('');
  const [ordPage,    setOrdPage]    = useState(1);
  const ORD_PER_PAGE = 15;

  /* ── Forms ──────────────────────────────────────────────────────────── */
  const [blacklist, setBlacklist] = useState([]);
  /* ── Module 6: Blacklist — bộ lọc + form ── */
  const [fBlReason, setFBlReason] = useState('');
  const [fBlStatus, setFBlStatus] = useState('');
  const [fBlPerson, setFBlPerson] = useState('');
  const [fBlSearch, setFBlSearch] = useState('');
  const [blDays,    setBlDays]    = useState(0);      // 0 = tất cả · 7 · 15 · 30 ngày
  const [editBl,    setEditBl]    = useState(null);   // bản ghi đang thêm/sửa (null = đóng)
  const [showCustForm, setShowCustForm] = useState(false);
  const [showGroupForm,setShowGroupForm]= useState(false);
  const [showOAForm,   setShowOAForm]   = useState(false);
  const [newCust,   setNewCust]   = useState(EMPTY_CUSTOMER);
  // Bulk Excel import modal
  const [showImport, setShowImport] = useState(false);
  const [impFile,    setImpFile]    = useState('');
  const [impRows,    setImpRows]    = useState([]);
  const [impPerson,  setImpPerson]  = useState('');
  const [impType,    setImpType]    = useState('Mới');
  const [importing,  setImporting]  = useState(false);
  const [impMsg,     setImpMsg]     = useState('');
  const [newOrder,  setNewOrder]  = useState(EMPTY_ORDER);
  const [newGroup,  setNewGroup]  = useState({ report_date:today(), group_name:'', total_members:'', new_joins:'' });
  const [editOrigMembers, setEditOrigMembers] = useState(0); // số TV cũ khi mở sửa nhóm → tính "mới tham gia"
  const [editGroupId, setEditGroupId] = useState(null);   // id của group đang sửa (null = thêm mới)
  const [newOA,     setNewOA]     = useState({ report_date:today(), oa_name:'Zalo OA', total_follows:'', oa_scans:'', new_follows:'', menu_interactions:'' });
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

  /* ══ Module 6: Blacklist — lọc + thống kê + CRUD ════════════════════ */
  const blDateOf = (b) => b.order_date || (b.created_at || '').slice(0, 10) || '';
  const blFiltered = useMemo(() => {
    const s = fBlSearch.trim().toLowerCase();
    const cutoff = blDays ? new Date(Date.now() - blDays * 86400000).toISOString().slice(0, 10) : '';
    return blacklist.filter(b => {
      if (fBlReason && (b.reason || '') !== fBlReason) return false;
      if (fBlStatus && (b.status || 'Blacklist') !== fBlStatus) return false;
      if (fBlPerson && (b.sales_person || '') !== fBlPerson) return false;
      if (cutoff && blDateOf(b) < cutoff) return false;
      if (s) {
        const hay = `${b.full_name || ''} ${b.phone || ''} ${b.nhanh_id || ''} ${b.product_name || ''} ${b.shipping_code || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [blacklist, fBlReason, fBlStatus, fBlPerson, fBlSearch, blDays]);

  // Thống kê cuối bảng — theo đúng bộ lọc đang xem (7/15/30 ngày hoặc tất cả)
  const blStats = useMemo(() => {
    const rows = blFiltered;
    const byStatus = {}; BL_STATUSES.forEach(s => { byStatus[s] = 0; });
    const byReason = {};
    let refundAmount = 0;
    rows.forEach(b => {
      const st = b.status || 'Blacklist';
      byStatus[st] = (byStatus[st] || 0) + 1;
      const rs = b.reason || 'Khác';
      byReason[rs] = (byReason[rs] || 0) + 1;
      refundAmount += Number(b.total_amount || 0);
    });
    const phones = new Set(rows.map(b => b.phone).filter(Boolean));
    const reasonList = Object.entries(byReason)
      .map(([name, value]) => ({ name, value, pct: rows.length ? Math.round(value / rows.length * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
    return { total: rows.length, customers: phones.size, byStatus, reasonList, refundAmount };
  }, [blFiltered]);

  const saveBl = async () => {
    const b = editBl; if (!b) return;
    if (!(b.phone || '').trim()) { alert('Cần nhập Số điện thoại'); return; }
    setSaving(true);
    const payload = {
      nhanh_id: b.nhanh_id || null, order_date: b.order_date || null,
      full_name: b.full_name || null, phone: String(b.phone).replace(/[^\d]/g, ''),
      source: b.source || null, product_name: b.product_name || null,
      total_amount: b.total_amount === '' || b.total_amount == null ? null : Number(String(b.total_amount).replace(/[^\d]/g, '')),
      reason: b.reason || null, shipping_code: b.shipping_code || null,
      status: b.status || 'Blacklist', sales_person: b.sales_person || null,
      address: b.address || null, updated_at: new Date().toISOString(),
    };
    const { error } = b.id
      ? await supabase.from('crm_blacklist').update(payload).eq('id', b.id)
      : await supabase.from('crm_blacklist').insert(payload);
    setSaving(false);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setEditBl(null); fetchAll();
  };
  const delBl = async (b) => {
    if (!confirm(`Xoá "${b.full_name || b.phone}" khỏi danh sách blacklist?`)) return;
    await supabase.from('crm_blacklist').delete().eq('id', b.id);
    fetchAll();
  };
  // Đổi nhanh trạng thái ngay trên bảng (Blacklist → Xem xét → Loại bỏ)
  const setBlStatus = async (b, status) => {
    setBlacklist(list => list.map(x => x.id === b.id ? { ...x, status } : x));   // cập nhật ngay trên UI
    const { error } = await supabase.from('crm_blacklist')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', b.id);
    if (error) { alert('Lỗi đổi trạng thái: ' + error.message); fetchAll(); }
  };

  /* ══ Module 3: thao tác trên đơn (duyệt · mã vận đơn · tình trạng giao) ══ */
  const patchOrder = async (o, patch) => {
    setOrders(list => list.map(x => x.id === o.id ? { ...x, ...patch } : x));   // cập nhật ngay trên UI
    const { error } = await supabase.from('crm_orders').update(patch).eq('id', o.id);
    if (error) { alert('Lỗi lưu: ' + error.message); fetchAll(); }
  };
  // Kế toán tích duyệt đơn → ghi lại ai duyệt + lúc nào
  const toggleApprove = (o) => patchOrder(o, o.is_approved
    ? { is_approved: false, approved_by: null, approved_at: null }
    : { is_approved: true, approved_by: currentUser?.name || currentUser?.username || 'admin', approved_at: new Date().toISOString() });
  const toggleInvoice = (o) => patchOrder(o, { has_invoice: !o.has_invoice });
  const setOrderStatus = (o, status) => patchOrder(o, { status });
  // Sale bấm cây bút để điền mã vận đơn (admin kho đẩy đơn xong mới có mã)
  const editShipping = (o) => {
    const v = prompt(`Mã vận đơn cho đơn ${o.order_code || o.id}:`, o.shipping_code || '');
    if (v === null) return;
    patchOrder(o, { shipping_code: v.trim() });
  };

  /* ── Enriched customers (with tags + order stats) ───────────────────── */
  const enriched = useMemo(() => {
    // Gom đơn theo SĐT 1 lần (thay vì filter lồng 3038×1666 ≈ 5 triệu phép so sánh mỗi lần render)
    const byPhone = new Map();
    orders.forEach(o => {
      const p = o.recipient_phone; if (!p) return;
      const arr = byPhone.get(p); if (arr) arr.push(o); else byPhone.set(p, [o]);
    });
    return customers.map(c => {
      const co = byPhone.get(c.phone) || [];
      const gmv = co.reduce((s,o) => s + Number(o.total_amount||0), 0);
      // orders đã sort order_date DESC → phần tử đầu là đơn gần nhất
      const lastOrder = co.length ? (co[0].order_date || co[0].created_at?.slice(0,10) || null) : null;
      const cnt = Math.max(co.length, Number(c.order_count) || 0);
      // Phân loại KH theo BRIEF: VIP = trên 5 đơn HOẶC tổng chi tiêu trên 10 triệu; ≥2 đơn = Mua lại; còn lại = Mới
      const briefTag = (cnt > 5 || gmv > 10_000_000) ? 'VIP' : (cnt >= 2 ? 'Mua lại' : 'Mới');
      // "Khách quen" — brief: sale điền lặp SĐT thì tự gắn tag
      const isRegular = cnt >= 2;
      // Sản phẩm đã mua (rút gọn) — ưu tiên products(json), fallback product_name
      const prodSet = new Set();
      co.forEach(o => {
        (Array.isArray(o.products) ? o.products : []).forEach(p => { if (p?.name) prodSet.add(String(p.name).trim()); });
        if (o.product_name) prodSet.add(String(o.product_name).trim());
      });
      return { ...c, tag: classifyCustomer(c, co), briefTag, isRegular,
               orderCount: co.length, orderCountEff: cnt, gmv, lastOrder,
               myOrders: co, products: [...prodSet] };
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
      if (fBriefTag && c.briefTag !== fBriefTag) return false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        if (!(c.full_name||'').toLowerCase().includes(q) && !(c.phone||'').includes(q)) return false;
      }
      return true;
    });
  }, [enriched, fProvince, fBizType, fPerson, fContact, fBriefTag, fSearch]);
  // Về trang 1 khi đổi bộ lọc (tránh đứng ở trang trống)
  useEffect(() => { setCustPage(1); }, [fProvince, fBizType, fPerson, fContact, fBriefTag, fSearch]);
  const custTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUST_PER_PAGE));
  const custPageC = Math.min(custPage, custTotalPages);
  const pagedCustomers = filteredCustomers.slice((custPageC - 1) * CUST_PER_PAGE, custPageC * CUST_PER_PAGE);

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

  /* ── Bộ lọc "Phân loại sản phẩm" (brief M1) — options lấy từ đơn thật ── */
  const productOptions = useMemo(() => {
    const s = new Set();
    orders.forEach(o => {
      (Array.isArray(o.products) ? o.products : []).forEach(p => { if (p?.name) s.add(String(p.name).trim()); });
      if (o.product_name) s.add(String(o.product_name).trim());
    });
    return [...s].filter(Boolean).sort();
  }, [orders]);
  // SĐT của nhóm KH đang lọc (Mới/Mua lại/VIP) → dùng chung cho KPI, biểu đồ ngày và Top SP
  // để mọi con số trên Dashboard cùng theo 1 bộ lọc (tránh KPI 1 đơn mà Top SP vẫn 5 sản phẩm).
  const custTypePhones = useMemo(() => {
    if (!fCustType) return null;
    return new Set(enriched.filter(c => c.briefTag === fCustType).map(c => c.phone).filter(Boolean));
  }, [enriched, fCustType]);

  const orderHasProduct = useCallback((o, name) => {
    if (!name) return true;
    const ps = Array.isArray(o.products) ? o.products : [];
    if (ps.some(p => String(p?.name || '').trim() === name)) return true;
    return String(o.product_name || '').trim() === name;
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      if (fDateFrom && d < fDateFrom) return false;
      if (fDateTo   && d > fDateTo) return false;
      if (fPerson   && o.sales_person !== fPerson) return false;
      return true;
    });
  }, [orders, fDateFrom, fDateTo, fPerson]);

  /* ── Derived: tháng có đơn, SĐT→loại hình KD, tổng thành viên nhóm ─── */
  const orderMonths = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { const m = (o.order_date || o.created_at?.slice(0,10) || '').slice(0,7); if (m) set.add(m); });
    return [...set].sort().reverse();
  }, [orders]);
  const custBizByPhone = useMemo(() => {
    const m = new Map();
    enriched.forEach(c => { if (c.phone) m.set(c.phone, c.business_type); });
    return m;
  }, [enriched]);
  // Nhân sự phụ trách của ĐƠN: crm_orders.sales_person đang trống toàn bộ (data import) →
  // lấy theo NS đang quản lý KHÁCH đó (khớp SĐT) để cột "Nhân sự phụ trách" có dữ liệu thật.
  const custPersonByPhone = useMemo(() => {
    const m = new Map();
    customers.forEach(c => { if (c.phone && c.sales_person) m.set(c.phone, c.sales_person); });
    return m;
  }, [customers]);
  // Thứ tự ưu tiên: cột sales_person của đơn → tên NS nhúng trong nguồn ("Zalo Sỉ Kỳ Anh") → NS quản lý khách.
  const orderPerson = useCallback((o) => {
    if (o.sales_person) return o.sales_person;
    const src = (o.order_source || '').toUpperCase();
    for (const p of SALES_PERSONS) if (src.includes(p)) return p;   // HUỆ / KỲ ANH / HẠNH
    return custPersonByPhone.get(o.recipient_phone) || '';
  }, [custPersonByPhone]);
  const groupSummary = useMemo(() => {
    const nm = {};
    groups.forEach(g => { if (!nm[g.group_name]) nm[g.group_name] = g; });
    const arr = Object.values(nm);
    return {
      count:   arr.length,
      members: arr.reduce((s,g)=>s+(Number(g.total_members)||0),0),
      joins:   arr.reduce((s,g)=>s+(Number(g.new_joins)||0),0),
    };
  }, [groups]);

  // Chỉ số theo NGÀY: doanh thu + số đơn (order_date thật), theo bộ lọc ngày/nhân sự/loại hình.
  const dailyChart = useMemo(() => {
    const hasDate = !!(fDateFrom || fDateTo);
    const curStart = fDateFrom || '0000-01-01';
    const curEnd   = fDateTo   || '9999-12-31';
    const map = {};
    orders.forEach(o => {
      if (fPerson && o.sales_person !== fPerson) return;
      if (fBizType && (custBizByPhone.get(o.recipient_phone) || '') !== fBizType) return;
      if (fProduct && !orderHasProduct(o, fProduct)) return;
      if (custTypePhones && !custTypePhones.has(o.recipient_phone)) return;
      if (Number(o.total_amount||0) <= 0) return;
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      if (!d || d < curStart || d > curEnd) return;
      if (!map[d]) map[d] = { date: d, rev: 0, count: 0, qty: 0 };
      map[d].rev += Number(o.total_amount||0);
      map[d].count += 1;
      // Sản phẩm bán ra trong ngày (brief: tooltip hiện 3 dòng doanh thu/số đơn/SP bán ra)
      (Array.isArray(o.products) ? o.products : []).forEach(p => { map[d].qty += Number(p?.quantity || 0); });
    });
    let arr = Object.values(map).sort((a,b) => a.date.localeCompare(b.date));
    if (!hasDate && arr.length > 45) arr = arr.slice(-45); // không lọc ngày → 45 ngày gần nhất cho dễ đọc
    return arr;
  }, [orders, fPerson, fBizType, fProduct, fDateFrom, fDateTo, custBizByPhone, orderHasProduct, custTypePhones]);

  // Nhiều Zalo OA: gom theo oa_name, lấy bản ghi mới nhất mỗi OA (zaloOA đã sort report_date desc)
  const zaloOAList = useMemo(() => {
    const byName = {};
    zaloOA.forEach(z => {
      const name = (z.oa_name || 'Zalo OA').toString().trim() || 'Zalo OA';
      (byName[name] = byName[name] || []).push(z);
    });
    return Object.entries(byName).map(([name, rows]) => {
      const latest = rows[0] || {};
      const follows = Number(latest.total_follows) || rows.reduce((s,z)=>s+(Number(z.new_follows)||0),0);
      return { name, follows, msgs30: Number(latest.menu_interactions)||0, report_date: latest.report_date };
    });
  }, [zaloOA]);

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
      if (fCustType && c.briefTag !== fCustType) return false;   // phân loại KH: Mới / Mua lại / VIP
      return true;
    });
    // Apply non-date filters to orders
    // Lọc "phân loại KH" áp cho cả đơn: chỉ giữ đơn của nhóm KH đang chọn (khớp theo SĐT)
    const phoneSet = fCustType ? new Set(fc.map(c => c.phone).filter(Boolean)) : null;
    const fo = orders.filter(o => {
      if (fPerson && o.sales_person !== fPerson) return false;
      if (phoneSet && !phoneSet.has(o.recipient_phone)) return false;
      if (fProduct && !orderHasProduct(o, fProduct)) return false;   // phân loại sản phẩm
      return true;
    });

    const totalCust   = fc.length;
    // KH Mới = phân loại customer_type='Mới' (theo bộ lọc tỉnh/nhân sự/loại hình).
    // KHÔNG đếm theo created_date: ngày tạo là ngày import data (có cả ngày tương lai 12/2026)
    // nên không phản ánh "khách mới" thật → trước đây ra 726 + ▲12000% + lọc tỉnh ra 0.
    const newCustCur  = fc.filter(c => c.customer_type === 'Mới').length;

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

    /* ── Bổ sung theo brief Module 1 ─────────────────────────────────── */
    // Tổng sản phẩm bán ra: cộng số lượng trong products (json) của đơn trong kỳ.
    // Data import cũ KHÔNG có số lượng → trả null để UI hiện "chưa có dữ liệu" thay vì số 0 sai.
    let qty = 0, qtyKnown = false;
    ordersCur.forEach(o => {
      const ps = Array.isArray(o.products) ? o.products : [];
      ps.forEach(p => { const q = Number(p?.quantity || 0); if (q > 0) { qty += q; qtyKnown = true; } });
    });

    // Tỷ lệ mua lại lần 2 = KH có từ 2 đơn trở lên / KH đã từng mua.
    const cntByPhone = {};
    ordersCur.forEach(o => { const p = o.recipient_phone; if (p) cntByPhone[p] = (cntByPhone[p]||0)+1; });
    const buyers  = Object.keys(cntByPhone).length;
    const repeat2 = Object.values(cntByPhone).filter(n => n >= 2).length;
    const repeatRate = buyers > 0 ? (repeat2 / buyers * 100) : 0;

    // Tỷ lệ chuyển đổi khách SÀN → CRM = KH nguồn sàn đã phát sinh đơn / tổng KH nguồn sàn.
    const isSan = (s) => /^(tt |tiktok|shopee|lazada)/i.test(String(s || '').trim());
    const sanCusts = fc.filter(c => isSan(c.data_source));
    const sanConverted = sanCusts.filter(c => (c.orderCount || 0) > 0 || (c.order_count || 0) > 0).length;
    const sanRate = sanCusts.length > 0 ? (sanConverted / sanCusts.length * 100) : 0;

    return [
      { label:'GMV',                   value: fmtMoney(revCur),         raw: revCur,           trend: showTrend ? pctChange(revCur, revPrev) : 0 },
      { label:'AOV',                   value: fmtMoneyK(aovCur),        raw: aovCur,           trend: showTrend ? pctChange(aovCur, aovPrev) : 0 },
      { label:'Tổng đơn hàng',         value: fmtNum(ordersCur.length), raw: ordersCur.length, trend: showTrend ? pctChange(ordersCur.length, ordersPrev.length) : 0 },
      { label:'Tổng SP bán ra',        value: qtyKnown ? fmtNum(qty) : '—', raw: qty,          trend: 0,
        hint: qtyKnown ? 'Cộng số lượng trong đơn' : 'Đơn chưa có dữ liệu số lượng sản phẩm' },
      { label:'Tổng KH đã lên đơn',    value: fmtNum(buyers),           raw: buyers,           trend: 0,
        hint:`Khách KHÔNG TRÙNG LẶP có phát sinh đơn trong kỳ (không phải tổng số đơn). Toàn bộ danh sách KH: ${fmtNum(totalCust)}` },
      { label:'Tỷ lệ mua lại lần 2',   value:`${repeatRate.toFixed(1)}%`, raw: repeatRate,     trend: 0, hint:`${repeat2}/${buyers} khách mua từ 2 đơn` },
      { label:'Chuyển đổi sàn → CRM',  value:`${sanRate.toFixed(1)}%`,  raw: sanRate,          trend: 0, hint:`${sanConverted}/${sanCusts.length} khách nguồn sàn đã mua` },
      { label:'KH Mới',                value: fmtNum(newCustCur),       raw: newCustCur,       trend: 0 },
      { label:'Đã liên hệ',            value: fmtNum(contactedCust),    raw: contactedCust,    trend: 0, hint:`Tỷ lệ chốt đơn/đã LH: ${convRate.toFixed(1)}%` },
    ];
  }, [enriched, orders, fDateFrom, fDateTo, fProvince, fBizType, fPerson, fCustType, fProduct, orderHasProduct]);

  /* ── Top sản phẩm bán chạy (brief Module 1) ──────────────────────── */
  // Nguồn: products (json, có số lượng) → fallback product_name (chỉ đếm đơn + doanh thu).
  const topProducts = useMemo(() => {
    const curStart = fDateFrom || '0000-01-01';
    const curEnd   = fDateTo   || '9999-12-31';
    const map = {};
    let hasQty = false;
    orders.forEach(o => {
      if (fPerson && o.sales_person !== fPerson) return;
      if (fProduct && !orderHasProduct(o, fProduct)) return;
      if (custTypePhones && !custTypePhones.has(o.recipient_phone)) return;
      if (Number(o.total_amount||0) <= 0) return;
      const d = o.order_date || o.created_at?.slice(0,10) || '';
      if (d < curStart || d > curEnd) return;
      const ps = Array.isArray(o.products) ? o.products.filter(p => p?.name) : [];
      if (ps.length) {
        ps.forEach(p => {
          const n = String(p.name).trim(); if (!n) return;
          const q = Number(p.quantity || 0); if (q > 0) hasQty = true;
          if (!map[n]) map[n] = { name:n, qty:0, orders:0, rev:0 };
          map[n].qty += q; map[n].orders += 1;
          map[n].rev += Number(o.total_amount||0) / ps.length;   // chia đều doanh thu đơn cho các SP trong đơn
        });
      } else if (o.product_name) {
        const n = String(o.product_name).trim();
        if (!map[n]) map[n] = { name:n, qty:0, orders:0, rev:0 };
        map[n].orders += 1; map[n].rev += Number(o.total_amount||0);
      }
    });
    const list = Object.values(map).sort((a,b) => b.rev - a.rev);
    const totalRev = list.reduce((s,x) => s + x.rev, 0) || 1;
    return { list: list.slice(0,10).map(x => ({ ...x, pct: Math.round(x.rev/totalRev*100) })), hasQty, count: list.length };
  }, [orders, fDateFrom, fDateTo, fPerson, fProduct, orderHasProduct, custTypePhones]);

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

  /* ── Bulk Excel import ──────────────────────────────────────────────── */
  const onPickImportFile = async (file) => {
    if (!file) return;
    setImpFile(file.name); setImpMsg('Đang đọc file…'); setImpRows([]);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      const { headerRow, customers } = parseCustomerSheet(rows2d);
      if (headerRow === -1) { setImpMsg('⚠️ Không thấy dòng tiêu đề có cột SĐT/TÊN. Kiểm tra lại file.'); return; }
      setImpRows(customers);
      setImpMsg(`Đọc được ${customers.length} dòng có SĐT hợp lệ (sheet "${wb.SheetNames[0]}").`);
    } catch (e) { setImpMsg('⚠️ Lỗi đọc file: ' + e.message); }
  };

  const runImport = async () => {
    if (!impRows.length || importing) return;
    setImporting(true); setImpMsg('Đang nhập vào CRM…');
    const byPhone = new Map(); // dedupe trong file theo SĐT
    for (const c of impRows) {
      const rec = { phone: c.phone, customer_type: impType, data_source: 'Import Excel' };
      if (c.full_name)     rec.full_name = c.full_name;
      if (c.province)      rec.province = c.province;
      if (c.business_type) rec.business_type = c.business_type;
      if (c.address)       rec.address = c.address;
      if (c.region)        rec.region = c.region;
      if (c.email)         rec.email = c.email;
      if (impPerson)       rec.sales_person = impPerson;
      if (c._contact !== '') {
        const cv = _norm(c._contact);
        rec.contact_status = (cv === 'true' || cv === 'x' || cv === '1' || cv.includes('v') || cv.includes('da lien'))
          ? 'Đã liên hệ' : 'Chưa liên hệ';
      }
      byPhone.set(c.phone, rec);
    }
    const records = [...byPhone.values()];
    let ok = 0, fail = 0;
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await supabase.from('crm_customers').upsert(records.slice(i, i + 500), { onConflict: 'phone' });
      if (error) fail += Math.min(500, records.length - i); else ok += Math.min(500, records.length - i);
    }
    setImporting(false);
    setImpMsg(`✅ Xong! Đã nhập/cập nhật ${ok} khách${fail ? `, lỗi ${fail}` : ''}. ${records.length !== impRows.length ? `(${impRows.length - records.length} SĐT trùng trong file đã gộp)` : ''}`);
    if (ok) { setImpRows([]); setImpFile(''); fetchAll(); }
  };

  const downloadTemplate = () => {
    const headers = ['SĐT', 'TÊN', 'TỈNH', 'LOẠI HÌNH KD', 'ĐỊA CHỈ', 'KHU VỰC', 'ĐLH', 'EMAIL'];
    const sample = [
      ['0901234567', 'Spa Mẫu ABC',       'TP. Hồ Chí Minh', 'SPA - CLINIC',        '123 Lê Lợi, Quận 1', 'TP HCM', 'x', ''],
      ['0987654321', 'Gội Đầu Mẫu XYZ',   'Hà Nội',          'GỘI ĐẦU DƯỠNG SINH',  '45 Cầu Giấy',        'Hà Nội', '',  ''],
      ['0912000000', 'Mini Mart Mẫu',     'Đà Nẵng',         'MINI MART',           '12 Bạch Đằng',       'Đà Nẵng','x', 'shop@email.com'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
    XLSX.writeFile(wb, 'mau-nhap-khach-hang-CRM.xlsx');
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
    const newTotal = Number(newGroup.total_members||0);
    const payload = {
      ...newGroup,
      total_members: newTotal,
      // Khi SỬA: "mới tham gia" tự tính = số TV mới - số TV cũ (chênh lệch lần cập nhật này),
      // và đóng dấu ngày cập nhật = hôm nay. Khi THÊM mới: lấy số nhập tay.
      new_joins: editGroupId ? Math.max(0, newTotal - editOrigMembers) : Number(newGroup.new_joins||0),
      report_date: editGroupId ? today() : (newGroup.report_date || today()),
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
    setEditOrigMembers(Number(g.total_members) || 0);
    setEditGroupId(g.id);
    setShowGroupForm(true);
  };

  const addOA = async () => {
    if (!newOA.oa_name?.trim()) return alert('Nhập tên OA!');
    setSaving(true);
    await supabase.from('crm_zalo_oa').insert({
      ...newOA, oa_name:newOA.oa_name.trim(),
      total_follows:Number(newOA.total_follows||0), oa_scans:Number(newOA.oa_scans||0),
      new_follows:Number(newOA.new_follows||0), menu_interactions:Number(newOA.menu_interactions||0),
    });
    setSaving(false);
    setNewOA({ report_date:today(), oa_name:'Zalo OA', total_follows:'', oa_scans:'', new_follows:'', menu_interactions:'' });
    setShowOAForm(false); fetchAll();
  };

  const resetFilters = () => {
    setFDateFrom(''); setFDateTo(''); setFProvince('');
    setFCustType(''); setFPerson(''); setFSearch(''); setFBizType('');
    setFContact(''); setFProduct('');
  };

  // Preset nhanh cho khoảng ngày (Hôm qua / 7 ngày / 30 ngày)
  const _fmtYmd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const datePresetRange = (key) => {
    if (key === 'yesterday') { const y = new Date(); y.setDate(y.getDate()-1); const s = _fmtYmd(y); return [s, s]; }
    // 'month' = THÁNG NÀY (từ ngày 1 tới hôm nay) — theo bộ lọc thời gian trong brief
    if (key === 'month') { const n = new Date(); return [_fmtYmd(new Date(n.getFullYear(), n.getMonth(), 1)), _fmtYmd(n)]; }
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - (key - 1));
    return [_fmtYmd(start), _fmtYmd(end)];
  };
  const applyDatePreset = (key) => { const [s,e] = datePresetRange(key); setFDateFrom(s); setFDateTo(e); };

  /* ══════════════════════════════════════════════════════════════════════
     Sub-components (render helpers)
     ══════════════════════════════════════════════════════════════════════ */

  /* ── KPI Card ────────────────────────────────────────────────────────── */
  const KpiCard = ({ label, value, trend, hint }) => {
    const up = trend >= 0;
    return (
      <div style={{ ...S.card, padding:'16px 18px', flex:'1 1 130px', minWidth:130 }} title={hint || ''}>
        <div style={{ fontSize:'0.76rem', color:'#64748b', fontWeight:500, marginBottom:6 }}>
          {label}{hint && <span style={{ color:'#cbd5e1', marginLeft:4, cursor:'help' }}>ⓘ</span>}
        </div>
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
  // 1 thẻ kênh OA (dùng cho nhiều Zalo OA + các kênh khác)
  const renderOACard = ({ key, icon, color, name, sub, connected, follows, msgs30, resp }) => (
    <div key={key} style={{ ...S.card, padding:'16px 20px', opacity: connected ? 1 : 0.55 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: connected ? 12 : 0 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ width:42, height:42, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background:color+'18', fontSize:'1.3rem' }}>{icon}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#0f172a' }}>{name}</div>
            <div style={{ fontSize:'0.76rem', color:'#94a3b8' }}>{connected ? (sub || 'Đã kết nối') : 'Chưa kết nối'}</div>
          </div>
        </div>
        <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
          background: connected ? '#dcfce7' : '#f1f5f9', color: connected ? '#16a34a' : '#94a3b8' }}>
          {connected ? 'Active' : 'Inactive'}
        </span>
      </div>
      {connected && (
        <div style={{ display:'flex', gap:16, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
          <div style={{ flex:1, textAlign:'center' }}><div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>THEO DÕI</div><div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>{follows!=null ? fmtNum(follows) : '—'}</div></div>
          <div style={{ width:1, background:'#f1f5f9' }}/>
          <div style={{ flex:1, textAlign:'center' }}><div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>TIN 30D</div><div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>{msgs30!=null ? fmtNum(msgs30) : '—'}</div></div>
          <div style={{ width:1, background:'#f1f5f9' }}/>
          <div style={{ flex:1, textAlign:'center' }}><div style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:500, marginBottom:3 }}>PHẢN HỒI %</div><div style={{ fontWeight:800, fontSize:'1rem', color:'#0f172a' }}>{resp || '—'}</div></div>
        </div>
      )}
    </div>
  );

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

      {[['yesterday','Hôm qua'],[7,'7 ngày'],[30,'30 ngày'],['month','Tháng này']].map(([key,label]) => {
        const [s,e] = datePresetRange(key);
        const active = fDateFrom===s && fDateTo===e;
        return (
          <button key={label} onClick={()=>applyDatePreset(key)} style={{
            padding:'7px 12px', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', fontFamily:S.font,
            border: active ? '1.5px solid #ff6a2c' : '1.5px solid #e2e8f0',
            background: active ? '#fff7ed' : '#fff', color: active ? '#ff6a2c' : '#64748b',
          }}>{label}</button>
        );
      })}

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

      {/* Phân loại khách hàng (brief M1) */}
      <select value={fCustType} onChange={e=>setFCustType(e.target.value)}
        style={{ ...S.select, width:155, padding:'7px 10px' }}>
        <option value=''>Phân loại KH</option>
        {['Mới','Mua lại','VIP'].map(t=><option key={t} value={t}>{t}</option>)}
      </select>

      {/* Phân loại sản phẩm (brief M1) */}
      <select value={fProduct} onChange={e=>setFProduct(e.target.value)}
        title={productOptions.length ? '' : 'Đơn chưa có dữ liệu sản phẩm'}
        style={{ ...S.select, width:170, padding:'7px 10px' }}>
        <option value=''>{productOptions.length ? 'Phân loại SP' : 'Phân loại SP (chưa có)'}</option>
        {productOptions.map(p=><option key={p} value={p}>{p}</option>)}
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
  // 6 module theo brief "ĐỀ XUẤT TỐI ƯU QUY TRÌNH CRM" (+ Nhóm & OA giữ lại từ bản cũ)
  const tabItems = [
    { key:'dashboard', label:'1. Dashboard',    icon:'📊' },
    { key:'customers', label:'2. Khách hàng',   icon:'👥' },
    { key:'orders',    label:'3. Đơn hàng',     icon:'📋' },
    { key:'pricing',   label:'4. Giá + Material', icon:'💰' },
    { key:'care',      label:'5. Quy trình CSKH', icon:'📖' },
    { key:'blacklist', label:'6. Blacklist',    icon:'🚫' },
    { key:'groups',    label:'Nhóm & OA',       icon:'📱' },
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

          {/* Top sản phẩm bán chạy (brief Module 1) */}
          <div style={{ ...S.card, padding:20, marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a' }}>🏆 Top sản phẩm bán chạy</div>
              <span style={{ fontSize:'0.76rem', color:'#94a3b8' }}>
                {topProducts.count > 0 ? `${topProducts.count} sản phẩm · xếp theo doanh thu` : ''}
              </span>
            </div>
            {topProducts.list.length > 0 ? (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    {['#','SẢN PHẨM', ...(topProducts.hasQty ? ['SỐ LƯỢNG'] : []), 'SỐ ĐƠN','DOANH THU','TỶ TRỌNG'].map(h => (
                      <th key={h} style={{ padding:'9px 12px', textAlign: h==='SẢN PHẨM'?'left':'right', fontWeight:700,
                        color:'#64748b', fontSize:'0.7rem', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {topProducts.list.map((p,i) => (
                      <tr key={p.name} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'9px 12px', textAlign:'right', width:34 }}>
                          <span style={{ display:'inline-flex', width:22, height:22, borderRadius:'50%', alignItems:'center',
                            justifyContent:'center', fontSize:'0.72rem', fontWeight:800,
                            background: i===0?'#fef3c7':i===1?'#f1f5f9':i===2?'#fff7ed':'#f8fafc',
                            color: i===0?'#b45309':i===1?'#64748b':i===2?'#c2410c':'#94a3b8' }}>{i+1}</span>
                        </td>
                        <td style={{ padding:'9px 12px', fontWeight:700, color:'#0f172a' }}>{p.name}</td>
                        {topProducts.hasQty && <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700, color:'#7c3aed' }}>{fmtNum(p.qty)}</td>}
                        <td style={{ padding:'9px 12px', textAlign:'right', color:'#475569' }}>{fmtNum(p.orders)}</td>
                        <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:800, color:'#16a34a', whiteSpace:'nowrap' }}>{fmtMoney(p.rev)}đ</td>
                        <td style={{ padding:'9px 12px', textAlign:'right', width:130 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, justifyContent:'flex-end' }}>
                            <div style={{ flex:1, maxWidth:70, height:6, background:'#f1f5f9', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ width:`${p.pct}%`, height:'100%', background:'#ff6a2c', borderRadius:3 }}/>
                            </div>
                            <span style={{ fontWeight:700, color:'#64748b', fontSize:'0.78rem', width:34, textAlign:'right' }}>{p.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!topProducts.hasQty && (
                  <div style={{ marginTop:10, fontSize:'0.76rem', color:'#b45309', background:'#fffbeb',
                    border:'1px solid #fde68a', borderRadius:9, padding:'8px 12px', lineHeight:1.5 }}>
                    ⚠️ Đơn hiện <b>chưa có số lượng sản phẩm</b> nên chỉ xếp theo doanh thu/số đơn. Nhập đơn kèm sản phẩm + số lượng
                    (tab <b>3. Đơn hàng</b>) thì cột SỐ LƯỢNG và KPI “Tổng SP bán ra” sẽ tự có số.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding:30, textAlign:'center', color:'#94a3b8', fontSize:'0.85rem', lineHeight:1.6 }}>
                Chưa có dữ liệu sản phẩm trong đơn.<br/>
                <span style={{ fontSize:'0.78rem' }}>Đơn cần có tên sản phẩm (và số lượng) thì mục này mới thống kê được.</span>
              </div>
            )}
          </div>

          {/* Chỉ số theo ngày — doanh thu + số đơn */}
          <div style={{ ...S.card, padding:20, marginBottom:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a' }}>📈 Chỉ số theo ngày</div>
                <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>
                  Doanh thu &amp; số đơn theo ngày {(fDateFrom||fDateTo) ? '· theo khoảng ngày đã chọn' : '· 45 ngày gần nhất'}
                </div>
              </div>
              <div style={{ display:'flex', gap:14, fontSize:'0.76rem', fontWeight:600 }}>
                <span style={{ display:'flex', alignItems:'center', gap:5, color:'#ff6a2c' }}><span style={{ width:10, height:10, borderRadius:3, background:'#ff6a2c' }}/>Doanh thu</span>
                <span style={{ display:'flex', alignItems:'center', gap:5, color:'#2563eb' }}><span style={{ width:10, height:10, borderRadius:3, background:'#2563eb' }}/>Số đơn</span>
              </div>
            </div>
            {dailyChart.length > 0 ? (
              <ResponsiveContainer width='100%' height={250}>
                <LineChart data={dailyChart} margin={{ top:4, right:8, bottom:4, left:0 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#f1f5f9'/>
                  <XAxis dataKey='date' tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={d => `${d.slice(8)}/${d.slice(5,7)}`} minTickGap={20}/>
                  <YAxis yAxisId='rev' tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v>=1e6 ? (v/1e6).toFixed(0)+'tr' : (v/1e3).toFixed(0)+'k'}/>
                  <YAxis yAxisId='cnt' orientation='right' tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false}/>
                  {/* Tooltip theo brief: ngày · doanh thu · số đơn · sản phẩm bán ra */}
                  <Tooltip
                    labelFormatter={d => `${d.slice(8)}/${d.slice(5,7)}/${d.slice(0,4)}`}
                    formatter={(value, name, item) => {
                      if (name === 'Doanh thu') return [fmtMoney(value)+'đ', 'Doanh thu'];
                      const qty = item?.payload?.qty || 0;
                      return [`${value} đơn${qty > 0 ? ` · ${fmtNum(qty)} sản phẩm` : ''}`, 'Số đơn'];
                    }}
                    contentStyle={{ borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}/>
                  <Line yAxisId='rev' type='monotone' dataKey='rev' name='Doanh thu' stroke='#ff6a2c' strokeWidth={2.5} dot={{ r:3, fill:'#ff6a2c' }} activeDot={{ r:6 }}/>
                  <Line yAxisId='cnt' type='monotone' dataKey='count' name='Số đơn' stroke='#2563eb' strokeWidth={2} dot={{ r:2, fill:'#2563eb' }} strokeDasharray='5 5'/>
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'0.85rem' }}>
                Chưa có đơn có doanh thu trong khoảng/lọc này
              </div>
            )}
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
                    <Line type='monotone' dataKey='KH mới' stroke='#ff6a2c' strokeWidth={2.5}
                      dot={{ r:4, fill:'#ff6a2c' }} activeDot={{ r:6 }}/>
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
                          i===0?'#ff6a2c':i===1?'#ff7a30':i===2?'#ff8a4c':'#ffc196',
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
                  <div style={{ fontSize:'0.72rem', color:'#ff6a2c', fontWeight:600, marginBottom:6, textTransform:'uppercase' }}>KH Cũ</div>
                  <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#e85518' }}>{fmtNum(newVsReturn.retCusts)}</div>
                  <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:2 }}>khách</div>
                  <div style={{ fontSize:'0.82rem', color:'#475569', marginTop:4 }}>{fmtNum(newVsReturn.retOrders)} đơn</div>
                </div>
              </div>
              {(newVsReturn.newCusts + newVsReturn.retCusts) > 0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:'flex', height:10, borderRadius:5, overflow:'hidden', background:'#f1f5f9' }}>
                    <div style={{ width:`${Math.round(newVsReturn.newCusts/(newVsReturn.newCusts+newVsReturn.retCusts)*100)}%`,
                      background:'#3b82f6', transition:'width 0.4s' }}/>
                    <div style={{ flex:1, background:'#ff6a2c', transition:'width 0.4s' }}/>
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
                        <td style={{ padding:'10px 14px', fontWeight:700, color:'#ff6a2c' }}>{b.pct}%</td>
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
                  padding:'6px 14px', borderRadius:20, border: fBizType===k ? '2px solid #ff6a2c' : '1.5px solid #e2e8f0',
                  background: fBizType===k ? '#fff7ed' : '#fff', color: fBizType===k ? '#ff6a2c' : '#64748b',
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

            <button onClick={()=>setShowImport(true)}
              style={{ ...S.btnPrimary, background:'#fff', color:'#ff6a2c', border:'1.5px solid #ff6a2c' }}>
              📥 Nhập Excel
            </button>
            <button onClick={()=>setShowCustForm(true)} style={S.btnPrimary}>
              + Thêm KH
            </button>
          </div>

          {/* Phân loại KH theo brief (Mới / Mua lại / VIP) + đếm */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.78rem', color:'#64748b', fontWeight:700 }}>Phân loại KH:</span>
            {[['','Tất cả'],['Mới','Mới'],['Mua lại','Mua lại'],['VIP','VIP']].map(([k,l]) => {
              const n = k ? filteredCustomers.filter(c=>c.briefTag===k).length : filteredCustomers.length;
              const active = fBriefTag === k;
              return (
                <button key={l} onClick={()=>setFBriefTag(prev => prev===k ? '' : k)} style={{
                  padding:'5px 13px', borderRadius:20, cursor:'pointer', fontFamily:S.font,
                  border: active ? '2px solid #ff6a2c' : '1.5px solid #e2e8f0',
                  background: active ? '#fff7ed' : '#fff', color: active ? '#ff6a2c' : '#64748b',
                  fontWeight:700, fontSize:'0.75rem',
                }}>{l} <span style={{ opacity:0.7 }}>({fmtNum(n)})</span></button>
              );
            })}
            <div style={{ marginLeft:'auto', fontSize:'0.82rem', color:'#64748b', fontWeight:500 }}>
              Hiển thị <b style={{ color:'#0f172a' }}>{fmtNum(pagedCustomers.length)}</b> / {fmtNum(filteredCustomers.length)} khách hàng
            </div>
          </div>

          {/* Customer table — cột theo brief Module 2 */}
          <div style={{ ...S.card, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['TÊN KHÁCH HÀNG','SỐ ĐIỆN THOẠI','TỈNH/TP','TỔNG CHI TIÊU','ĐƠN','NGÀY MUA GẦN NHẤT','SẢN PHẨM ĐÃ MUA','NHÂN SỰ','PHÂN LOẠI TỆP','PHÂN LOẠI KH'].map(h => (
                      <th key={h} style={{ padding:'11px 13px', textAlign:'left', fontWeight:700,
                        color:'#64748b', fontSize:'0.7rem', letterSpacing:'0.4px',
                        borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map((c,i) => (
                    <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9',
                      background: i%2 ? '#fafbfc' : '#fff', transition:'background 0.1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#fafbfc':'#fff'}>
                      <td style={{ padding:'10px 13px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <Avatar name={c.full_name} />
                          <button onClick={()=>setDetailCust(c)} title='Xem tất cả đơn khách này đã mua'
                            style={{ border:'none', background:'none', padding:0, cursor:'pointer', textAlign:'left',
                              fontWeight:700, color:'#2563eb', fontSize:'0.85rem', fontFamily:S.font,
                              textDecoration:'underline', textDecorationStyle:'dotted' }}>
                            {c.full_name || '—'}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding:'10px 13px', fontWeight:600, color:'#475569', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                        {c.phone}
                        {c.isRegular && (
                          <div style={{ display:'inline-block', marginLeft:6, padding:'1px 7px', borderRadius:20,
                            fontSize:'0.65rem', fontWeight:800, background:'#dcfce7', color:'#16a34a',
                            fontFamily:S.font }}>Khách quen</div>
                        )}
                      </td>
                      <td style={{ padding:'10px 13px', color:'#475569', fontSize:'0.8rem' }}>{c.province || '—'}</td>
                      <td style={{ padding:'10px 13px', fontWeight:800, color:'#16a34a', whiteSpace:'nowrap' }}>
                        {c.gmv > 0 ? fmtMoney(c.gmv)+'đ' : '—'}
                      </td>
                      <td style={{ padding:'10px 13px', fontWeight:700, color:'#0f172a' }}>{c.orderCountEff}</td>
                      <td style={{ padding:'10px 13px', color:'#475569', fontSize:'0.78rem', whiteSpace:'nowrap' }}>
                        {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding:'10px 13px', maxWidth:190 }}>
                        {c.products.length === 0 ? <span style={{ color:'#cbd5e1' }}>—</span> : (
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {c.products.slice(0,2).map(p => (
                              <span key={p} style={{ padding:'2px 7px', borderRadius:6, background:'#f1f5f9',
                                color:'#475569', fontSize:'0.7rem', fontWeight:600 }}>{p}</span>
                            ))}
                            {c.products.length > 2 && (
                              <span style={{ padding:'2px 7px', borderRadius:6, background:'#eff6ff',
                                color:'#2563eb', fontSize:'0.7rem', fontWeight:700 }}>+{c.products.length-2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'10px 13px', fontWeight:600, color:S.primary, fontSize:'0.8rem' }}>
                        {c.sales_person || '—'}
                      </td>
                      <td style={{ padding:'10px 13px', color:'#475569', fontSize:'0.76rem' }}>{c.business_type || '—'}</td>
                      <td style={{ padding:'10px 13px' }}>
                        <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:'0.71rem', fontWeight:800,
                          background: c.briefTag==='VIP' ? '#f5f3ff' : c.briefTag==='Mua lại' ? '#eff6ff' : '#f0fdf4',
                          color:      c.briefTag==='VIP' ? '#7c3aed' : c.briefTag==='Mua lại' ? '#2563eb' : '#16a34a',
                        }}>{c.briefTag==='VIP' ? '👑 VIP' : c.briefTag}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                        <div style={{ fontSize:'2rem', marginBottom:8 }}>👥</div>
                        Chưa có khách hàng
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {custTotalPages > 1 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px 0', borderTop:'1px solid #f1f5f9' }}>
                <button onClick={()=>setCustPage(p=>Math.max(1,p-1))} disabled={custPageC<=1}
                  style={{ ...S.btnOutline, padding:'5px 13px', fontSize:'0.78rem', opacity:custPageC<=1?0.45:1 }}>‹ Trước</button>
                <span style={{ fontSize:'0.8rem', color:'#64748b', fontWeight:600 }}>
                  Trang {custPageC}/{custTotalPages}
                </span>
                <button onClick={()=>setCustPage(p=>Math.min(custTotalPages,p+1))} disabled={custPageC>=custTotalPages}
                  style={{ ...S.btnOutline, padding:'5px 13px', fontSize:'0.78rem', opacity:custPageC>=custTotalPages?0.45:1 }}>Sau ›</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Chi tiết khách hàng — tất cả đơn đã mua + tình trạng giao (brief M2) ── */}
      {detailCust && (
        <Modal onClose={()=>setDetailCust(null)} title={`Chi tiết khách hàng — ${detailCust.full_name || detailCust.phone}`}>
          {/* Tóm tắt */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:14 }}>
            <Avatar name={detailCust.full_name} size={46}/>
            <div style={{ flex:'1 1 190px' }}>
              <div style={{ fontWeight:800, fontSize:'1.05rem', color:'#0f172a' }}>
                {detailCust.full_name || '—'}
                {detailCust.isRegular && <span style={{ marginLeft:8, padding:'2px 9px', borderRadius:20, fontSize:'0.68rem', fontWeight:800, background:'#dcfce7', color:'#16a34a' }}>Khách quen</span>}
              </div>
              <div style={{ fontSize:'0.82rem', color:'#64748b', marginTop:2 }}>
                📞 {detailCust.phone} · 📍 {detailCust.province || '—'}
              </div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:3 }}>
                Tệp: <b>{detailCust.business_type || '—'}</b> · Phân loại: <b style={{ color:'#7c3aed' }}>{detailCust.briefTag}</b> · NS: <b style={{ color:S.primary }}>{detailCust.sales_person || '—'}</b>
              </div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10, marginBottom:16 }}>
            {[
              { l:'Tổng chi tiêu', v: fmtMoney(detailCust.gmv)+'đ', c:'#16a34a' },
              { l:'Tổng số đơn',   v: fmtNum(detailCust.orderCountEff), c:'#0f172a' },
              { l:'Mua gần nhất',  v: detailCust.lastOrder ? new Date(detailCust.lastOrder).toLocaleDateString('vi-VN') : '—', c:'#2563eb' },
              { l:'Lần mua đầu',   v: (() => { const ds = detailCust.myOrders.map(o=>o.order_date||o.created_at?.slice(0,10)).filter(Boolean).sort(); return ds.length ? new Date(ds[0]).toLocaleDateString('vi-VN') : '—'; })(), c:'#7c3aed' },
            ].map((x,i) => (
              <div key={i} style={{ ...S.card, padding:'11px 13px' }}>
                <div style={{ fontSize:'0.68rem', color:'#94a3b8', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{x.l}</div>
                <div style={{ fontSize:'1.05rem', fontWeight:800, color:x.c }}>{x.v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontWeight:800, fontSize:'0.9rem', color:'#0f172a', marginBottom:8 }}>
            📋 Danh sách đơn hàng ({detailCust.myOrders.length})
          </div>
          {/* Số đơn ở file import (order_count) nhiều hơn số đơn CHI TIẾT có trong crm_orders → nói rõ, tránh tưởng lỗi */}
          {detailCust.orderCountEff > detailCust.myOrders.length && (
            <div style={{ marginBottom:8, padding:'8px 12px', borderRadius:9, background:'#fffbeb',
              border:'1px solid #fde68a', color:'#92400e', fontSize:'0.76rem', lineHeight:1.5 }}>
              ⚠️ Khách này có <b>{detailCust.orderCountEff} đơn</b> theo file Excel đã nhập, nhưng hệ thống mới có
              chi tiết <b>{detailCust.myOrders.length} đơn</b>. Cần nhập đơn (tab <b>3. Đơn hàng</b>) thì mới xem được đầy đủ
              — tổng chi tiêu &amp; ngày mua cũng tính từ đơn chi tiết.
            </div>
          )}
          {detailCust.myOrders.length === 0 ? (
            <div style={{ padding:26, textAlign:'center', color:'#94a3b8', fontSize:'0.85rem',
              border:'1px dashed #e2e8f0', borderRadius:10 }}>
              Khách này chưa có đơn nào trong hệ thống.
            </div>
          ) : (
            <div style={{ maxHeight:330, overflowY:'auto', border:'1px solid #e5e7eb', borderRadius:10 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' }}>
                <thead><tr style={{ position:'sticky', top:0, background:'#f8fafc', zIndex:1 }}>
                  {['MÃ ĐƠN','MÃ VẬN ĐƠN','NGÀY ĐẶT','SẢN PHẨM','GIÁ TRỊ','TÌNH TRẠNG GIAO'].map(h => (
                    <th key={h} style={{ padding:'8px 11px', textAlign:'left', fontWeight:700, color:'#64748b',
                      fontSize:'0.67rem', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {detailCust.myOrders.map(o => {
                    const st = orderStatusBadge(o);
                    const prods = (Array.isArray(o.products) ? o.products.filter(p=>p?.name).map(p=>p.name) : []);
                    const pTxt = prods.length ? prods.join(', ') : (o.product_name || '—');
                    return (
                      <tr key={o.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'8px 11px', fontFamily:'monospace', fontSize:'0.74rem', color:'#475569' }}>{o.order_code || '—'}</td>
                        <td style={{ padding:'8px 11px', fontFamily:'monospace', fontSize:'0.72rem', color:'#64748b' }}>{o.shipping_code || '—'}</td>
                        <td style={{ padding:'8px 11px', whiteSpace:'nowrap', color:'#475569' }}>
                          {(o.order_date || o.created_at) ? new Date(o.order_date || o.created_at).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding:'8px 11px', color:'#334155', maxWidth:210 }}>{pTxt}</td>
                        <td style={{ padding:'8px 11px', fontWeight:800, color:'#0f172a', whiteSpace:'nowrap' }}>
                          {Number(o.total_amount||0) > 0 ? fmtMoney(o.total_amount)+'đ' : '—'}
                        </td>
                        <td style={{ padding:'8px 11px' }}>
                          <span style={{ padding:'2px 9px', borderRadius:20, fontSize:'0.68rem', fontWeight:700,
                            background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
            <button onClick={()=>setDetailCust(null)} style={S.btnOutline}>Đóng</button>
          </div>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: ĐƠN HÀNG (split layout)
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'orders' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Nút mở form tạo đơn — mockup M3 là BẢNG full-width nên form để thu gọn */}
          <div>
            <button onClick={()=>setShowOrderForm(v=>!v)}
              style={{ ...(showOrderForm ? S.btnOutline : S.btnPrimary), padding:'9px 18px', fontSize:'0.85rem' }}>
              {showOrderForm ? '✕ Đóng form tạo đơn' : '+ Tạo đơn hàng mới'}
            </button>
          </div>

          {/* FORM tạo đơn (thu gọn) */}
          {showOrderForm && (
          <div style={{ ...S.card, padding:24, maxWidth:760 }}>
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
          )}

          {/* BẢNG ĐƠN HÀNG (theo mockup Module 3) */}
          <div>
            {/* Bộ lọc: tháng + loại hình KD */}
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <select value={fOrderMonth} onChange={e=>setFOrderMonth(e.target.value)}
                style={{ ...S.select, width:'auto', minWidth:140, padding:'7px 10px' }}>
                <option value=''>Tất cả tháng</option>
                {orderMonths.map(m => <option key={m} value={m}>Tháng {m.slice(5,7)}/{m.slice(0,4)}</option>)}
              </select>
              <select value={fOrderBiz} onChange={e=>setFOrderBiz(e.target.value)}
                style={{ ...S.select, width:'auto', minWidth:160, padding:'7px 10px' }}>
                <option value=''>Tất cả loại hình</option>
                {BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {/* Bộ lọc theo mockup M3: nguồn khách · nhân sự phụ trách · tìm theo ID nhanh/tên/SĐT */}
              <select value={fOrdSource} onChange={e=>{setFOrdSource(e.target.value); setOrdPage(1);}}
                style={{ ...S.select, width:'auto', minWidth:160, padding:'7px 10px' }}>
                <option value=''>Nguồn khách: Tất cả</option>
                {ORDER_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={fOrdPerson} onChange={e=>{setFOrdPerson(e.target.value); setOrdPage(1);}}
                style={{ ...S.select, width:'auto', minWidth:170, padding:'7px 10px' }}>
                <option value=''>Nhân sự phụ trách: Tất cả</option>
                {SALES_PERSONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={fOrdSearch} onChange={e=>{setFOrdSearch(e.target.value); setOrdPage(1);}}
                placeholder='🔍 Tìm theo ID nhanh, tên KH, SĐT...'
                style={{ ...S.input, width:250, flex:'0 1 250px', padding:'7px 12px' }}/>
              {(fOrderMonth || fOrderBiz || fOrdSource || fOrdPerson || fOrdSearch) && (
                <button onClick={()=>{ setFOrderMonth(''); setFOrderBiz(''); setFOrdSource(''); setFOrdPerson(''); setFOrdSearch(''); setOrdPage(1); }}
                  style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#fff',
                    color:'#64748b', fontWeight:600, fontSize:'0.78rem', cursor:'pointer', fontFamily:S.font }}>
                  ✕ Bỏ lọc
                </button>
              )}
            </div>

            {(() => {
              const odMonth = (o) => (o.order_date || o.created_at?.slice(0,10) || '').slice(0,7);
              const q = fOrdSearch.trim().toLowerCase();
              const filtered = orders.filter(o => {
                if (fOrderMonth && odMonth(o) !== fOrderMonth) return false;
                if (fOrderBiz && (custBizByPhone.get(o.recipient_phone) || '') !== fOrderBiz) return false;
                // Data thật có biến thể "Zalo Sỉ Kỳ Anh / Zalo Sỉ Huệ / Zalo Sỉ Hạnh" → khớp theo TIỀN TỐ,
                // nếu khớp tuyệt đối thì lọc "Zalo Sỉ" sẽ ra 0 đơn.
                if (fOrdSource) {
                  const src = (o.order_source || '').toLowerCase();
                  if (!src.startsWith(fOrdSource.toLowerCase())) return false;
                }
                if (fOrdPerson && orderPerson(o) !== fOrdPerson) return false;
                if (q) {
                  const hay = `${o.platform_order_id||''} ${o.order_code||''} ${o.recipient_name||''} ${o.recipient_phone||''} ${o.shipping_code||''}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });
              const revOrders = filtered.filter(o => Number(o.total_amount||0) > 0);
              const totalRev = revOrders.reduce((s,o) => s + Number(o.total_amount||0), 0);

              return (<>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:6 }}>
                  <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                    Đơn hàng
                  </h3>
                  <span style={{ fontSize:'0.82rem', color:'#64748b', fontWeight:500 }}>
                    {fmtNum(filtered.length)} đơn{revOrders.length>0 ? ` · ${fmtNum(revOrders.length)} có DT · ${fmtMoney(totalRev)}đ` : ''}
                  </span>
                </div>

                {/* Bảng đơn hàng — đúng cột theo mockup Module 3 */}
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(filtered.length / ORD_PER_PAGE));
                  const pageC = Math.min(ordPage, totalPages);
                  const paged = filtered.slice((pageC-1)*ORD_PER_PAGE, pageC*ORD_PER_PAGE);
                  const payStyle = (m) => /ck|chuyển/i.test(m||'')
                    ? { bg:'#eff6ff', color:'#2563eb', txt:'CK' }
                    : { bg:'#fff7ed', color:'#ea580c', txt:'COD' };
                  return (<>
                  <div style={{ ...S.card, overflow:'hidden' }}>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.81rem' }}>
                        <thead><tr style={{ background:'#f8fafc' }}>
                          {['#','ID NHANH','NGÀY ĐẶT','KHÁCH HÀNG','SĐT','NGUỒN KHÁCH','SẢN PHẨM','TỔNG TIỀN (Đ)','TT THANH TOÁN','TRẠNG THÁI ĐƠN HÀNG','MÃ VẬN ĐƠN','DUYỆT','HOÁ ĐƠN','NHÂN SỰ PHỤ TRÁCH'].map(h => (
                            <th key={h} style={{ padding:'10px 11px', textAlign:'left', fontWeight:700, color:'#64748b',
                              fontSize:'0.67rem', letterSpacing:'0.3px', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {paged.map((o,i) => {
                            const status = orderStatusBadge(o);
                            const pay = payStyle(o.payment_method);
                            const prods = Array.isArray(o.products) ? o.products.filter(p=>p?.name) : [];
                            const pTxt = prods.length
                              ? prods.map(p => `${p.name}${p.quantity>1?` ×${p.quantity}`:''}`).join(', ')
                              : (o.product_name || '—');
                            return (
                              <tr key={o.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2 ? '#fafbfc' : '#fff' }}>
                                <td style={{ padding:'9px 11px', color:'#94a3b8', fontSize:'0.75rem' }}>{(pageC-1)*ORD_PER_PAGE + i + 1}</td>
                                <td style={{ padding:'9px 11px', fontFamily:'monospace', fontSize:'0.74rem', color:'#0891b2', fontWeight:700 }}>
                                  {o.platform_order_id || o.order_code || '—'}
                                </td>
                                <td style={{ padding:'9px 11px', fontSize:'0.75rem', color:'#475569', whiteSpace:'nowrap' }}>
                                  {(o.order_date || o.created_at)
                                    ? new Date(o.order_date || o.created_at).toLocaleDateString('vi-VN') : '—'}
                                </td>
                                <td style={{ padding:'9px 11px', fontWeight:700, color:'#0f172a', maxWidth:150 }}>{o.recipient_name || '—'}</td>
                                <td style={{ padding:'9px 11px', fontFamily:'monospace', fontSize:'0.75rem', color:'#475569', whiteSpace:'nowrap' }}>{o.recipient_phone || '—'}</td>
                                <td style={{ padding:'9px 11px' }}>
                                  {o.order_source
                                    ? <span style={{ padding:'2px 8px', borderRadius:20, background:'#f5f3ff', color:'#7c3aed', fontWeight:700, fontSize:'0.69rem', whiteSpace:'nowrap' }}>{o.order_source}</span>
                                    : '—'}
                                </td>
                                <td style={{ padding:'9px 11px', color:'#334155', fontSize:'0.76rem', maxWidth:210 }}>{pTxt}</td>
                                <td style={{ padding:'9px 11px', fontWeight:800, whiteSpace:'nowrap',
                                  color: Number(o.total_amount||0) > 0 ? '#16a34a' : '#94a3b8' }}>
                                  {Number(o.total_amount||0) > 0 ? fmtMoney(o.total_amount)+'đ' : '0đ'}
                                </td>
                                <td style={{ padding:'9px 11px' }}>
                                  <span style={{ padding:'2px 9px', borderRadius:6, background:pay.bg, color:pay.color, fontWeight:800, fontSize:'0.69rem' }}>{pay.txt}</span>
                                </td>
                                <td style={{ padding:'9px 11px' }}>
                                  <select value={o.status || ''} onChange={e=>setOrderStatus(o, e.target.value)} title='Đổi tình trạng đơn hàng'
                                    style={{ padding:'3px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:700,
                                      background:status.bg, color:status.color, border:`1px solid ${status.color}33`,
                                      cursor:'pointer', fontFamily:S.font, maxWidth:130 }}>
                                    {[...new Set(['Đã lên đơn','Đang giao','Đã giao','Hàng hoàn', o.status].filter(Boolean))]
                                      .map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding:'9px 11px', whiteSpace:'nowrap' }}>
                                  <span style={{ fontFamily:'monospace', fontSize:'0.71rem', color: o.shipping_code ? '#475569' : '#cbd5e1' }}>
                                    {o.shipping_code || 'chưa có'}
                                  </span>
                                  <button onClick={()=>editShipping(o)} title='Sale bấm để điền / sửa mã vận đơn'
                                    style={{ border:'none', background:'none', cursor:'pointer', fontSize:'0.82rem', padding:'0 0 0 4px' }}>✏️</button>
                                </td>
                                <td style={{ padding:'9px 11px' }}>
                                  <button onClick={()=>toggleApprove(o)}
                                    title={o.is_approved ? `Đã duyệt${o.approved_by ? ' bởi '+o.approved_by : ''}${o.approved_at ? ' · '+new Date(o.approved_at).toLocaleString('vi-VN') : ''} — bấm để bỏ duyệt` : 'Kế toán check đơn rồi bấm duyệt'}
                                    style={{ padding:'3px 9px', borderRadius:20, cursor:'pointer', fontFamily:S.font, fontWeight:700, fontSize:'0.7rem',
                                      border:`1px solid ${o.is_approved ? '#bbf7d0' : '#e2e8f0'}`,
                                      background: o.is_approved ? '#f0fdf4' : '#fff', color: o.is_approved ? '#16a34a' : '#94a3b8', whiteSpace:'nowrap' }}>
                                    {o.is_approved ? '✅ Đã duyệt' : '☐ Duyệt'}
                                  </button>
                                </td>
                                <td style={{ padding:'9px 11px' }}>
                                  <button onClick={()=>toggleInvoice(o)} title='Đơn này có xuất hoá đơn'
                                    style={{ padding:'3px 9px', borderRadius:20, cursor:'pointer', fontFamily:S.font, fontWeight:700, fontSize:'0.7rem',
                                      border:`1px solid ${o.has_invoice ? '#fde68a' : '#e2e8f0'}`,
                                      background: o.has_invoice ? '#fffbeb' : '#fff', color: o.has_invoice ? '#b45309' : '#94a3b8', whiteSpace:'nowrap' }}>
                                    {o.has_invoice ? '🧾 Có' : '☐ HĐ'}
                                  </button>
                                </td>
                                <td style={{ padding:'9px 11px', fontWeight:600, color:S.primary, fontSize:'0.76rem', whiteSpace:'nowrap' }}
                                  title={!o.sales_person && orderPerson(o) ? 'Lấy theo nhân sự đang quản lý khách này' : ''}>
                                  {orderPerson(o) || '—'}
                                </td>
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr><td colSpan={14} style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                              <div style={{ fontSize:'2rem', marginBottom:8 }}>📋</div>
                              {(fOrderMonth || fOrderBiz || fOrdSource || fOrdPerson || fOrdSearch) ? 'Không có đơn khớp bộ lọc' : 'Chưa có đơn hàng'}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
                        padding:'11px 16px', borderTop:'1px solid #f1f5f9', flexWrap:'wrap' }}>
                        <span style={{ fontSize:'0.78rem', color:'#64748b' }}>
                          Hiển thị {(pageC-1)*ORD_PER_PAGE+1} – {Math.min(pageC*ORD_PER_PAGE, filtered.length)} trong tổng số {fmtNum(filtered.length)} đơn hàng
                        </span>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <button onClick={()=>setOrdPage(p=>Math.max(1,p-1))} disabled={pageC<=1}
                            style={{ ...S.btnOutline, padding:'5px 12px', fontSize:'0.78rem', opacity:pageC<=1?0.45:1 }}>‹ Trước</button>
                          <span style={{ fontSize:'0.8rem', color:'#64748b', fontWeight:600 }}>Trang {pageC}/{totalPages}</span>
                          <button onClick={()=>setOrdPage(p=>Math.min(totalPages,p+1))} disabled={pageC>=totalPages}
                            style={{ ...S.btnOutline, padding:'5px 12px', fontSize:'0.78rem', opacity:pageC>=totalPages?0.45:1 }}>Sau ›</button>
                        </div>
                      </div>
                    )}
                  </div>
                  </>);
                })()}
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
              <div>
                <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                  Nhóm khách hàng
                </h3>
                <div style={{ fontSize:'0.78rem', color:'#64748b', fontWeight:600, marginTop:3 }}>
                  {groupSummary.count} nhóm · Tổng <b style={{ color:'#7c3aed' }}>{fmtNum(groupSummary.members)}</b> thành viên
                  {groupSummary.joins > 0 ? <> · <span style={{ color:'#16a34a' }}>+{fmtNum(groupSummary.joins)} mới</span></> : null}
                </div>
              </div>
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
              {/* Nhiều Zalo OA — mỗi OA 1 thẻ */}
              {zaloOAList.map((oa,i) => renderOACard({
                key:'zalo-'+i, icon:'💬', color:'#0068ff', name:oa.name, connected:true,
                follows:oa.follows, msgs30:oa.msgs30, resp:'95%', sub:`Đã kết nối · cập nhật ${oa.report_date||'—'}`,
              }))}
              {zaloOAList.length === 0 && renderOACard({ key:'zalo-empty', icon:'💬', color:'#0068ff', name:'Zalo OA', connected:false })}
              {/* Các kênh khác (không phải Zalo) */}
              {OA_CHANNELS.filter(c=>c.key!=='zalo').map(ch => {
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
         TAB: 4. CHÍNH SÁCH GIÁ + MATERIAL · 5. QUY TRÌNH CSKH (component riêng)
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'pricing' && <CrmPricingTab />}
      {subTab === 'care'    && <CrmCareTab currentUser={currentUser} />}

      {/* ════════════════════════════════════════════════════════════════════
         TAB: BLACKLIST
         ════════════════════════════════════════════════════════════════════ */}
      {subTab === 'blacklist' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, gap:12, flexWrap:'wrap' }}>
            <div>
              <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
                🚫 Danh sách Blacklist
              </h3>
              <div style={{ fontSize:'0.82rem', color:'#64748b', marginTop:4 }}>
                Khách bị hoàn hàng nhiều lần hoặc được đưa vào Blacklist.
              </div>
            </div>
            <button onClick={()=>setEditBl({ ...EMPTY_BL })} style={S.btnPrimary}>+ Thêm vào Blacklist</button>
          </div>

          {/* Bộ lọc */}
          <div style={{ display:'flex', gap:9, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <select value={blDays} onChange={e=>setBlDays(Number(e.target.value))} style={{ ...S.select, width:150, padding:'7px 10px' }}>
              <option value={0}>Tất cả thời gian</option>
              <option value={7}>7 ngày gần đây</option>
              <option value={15}>15 ngày gần đây</option>
              <option value={30}>30 ngày gần đây</option>
            </select>
            <select value={fBlReason} onChange={e=>setFBlReason(e.target.value)} style={{ ...S.select, width:180, padding:'7px 10px' }}>
              <option value=''>Lý do hoàn: Tất cả</option>
              {BL_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fBlStatus} onChange={e=>setFBlStatus(e.target.value)} style={{ ...S.select, width:160, padding:'7px 10px' }}>
              <option value=''>Trạng thái: Tất cả</option>
              {BL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fBlPerson} onChange={e=>setFBlPerson(e.target.value)} style={{ ...S.select, width:150, padding:'7px 10px' }}>
              <option value=''>Nhân sự: Tất cả</option>
              {SALES_PERSONS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <input value={fBlSearch} onChange={e=>setFBlSearch(e.target.value)}
              placeholder='🔍 Tìm ID, tên KH, SĐT, mã vận đơn...'
              style={{ ...S.input, width:260, flex:'0 1 260px', padding:'8px 12px' }}/>
            <div style={{ fontSize:'0.8rem', color:'#64748b', fontWeight:600 }}>
              {blFiltered.length}/{blacklist.length} bản ghi
            </div>
          </div>

          {/* Bảng blacklist — đủ cột theo brief */}
          <div style={{ ...S.card, overflow:'hidden', marginBottom:20 }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead>
                  <tr style={{ background:'#fef2f2' }}>
                    {['#','ID NHANH','NGÀY ĐẶT','KHÁCH HÀNG','SĐT','NGUỒN','SẢN PHẨM','TỔNG TIỀN','LÝ DO HOÀN','MÃ VẬN ĐƠN','TRẠNG THÁI','NHÂN SỰ','THAO TÁC'].map(h => (
                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700,
                        color:'#991b1b', fontSize:'0.68rem', letterSpacing:'0.4px',
                        borderBottom:'1px solid #fecaca', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blFiltered.map((b,i) => {
                    const st = b.status || 'Blacklist';
                    const sty = BL_STATUS_STYLE[st] || BL_STATUS_STYLE['Blacklist'];
                    return (
                    <tr key={b.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2 ? '#fffbfb' : '#fff' }}>
                      <td style={{ padding:'9px 12px', color:'#94a3b8', fontSize:'0.76rem' }}>{i+1}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:'0.75rem', color:'#64748b' }}>{b.nhanh_id || '—'}</td>
                      <td style={{ padding:'9px 12px', fontSize:'0.76rem', color:'#475569', whiteSpace:'nowrap' }}>
                        {b.order_date ? new Date(b.order_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', display:'flex',
                            alignItems:'center', justifyContent:'center', flexShrink:0,
                            background:'#fef2f2', color:'#dc2626', fontWeight:700, fontSize:11 }}>
                            {getInitials(b.full_name)}
                          </div>
                          <span style={{ fontWeight:700, color:'#0f172a', fontSize:'0.8rem' }}>{b.full_name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding:'9px 12px', fontWeight:600, color:'#dc2626', fontFamily:'monospace', fontSize:'0.76rem' }}>{b.phone}</td>
                      <td style={{ padding:'9px 12px', fontSize:'0.76rem' }}>
                        {b.source ? <span style={{ padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#2563eb', fontWeight:700, fontSize:'0.7rem' }}>{b.source}</span> : '—'}
                      </td>
                      <td style={{ padding:'9px 12px', color:'#475569', fontSize:'0.76rem', maxWidth:200 }}>{b.product_name || '—'}</td>
                      <td style={{ padding:'9px 12px', fontWeight:700, color:'#0f172a', whiteSpace:'nowrap' }}>
                        {Number(b.total_amount||0) > 0 ? fmtMoney(b.total_amount)+'đ' : '—'}
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        <span style={{ padding:'3px 9px', borderRadius:20, fontSize:'0.7rem', fontWeight:700,
                          background:'#fef2f2', color:'#dc2626', whiteSpace:'nowrap' }}>
                          {b.reason || 'Khác'}
                        </span>
                      </td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:'0.72rem', color:'#64748b' }}>{b.shipping_code || '—'}</td>
                      <td style={{ padding:'9px 12px' }}>
                        <select value={st} onChange={e=>setBlStatus(b, e.target.value)} title='Đổi trạng thái'
                          style={{ padding:'3px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:700,
                            background:sty.bg, color:sty.color, border:`1px solid ${sty.color}33`,
                            cursor:'pointer', fontFamily:S.font }}>
                          {BL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:'9px 12px', fontWeight:600, color:S.primary, fontSize:'0.76rem' }}>{b.sales_person || '—'}</td>
                      <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                        <button onClick={()=>setEditBl({ ...b })} title='Sửa'
                          style={{ border:'none', background:'none', cursor:'pointer', fontSize:'0.88rem' }}>✏️</button>
                        <button onClick={()=>delBl(b)} title='Xoá khỏi blacklist'
                          style={{ border:'none', background:'none', cursor:'pointer', fontSize:'0.88rem' }}>🗑️</button>
                      </td>
                    </tr>
                  );})}
                  {blFiltered.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                        <div style={{ fontSize:'2rem', marginBottom:8 }}>🚫</div>
                        {blacklist.length === 0 ? 'Chưa có ai trong blacklist' : 'Không có bản ghi khớp bộ lọc'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Thống kê cuối bảng (theo bộ lọc 7/15/30 ngày) ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:12, marginBottom:16 }}>
            {[
              { icon:'🚫', label:'Tổng khách Blacklist', value: fmtNum(blStats.byStatus['Blacklist']||0), color:'#dc2626' },
              { icon:'⏳', label:'Đang xem xét',         value: fmtNum(blStats.byStatus['Xem xét']||0),   color:'#ea580c' },
              { icon:'✅', label:'Đã loại bỏ',           value: fmtNum(blStats.byStatus['Loại bỏ']||0),   color:'#64748b' },
              { icon:'🔄', label:'Tổng đơn hoàn',        value: fmtNum(blStats.total),                    color:'#7c3aed' },
              { icon:'💸', label:'Giá trị đơn hoàn',     value: fmtMoney(blStats.refundAmount)+'đ',       color:'#0891b2' },
            ].map((s,i) => (
              <div key={i} style={{ ...S.card, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ width:28, height:28, borderRadius:9, display:'inline-flex', alignItems:'center',
                    justifyContent:'center', background:`${s.color}18`, fontSize:'0.85rem' }}>{s.icon}</span>
                  <span style={{ fontSize:'0.7rem', color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{s.label}</span>
                </div>
                <div style={{ fontSize:'1.35rem', fontWeight:900, color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Lý do hoàn theo tỷ lệ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ ...S.card, padding:20 }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#0f172a', marginBottom:14 }}>
                📊 Thống kê lý do hoàn hàng
                <span style={{ fontWeight:500, fontSize:'0.76rem', color:'#94a3b8', marginLeft:8 }}>
                  {blDays ? `${blDays} ngày gần đây` : 'tất cả thời gian'}
                </span>
              </div>
              {blStats.reasonList.length > 0 ? (
                <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                  <ResponsiveContainer width={170} height={170}>
                    <PieChart>
                      <Pie data={blStats.reasonList} dataKey='value' nameKey='name' cx='50%' cy='50%'
                        innerRadius={48} outerRadius={74} paddingAngle={3} strokeWidth={0}>
                        {blStats.reasonList.map((_,i) => <Cell key={i} fill={BL_REASON_COLORS[i % BL_REASON_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v,n)=>[`${v} đơn`, n]} contentStyle={{ borderRadius:10, border:'1px solid #e5e7eb' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex:1, minWidth:180, display:'flex', flexDirection:'column', gap:7 }}>
                    {blStats.reasonList.map((r,i) => (
                      <div key={r.name} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.8rem' }}>
                        <span style={{ width:10, height:10, borderRadius:'50%', background:BL_REASON_COLORS[i % BL_REASON_COLORS.length], flexShrink:0 }}/>
                        <span style={{ color:'#475569', flex:1 }}>{r.name}</span>
                        <b style={{ color:'#0f172a' }}>{r.value}</b>
                        <span style={{ color:'#94a3b8', width:42, textAlign:'right' }}>({r.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding:30, textAlign:'center', color:'#94a3b8', fontSize:'0.85rem' }}>Chưa có dữ liệu</div>
              )}
            </div>

            {/* Cảnh báo */}
            <div style={{ ...S.card, padding:20, background:'#fffbeb', borderColor:'#fde68a' }}>
              <div style={{ fontWeight:800, fontSize:'0.95rem', color:'#b45309', marginBottom:12 }}>⚠️ Cảnh báo</div>
              {(() => {
                const cnt = {};
                blacklist.forEach(b => { if (b.phone) cnt[b.phone] = (cnt[b.phone]||0)+1; });
                const repeat = Object.entries(cnt).filter(([,n]) => n >= 3);
                const reviewing = blStats.byStatus['Xem xét'] || 0;
                const items = [
                  { n: repeat.length, txt: 'khách hoàn hàng từ 3 lần trở lên — nên đưa vào Blacklist', color:'#dc2626' },
                  { n: reviewing,     txt: 'khách đang ở trạng thái "Xem xét" — cần chốt xử lý',        color:'#ea580c' },
                  { n: blStats.customers, txt: 'khách không trùng lặp trong danh sách đang lọc',        color:'#64748b' },
                ];
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                    {items.map((it,i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                        <span style={{ minWidth:34, height:26, borderRadius:8, display:'inline-flex', alignItems:'center',
                          justifyContent:'center', background:'#fff', border:`1px solid ${it.color}44`,
                          color:it.color, fontWeight:900, fontSize:'0.82rem', padding:'0 6px' }}>{it.n}</span>
                        <span style={{ fontSize:'0.8rem', color:'#78350f', lineHeight:1.5 }}>{it.txt}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div style={{ marginTop:14, paddingTop:12, borderTop:'1px dashed #fde68a', fontSize:'0.76rem', color:'#92400e', lineHeight:1.55 }}>
                ℹ️ Khách ở trạng thái <b>Blacklist</b> nên từ chối tạo đơn mới. Đổi trạng thái ngay trong cột “Trạng thái”.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: thêm/sửa blacklist ── */}
      {editBl && (
        <Modal onClose={()=>setEditBl(null)} title={editBl.id ? 'Sửa bản ghi Blacklist' : 'Thêm vào Blacklist'}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
            <div><FieldLabel label='ID Nhanh'/>
              <input style={S.input} value={editBl.nhanh_id||''} onChange={e=>setEditBl(p=>({...p, nhanh_id:e.target.value}))}/></div>
            <div><FieldLabel label='Ngày đặt hàng'/>
              <input type='date' style={S.input} value={editBl.order_date||''} onChange={e=>setEditBl(p=>({...p, order_date:e.target.value}))}/></div>
            <div><FieldLabel label='Tên khách hàng'/>
              <input style={S.input} value={editBl.full_name||''} onChange={e=>setEditBl(p=>({...p, full_name:e.target.value}))}/></div>
            <div><FieldLabel label='Số điện thoại *'/>
              <input style={S.input} value={editBl.phone||''} onChange={e=>setEditBl(p=>({...p, phone:e.target.value}))}/></div>
            <div><FieldLabel label='Nguồn khách'/>
              <select style={S.select} value={editBl.source||''} onChange={e=>setEditBl(p=>({...p, source:e.target.value}))}>
                <option value=''>—</option>{ORDER_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><FieldLabel label='Tổng tiền (đ)'/>
              <input style={S.input} value={editBl.total_amount??''} onChange={e=>setEditBl(p=>({...p, total_amount:e.target.value}))}/></div>
            <div style={{ gridColumn:'1 / -1' }}><FieldLabel label='Sản phẩm'/>
              <input style={S.input} value={editBl.product_name||''} onChange={e=>setEditBl(p=>({...p, product_name:e.target.value}))}/></div>
            <div><FieldLabel label='Lý do blacklist'/>
              <select style={S.select} value={editBl.reason||''} onChange={e=>setEditBl(p=>({...p, reason:e.target.value}))}>
                {BL_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select></div>
            <div><FieldLabel label='Mã vận đơn'/>
              <input style={S.input} value={editBl.shipping_code||''} onChange={e=>setEditBl(p=>({...p, shipping_code:e.target.value}))}/></div>
            <div><FieldLabel label='Trạng thái'/>
              <select style={S.select} value={editBl.status||'Blacklist'} onChange={e=>setEditBl(p=>({...p, status:e.target.value}))}>
                {BL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><FieldLabel label='Nhân sự phụ trách'/>
              <select style={S.select} value={editBl.sales_person||''} onChange={e=>setEditBl(p=>({...p, sales_person:e.target.value}))}>
                <option value=''>—</option>{SALES_PERSONS.map(s=><option key={s} value={s}>{s}</option>)}
              </select></div>
            <div style={{ gridColumn:'1 / -1' }}><FieldLabel label='Địa chỉ'/>
              <input style={S.input} value={editBl.address||''} onChange={e=>setEditBl(p=>({...p, address:e.target.value}))}/></div>
          </div>
          <div style={{ display:'flex', gap:9, marginTop:18 }}>
            <button onClick={saveBl} disabled={saving} style={{ ...S.btnPrimary, flex:1, opacity:saving?0.6:1 }}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
            <button onClick={()=>setEditBl(null)} style={S.btnOutline}>Đóng</button>
          </div>
        </Modal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
         MODAL: Thêm khách hàng
         ════════════════════════════════════════════════════════════════════ */}
      {showImport && (
        <Modal onClose={()=>setShowImport(false)} title='Nhập khách hàng từ Excel'>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:'0.82rem', color:'#64748b', lineHeight:1.55 }}>
              Tải file mẫu về điền cho đúng, hoặc xuất 1 tab từ Google Sheet ra Excel/CSV rồi tải lên.
              Tao tự dò dòng tiêu đề + đọc cột: <b>SĐT, TÊN, TỈNH, LOẠI HÌNH KD, ĐỊA CHỈ, KHU VỰC, ĐLH</b>.
              Trùng SĐT sẽ <b>cập nhật</b> chứ không tạo trùng.
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'10px 12px',
              background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10 }}>
              <button onClick={downloadTemplate}
                style={{ ...S.btnPrimary, padding:'8px 16px', fontSize:'0.82rem', whiteSpace:'nowrap' }}>
                📄 Tải file mẫu (.xlsx)
              </button>
              <div style={{ fontSize:'0.74rem', color:'#cc4a16', lineHeight:1.5 }}>
                <b>LOẠI HÌNH KD</b> điền đúng 1 trong: {BUSINESS_TYPES.join(' · ')}.<br/>
                <b>ĐLH</b> = đã liên hệ → điền <b>x</b> (để trống = chưa). Nhân sự + Loại KH chọn ở dưới (gán cả file).
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <FieldLabel label='Nhân sự (gán cả file)'/>
                <select value={impPerson} onChange={e=>setImpPerson(e.target.value)} style={S.select}>
                  <option value=''>— Không gán —</option>
                  {SALES_PERSONS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel label='Loại KH (gán cả file)'/>
                <select value={impType} onChange={e=>setImpType(e.target.value)} style={S.select}>
                  <option value='Mới'>Mới</option>
                  <option value='Cũ'>Cũ</option>
                </select>
              </div>
            </div>
            <div>
              <FieldLabel label='File Excel / CSV'/>
              <input type='file' accept='.xlsx,.xls,.csv'
                onChange={e=>onPickImportFile(e.target.files?.[0])}
                style={{ ...S.input, padding:'8px' }}/>
              {impFile && <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:6 }}>📄 {impFile}</div>}
            </div>
            {impMsg && (
              <div style={{ fontSize:'0.82rem', fontWeight:600, padding:'10px 12px', borderRadius:8,
                background: impMsg.startsWith('⚠️') ? '#fef2f2' : '#f0fdf4',
                color: impMsg.startsWith('⚠️') ? '#dc2626' : '#15803d' }}>{impMsg}</div>
            )}
            <button onClick={runImport} disabled={!impRows.length || importing}
              style={{ ...S.btnPrimary, width:'100%', opacity:(!impRows.length || importing) ? 0.5 : 1 }}>
              {importing ? 'Đang nhập…' : `Nhập ${impRows.length || ''} khách vào CRM`}
            </button>
          </div>
        </Modal>
      )}

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
              {editGroupId ? (
                <div style={{ ...S.input, display:'flex', alignItems:'center', background:'#f8fafc', color:'#16a34a', fontWeight:700 }}>
                  +{Math.max(0, Number(newGroup.total_members||0) - editOrigMembers)}
                  <span style={{ color:'#94a3b8', fontWeight:400, fontSize:'0.76rem', marginLeft:6 }}>
                    (tự tính: {Number(newGroup.total_members||0)} − {editOrigMembers} cũ)
                  </span>
                </div>
              ) : (
                <input type='number' value={newGroup.new_joins}
                  onChange={e=>setNewGroup(p=>({...p,new_joins:e.target.value}))}
                  placeholder='0' style={S.input}/>
              )}
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
        <Modal onClose={()=>setShowOAForm(false)} title='Cập nhật / Thêm Zalo OA'>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div>
              <FieldLabel label='Tên OA' required/>
              <input value={newOA.oa_name} list='oa-names' placeholder='VD: eHerb OA, Spa OA…'
                onChange={e=>setNewOA(p=>({...p,oa_name:e.target.value}))} style={S.input}/>
              <datalist id='oa-names'>{zaloOAList.map(o=><option key={o.name} value={o.name}/>)}</datalist>
            </div>
            <div>
              <FieldLabel label='Ngày báo cáo'/>
              <input type='date' value={newOA.report_date}
                onChange={e=>setNewOA(p=>({...p,report_date:e.target.value}))} style={S.input}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div>
              <FieldLabel label='Tổng follow (hiện tại)'/>
              <input type='number' value={newOA.total_follows}
                onChange={e=>setNewOA(p=>({...p,total_follows:e.target.value}))} placeholder='0' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Follow mới (trong kỳ)'/>
              <input type='number' value={newOA.new_follows}
                onChange={e=>setNewOA(p=>({...p,new_follows:e.target.value}))} placeholder='0' style={S.input}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
            <div>
              <FieldLabel label='Lượt quét OA'/>
              <input type='number' value={newOA.oa_scans}
                onChange={e=>setNewOA(p=>({...p,oa_scans:e.target.value}))} placeholder='0' style={S.input}/>
            </div>
            <div>
              <FieldLabel label='Tương tác menu (TIN 30D)'/>
              <input type='number' value={newOA.menu_interactions}
                onChange={e=>setNewOA(p=>({...p,menu_interactions:e.target.value}))} placeholder='0' style={S.input}/>
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
