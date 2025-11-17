// src/context/AppDataContext.jsx

import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

// --- HÀM CHUYỂN SỐ THÀNH CHỮ (Logic giữ nguyên) ---
const mangso = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function dochangchuc(so, daydu) {
    let chuoi = "";
    let chuc = Math.floor(so / 10);
    let donvi = so % 10;
    if (chuc > 1) {
        chuoi = " " + mangso[chuc] + " mươi";
        if (donvi == 1) {
            chuoi += " mốt";
        }
    } else if (chuc == 1) {
        chuoi = " mười";
        if (donvi == 5) {
            chuoi += " lăm";
        }
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
// --- KẾT THÚC HÀM CHUYỂN SỐ ---

// Cấu hình Phân trang
const ORDERS_PER_PAGE = 50;
const AIRLINKS_PER_PAGE = 500; // 500 dòng mỗi trang

// 1. Tạo Context
const AppDataContext = createContext(null);

// 2. Tạo Provider (Component "Não")
export const AppDataProvider = ({ children }) => {
  // =================================================================
  // STATE CHUNG
  // =================================================================
  const [brands, setBrands] = useState([]);
  const [nhanSus, setNhanSus] = useState([]);
  const [sanPhams, setSanPhams] = useState([]); // Dùng cho form
  const [filterSanPhams, setFilterSanPhams] = useState([]); // Dùng cho lọc

  // =================================================================
  // STATE CHO TAB ORDER
  // =================================================================
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
  const [selectedOrders, setSelectedOrders] = new useState(new Set());
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
  const [columnWidths, setColumnWidths] = useState({ select: 40, stt: 50, ngayGui: 160, hoTenKOC: 150, cccd: 120, idKenh: 120, sdt: 120, diaChi: 250, brand: 120, sanPham: 200, nhanSu: 120, loaiShip: 120, trangThai: 120, hanhDong: 100 });
  
  // =================================================================
  // STATE CHO TAB CONTRACT
  // =================================================================
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
  
  // =================================================================
  // STATE CHO TAB AIR LINKS
  // =================================================================
  const [airLinks, setAirLinks] = useState([]);
  const [isLoadingAirLinks, setIsLoadingAirLinks] = useState(false);
  const [filterAlKenh, setFilterAlKenh] = useState('');
  const [filterAlBrand, setFilterAlBrand] = useState('');
  const [filterAlNhanSu, setFilterAlNhanSu] = useState('');
  const [filterAlDate, setFilterAlDate] = useState('');
  const [airLinksCurrentPage, setAirLinksCurrentPage] = useState(1);
  const [airLinksTotalCount, setAirLinksTotalCount] = useState(0);
  
  // --- STATE MỚI CHO BÁO CÁO AIR LINKS ---
  const [airReportMonth, setAirReportMonth] = useState(new Date().getMonth() + 1);
  const [airReportYear, setAirReportYear] = useState(new Date().getFullYear());
  const [airReportData, setAirReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isAirReportLoading, setIsAirReportLoading] = useState(false);
  const [airSortConfig, setAirSortConfig] = useState({ key: 'chi_phi_cast', direction: 'desc' });


  // =================================================================
  // HÀM LOGIC CHO TAB ORDER (Giữ nguyên)
  // =================================================================
  const handleResize = (key) => (e, { size }) => { setColumnWidths(prev => ({ ...prev, [key]: size.width }));
  };

  const loadInitialData = async () => { 
    setIsLoading(true);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = startIndex + ORDERS_PER_PAGE - 1;
    let query = supabase.from('donguis').select(`
      id, ngay_gui, da_sua,
      loai_ship, original_loai_ship, trang_thai, original_trang_thai,
      koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, 
      koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, 
      koc_cccd, original_koc_cccd,
      nhansu ( id, ten_nhansu ),
      chitiettonguis ( id, so_luong, 
      sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )
    `, { count: 'exact' });
    
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

    if (countError) {
        alert("Lỗi tải tổng số đơn hàng: " + countError.message);
        setIsLoading(false);
        return;
    }
    setTotalOrderCount(count || 0); 
    
    const { data, error } = await query
        .order('ngay_gui', { ascending: false })
        .range(startIndex, endIndex);
    if(error) { 
        alert("Lỗi tải dữ liệu Order: " + error.message) 
    } 
    else if (data) {
      const dataWithStt = data.map((item, index) => ({ 
          ...item, 
          originalStt: (count || 0) - (startIndex + index) 
      }));
      
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
      if (!brandId) {
          setSanPhams([]);
          setFilterSanPhams([]);
          return;
      }
      const { data: sanPhamsData, error } = await supabase
          .from('sanphams')
          .select(`id, ten_sanpham, barcode, gia_tien`)
          .eq('brand_id', brandId);
          
      if (error) {
          console.error("Lỗi tải sản phẩm theo Brand:", error.message);
      } else {
          setSanPhams(sanPhamsData || []);
          setFilterSanPhams(sanPhamsData || []);
      }
  };

  const handleQuantityChange = (productId, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    setSelectedSanPhams(prevSelected => { const newSelected = { ...prevSelected }; if (isNaN(quantity) || quantity <= 0) { delete newSelected[productId]; } else { newSelected[productId] = quantity; } return newSelected; });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return; }
    if (Object.keys(selectedSanPhams).length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm với số lượng lớn hơn 0!'); return; }
    setIsLoading(true);
    try {
      const donGuiPayload = {
        koc_ho_ten: hoTen, original_koc_ho_ten: hoTen, koc_id_kenh: idKenh, original_koc_id_kenh: idKenh,
        koc_sdt: sdt, original_koc_sdt: sdt, koc_dia_chi: diaChi, original_koc_dia_chi: diaChi,
        koc_cccd: cccd, original_koc_cccd: cccd, nhansu_id: selectedNhanSu,
        loai_ship: loaiShip, original_loai_ship: loaiShip,
        trang_thai: 'Chưa đóng đơn', original_trang_thai: 'Chưa đóng đơn',
      };
      const { data: donGuiData, error: donGuiError } = await supabase.from('donguis').insert(donGuiPayload).select().single();
      if (donGuiError) throw donGuiError;
      const chiTietData = Object.entries(selectedSanPhams).map(([sanPhamId, soLuong]) => ({ don_gui_id: donGuiData.id, sanpham_id: sanPhamId, so_luong: soLuong }));
      if (chiTietData.length > 0) {
        const { error: chiTietError } = await supabase.from('chitiettonguis').insert(chiTietData);
        if (chiTietError) throw chiTietError;
      }

      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt('');
      setDiaChi(''); setCccd('');
      setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu(''); setLoaiShip('Ship thường');
      loadInitialData();
      const newOrderDate = new Date();
      const newOrderMonth = newOrderDate.getMonth() + 1;
      const newOrderYear = newOrderDate.getFullYear();
      if (newOrderMonth === parseInt(reportMonth, 10) && newOrderYear === parseInt(reportYear, 10)) {
          await handleGenerateReport();
      }
    } catch (error) {
      alert('Đã có lỗi xảy ra: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIdKenhBlur = async () => { if (!idKenh) return;
    const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single();
    if (data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } 
  };
  
  const clearFilters = () => { 
    setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu('');
    setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); 
  };
  
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!'); return; }
    setIsSummarizing(true);
    setProductSummary({ 'Ship thường': [], 'Hỏa tốc': [] });
    setRawSummaryData([]);
    const { data, error } = await supabase.rpc('get_product_summary_by_day_grouped', { target_day: summaryDate });
    if (error) {
      alert('Lỗi khi lấy tổng hợp: ' + error.message);
    } else if (data) {
      setRawSummaryData(data);
      const summaryData = {
        'Ship thường': data.filter(item => item.loai_ship === 'Ship thường'),
        'Hỏa tốc': data.filter(item => item.loai_ship === 'Hỏa tốc'),
      };
      setProductSummary(summaryData);
    }
    setIsSummarizing(false);
  };

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setReportData({ reportRows: [], brandHeaders: [] });
    // **** SỬA HÀM RPC ĐỂ GỌI HÀM V2 (NẾU MUỐN) HOẶC GIỮ NGUYÊN BÁO CÁO CŨ NÀY ****
    // Hiện tại tao đang giữ nguyên báo cáo cũ, chỉ thêm báo cáo mới
    const { data, error } = await supabase.rpc('generate_performance_report', { target_month: reportMonth, target_year: reportYear });
    if (error) {
      alert("Lỗi tải báo cáo (Order): " + error.message);
      setIsReportLoading(false);
      return;
    }
    const brandSet = new Set();
    const reportRows = data.map(row => {
      const brandCounts = row.brand_counts || {};
      Object.keys(brandCounts).forEach(brand => brandSet.add(brand));
      return { ...row, brand_counts: brandCounts, sl_order: parseInt(row.sl_order, 10) || 0, chi_phi_tong: parseFloat(row.chi_phi_tong) || 0, aov_don_order: parseFloat(row.aov_don_order) || 0 };
    });
    const brandHeaders = Array.from(brandSet).sort();
    setReportData({ reportRows, brandHeaders });
    setIsReportLoading(false);
  };

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const handleEdit = (donHang) => { setEditingDonHang({ ...donHang }); };
  const handleCancelEdit = () => { setEditingDonHang(null); };
  
  const handleUpdate = async () => {
    if (!editingDonHang) return;
    if (!editingDonHang.koc_cccd || editingDonHang.koc_cccd.length !== 12 || !/^\d{12}$/.test(editingDonHang.koc_cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return; }
    const updatePayload = { koc_ho_ten: editingDonHang.koc_ho_ten, koc_id_kenh: editingDonHang.koc_id_kenh, koc_sdt: editingDonHang.koc_sdt, koc_dia_chi: editingDonHang.koc_dia_chi, koc_cccd: editingDonHang.koc_cccd, loai_ship: editingDonHang.loai_ship, trang_thai: editingDonHang.trang_thai, da_sua: true, };
    const { error } = await supabase.from('donguis').update(updatePayload).eq('id', editingDonHang.id);
    if (error) { alert('Lỗi cập nhật đơn gửi: ' + error.message); return; }
    await loadInitialData(); 
    
    const editedOrderDate = new Date(editingDonHang.ngay_gui); 
    const editedOrderMonth = editedOrderDate.getMonth() + 1;
    const editedOrderYear = editedOrderDate.getFullYear();
    if (editedOrderMonth === parseInt(reportMonth, 10) && editedOrderYear === parseInt(reportYear, 10)) {
        await handleGenerateReport();
    }
    setEditingDonHang(null);
  };
  
  const handleSelect = (orderId) => { setSelectedOrders(prevSelected => { const newSelected = new Set(prevSelected); if (newSelected.has(orderId)) { newSelected.delete(orderId); } else { newSelected.add(orderId); } return newSelected; }); };
  const handleSelectAll = (e) => { if (e.target.checked) { const allDisplayedIds = new Set(donHangs.map(dh => dh.id)); setSelectedOrders(allDisplayedIds); } else { setSelectedOrders(new Set()); } };
  
  const handleBulkUpdateStatus = async () => { 
    if (selectedOrders.size === 0) { alert("Vui lòng chọn ít nhất một đơn hàng."); return; } 
    const idsToUpdate = Array.from(selectedOrders); 
    const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', idsToUpdate);
    if (error) { alert("Lỗi khi cập nhật hàng loạt: " + error.message); } 
    else { 
      setDonHangs(prevState => prevState.map(donHang => idsToUpdate.includes(donHang.id) ? { ...donHang, trang_thai: 'Đã đóng đơn' } : donHang ));
      setSelectedOrders(new Set()); 
      alert(`Đã cập nhật trạng thái cho ${idsToUpdate.length} đơn hàng.`); 
    } 
  };
  
  const handleExport = ({ data, headers, filename }) => { 
    const orderedData = data.map(row => { const newRow = {}; headers.forEach(header => { if (header.key) { newRow[header.label] = row[header.key]; } }); return newRow; });
    const worksheet = XLSX.utils.json_to_sheet(orderedData); 
    const workbook = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1"); 
    XLSX.writeFile(workbook, filename); 
  };

  const handleExportAll = async () => {
    setIsLoading(true);
    let query = supabase.from('donguis').select(`
      id, ngay_gui, da_sua,
      loai_ship, original_loai_ship, trang_thai, original_trang_thai,
      koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, 
      koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, 
      koc_cccd, original_koc_cccd,
      nhansu ( id, ten_nhansu ),
      chitiettonguis ( id, so_luong, 
      sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )
    `).order('ngay_gui', { ascending: false });
    
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
    
    const { data, error } = await query;
    if (error) {
        alert("Lỗi tải dữ liệu để xuất file: " + error.message);
        setIsLoading(false);
        return;
    }

    let exportData = data || [];
    exportData = exportData.filter(donHang => {
        if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
        if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
        return true;
    });
    
    const finalExportData = exportData.flatMap((donHang, index) => {
        const baseData = { 
            stt: index + 1, ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), tenKOC: donHang.koc_ho_ten, 
            cccd: donHang.koc_cccd, idKenh: donHang.koc_id_kenh, sdt: donHang.koc_sdt, diaChi: donHang.koc_dia_chi, 
            nhanSu: donHang.nhansu?.ten_nhansu, loaiShip: donHang.loai_ship, trangThai: donHang.trang_thai 
        };
        if (donHang.chitiettonguis.length === 0) { 
            return [{ ...baseData, sanPham: 'N/A', soLuong: 0, brand: 'N/A', barcode: 'N/A' }]; 
        }
        return donHang.chitiettonguis.map(ct => ({ 
            ...baseData, sanPham: ct.sanphams?.ten_sanpham, soLuong: ct.so_luong, 
            brand: ct.sanphams?.brands?.ten_brand, barcode: ct.sanphams?.barcode, 
        }));
    });
    
    const mainExportHeaders = [ { label: "STT", key: "stt"}, { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "CCCD", key: "cccd" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" }, { label: "Địa chỉ", key: "diaChi" }, { label: "Sản Phẩm", key: "sanPham" }, { label: "Số Lượng", key: "soLuong"}, { label: "Brand", key: "brand" }, { label: "Barcode", key: "barcode" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" }, { label: "Trạng Thái", key: "trangThai" }, ];
    handleExport({ data: finalExportData, headers: mainExportHeaders, filename: 'danh-sach-don-hang-FULL.xlsx' });
    setIsLoading(false);
  };

  // =================================================================
  // HÀM LOGIC CHO TAB CONTRACT (Giữ nguyên)
  // =================================================================
  const handleContractFormChange = (e) => {
    const value = (e.target.type === 'number') ? parseFloat(e.target.value) || 0 : e.target.value;
    setContractData({ ...contractData, [e.target.id]: value });
  };
  
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
    
    // Mẫu Hợp đồng (giữ nguyên)
    const contractTemplate = `... (Giữ nguyên toàn bộ template HTML của mày) ...`;
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
  // HÀM LOGIC CHO TAB AIR LINKS
  // =================================================================
  const loadAirLinks = async () => {
    setIsLoadingAirLinks(true);
    
    const startIndex = (airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE;
    const endIndex = startIndex + AIRLINKS_PER_PAGE - 1;

    let query = supabase.from('air_links').select(`
      id, created_at, link_air_koc, id_kenh, id_video,
      "cast", cms_brand, 
      ngay_air, san_pham, ngay_booking,
      brands ( ten_brand ),
      nhansu ( ten_nhansu )
    `, { count: 'exact' }); 

    if (filterAlKenh) query = query.ilike('id_kenh', `%${filterAlKenh}%`);
    if (filterAlBrand) query = query.eq('brand_id', filterAlBrand);
    if (filterAlNhanSu) query = query.eq('nhansu_id', filterAlNhanSu);
    if (filterAlDate) {
      const startDate = `${filterAlDate}T00:00:00.000Z`;
      const endDate = `${filterAlDate}T23:59:59.999Z`;
      query = query.gte('ngay_air', startDate).lte('ngay_air', endDate);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false }) // Sắp xếp theo ngày tạo (mới nhất)
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
        loadAirLinks(); // Tải lại trang hiện tại
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
  }, [reportData.reportRows, reportData.brandHeaders]); // <-- Sửa: Thêm brandHeaders
  
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
    isReportLoading, setIsReportLoading,
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
     filterAlKenh, setFilterAlKenh,
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
    handleGenerateAirLinksReport,
    requestAirSort,
    sortedAirReportRows,
    totalsRowAirReport
  };
  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider> //
  );
};
// 3. Tạo Custom Hook (để dễ gọi)
export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};