// src/context/AppDataContext.jsx

import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

// ============================================================================
// --- HÀM CHUYỂN SỐ THÀNH CHỮ (GIỮ NGUYÊN) ---
// ============================================================================
const mangso = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function dochangchuc(so, daydu) {
    let chuoi = "";
    let chuc = Math.floor(so / 10);
    let donvi = so % 10;
    if (chuc > 1) {
        chuoi = " " + mangso[chuc] + " mươi";
        if (donvi == 1) { chuoi += " mốt"; }
    } else if (chuc == 1) {
        chuoi = " mười";
        if (donvi == 5) { chuoi += " lăm"; }
    } else if (daydu && donvi > 0) {
        chuoi = " lẻ";
    }
    if (donvi == 5 && chuc > 1) {
        chuoi += " lăm";
    } else if (donvi > 0 && donvi != 1 && donvi != 5) {
        chuoi += " " + mangso[donvi];
    } else if (donvi == 1 && chuc < 1) {
        chuoi += " " + mangso[donvi];
    }
    return chuoi;
}
function dochangtram(so, daydu) {
    let chuoi = "";
    let tram = Math.floor(so / 100);
    so = so % 100;
    if (daydu || tram > 0) {
        chuoi = " " + mangso[tram] + " trăm";
        chuoi += dochangchuc(so, true);
    } else {
        chuoi = dochangchuc(so, false);
    }
    return chuoi;
}
function dochangtrieu(so, daydu) {
    let chuoi = "";
    let trieu = Math.floor(so / 1000000);
    so = so % 1000000;
    if (trieu > 0) {
        chuoi = dochangtram(trieu, daydu) + " triệu";
        daydu = true;
    }
    let nghin = Math.floor(so / 1000);
    so = so % 1000;
    if (nghin > 0) {
        chuoi += dochangtram(nghin, daydu) + " nghìn";
        daydu = true;
    }
    if (so > 0) {
        chuoi += dochangtram(so, daydu);
    }
    return chuoi;
}
function to_vietnamese_string(so) {
    if (so == 0) return mangso[0].charAt(0).toUpperCase() + mangso[0].slice(1);
    let chuoi = "", hauto = "";
    do {
        let ty = so % 1000000000;
        so = Math.floor(so / 1000000000);
        if (so > 0) {
            chuoi = dochangtram(ty, true) + hauto + chuoi;
        } else {
            chuoi = dochangtram(ty, false) + hauto + chuoi;
        }
        hauto = " tỷ";
    } while (so > 0);
    let finalString = chuoi.trim();
    return finalString.charAt(0).toUpperCase() + finalString.slice(1);
}

// Cấu hình Phân trang
const ORDERS_PER_PAGE = 50;
const AIRLINKS_PER_PAGE = 500;
// 1. Tạo Context
export const AppDataContext = createContext(null);

