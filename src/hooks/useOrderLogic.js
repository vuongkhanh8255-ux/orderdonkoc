// src/hooks/useOrderLogic.js
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

export const useOrderLogic = (brands, sanPhams, reportMonth, reportYear) => {
  const ORDERS_PER_PAGE = 50;

  // --- STATE ---
  const [isLoading, setIsLoading] = useState(false);
  const [donHangs, setDonHangs] = useState([]);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [hoTen, setHoTen] = useState('');
  const [idKenh, setIdKenh] = useState('');
  const [sdt, setSdt] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [cccd, setCccd] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSanPhams, setSelectedSanPhams] = useState({});
  const [selectedNhanSu, setSelectedNhanSu] = useState('');
  const [loaiShip, setLoaiShip] = useState('Ship thường');

  // Filters
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterLoaiShip, setFilterLoaiShip] = useState('');
  const [filterEditedStatus, setFilterEditedStatus] = useState('all');

  // Chart & Report
  const [chartNhanSu, setChartNhanSu] = useState('');
  const [chartData, setChartData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [reportData, setReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isReportLoading, setIsReportLoading] = useState(false);

  // Misc
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState({ 'Ship thường': [], 'Hỏa tốc': [] });
  const [rawSummaryData, setRawSummaryData] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'chi_phi_tong', direction: 'desc' });
  const [editingDonHang, setEditingDonHang] = useState(null);
  const [selectedOrders, setSelectedOrders] = useState(new Set());

  // --- LOAD DATA ---
  const loadInitialData = async () => {
    setIsLoading(true);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = startIndex + ORDERS_PER_PAGE - 1;

    const hasProductFilter = !!filterBrand || !!filterSanPham;
    const ctRelation = hasProductFilter ? 'chitiettonguis!chitiettonguis_dongui_id_fkey_final!inner' : 'chitiettonguis!chitiettonguis_dongui_id_fkey_final';
    const spRelation = hasProductFilter ? 'sanphams!inner' : 'sanphams';

    let query = supabase.from('donguis').select(`
        id, ngay_gui, da_sua, loai_ship, original_loai_ship, trang_thai, original_trang_thai, 
        koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, koc_sdt, original_koc_sdt, 
        koc_dia_chi, original_koc_dia_chi, koc_cccd, original_koc_cccd, 
        nhansu ( id, ten_nhansu ), 
        ${ctRelation} ( id, so_luong, ${spRelation} ( id, ten_sanpham, barcode, gia_tien, brand_id, brands ( id, ten_brand ) ) )
    `, { count: 'exact' });

    if (filterIdKenh) query = query.ilike('koc_id_kenh', `%${filterIdKenh.trim()}%`);
    if (filterSdt) query = query.ilike('koc_sdt', `%${filterSdt.trim()}%`);
    if (filterNhanSu) query = query.eq('nhansu_id', filterNhanSu);
    if (filterLoaiShip) query = query.eq('loai_ship', filterLoaiShip);
    if (filterNgay) {
      const startDate = `${filterNgay}T00:00:00.000Z`;
      const endDate = `${filterNgay}T23:59:59.999Z`;
      query = query.gte('ngay_gui', startDate).lte('ngay_gui', endDate);
    }
    if (filterEditedStatus !== 'all') {
      const isEdited = filterEditedStatus === 'edited';
      query = query.eq('da_sua', isEdited);
    }
    if (filterBrand) query = query.eq('chitiettonguis.sanphams.brand_id', filterBrand);
    if (filterSanPham) query = query.eq('chitiettonguis.sanphams.id', filterSanPham);

    const { count, error: countError } = await query.order('ngay_gui', { ascending: false }).range(0, 0);
    if (countError) { alert("Lỗi đếm: " + countError.message); setIsLoading(false); return; }
    setTotalOrderCount(count || 0);

    const { data, error } = await query.order('ngay_gui', { ascending: false }).range(startIndex, endIndex);
    if (error) { alert("Lỗi tải: " + error.message); }
    else if (data) {
      const dataWithStt = data.map((item, index) => ({ ...item, originalStt: (count || 0) - (startIndex + index) }));
      setDonHangs(dataWithStt);
    }
    setIsLoading(false);
  };

  // --- CHART LOGIC ---
  const fetchChartData = async (nhanSuId) => {
    if (!nhanSuId) { setChartData([]); return; }
    setIsChartLoading(true);
    const startDate = `${reportYear}-${String(reportMonth).padStart(2,'0')}-01T00:00:00.000Z`;
    const lastDay = new Date(reportYear, reportMonth, 0).getDate();
    const endDate = `${reportYear}-${String(reportMonth).padStart(2,'0')}-${lastDay}T23:59:59.999Z`;

    const { data, error } = await supabase.from('donguis').select('ngay_gui').eq('nhansu_id', nhanSuId).gte('ngay_gui', startDate).lte('ngay_gui', endDate);
    if (error) { console.error(error); setChartData([]); }
    else {
      const dailyCounts = {};
      for(let d=1; d<=lastDay; d++) dailyCounts[d] = 0;
      data.forEach(item => { const day = new Date(item.ngay_gui).getDate(); if(dailyCounts[day] !== undefined) dailyCounts[day]++; });
      setChartData(Object.keys(dailyCounts).map(d => ({ day: `Ngày ${d}`, orders: dailyCounts[d] })));
    }
    setIsChartLoading(false);
  };

  useEffect(() => { if (chartNhanSu) fetchChartData(chartNhanSu); else setChartData([]); }, [chartNhanSu, reportMonth, reportYear]);

  // --- ACTIONS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('CCCD 12 số'); return; }
    if (Object.keys(selectedSanPhams).length === 0) { alert('Chưa chọn SP'); return; }
    setIsLoading(true);
    try {
        const { data: dg, error: errDg } = await supabase.from('donguis').insert({ koc_ho_ten: hoTen, original_koc_ho_ten: hoTen, koc_id_kenh: idKenh, original_koc_id_kenh: idKenh, koc_sdt: sdt, original_koc_sdt: sdt, koc_dia_chi: diaChi, original_koc_dia_chi: diaChi, koc_cccd: cccd, original_koc_cccd: cccd, nhansu_id: selectedNhanSu, loai_ship: loaiShip, original_loai_ship: loaiShip, trang_thai: 'Chưa đóng đơn', original_trang_thai: 'Chưa đóng đơn' }).select().single();
        if(errDg) throw errDg;
        const ctData = Object.entries(selectedSanPhams).map(([spId, sl]) => ({ dongui_id: dg.id, sanpham_id: spId, so_luong: sl }));
        if(ctData.length > 0) { const { error: errCt } = await supabase.from('chitiettonguis').insert(ctData); if(errCt) throw errCt; }
        alert('Tạo đơn OK!'); setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd(''); setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu(''); loadInitialData();
    } catch(e) { alert("Lỗi: " + e.message); } finally { setIsLoading(false); }
  };

  const handleDeleteOrder = async (donHang) => {
    let id = donHang.id || donHang;
    if (window.confirm(`Xóa đơn #${id}?`)) {
        setIsLoading(true);
        try {
            await supabase.from('bookings').delete().ilike('ghi_chu', `%Đơn hàng #${id}%`);
            await supabase.from('chitiettonguis').delete().eq('dongui_id', id);
            await supabase.from('donguis').delete().eq('id', id);
            alert("Đã xóa!"); setDonHangs(p => p.filter(x => x.id !== id)); setTotalOrderCount(p => p - 1);
        } catch(e) { alert("Lỗi xóa: " + e.message); } finally { setIsLoading(false); }
    }
  };

  const handleUpdate = async () => {
      if(!editingDonHang) return;
      const { error } = await supabase.from('donguis').update({ 
          koc_ho_ten: editingDonHang.koc_ho_ten, koc_sdt: editingDonHang.koc_sdt, koc_dia_chi: editingDonHang.koc_dia_chi, 
          koc_cccd: editingDonHang.koc_cccd, loai_ship: editingDonHang.loai_ship, trang_thai: editingDonHang.trang_thai, da_sua: true
      }).eq('id', editingDonHang.id);
      if(error) alert("Lỗi update: " + error.message); else { loadInitialData(); setEditingDonHang(null); }
  };

  const handleGenerateReport = async () => {
    setIsReportLoading(true); setReportData({ reportRows: [], brandHeaders: [] });
    const { data, error } = await supabase.rpc('generate_performance_report', { target_month: reportMonth, target_year: reportYear });
    if(error) { alert("Lỗi Report: " + error.message); setIsReportLoading(false); return; }
    const bSet = new Set();
    const rows = data.map(r => { Object.keys(r.brand_counts||{}).forEach(b => bSet.add(b)); return { ...r, sl_order: Number(r.sl_order), chi_phi_tong: Number(r.chi_phi_tong), aov_don_order: Number(r.aov_don_order) }; });
    setReportData({ reportRows: rows, brandHeaders: Array.from(bSet).sort() }); setIsReportLoading(false);
  };

  // Helpers
  const handleQuantityChange = (id, val) => { const q = parseInt(val, 10); setSelectedSanPhams(p => { const n = {...p}; if(isNaN(q)||q<=0) delete n[id]; else n[id]=q; return n; }); };
  const handleIdKenhBlur = async () => { if(!idKenh) return; const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh.trim()).single(); if(data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } };
  const clearFilters = () => { setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu(''); setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); };
  const handleGetSummary = async () => { if(!summaryDate) return; setIsSummarizing(true); setProductSummary({'Ship thường': [], 'Hỏa tốc': []}); setRawSummaryData([]); try { const {data}=await supabase.from('chitiettonguis').select(`so_luong, donguis!inner(loai_ship, ngay_gui), sanphams(ten_sanpham, barcode, brands(ten_brand))`).gte('donguis.ngay_gui', `${summaryDate}T00:00:00.000Z`).lte('donguis.ngay_gui', `${summaryDate}T23:59:59.999Z`); const map={}; data?.forEach(i=>{ const key=`${i.sanphams?.brands?.ten_brand}_${i.sanphams?.barcode}_${i.donguis?.loai_ship}`; if(!map[key]) map[key]={ten_san_pham: i.sanphams?.ten_sanpham, barcode: i.sanphams?.barcode, ten_brand: i.sanphams?.brands?.ten_brand, loai_ship: i.donguis?.loai_ship, total_quantity: 0}; map[key].total_quantity+=i.so_luong; }); const final=Object.values(map).sort((a,b)=>a.ten_brand.localeCompare(b.ten_brand)); setRawSummaryData(final); setProductSummary({'Ship thường': final.filter(x=>x.loai_ship==='Ship thường'), 'Hỏa tốc': final.filter(x=>x.loai_ship==='Hỏa tốc')}); } catch(e){alert(e.message)} finally{setIsSummarizing(false);} };
  const handleExport = ({ data, headers, filename }) => { const ws = XLSX.utils.json_to_sheet(data.map(r => { const n={}; headers.forEach(h => { if(h.key) n[h.label] = r[h.key]; }); return n; })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1"); XLSX.writeFile(wb, filename); };
  const handleExportAll = async () => { setIsLoading(true); /* Logic export full */ alert("Đang export..."); setIsLoading(false); };
  const handleSelect = (id) => setSelectedOrders(p => { const n = new Set(p); if(n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleSelectAll = (e) => setSelectedOrders(e.target.checked ? new Set(donHangs.map(d=>d.id)) : new Set());
  const handleBulkUpdateStatus = async () => { if(!selectedOrders.size) return; const ids = Array.from(selectedOrders); const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', ids); if(error) alert(error.message); else { setDonHangs(p => p.map(d => ids.includes(d.id) ? {...d, trang_thai: 'Đã đóng đơn'} : d)); setSelectedOrders(new Set()); alert("Đã đóng đơn!"); } };
  const requestSort = (key) => { setSortConfig(p => ({ key, direction: p.key === key && p.direction === 'desc' ? 'asc' : 'desc' })); };

  // Effects
  useEffect(() => { loadInitialData(); }, [currentPage, filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);
  useEffect(() => { if(currentPage !== 1) setCurrentPage(1); }, [filterIdKenh, filterSdt, filterBrand, filterSanPham]);

  // Memo
  const sortedReportRows = useMemo(() => { if (!reportData.reportRows.length) return []; const items = [...reportData.reportRows]; if (sortConfig.key) { items.sort((a, b) => { let av = a[sortConfig.key], bv = b[sortConfig.key]; if(reportData.brandHeaders.includes(sortConfig.key)) { av = a.brand_counts[sortConfig.key]||0; bv = b.brand_counts[sortConfig.key]||0; } return (Number(av)||0) < (Number(bv)||0) ? (sortConfig.direction==='asc'?-1:1) : (sortConfig.direction==='asc'?1:-1); }); } return items; }, [reportData, sortConfig]);
  const totalsRow = useMemo(() => { if (!reportData.reportRows.length) return null; const t = { sl_order: 0, chi_phi_tong: 0, brand_counts: {} }; reportData.brandHeaders.forEach(b => t.brand_counts[b] = 0); reportData.reportRows.forEach(r => { t.sl_order += r.sl_order; t.chi_phi_tong += r.chi_phi_tong; reportData.brandHeaders.forEach(b => t.brand_counts[b] += (r.brand_counts[b] || 0)); }); t.aov_don_order = t.sl_order ? t.chi_phi_tong / t.sl_order : 0; return t; }, [reportData]);

  return {
    isLoading, setIsLoading, hoTen, setHoTen, idKenh, setIdKenh, sdt, setSdt, diaChi, setDiaChi, cccd, setCccd, selectedBrand, setSelectedBrand, selectedSanPhams, setSelectedSanPhams, selectedNhanSu, setSelectedNhanSu, loaiShip, setLoaiShip, donHangs, setDonHangs, selectedOrders, setSelectedOrders, currentPage, setCurrentPage, totalOrderCount, setTotalOrderCount,
    filterIdKenh, setFilterIdKenh, filterSdt, setFilterSdt, filterBrand, setFilterBrand, filterSanPham, setFilterSanPham, filterNhanSu, setFilterNhanSu, filterNgay, setFilterNgay, filterLoaiShip, setFilterLoaiShip, filterEditedStatus, setFilterEditedStatus,
    productSearchTerm, setProductSearchTerm, summaryDate, setSummaryDate, productSummary, rawSummaryData, isSummarizing,
    reportData, isReportLoading, sortConfig, setSortConfig, editingDonHang, setEditingDonHang,
    chartNhanSu, setChartNhanSu, chartData, isChartLoading,
    handleQuantityChange, handleSubmit, handleIdKenhBlur, clearFilters, handleGetSummary, handleGenerateReport, requestSort, handleEdit, setEditingDonHang, handleDeleteOrder, handleUpdate, handleSelect, handleSelectAll, handleBulkUpdateStatus, handleExport, handleExportAll, loadInitialData, fetchChartData,
    sortedReportRows, totalsRow, totalPages: Math.ceil(totalOrderCount / ORDERS_PER_PAGE)
  };
};