// 2. Tạo Provider
export const AppDataProvider = ({ children }) => {
  // AUTH (Giữ nguyên nhưng chưa kích hoạt chặn)
  const [user, setUser] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    checkSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user || null);
        if (event === 'SIGNED_IN') loadInitialData();
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);
  const handleLogin = async (email, password) => {
    setIsLoggingIn(true); setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError('Sai email hoặc mật khẩu!');
    setIsLoggingIn(false);
  };
  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setDonHangs([]); setAirLinks([]); };
  // STATE CHUNG
  const [brands, setBrands] = useState([]);
  const [nhanSus, setNhanSus] = useState([]);
  const [sanPhams, setSanPhams] = useState([]);
  const [filterSanPhams, setFilterSanPhams] = useState([]);

  // STATE ORDER
  const [isLoading, setIsLoading] = useState(false);
  const [hoTen, setHoTen] = useState('');
  const [idKenh, setIdKenh] = useState('');
  const [sdt, setSdt] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [cccd, setCccd] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSanPhams, setSelectedSanPhams] = useState({});
  const [selectedNhanSu, setSelectedNhanSu] = useState('');
  const [loaiShip, setLoaiShip] = useState('Ship thường');
  const [donHangs, setDonHangs] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterLoaiShip, setFilterLoaiShip] = useState('');
  const [filterEditedStatus, setFilterEditedStatus] = useState('all');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState({ 'Ship thường': [], 'Hỏa tốc': [] });
  const [rawSummaryData, setRawSummaryData] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'chi_phi_tong', direction: 'desc' });
  const [editingDonHang, setEditingDonHang] = useState(null);
  const [isPastDeadlineForNewOrders] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours > 16 || (hours === 16 && minutes >= 30);
  });
  const [columnWidths, setColumnWidths] = useState({ select: 40, stt: 50, ngayGui: 160, hoTenKOC: 150, cccd: 120, idKenh: 120, sdt: 120, diaChi: 250, brand: 120, sanPham: 200, nhanSu: 120, loaiShip: 120, trangThai: 120, hanhDong: 150 });
  // STATE CONTRACT
  const [contractData, setContractData] = useState({
        benB_ten: '', benB_sdt: '', benB_diaChi: '', benB_cccd: '', benB_mst: '', benB_stk: '', benB_nganHang: '', benB_nguoiThuHuong: '',
        soHopDong: '', ngayKy: new Date().toISOString().split('T')[0], ngayThucHien: new Date().toISOString().split('T')[0],
        sanPham: '', linkSanPham: '', linkKenh: '', soLuong: 1, donGia: 0,
        benA_ten: "CÔNG TY TNHH ĐỘNG \nHỌC STELLA",
        benA_diaChi: "9/11 Nguyễn Huy Tưởng, Phường Gia Định, Thành phố Hồ Chí Minh",
        benA_mst: "0314421133",
        benA_nguoiDaiDien: "VÕ HUÂN",
        benA_chucVu: "Giám đốc",
  });
  const [contractHTML, setContractHTML] = useState('');
  const [isOutputVisible, setIsOutputVisible] = useState(false);
  const [copyMessage, setCopyMessage] = useState({ text: '', type: 'hidden' });
  // STATE LƯU TRỮ HỢP ĐỒNG (MỚI)
  const [savedContracts, setSavedContracts] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  // STATE AIR LINKS
  const [airLinks, setAirLinks] = useState([]);
  const [isLoadingAirLinks, setIsLoadingAirLinks] = useState(false);
  const [filterAlKenh, setFilterAlKenh] = useState('');
  const [filterAlBrand, setFilterAlBrand] = useState('');
  const [filterAlNhanSu, setFilterAlNhanSu] = useState('');
  const [filterAlDate, setFilterAlDate] = useState('');
  const [airLinksCurrentPage, setAirLinksCurrentPage] = useState(1);
  const [airLinksTotalCount, setAirLinksTotalCount] = useState(0);
  
  // STATE BÁO CÁO AIR LINKS
  const [airReportMonth, setAirReportMonth] = useState(new Date().getMonth() + 1);
  const [airReportYear, setAirReportYear] = useState(new Date().getFullYear());
  const [airReportData, setAirReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isAirReportLoading, setIsAirReportLoading] = useState(false);
  const [airSortConfig, setAirSortConfig] = useState({ key: 'chi_phi_cast', direction: 'desc' });
  // --- LOGIC ---
  const handleResize = (key) => (e, { size }) => { setColumnWidths(prev => ({ ...prev, [key]: size.width }));
  };

  // --- LOAD ORDER DATA (ĐÃ BỎ CHECK USER ĐỂ HIỆN DATA) ---
  const loadInitialData = async () => { 
    // if (!user) return;
    setIsLoading(true);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = startIndex + ORDERS_PER_PAGE - 1;
    let query = supabase.from('donguis').select(`id, ngay_gui, da_sua, loai_ship, original_loai_ship, trang_thai, original_trang_thai, koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, koc_cccd, original_koc_cccd, nhansu ( id, ten_nhansu ), chitiettonguis ( id, so_luong, sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )`, { count: 'exact' });
    if (filterIdKenh) query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`);
    if (filterSdt) query = query.ilike('koc_sdt', `%${filterSdt}%`);
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
    const { count, error: countError } = await query.order('ngay_gui', { ascending: false }).range(0, 0);
    if (countError) { alert("Lỗi tải tổng số đơn hàng: " + countError.message); setIsLoading(false); return;
    }
    setTotalOrderCount(count || 0); 
    const { data, error } = await query.order('ngay_gui', { ascending: false }).range(startIndex, endIndex);
    if(error) { alert("Lỗi tải dữ liệu Order: " + error.message) } 
    else if (data) {
      const dataWithStt = data.map((item, index) => ({ ...item, originalStt: (count || 0) - (startIndex + index) }));
      const filteredData = dataWithStt.filter(donHang => {
          if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
          if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
          return true;
      });
      setDonHangs(filteredData);
    }
    setIsLoading(false); 
  };

  const loadSanPhamsByBrand = async (brandId) => {
      // if (!user) return;
      if (!brandId) { setSanPhams([]); setFilterSanPhams([]); return;
      }
      const { data: sanPhamsData, error } = await supabase.from('sanphams').select(`id, ten_sanpham, barcode, gia_tien`).eq('brand_id', brandId);
      if (error) { console.error("Lỗi tải sản phẩm theo Brand:", error.message); } else { setSanPhams(sanPhamsData || []); setFilterSanPhams(sanPhamsData || []);
      }
  };

  const handleQuantityChange = (productId, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    setSelectedSanPhams(prevSelected => { const newSelected = { ...prevSelected }; if (isNaN(quantity) || quantity <= 0) { delete newSelected[productId]; } else { newSelected[productId] = quantity; } return newSelected; });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return;
    }
    if (Object.keys(selectedSanPhams).length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm với số lượng lớn hơn 0!');
    return; }
    setIsLoading(true);
    try {
      const donGuiPayload = { koc_ho_ten: hoTen, original_koc_ho_ten: hoTen, koc_id_kenh: idKenh, original_koc_id_kenh: idKenh, koc_sdt: sdt, original_koc_sdt: sdt, koc_dia_chi: diaChi, original_koc_dia_chi: diaChi, koc_cccd: cccd, original_koc_cccd: cccd, nhansu_id: selectedNhanSu, loai_ship: loaiShip, original_loai_ship: loaiShip, trang_thai: 'Chưa đóng đơn', original_trang_thai: 'Chưa đóng đơn', };
      const { data: donGuiData, error: donGuiError } = await supabase.from('donguis').insert(donGuiPayload).select().single();
      if (donGuiError) throw donGuiError;
      const chiTietData = Object.entries(selectedSanPhams).map(([sanPhamId, soLuong]) => ({ don_gui_id: donGuiData.id, sanpham_id: sanPhamId, so_luong: soLuong }));
      if (chiTietData.length > 0) { const { error: chiTietError } = await supabase.from('chitiettonguis').insert(chiTietData); if (chiTietError) throw chiTietError;
      }
      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd(''); setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu('');
      setLoaiShip('Ship thường');
      loadInitialData();
      const newOrderDate = new Date();
      if (newOrderDate.getMonth() + 1 === parseInt(reportMonth, 10) && newOrderDate.getFullYear() === parseInt(reportYear, 10)) { await handleGenerateReport();
      }
    } catch (error) { alert('Đã có lỗi xảy ra: ' + error.message); } finally { setIsLoading(false);
    }
  };

  const handleIdKenhBlur = async () => { if (!idKenh) return;
    const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single();
    if (data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } };
  const clearFilters = () => { setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu('');
    setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); };
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!');
    return; }
    setIsSummarizing(true); setProductSummary({ 'Ship thường': [], 'Hỏa tốc': [] }); setRawSummaryData([]);
    const { data, error } = await supabase.rpc('get_product_summary_by_day_grouped', { target_day: summaryDate });
    if (error) { alert('Lỗi khi lấy tổng hợp: ' + error.message);
    } else if (data) {
      setRawSummaryData(data);
      setProductSummary({ 'Ship thường': data.filter(item => item.loai_ship === 'Ship thường'), 'Hỏa tốc': data.filter(item => item.loai_ship === 'Hỏa tốc') });
    }
    setIsSummarizing(false);
  };

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setReportData({ reportRows: [], brandHeaders: [] });
    const { data, error } = await supabase.rpc('generate_performance_report', { target_month: reportMonth, target_year: reportYear });
    if (error) { alert("Lỗi tải báo cáo (Order): " + error.message); setIsReportLoading(false); return;
    }
    const brandSet = new Set();
    const reportRows = data.map(row => {
      const brandCounts = row.brand_counts || {}; Object.keys(brandCounts).forEach(brand => brandSet.add(brand));
      return { ...row, brand_counts: brandCounts, sl_order: parseInt(row.sl_order, 10) || 0, chi_phi_tong: parseFloat(row.chi_phi_tong) || 0, aov_don_order: parseFloat(row.aov_don_order) || 0 };
    });
    setReportData({ reportRows, brandHeaders: Array.from(brandSet).sort() }); setIsReportLoading(false);
  };

  const requestSort = (key) => { let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') { direction = 'asc'; } setSortConfig({ key, direction }); };
  const handleEdit = (donHang) => { setEditingDonHang({ ...donHang }); };
  const handleCancelEdit = () => { setEditingDonHang(null); };
  const handleUpdate = async () => {
    if (!editingDonHang) return;
    if (!editingDonHang.koc_cccd || editingDonHang.koc_cccd.length !== 12 || !/^\d{12}$/.test(editingDonHang.koc_cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return;
    }
    const updatePayload = { koc_ho_ten: editingDonHang.koc_ho_ten, koc_id_kenh: editingDonHang.koc_id_kenh, koc_sdt: editingDonHang.koc_sdt, koc_dia_chi: editingDonHang.koc_dia_chi, koc_cccd: editingDonHang.koc_cccd, loai_ship: editingDonHang.loai_ship, trang_thai: editingDonHang.trang_thai, da_sua: true, };
    const { error } = await supabase.from('donguis').update(updatePayload).eq('id', editingDonHang.id);
    if (error) { alert('Lỗi cập nhật đơn gửi: ' + error.message); return;
    }
    await loadInitialData(); 
    const editedOrderDate = new Date(editingDonHang.ngay_gui);
    if (editedOrderDate.getMonth() + 1 === parseInt(reportMonth, 10) && editedOrderDate.getFullYear() === parseInt(reportYear, 10)) { await handleGenerateReport(); }
    setEditingDonHang(null);
  };
  const handleSelect = (orderId) => { setSelectedOrders(prevSelected => { const newSelected = new Set(prevSelected); if (newSelected.has(orderId)) { newSelected.delete(orderId); } else { newSelected.add(orderId); } return newSelected; });
  };
  const handleSelectAll = (e) => { if (e.target.checked) { const allDisplayedIds = new Set(donHangs.map(dh => dh.id)); setSelectedOrders(allDisplayedIds);
  } else { setSelectedOrders(new Set()); } };
  const handleBulkUpdateStatus = async () => { 
    if (selectedOrders.size === 0) { alert("Vui lòng chọn ít nhất một đơn hàng.");
    return; } 
    const idsToUpdate = Array.from(selectedOrders);
    const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', idsToUpdate);
    if (error) { alert("Lỗi khi cập nhật hàng loạt: " + error.message);
    } 
    else { setDonHangs(prevState => prevState.map(donHang => idsToUpdate.includes(donHang.id) ? { ...donHang, trang_thai: 'Đã đóng đơn' } : donHang ));
    setSelectedOrders(new Set()); alert(`Đã cập nhật trạng thái cho ${idsToUpdate.length} đơn hàng.`); } 
  };
  const handleExport = ({ data, headers, filename }) => { 
    const orderedData = data.map(row => { const newRow = {}; headers.forEach(header => { if (header.key) { newRow[header.label] = row[header.key]; } }); return newRow; });
    const worksheet = XLSX.utils.json_to_sheet(orderedData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1"); XLSX.writeFile(workbook, filename); 
  };
  const handleExportAll = async () => {
    setIsLoading(true);
    let query = supabase.from('donguis').select(`id, ngay_gui, da_sua, loai_ship, original_loai_ship, trang_thai, original_trang_thai, koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, koc_cccd, original_koc_cccd, nhansu ( id, ten_nhansu ), chitiettonguis ( id, so_luong, sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )`).order('ngay_gui', { ascending: false });
    if (filterIdKenh) query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`); if (filterSdt) query = query.ilike('koc_sdt', `%${filterSdt}%`); if (filterNhanSu) query = query.eq('nhansu_id', filterNhanSu);
    if (filterLoaiShip) query = query.eq('loai_ship', filterLoaiShip);
    if (filterNgay) { const startDate = `${filterNgay}T00:00:00.000Z`; const endDate = `${filterNgay}T23:59:59.999Z`;
    query = query.gte('ngay_gui', startDate).lte('ngay_gui', endDate); }
    if (filterEditedStatus !== 'all') { const isEdited = filterEditedStatus === 'edited';
    query = query.eq('da_sua', isEdited); }
    const { data, error } = await query;
    if (error) { alert("Lỗi tải dữ liệu để xuất file: " + error.message); setIsLoading(false); return;
    }
    let exportData = data || [];
    exportData = exportData.filter(donHang => {
        if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
        if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
        return true;
    });
    const finalExportData = exportData.flatMap((donHang, index) => {
        const baseData = { stt: index + 1, ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), tenKOC: donHang.koc_ho_ten, cccd: donHang.koc_cccd, idKenh: donHang.koc_id_kenh, sdt: donHang.koc_sdt, diaChi: donHang.koc_dia_chi, nhanSu: donHang.nhansu?.ten_nhansu, loaiShip: donHang.loai_ship, trangThai: donHang.trang_thai };
        if (donHang.chitiettonguis.length === 0) { return [{ ...baseData, sanPham: 'N/A', soLuong: 0, brand: 'N/A', barcode: 'N/A' }]; }
        return donHang.chitiettonguis.map(ct => ({ ...baseData, sanPham: ct.sanphams?.ten_sanpham, soLuong: ct.so_luong, brand: ct.sanphams?.brands?.ten_brand, barcode: ct.sanphams?.barcode, }));
    });
    const mainExportHeaders = [ { label: "STT", key: "stt"}, { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "CCCD", key: "cccd" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" }, { label: "Địa chỉ", key: "diaChi" }, { label: "Sản Phẩm", key: "sanPham" }, { label: "Số Lượng", key: "soLuong"}, { label: "Brand", key: "brand" }, { label: "Barcode", key: "barcode" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" }, { label: "Trạng Thái", key: "trangThai" }, ];
    handleExport({ data: finalExportData, headers: mainExportHeaders, filename: 'danh-sach-don-hang-FULL.xlsx' });
    setIsLoading(false);
  };
  
  // --- HÀM XÓA ĐƠN HÀNG "SÁT THỦ" (ĐÃ SỬA) ---
  const handleDeleteOrder = async (id) => {
    if (window.confirm("⚠️ Sếp có chắc muốn XÓA VĨNH VIỄN đơn hàng này không?")) {
        setIsLoading(true);

        // BƯỚC 1: Xóa sản phẩm con trong đơn trước (chitiettonguis)
        const { error: errorChiTiet } = await supabase
            .from('chitiettonguis')
            .delete()
            .eq('don_gui_id', id);

        // Nếu lỗi khi xóa chi tiết thì dừng lại và báo lỗi
        if (errorChiTiet) {
            alert("Lỗi khi xóa chi tiết đơn hàng: " + errorChiTiet.message);
            setIsLoading(false);
            return;
        }

        // BƯỚC 2: Xóa đơn chính (donguis)
        const { error: errorDon } = await supabase
            .from('donguis')
            .delete()
            .eq('id', id);
        
        if (errorDon) {
            alert("Lỗi khi xóa đơn gốc: " + errorDon.message);
        } else {
            alert("Đã xóa bay màu đơn hàng! 🗑️");
            // Cập nhật giao diện sau khi xóa thành công
            setDonHangs(prev => prev.filter(item => item.id !== id));
            setTotalOrderCount(prev => prev - 1);
        }
        setIsLoading(false);
    }
  };

  const handleContractFormChange = (e) => { const value = (e.target.type === 'number') ?
    parseFloat(e.target.value) || 0 : e.target.value;
    setContractData({ ...contractData, [e.target.id]: value }); };
    const handleGenerateContract = (event) => {
    event.preventDefault();
    const data = contractData;
    const formatCurrency = (num) => num.toLocaleString('vi-VN');
    const tongGiaTri = data.soLuong * data.donGia;
    const tongCong = Math.round(tongGiaTri / 0.9);
    const thueTNCN = tongCong - tongGiaTri;
    const thucTeThanhToan = tongGiaTri;
    const tongCongChu = to_vietnamese_string(tongCong) + ' đồng';
    const thueTNCNChu = to_vietnamese_string(thueTNCN) + ' đồng';
    const thucTeThanhToanChu = to_vietnamese_string(thucTeThanhToan) + ' đồng chẵn';
    const formatDate = (dateString) => {
        const dateObj = new Date(dateString);
        const ngay = String(dateObj.getDate()).padStart(2, '0');
        const thang = String(dateObj.getMonth() + 1).padStart(2, '0');
        const nam = dateObj.getFullYear();
        return { ngay, thang, nam, full: `ngày ${ngay} tháng ${thang} năm ${nam}` };
    };
    const ngayKy = formatDate(data.ngayKy);
    const ngayThucHien = formatDate(data.ngayThucHien);
    
    // --- FULL HTML HỢP ĐỒNG (KHÔNG RÚT GỌN) ---
    const contractTemplate = `
        <style>
            #contractContent { background-color: white;
            line-height: 1.6; font-family: 'Times New Roman', Times, serif; font-size: 13pt;
            }
            #contractContent table { width: 100%; border-collapse: collapse;
            border: 1px solid black; }
            #contractContent th, #contractContent td { border: 1px solid black;
            padding: 8px; vertical-align: top; }
            #contractContent .no-border-table, #contractContent .no-border-table td { border: none !important;
            padding: 2px 0; }
            #contractContent h1, h2 { text-align: center;
            font-weight: bold; }
            #contractContent .center-text { text-align: center;
            }
            #contractContent .bold-text { font-weight: bold;
            }
            @media print {
                body * { visibility: hidden;
                }
                #outputContainer, #outputContainer * { visibility: visible;
                }
                #outputContainer { position: absolute;
                left: 0; top: 0; width: 100%; height: auto; box-shadow: none; border: none;
                }
                #contractContent { max-height: none;
                overflow: visible; }
            }
        </style>
        <div id="contractContent">
            <div class="center-text"><p class="bold-text">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</p><p class="bold-text">Độc lập - Tự do - Hạnh phúc</p><p>---- o0o ----</p></div><br>
            <h2>HỢP ĐỒNG DỊCH VỤ</h2><p class="center-text">Số: ${data.soHopDong}</p><br>
            <p>Căn cứ Bộ luật Dân sự 2015 số 91/2015/QH13 ngày 24/11/2015;</p>
            <p>Căn cứ Luật Thương Mại số 36/2005/QH11 ngày 14/06/2005;</p>
            <p>Căn cứ Luật Quảng Cáo số 16/2012/QH13 ngày 21/06/2012 và các văn bản hướng dẫn liên quan;</p>
            <p>Căn cứ nhu cầu và khả năng của các bên</p><br>
            <p>Hôm nay, ${ngayKy.full}, chúng tôi gồm:</p>
            <table class="no-border-table" style="width: 100%;">
                <tr><td style="width: 20%;" class="bold-text">BÊN A</td><td style="width: 80%;" class="bold-text">: ${data.benA_ten.toUpperCase()}</td></tr>
                <tr><td>Địa chỉ</td><td>: ${data.benA_diaChi}</td></tr>
                <tr><td>Mã số thuế</td><td>: ${data.benA_mst}</td></tr>
                <tr><td>Người đại diện</td><td>: <span class="bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Chức vụ: ${data.benA_chucVu}</td></tr>
            </table>
            <p>Và</p>
            <table class="no-border-table" style="width: 100%;">
                <tr><td style="width: 20%;" class="bold-text">BÊN B</td><td style="width: 80%;" class="bold-text">: ${data.benB_ten.toUpperCase()}</td></tr>
                <tr><td>Địa chỉ</td><td>: ${data.benB_diaChi}</td></tr>
                <tr><td>SĐT</td><td>: ${data.benB_sdt}</td></tr>
                <tr><td>CCCD</td><td>: ${data.benB_cccd}</td></tr>
                <tr><td>MST</td><td>: ${data.benB_mst}</td></tr>
                <tr><td>Số tài khoản</td><td>: ${data.benB_stk}</td></tr>
                <tr><td>Ngân hàng</td><td>: ${data.benB_nganHang.toUpperCase()}</td></tr>
                <tr><td>Người thụ hưởng</td><td>: ${data.benB_nguoiThuHuong.toUpperCase()}</td></tr>
            </table><br>
            <p>Hai Bên thống nhất ký kết hợp đồng với các điều khoản và điều kiện sau đây:</p>
            <p class="bold-text">ĐIỀU 1: NỘI DUNG HỢP ĐỒNG</p>
            <p>1.1. Bên A mời Bên B đồng ý nhận cung cấp dịch vụ quảng cáo và Bên A đồng ý sử dụng dịch vụ quảng cáo trên kênh của B, cụ thể như sau:</p>
            <p style="padding-left: 20px;">a. Thời gian: ${ngayThucHien.ngay}/${ngayThucHien.thang}/${ngayThucHien.nam}</p>
            <p style="padding-left: 20px;">b. Sản phẩm: ${data.sanPham}</p>
            <p style="padding-left: 20px;">c. Link sản phẩm: ${data.linkSanPham}</p>
            <p style="padding-left: 20px;">d. Nội dung công việc cụ thể:</p>
            <table>
                <thead><tr><th class="center-text">STT</th><th class="center-text">Link kênh Tiktok</th><th class="center-text">Hạng mục</th><th class="center-text">Số lượng</th><th class="center-text">Đơn giá</th></tr></thead>
                <tbody>
                    <tr><td class="center-text">1</td><td>${data.linkKenh}</td><td class="center-text">video</td><td class="center-text">${String(data.soLuong).padStart(2, '0')}</td><td style="text-align: right;">${formatCurrency(data.donGia)}</td></tr>
                    <tr><td colspan="4" class="bold-text">Tổng giá trị hợp đồng</td><td style="text-align: right;" class="bold-text">${formatCurrency(tongGiaTri)}</td></tr>
                    <tr><td colspan="4">Thuế TNCN 10%</td><td style="text-align: right;">${formatCurrency(thueTNCN)}</td></tr>
                    <tr><td colspan="4" class="bold-text">TỔNG CỘNG</td><td style="text-align: right;" class="bold-text">${formatCurrency(tongCong)}</td></tr>
                </tbody>
            </table>
            <p><i>(Bằng chữ: ${tongCongChu}.)</i></p>
            <p>1.2. Nội dung nghiệm thu công việc:</p>
            <table>
                <thead><tr><th class="center-text">STT</th><th class="center-text">Hạng mục</th><th class="center-text">Nội dung nghiệm thu</th></tr></thead>
                <tbody>
                    <tr><td class="center-text">1</td><td>Demo (video)</td><td>Gửi Demo trước từ 3-5 ngày kể từ ngày đăng video</td></tr>
                    <tr><td class="center-text">2</td><td>Link Post (Url)</td><td>Check video đã gắn đúng link sản phẩm</td></tr>
                    <tr><td class="center-text">3</td><td>Cung cấp mã quảng cáo</td><td>Code ads 365 ngày hoặc uỷ quyền kênh</td></tr>
                </tbody>
            </table>
            <p class="bold-text">ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG VÀ THANH TOÁN</p>
             <p>2.1. Giá trị và thời gian thanh toán:</p>
            <p style="padding-left: 20px;">a. Tổng chi phí cho công việc mà Bên B thực hiện là <b>${formatCurrency(tongCong)} VNĐ</b> <i>(Bằng chữ: ${tongCongChu}.)</i> - Đã bao gồm thuế TNCN (10%)</p>
            <p style="padding-left: 20px;">b. Nghĩa vụ thuế TNCN của Bên B là: <b>${formatCurrency(thueTNCN)} VNĐ</b> <i>(Bằng chữ: ${thueTNCNChu}.)</i> Bên A có trách nhiệm khấu trừ tiền thuế tại nguồn để nộp thuế TNCN cho bên B.</p>
            <p style="padding-left: 20px;">c. Giá trị Hợp đồng Bên A thực tế thanh toán cho Bên B sau khi đã khấu trừ thuế TNCN cho Bên B là: <b>${formatCurrency(thucTeThanhToan)} VNĐ</b> <i>(Bằng chữ: ${thucTeThanhToanChu}).</i></p>
            <p style="padding-left: 20px;">d. Trong quá trình thực hiện Hợp đồng, nếu có phát sinh bất kỳ khoản chi phí nào ngoài giá trị Hợp đồng nêu trên, Bên B phải thông báo ngay lập tức cho Bên A và chỉ thực hiện phần công việc phát sinh chi phí đó khi nhận được sự đồng ý bằng văn bản của Bên A. Bên A không có trách nhiệm thanh toán cho Bên B bất kỳ khoản chi phí nào được triển khai khi chưa nhận được sự chấp thuận của Bên A.</p>
            <p>2.2. Thanh toán:</p>
            <p style="padding-left: 20px;">a. Hình thức thanh toán: Chuyển khoản theo số tài khoản quy định tại trang đầu tiên của hợp đồng.</p>
            <p style="padding-left: 20px;">b. Loại tiền thanh toán: Việt Nam đồng (VNĐ).</p>
            <p style="padding-left: 20px;">c. Thời hạn thanh toán: Bên A thanh toán 100% giá trị Hợp đồng quy định tại điểm c Điều 2.1 nêu trên cho Bên B trong thời hạn 15 (mười lăm) ngày làm việc kể từ thời điểm các Bên hoàn tất nghiệm thu tất cả các hạng mục theo quy định tại Điều 1.2 Hợp đồng.</p>
            <p class="bold-text">ĐIỀU 3: TRÁCH NHIỆM CỦA BÊN A</p>
            <p>3.1. Tạo điều kiện thuận lợi để bên B hoàn thành công việc.</p>
            <p>3.2. Bên A có trách nhiệm thanh toán đầy đủ và đúng hạn theo quy định tại Điều 2 của Hợp đồng. Việc thanh toán không được chậm hơn thời gian được quy định tại Điều 2 của Hợp đồng. Nếu bên A thanh toán chậm hơn thời gian được quy định tại điểm này, Bên A phải chịu tiền lãi suất tiền gửi không kỳ hạn của ngân hàng BIDV quy định tại thời điểm thanh toán.</p>
            <p>3.3. Bên A có trách nhiệm cung cấp đầy đủ, nhanh chóng, kịp thời thông tin, tài liệu để bên B thực hiện công việc.</p>
            <p>3.4. Thông báo bằng văn bản và nêu rõ lý do cho Bên B trong trường hợp Bên A có nhu cầu chấm dứt Hợp đồng ít nhất 03 (ba) ngày trước ngày dự định chấm dứt.</p>
            <p>3.5. Bên A được quyền kiểm tra, theo dõi, đánh giá, thẩm định chất lượng công việc do Bên B thực hiện.</p>
            <p>3.6. Các quyền và nghĩa vụ khác theo quy định của Hợp đồng và pháp luật hiện hành.</p>
            <p class="bold-text">ĐIỀU 4: TRÁCH NHIỆM CỦA BÊN B</p>
            <p>4.1. Thực hiện công việc theo đúng thỏa thuận giữa hai bên và theo quy định tại Điều 1 Hợp đồng, bao gồm nhưng không giới hạn cam kết đảm bảo chất lượng và thời hạn theo quy định của Hợp đồng.</p>
            <p>4.2. Tuân thủ các quy định làm việc và quy định nội bộ khác của Bên A trong thời gian thực hiện Hợp đồng.</p>
            <p>4.3. Trong trường hợp phát sinh bất kỳ khiếm khuyết nào đối với công việc, thì Bên B, bằng chi phí của mình, có nghĩa vụ khắc phục và/hoặc thực hiện lại đáp ứng các tiêu chuẩn, điều kiện của Bên A trong thời hạn do Bên A ấn định. Nếu Bên B vi phạm điều khoản này, Bên A có quyền thuê Bên Thứ Ba thực hiện công việc và mọi chi phí phát sinh sẽ do Bên B chịu trách nhiệm thanh toán.</p>
            <p>4.4. Trong quá trình thực hiện Hợp đồng, Bên B phải bảo mật tuyệt đối các thông tin nhận được từ Bên A. Trong trường hợp, Bên B vô ý hoặc cố ý tiết lộ các thông tin của Bên A mà chưa được Bên A chấp thuận trước bằng văn bản và/hoặc gây thiệt hại cho Bên A, Bên B sẽ phải chịu mọi trách nhiệm giải quyết cũng như bồi thường cho Bên A toàn bộ thiệt hại thực tế phát sinh.</p>
            <p>4.5. Phối hợp với bên A trong quá trình nghiệm thu kết quả thực hiện công việc/cung cấp dịch vụ theo quy định tại hợp đồng này.</p>
            <p>4.6. Các quyền và nghĩa vụ khác theo quy định tại Hợp đồng này và quy định của pháp luật.</p>
            <p class="bold-text">ĐIỀU 5. BẢO MẬT THÔNG TIN</p>
            <p>5.1. “Thông tin bảo mật” là tất cả các thông tin mà một trong hai Bên đã được cung cấp và/hoặc có được trong quá trình thực hiện Hợp đồng này, bao gồm nhưng không giới hạn các thông tin về Hợp đồng, chủ thể Hợp đồng, Dịch vụ, giá cả, bản chào thầu, công thức và/hoặc thông tin liên quan đến quy trình sản xuất, bản vẽ, mẫu thiết kế, danh sách khách hàng, kế hoạch, chiến lược kinh doanh, và toàn bộ các thông tin có liên quan khác.</p>
            <p>5.2. Tất cả các tài sản, phương tiện, thông tin, hồ sơ, tài liệu mà Bên B được giao, sử dụng hoặc nắm được trong quá trình thực hiện hợp đồng là tài sản của Bên A, Bên B không được quyền sao chép, tiết lộ, chuyển giao và cho người khác sử dụng hoặc sử dụng vì mục đích nào ngoài thực hiện Hợp đồng này trên cơ sở lợi ích của Bên A nếu không được sự chấp thuận trước bằng văn bản của Bên A. Mọi vi phạm sẽ dẫn đến việc chấm dứt Hợp đồng trước thời hạn, khi đó Bên A không phải chịu bất kỳ trách nhiệm nào vì chấm dứt Hợp đồng này trước thời hạn.</p>
            <p>5.3. Trong trường hợp những Thông tin bảo mật được yêu cầu cung cấp cho các cơ quan chính quyền theo luật định thì hai Bên phải thông báo cho nhau biết trong thời hạn 01 (một) ngày ngay sau khi nhận được yêu cầu từ cơ quan có thẩm quyền. Đồng thời các Bên cam kết chỉ tiết lộ các thông tin trong phạm vi được yêu cầu.</p>
            <p>5.4. Nếu Bên B vi phạm điều khoản này, dù gây thiệt hại/ảnh hưởng đến công việc kinh doanh của Bên A hay không, Bên B sẽ bị xử lý theo quy định của pháp luật hiện hành và phải bồi thường toàn bộ thiệt hại phát sinh cho Bên A. Để tránh hiểu nhầm, Bên A không có nghĩa vụ chứng minh các thiệt hại phát sinh trong trường hợp này.</p>
            <p class="bold-text">ĐIỀU 6: TẠM NGỪNG, CHẤM DỨT HỢP ĐỒNG</p>
            <p>6.1. Hợp đồng này có giá trị kể từ ngày ký kết và tự động thanh lý khi hai bên đã hoàn thành các nghĩa vụ quy định tại Hợp đồng này.</p>
            <p>6.2. Trong thời gian hợp đồng có hiệu lực, các bên có trách nhiệm thực hiện đúng nghĩa vụ của mình cho tới khi hợp đồng hết hiệu lực. Bên nào đơn phương chấm dứt hợp đồng trái các quy định tại Hợp đồng này và trái pháp luật sẽ phải chịu phạt một khoản tiền tương đương với 8% giá trị hợp đồng và có nghĩa vụ bồi thường cho bên còn lại toàn bộ các thiệt hại thực tế phát sinh do hành vi vi phạm theo quy định của pháp luật.</p>
            <p>6.3. Trường hợp bất khả kháng theo quy định của pháp luật dẫn đến việc một trong hai bên không có khả năng tiếp tục thực hiện Hợp đồng này thì phải báo cho bên kia biết trong vòng 15 (mười lăm) ngày kể từ ngày phát sinh sự kiện bất khả kháng.</p>
            <p>6.4. Bên A có quyền chấm dứt hợp đồng với bên B mà không bị phạt trong các trường hợp:</p>
            <p style="padding-left: 20px;">a. Bên B quá 03 (ba) lần cung cấp thông tin chậm so với thời gian được nêu ở Điều 1 hoặc cung cấp thông tin không chính xác, không đầy đủ theo yêu cầu của Bên A</p>
            <p style="padding-left: 20px;">b. Bên B thực hiện công việc không đảm bảo chất lượng, hoặc vi phạm quy định của Bên A, hoặc</p>
            <p style="padding-left: 20px;">c. Bên B gây thất thoát tài sản.</p>
            <p class="bold-text">ĐIỀU 7: ĐIỀU KHOẢN CHUNG</p>
            <p>7.1. Hai bên cam kết thực hiện đúng các điều khoản được ghi trong hợp đồng, bên nào vi phạm sẽ phải chịu trách nhiệm theo quy định của pháp luật và quy định trong Hợp đồng này.</p>
            <p>7.2. Hợp đồng này được điều chỉnh, diễn giải và thực hiện phù hợp với pháp luật Việt Nam. Trường hợp có tranh chấp xảy ra, Hai Bên sẽ cùng nhau bàn bạc tìm biện pháp giải quyết trên tinh thần thương lượng trong thời hạn 30 (ba mươi) ngày kể từ thời điểm phát sinh. Nếu Hai Bên không tự giải quyết được sau thời hạn này thì tranh chấp sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền. Phán quyết của Tòa án là chung thẩm buộc các Bên thực hiện và mọi chi phí giải quyết tranh chấp, bao gồm chi phí thuê luật sư của các Bên, sẽ do Bên thua kiện chi trả.</p>
            <p>7.3. Hợp đồng này được làm thành 02 (hai) bản bên A giữ 01 (một) bản, Bên B giữ 01 (một) bản có nội dung và giá trị pháp lý như nhau.</p>
            <br><br>
            <table class="no-border-table" style="position: relative; overflow: visible;">
                <tr>
                    <td class="center-text bold-text" style="width: 50%;">ĐẠI DIỆN BÊN A</td>
                    <td class="center-text bold-text" style="width: 50%;">ĐẠI DIỆN BÊN B</td>
                </tr>
                <tr>
                    <td class="center-text">(${data.benA_chucVu})</td>
                    <td class="center-text"></td>
                </tr>
                <tr><td style="height: 80px;"></td><td style="height: 80px;"></td></tr>
                <tr><td class="center-text bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</td><td class="center-text bold-text">${data.benB_ten.toUpperCase()}</td></tr>
            </table>
        </div>
    `;
    setContractHTML(contractTemplate);
    setIsOutputVisible(true);
    setCopyMessage({ text: '', type: 'hidden' });
  };
  
  const handleCopyToClipboard = () => {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = contractHTML;
    document.body.appendChild(tempElement);
    const range = document.createRange();
    range.selectNode(tempElement);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    try {
        const success = document.execCommand('copy');
        if (success) {
            setCopyMessage({ text: 'Đã sao chép vào clipboard!', type: 'success' });
        } else {
            setCopyMessage({ text: 'Lỗi! Trình duyệt chặn sao chép.', type: 'error' });
        }
    } catch (err) {
        setCopyMessage({ text: 'Lỗi! Không thể sao chép.', type: 'error' });
    }
    window.getSelection().removeAllRanges();
    document.body.removeChild(tempElement);
    setTimeout(() => {
        setCopyMessage({ text: '', type: 'hidden' });
    }, 3000);
};

  // =================================================================
  // HÀM LOGIC CHO TAB AIR LINKS (ĐÃ THÊM ĐẦY ĐỦ)
  // =================================================================
  const loadAirLinks = async () => {
    // if (!user) return;
    // <--- TẠM ẨN
    setIsLoadingAirLinks(true);
    // 1. Tính toán phân trang
    const startIndex = (airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE;
    const endIndex = startIndex + AIRLINKS_PER_PAGE - 1;

    // 2. Query (đã sửa)
    let query = supabase.from('air_links').select(`
      id, created_at, link_air_koc, id_kenh, id_video,
      "cast", cms_brand, 
      ngay_air, san_pham, ngay_booking,
      brands ( ten_brand ),
      nhansu ( ten_nhansu )
    `, { count: 'exact' });
    // 3. Áp dụng bộ lọc
    if (filterAlKenh) query = query.ilike('id_kenh', `%${filterAlKenh}%`);
    if (filterAlBrand) query = query.eq('brand_id', filterAlBrand);
    if (filterAlNhanSu) query = query.eq('nhansu_id', filterAlNhanSu);
    if (filterAlDate) {
      const startDate = `${filterAlDate}T00:00:00.000Z`;
      const endDate = `${filterAlDate}T23:59:59.999Z`;
      query = query.gte('ngay_air', startDate).lte('ngay_air', endDate);
    }

    // 4. Chạy query với phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false }) // Sắp xếp mới nhất
      .range(startIndex, endIndex);
    if (error) {
        alert("Lỗi tải danh sách Link Air: " + error.message);
    } else {
        setAirLinks(data || []);
        setAirLinksTotalCount(count || 0);
    }
    setIsLoadingAirLinks(false);
  };

  const handleDeleteAirLink = async (linkId, linkUrl) => {
    if (window.confirm(`Bạn có chắc muốn XÓA link này không?\n\n${linkUrl}`)) {
      setIsLoadingAirLinks(true);
      const { error } = await supabase.from('air_links').delete().eq('id', linkId);
      if (error) alert("Lỗi khi xóa link: " + error.message);
      else {
        alert("Đã xóa link thành công!");
        loadAirLinks();
      // Tải lại trang hiện tại
      }
      setIsLoadingAirLinks(false);
    }
  };

  const clearAirLinkFilters = () => {
    setFilterAlKenh('');
    setFilterAlBrand('');
    setFilterAlNhanSu('');
    setFilterAlDate('');
  };
  // --- HÀM MỚI: TẠO BÁO CÁO AIR LINKS ---
  const handleGenerateAirLinksReport = async () => {
    // if (!user) return;
    // <--- TẠM ẨN
    setIsAirReportLoading(true);
    setAirReportData({ reportRows: [], brandHeaders: [] });
    const { data, error } = await supabase.rpc('generate_air_links_report', { 
      target_month: airReportMonth, 
      target_year: airReportYear 
    });
    if (error) {
      alert("Lỗi tải báo cáo Air Links: " + error.message);
      setIsAirReportLoading(false);
      return;
    }
    
    const brandSet = new Set();
    const reportRows = data.map(row => {
      const brandCounts = row.brand_counts_air || {};
      Object.keys(brandCounts).forEach(brand => brandSet.add(brand));
      return {
        ...row,
        brand_counts_air: brandCounts,
        sl_video_air: parseInt(row.sl_video_air, 10) || 0,
        chi_phi_cast: parseFloat(row.chi_phi_cast) || 0,
      };
    });
    const brandHeaders = Array.from(brandSet).sort();
    setAirReportData({ reportRows, brandHeaders });
    setIsAirReportLoading(false);
  };
  // --- HÀM MỚI: SẮP XẾP BÁO CÁO AIR LINKS ---
  const requestAirSort = (key) => {
    let direction = 'desc';
    if (airSortConfig.key === key && airSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setAirSortConfig({ key, direction });
  };

  // =================================================================
  // USE EFFECT (Tác Vụ)
  // =================================================================
  
  // Effect tải dữ liệu chung (Brands, NhanSus) 1 lần
  useEffect(() => {
    async function getCommonData() {
      const { data: brandsData } = await supabase.from('brands').select();
      if (brandsData) setBrands(brandsData);
      const { data: nhanSusData } = await supabase.from('nhansu').select();
      if (nhanSusData) setNhanSus(nhanSusData);
    }
    getCommonData();
  }, []);
  // Effect tải DON HANG (Tab Order)
  useEffect(() => {
    loadInitialData();
  }, [currentPage, filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);
  // Effect reset trang (Tab Order)
  useEffect(() => {
    if (currentPage !== 1) {
        setCurrentPage(1);
    }
  }, [filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);
  // Effect tải sản phẩm theo brand (Tab Order)
  useEffect(() => {
      loadSanPhamsByBrand(selectedBrand);
      setProductSearchTerm(''); 
  }, [selectedBrand]);
  // Effect tải LINK AIR (Tab Air Links)
  useEffect(() => {
      loadAirLinks();
  }, [airLinksCurrentPage, filterAlKenh, filterAlBrand, filterAlNhanSu, filterAlDate]);
  // Effect reset trang (Tab Air Links)
  useEffect(() => {
    if (airLinksCurrentPage !== 1) {
        setAirLinksCurrentPage(1);
    }
  }, [filterAlKenh, filterAlBrand, filterAlNhanSu, filterAlDate]);
  // =================================================================
  // USE MEMO (Tính toán)
  // =================================================================
  
  // Memo Báo Cáo Order (Cũ)
  const sortedReportRows = useMemo(() => {
    if (reportData.reportRows.length === 0) return [];
    const sortableItems = [...reportData.reportRows];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (reportData.brandHeaders.includes(sortConfig.key)) {
          aValue = a.brand_counts[sortConfig.key] || 0;
           bValue = b.brand_counts[sortConfig.key] || 0;
        }
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
       });
    }
     return sortableItems;
}, [reportData.reportRows, sortConfig, reportData.brandHeaders]);
  const totalsRow = useMemo(() => {
    if (reportData.reportRows.length === 0) return null;
    const initialTotals = { sl_order: 0, chi_phi_tong: 0, brand_counts: {} };
    reportData.brandHeaders.forEach(brand => { initialTotals.brand_counts[brand] = 0; });
    const totals = reportData.reportRows.reduce((acc, row) => {
      acc.sl_order += Number(row.sl_order) || 0;
      acc.chi_phi_tong += Number(row.chi_phi_tong) || 0;
      reportData.brandHeaders.forEach(brand => {
        acc.brand_counts[brand] += (Number(row.brand_counts[brand]) || 0);
       });
      return acc;
    }, initialTotals);
    totals.aov_don_order = totals.sl_order > 0 ? (totals.chi_phi_tong / totals.sl_order) : 0;
    return totals;
  }, [reportData.reportRows, reportData.brandHeaders]);
  // Sửa: Thêm dependency
  
  // --- MEMO MỚI: BÁO CÁO AIR LINKS ---
  const sortedAirReportRows = useMemo(() => {
    if (airReportData.reportRows.length === 0) return [];
    const sortableItems = [...airReportData.reportRows];
    if (airSortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[airSortConfig.key];
        let bValue = b[airSortConfig.key];
        // Sắp xếp theo brand (json)
        if (airReportData.brandHeaders.includes(airSortConfig.key)) {
          aValue = a.brand_counts_air[airSortConfig.key] || 0;
          bValue = b.brand_counts_air[airSortConfig.key] || 0;
        }
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
        if (aValue < bValue) return airSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return airSortConfig.direction === 'asc' ? 1 : -1;
         return 0;
      });
    }
    return sortableItems;
  }, [airReportData.reportRows, airSortConfig, airReportData.brandHeaders]);
  const totalsRowAirReport = useMemo(() => {
    if (airReportData.reportRows.length === 0) return null;
    const initialTotals = { sl_video_air: 0, chi_phi_cast: 0, brand_counts_air: {} };
    airReportData.brandHeaders.forEach(brand => { initialTotals.brand_counts_air[brand] = 0; });
    
    const totals = airReportData.reportRows.reduce((acc, row) => {
      acc.sl_video_air += Number(row.sl_video_air) || 0;
      acc.chi_phi_cast += Number(row.chi_phi_cast) || 0;
      airReportData.brandHeaders.forEach(brand => {
        acc.brand_counts_air[brand] += (Number(row.brand_counts_air[brand]) || 0);
      });
      return acc;
    }, initialTotals);
    
    return totals;
  }, [airReportData.reportRows, airReportData.brandHeaders]);
  // =================================================================
  // Cung cấp VALUE cho Context
  // =================================================================
  const value = {
    // State chung
    brands, nhanSus, sanPhams, filterSanPhams,
    
    // State & Setters Tab Order
    isLoading, setIsLoading,
    hoTen, setHoTen,
    idKenh, setIdKenh,
    sdt, setSdt,
    diaChi, setDiaChi,
    cccd, setCccd,
    selectedBrand, setSelectedBrand,
    selectedSanPhams, setSelectedSanPhams,
    selectedNhanSu, setSelectedNhanSu,
    loaiShip, setLoaiShip,
    donHangs, setDonHangs,
    selectedOrders, setSelectedOrders,
    currentPage, setCurrentPage,
    totalOrderCount, setTotalOrderCount,
    filterIdKenh, setFilterIdKenh,
    filterSdt, setFilterSdt,
    filterBrand, setFilterBrand,
    filterSanPham, setFilterSanPham,
    filterNhanSu, setFilterNhanSu,
    filterNgay, setFilterNgay,
    filterLoaiShip, setFilterLoaiShip,
    filterEditedStatus, setFilterEditedStatus,
    productSearchTerm, setProductSearchTerm,
    summaryDate, setSummaryDate,
    productSummary, setProductSummary,
    rawSummaryData, setRawSummaryData,
    isSummarizing, setIsSummarizing,
    reportMonth, setReportMonth,
    reportYear, setReportYear,
    reportData, setReportData,
    isReportLoading, 
    setIsReportLoading,
    sortConfig, setSortConfig,
    editingDonHang, setEditingDonHang,
    isPastDeadlineForNewOrders,
    columnWidths, setColumnWidths,
    
    // Logic Tab Order
    handleResize,
    loadInitialData,
    loadSanPhamsByBrand,
    handleQuantityChange,
    handleSubmit,
    handleIdKenhBlur,
    clearFilters,
    handleGetSummary,
    handleGenerateReport,
    requestSort,
    handleEdit,
    handleCancelEdit,
    handleUpdate,
    handleSelect,
    handleSelectAll,
    handleBulkUpdateStatus,
    handleExport,
    handleExportAll,
 
    // Values đã tính (Memo)
    sortedReportRows,
    totalsRow,
    totalPages: Math.ceil(totalOrderCount / ORDERS_PER_PAGE),

    // State & Setters Tab Contract
    contractData, setContractData,
    contractHTML, setContractHTML,
    isOutputVisible, setIsOutputVisible,
    copyMessage, setCopyMessage,
    
    // Logic Tab Contract
    handleContractFormChange,
    handleGenerateContract,
    handleCopyToClipboard,

    // State & Setters Tab Air Links
    airLinks, setAirLinks,
    isLoadingAirLinks, setIsLoadingAirLinks,
    filterAlKenh, 
    setFilterAlKenh,
    filterAlBrand, setFilterAlBrand,
    filterAlNhanSu, setFilterAlNhanSu,
    filterAlDate, setFilterAlDate,
    airLinksCurrentPage, setAirLinksCurrentPage,
    airLinksTotalCount,

    // Logic Tab Air Links
    loadAirLinks,
    handleDeleteAirLink,
    clearAirLinkFilters,
    
    // Values đã tính (Memo)
    totalPagesAirLinks: Math.ceil(airLinksTotalCount / AIRLINKS_PER_PAGE),

    // --- LOGIC MỚI CHO BÁO CÁO AIR LINKS ---
    airReportMonth, setAirReportMonth,
    airReportYear, setAirReportYear,
    airReportData, setAirReportData,
    isAirReportLoading, setIsAirReportLoading,
    
    airSortConfig, setAirSortConfig,
    handleGenerateAirLinksReport, // <--- ĐÃ CÓ
    requestAirSort,
    sortedAirReportRows,
    totalsRowAirReport,

    // Auth (Đã tạm ẩn check để hiện data)
    user, handleLogin, handleLogout, isLoggingIn, loginError,

    // --- HÀM MỚI ---
    handleDeleteOrder, // <-- Đã thêm hàm này
    savedContracts: [], // Placeholder để không lỗi nếu chưa implement
    loadSavedContracts: () => {}, 
    addContractLink: 
    () => {}, 
    deleteContractLink: () => {}, 
    isLoadingContracts: false
  };
  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};
// 3. Tạo Custom Hook
export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}; 