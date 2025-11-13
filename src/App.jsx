// Thay thế toàn bộ nội dung file này (ví dụ: App.jsx/App.js)

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

// Cấu hình Phân trang
const ORDERS_PER_PAGE = 50; 

// Component Header có thể kéo thả
const ResizableHeader = ({ onResize, width, children }) => {
    if (!width) {
        return <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{children}</th>;
    }
    return (
        <Resizable width={width} height={0} onResize={onResize} draggableOpts={{ enableUserSelectHack: false }} axis="x">
            <th style={{ width: `${width}px`, padding: '12px', border: '1px solid #ddd', textAlign: 'left', position: 'relative', backgroundClip: 'padding-box' }}>
                {children}
            </th>
        </Resizable>
    );
};

function App() {
  // =================================================================
  // STATE CHUNG
  // =================================================================
  const [brands, setBrands] = useState([]);
  const [nhanSus, setNhanSus] = useState([]);
  const [sanPhams, setSanPhams] = useState([]);
  const [currentView, setCurrentView] = useState('orders');
  // 'orders' hoặc 'booking'

  // =================================================================
  // STATE CHO TAB ORDER & PHÂN TRANG (PAGINATION)
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
  
  // State Phân Trang
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrderCount, setTotalOrderCount] = useState(0); 

  // State Bộ Lọc
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterLoaiShip, setFilterLoaiShip] = useState('');
  const [filterEditedStatus, setFilterEditedStatus] = useState('all');
  const [filterSanPhams, setFilterSanPhams] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  
  // State Báo cáo/Tổng hợp
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
  // STATE CHO TAB BOOKING
  // =================================================================
  const [bookingKocName, setBookingKocName] = useState('');
  const [bookingCastCmt, setBookingCastCmt] = useState('');
  const [bookingNgayAir, setBookingNgayAir] = useState('');
  const [bookingLinkVideo, setBookingLinkVideo] = useState('');
  const [bookingBrandId, setBookingBrandId] = useState('');
  const [bookingSanPhamId, setBookingSanPhamId] = useState('');
  const [bookingKeyContent, setBookingKeyContent] = useState('');
  const [bookingDoiTuong, setBookingDoiTuong] = useState('');
  const [bookingChatLuong, setBookingChatLuong] = useState('');
  const [bookingDatKpi, setBookingDatKpi] = useState(false);
  const [bookingNguoiDealId, setBookingNguoiDealId] = useState('');
  const [bookingNgayBooking, setBookingNgayBooking] = useState('');
  const [bookingCms, setBookingCms] = useState('');
  const [bookingIdVideo, setBookingIdVideo] = useState('');
  const [bookingThongTinKoc, setBookingThongTinKoc] = useState('');
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [bookingSanPhams, setBookingSanPhams] = useState([]);
  


  const handleResize = (key) => (e, { size }) => { setColumnWidths(prev => ({ ...prev, [key]: size.width }));
  };

  // =================================================================
  // HÀM TẢI DỮ LIỆU ĐÃ SỬA VỚI PHÂN TRANG (SERVER-SIDE FILTERING)
  // =================================================================

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

    // --- ÁP DỤNG CÁC BỘ LỌC ĐƠN GIẢN (SERVER-SIDE) ---
    if (filterIdKenh) {
        query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`);
    }
    if (filterSdt) {
        query = query.ilike('koc_sdt', `%${filterSdt}%`);
    }
    if (filterNhanSu) {
        query = query.eq('nhansu_id', filterNhanSu);
    }
    if (filterLoaiShip) {
        query = query.eq('loai_ship', filterLoaiShip);
    }
    
    // KHẮC PHỤC LỖI LỌC THEO NGÀY: SỬ DỤNG RANGE (Server-side)
    if (filterNgay) {
        // filterNgay: VD '2025-11-04'
        const startDate = `${filterNgay}T00:00:00.000Z`; // Bắt đầu ngày
        const endDate = `${filterNgay}T23:59:59.999Z`;   // Kết thúc ngày

        // Áp dụng bộ lọc cho phạm vi ngày
        query = query
            .gte('ngay_gui', startDate) // Greater Than or Equal (Lớn hơn hoặc bằng)
            .lte('ngay_gui', endDate);   // Less Than or Equal (Nhỏ hơn hoặc bằng)
    }
    
    if (filterEditedStatus !== 'all') {
        const isEdited = filterEditedStatus === 'edited';
        query = query.eq('da_sua', isEdited);
    }

    // 1. Lấy tổng số đơn hàng (với bộ lọc)
    const { count, error: countError } = await query.order('ngay_gui', { ascending: false }).range(0, 0); // Lấy count trước

    if (countError) {
        alert("Lỗi tải tổng số đơn hàng: " + countError.message);
        setIsLoading(false);
        return;
    }
    setTotalOrderCount(count || 0); 
    
    // 2. Tải dữ liệu cho trang hiện tại
    const { data, error } = await query
        .order('ngay_gui', { ascending: false })
        .range(startIndex, endIndex);

    if(error) { 
        alert("Lỗi tải dữ liệu Order: " + error.message) 
    } 
    else if (data) {
      
      // Tính STT DỰA TRÊN TỔNG SỐ VÀ VỊ TRÍ TRONG TRANG
      const dataWithStt = data.map((item, index) => ({ 
          ...item, 
          originalStt: (count || 0) - (startIndex + index) 
      }));
      
      // --- ÁP DỤNG CÁC BỘ LỌC PHỨC TẠP (CLIENT-SIDE) ---
      // Áp dụng lọc Brand và Sản phẩm trên 50 đơn hàng đã tải về
      const filteredData = dataWithStt.filter(donHang => {
          if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
          if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
          return true;
      });

      setDonHangs(filteredData);
    }
    setIsLoading(false); 
  };
  
  // HÀM TẢI BOOKING (GIỮ NGUYÊN)
  const loadBookings = async () => {
      setIsLoadingBookings(true);
      const { data, error } = await supabase
          .from('bookings') 
          .select(`
              *,
              brands ( ten_brand ),
              Nhan_su:nhansu ( ten_nhansu ), 
              sanphams ( ten_sanpham ) 
          `)
          .order('Ngay_booking', { ascending: false });

      if (error) {
          alert("Lỗi tải danh sách booking: " + error.message);
      } else {
          setBookings(data || []);
      }
      setIsLoadingBookings(false);
  };
  
  // =================================================================
  // USE EFFECT CHUNG & LỌC
  // =================================================================

  useEffect(() => {
    async function getAllInitialData() {
      // Tải dữ liệu chung
      const { data: brandsData } = await supabase.from('brands').select();
      if (brandsData) setBrands(brandsData);
      const { data: nhanSusData } = await supabase.from('nhansu').select();
      if (nhanSusData) setNhanSus(nhanSusData);
      
      await loadBookings();
      // Tải đơn hàng ban đầu
      loadInitialData();
    }
    getAllInitialData();
  }, []);

  // Effect theo dõi PAGE và FILTERS để tải lại dữ liệu
  useEffect(() => {
    // Tải lại dữ liệu khi trang thay đổi, HOẶC bất kỳ bộ lọc nào thay đổi
    loadInitialData();
  }, [currentPage, filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);
  
  // Effect để reset trang về 1 khi các filter thay đổi 
  useEffect(() => {
    // Khi bất kỳ filter nào thay đổi, nếu trang KHÔNG phải là 1, set về 1
    if (currentPage !== 1) {
        setCurrentPage(1);
    }
    // Nếu currentPage đã là 1, useEffect trên sẽ tự động gọi loadInitialData với filter mới.
  }, [filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);


  // =================================================================
  // LOGIC KHÁC (GIỮ NGUYÊN HOẶC CHỈNH SỬA NHỎ)
  // =================================================================

  // Bỏ useMemo displayedDonHangs và dùng donHangs trực tiếp
  // (Đã dọn dẹp logic lọc client-side trong loadInitialData)

  useEffect(() => {
    if (!selectedBrand) { setSanPhams([]); setSelectedSanPhams({}); return; }
    async function getSanPhams() { const { data } = await supabase.from('sanphams').select().eq('brand_id', selectedBrand); if (data) setSanPhams(data); }
    getSanPhams();
  }, [selectedBrand]);
  
  useEffect(() => {
    if (!filterBrand) { setFilterSanPhams([]); setFilterSanPham(''); return; }
    async function getFilterSanPhams() { const { data } = await supabase.from('sanphams').select().eq('brand_id', filterBrand); if (data) setFilterSanPhams(data); }
    getFilterSanPhams();
  }, [filterBrand]);
  
  useEffect(() => {
    if (!bookingBrandId) { setBookingSanPhams([]); setBookingSanPhamId(''); return; }
    async function getBookingSanPhams() { 
        const { data } = await supabase.from('sanphams').select('*').eq('brand_id', bookingBrandId); 
        if (data) setBookingSanPhams(data);
    }
    getBookingSanPhams();
  }, [bookingBrandId]);
  
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
      const { error: chiTietError } = await supabase.from('chitiettonguis').insert(chiTietData);
      if (chiTietError) throw chiTietError;

      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt('');
      setDiaChi(''); setCccd('');
      setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu(''); setLoaiShip('Ship thường');
      
      // Tải lại data (sẽ tự động về trang 1 nhờ useEffect)
      loadInitialData();

      const newOrderDate = new Date();
      const newOrderMonth = newOrderDate.getMonth() + 1;
      const newOrderYear = newOrderDate.getFullYear();
      if (newOrderMonth === parseInt(reportMonth, 10) && newOrderYear === parseInt(reportYear, 10)) {
          console.log("Đơn hàng mới trong tháng báo cáo, đang cập nhật lại báo cáo...");
          await handleGenerateReport();
      }

    } catch (error) {
      alert('Đã có lỗi xảy ra: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBookingSubmit = async (event) => {
      event.preventDefault();
      setIsBookingLoading(true);

      const bookingData = {
          Koc_name: bookingKocName,
          Cast: bookingCastCmt,
          Ngay_air: bookingNgayAir ||
          null,
          Link_video: bookingLinkVideo,
          Brand_id: bookingBrandId,
          san_pham_id: bookingSanPhamId ||
          null,
          key_content: bookingKeyContent,
          doi_tuong: bookingDoiTuong,
          chat_luong: bookingChatLuong,
          dat_kpi: bookingDatKpi,
          Nhan_su: bookingNguoiDealId, 
          Ngay_booking: bookingNgayBooking ||
          null,
          Cms: bookingCms ||
          null,
          Id_video: bookingIdVideo,
          Thong_tin_koc: bookingThongTinKoc, 
      };
      try {
          const { error } = await supabase.from('bookings').insert(bookingData);
          if (error) throw error;

          alert('Thêm booking thành công!');
          setBookingKocName(''); setBookingCastCmt(''); setBookingNgayAir(''); 
          setBookingLinkVideo(''); setBookingBrandId(''); setBookingSanPhamId('');
          setBookingKeyContent(''); setBookingDoiTuong(''); setBookingChatLuong('');
          setBookingDatKpi(false); setBookingNguoiDealId(''); setBookingNgayBooking('');
          setBookingCms(''); setBookingIdVideo(''); setBookingThongTinKoc('');
          
          await loadBookings(); 

      } catch (error) {
          alert("Lỗi khi thêm booking: " + error.message);
      } finally {
          setIsBookingLoading(false);
      }
  };
  
  const handleIdKenhBlur = async () => { if (!idKenh) return; const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single();
  if (data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } };
  const clearFilters = () => { setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu('');
  setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); };
  
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!');
    return; }
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
    const { data, error } = await supabase.rpc('generate_performance_report', { target_month: reportMonth, target_year: reportYear });
    if (error) {
      alert("Lỗi tải báo cáo: " + error.message);
      setIsReportLoading(false);
      return;
    }
    const brandSet = new Set();
    const reportRows = data.map(row => {
      const brandCounts = row.brand_counts || {};
      Object.keys(brandCounts).forEach(brand => brandSet.add(brand));
      return {
        ...row,
        brand_counts: brandCounts,
        sl_order: parseInt(row.sl_order, 10) || 0,
        chi_phi_tong: parseFloat(row.chi_phi_tong) || 0,
        aov_don_order: parseFloat(row.aov_don_order) || 0,
      };
   
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
  }, [reportData]);
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
    const editedOrderMonth = editedOrderDate.getMonth() + 1;
    const editedOrderYear = editedOrderDate.getFullYear();
    if (editedOrderMonth === parseInt(reportMonth, 10) && editedOrderYear === parseInt(reportYear, 10)) {
        await handleGenerateReport();
    }
    
    setEditingDonHang(null);
  };
  const handleSelect = (orderId) => { setSelectedOrders(prevSelected => { const newSelected = new Set(prevSelected); if (newSelected.has(orderId)) { newSelected.delete(orderId); } else { newSelected.add(orderId); } return newSelected; });
  };
  const handleSelectAll = (e) => { if (e.target.checked) { const allDisplayedIds = new Set(donHangs.map(dh => dh.id)); setSelectedOrders(allDisplayedIds);
  } else { setSelectedOrders(new Set()); } };
  const handleBulkUpdateStatus = async () => { if (selectedOrders.size === 0) { alert("Vui lòng chọn ít nhất một đơn hàng.");
  return; } const idsToUpdate = Array.from(selectedOrders); const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', idsToUpdate);
  if (error) { alert("Lỗi khi cập nhật hàng loạt: " + error.message);
  } else { setDonHangs(prevState => prevState.map(donHang => idsToUpdate.includes(donHang.id) ? { ...donHang, trang_thai: 'Đã đóng đơn' } : donHang ));
  setSelectedOrders(new Set()); alert(`Đã cập nhật trạng thái cho ${idsToUpdate.length} đơn hàng.`); } };
  const handleExport = ({ data, headers, filename }) => { const orderedData = data.map(row => { const newRow = {}; headers.forEach(header => { if (header.key) { newRow[header.label] = row[header.key]; } }); return newRow; });
  const worksheet = XLSX.utils.json_to_sheet(orderedData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1"); XLSX.writeFile(workbook, filename); };
  
  
  // --- HÀM XUẤT FILE TOÀN BỘ DỮ LIỆU ĐÃ LỌC (KHẮC PHỤC LỖI #3) ---
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

    // Áp dụng bộ lọc Server-Side
    if (filterIdKenh) { query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`); }
    if (filterSdt) { query = query.ilike('koc_sdt', `%${filterSdt}%`); }
    if (filterNhanSu) { query = query.eq('nhansu_id', filterNhanSu); }
    if (filterLoaiShip) { query = query.eq('loai_ship', filterLoaiShip); }
    if (filterNgay) {
        const startDate = `${filterNgay}T00:00:00.000Z`;
        const endDate = `${filterNgay}T23:59:59.999Z`; 
        query = query
            .gte('ngay_gui', startDate) 
            .lte('ngay_gui', endDate); 
    }
    if (filterEditedStatus !== 'all') {
        const isEdited = filterEditedStatus === 'edited';
        query = query.eq('da_sua', isEdited);
    }
    
    // Tải TẤT CẢ dữ liệu (Không dùng range/limit)
    const { data, error } = await query;

    if (error) {
        alert("Lỗi tải dữ liệu để xuất file: " + error.message);
        setIsLoading(false);
        return;
    }

    // Áp dụng bộ lọc Client-Side cho Brand/Sản phẩm (nếu có)
    let exportData = data || [];
    exportData = exportData.filter(donHang => {
        if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
        if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
        return true;
    });

    // Chuyển đổi dữ liệu sang định dạng Export
    const finalExportData = exportData.flatMap((donHang, index) => {
        const baseData = { 
            stt: index + 1, // STT cho file export
            ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), 
            tenKOC: donHang.koc_ho_ten, 
            cccd: donHang.koc_cccd, 
            idKenh: donHang.koc_id_kenh, 
            sdt: donHang.koc_sdt, 
            diaChi: donHang.koc_dia_chi, 
            nhanSu: donHang.nhansu?.ten_nhansu, 
            loaiShip: donHang.loai_ship, 
            trangThai: donHang.trang_thai 
        };
        if (donHang.chitiettonguis.length === 0) { 
            return [{ ...baseData, sanPham: 'N/A', soLuong: 0, brand: 'N/A', barcode: 'N/A' }]; 
        }
        return donHang.chitiettonguis.map(ct => ({ 
            ...baseData, 
            sanPham: ct.sanphams?.ten_sanpham, 
            soLuong: ct.so_luong, 
            brand: ct.sanphams?.brands?.ten_brand, 
            barcode: ct.sanphams?.barcode, 
        }));
    });

    handleExport({ data: finalExportData, headers: mainExportHeaders, filename: 'danh-sach-don-hang-FULL.xlsx' });
    setIsLoading(false);
  };
  
  const mainExportHeaders = [ { label: "STT", key: "stt"}, { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "CCCD", key: "cccd" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" }, { label: "Địa chỉ", key: "diaChi" }, { label: "Sản Phẩm", key: "sanPham" }, { label: "Số Lượng", key: "soLuong"}, { label: "Brand", key: "brand" }, { label: "Barcode", key: "barcode" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" }, { label: "Trạng Thái", key: "trangThai" }, ];
  const summaryExportHeaders = [ { label: "Loại Ship", key: "loai_ship"}, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  const staffSummaryExportHeaders = [ { label: "Nhân Sự", key: "ten_nhansu"}, { label: "Brand", key: "ten_brand" }, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  const headers = [ { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} /> }, { key: 'stt', label: 'STT' }, { key: 'ngayGui', label: 'Ngày Gửi' }, { key: 'hoTenKOC', label: 'Họ Tên KOC' }, { key: 'cccd', label: 'CCCD' }, { key: 'idKenh', label: 'ID Kênh' }, { key: 'sdt', label: 'SĐT' }, { key: 'diaChi', label: 'Địa chỉ' }, { key: 'brand', label: 'Brand' }, { key: 'sanPham', label: 'Sản Phẩm (SL)' }, { key: 'nhanSu', label: 'Nhân Sự Gửi' }, { key: 'loaiShip', label: 'Loại Ship' }, { key: 'trangThai', label: 'Trạng Thái' }, { key: 'hanhDong', label: 
  'Hành Động' }, ];
  
  // Logic phân trang
  const totalPages = Math.ceil(totalOrderCount / ORDERS_PER_PAGE);
  const pageNumbers = [];
  // Hiển thị tối đa 5 nút trang (trang hiện tại, 2 trang trước, 2 trang sau)
  const maxButtons = 5; 
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }


  return (
    <div style={{ padding: '2rem' }}>
      
      {/* --- NÚT CHUYỂN TAB --- */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <button 
              onClick={() => setCurrentView('orders')} 
              style={{ 
              
              padding: '10px 20px', 
                  marginRight: '10px', 
                  fontSize: '16px', 
                  cursor: 'pointer',
                  backgroundColor: currentView === 'orders' ? '#007bff' : '#f8f9fa',
         
                  color: currentView === 'orders' ? 'white' : 'black',
                  border: '1px solid #dee2e6',
                  borderRadius: '5px'
              }}
          >
              Quản Lý Order
    
          </button>
          <button 
              onClick={() => setCurrentView('booking')} 
              style={{ 
                  padding: '10px 20px', 
                  fontSize: '16px', 
          
                  cursor: 'pointer',
                  backgroundColor: currentView === 'booking' ?
              '#007bff' : '#f8f9fa',
                  color: currentView === 'booking' ?
              'white' : 'black',
                  border: '1px solid #dee2e6',
                  borderRadius: '5px'
              }}
          >
              Quản Lý Booking
          </button>
      </div>

  
      {/* --- GIAO DIỆN TAB ORDER --- */}
      {currentView === 'orders' && (
          <> 
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
             
                <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tạo Đơn Gửi KOC</h1>
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div><label>ID Kênh</label><input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
                    
                    <div><label>Họ tên KOC</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
                    <div><label>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
                    <div><label>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
          
                    <div><label>CCCD</label><input type="text" value={cccd} onChange={e => setCccd(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." /></div>
                    <div><label>Brand</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
                    <div>
    
                      <label>Sản phẩm</label>
                      <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginBottom: '10px' }} disabled={!selectedBrand} />
                      <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
   
                        {sanPhams.length > 0 ?
              sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                            <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                              <label htmlFor={sp.id} style={{ flex: 1 }}>{sp.ten_sanpham}</label>
                        
                              <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleQuantityChange(sp.id, e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center' }} placeholder="0" />
                            </div>
                          )) : <p style={{ margin: 0, color: '#888' }}>Vui lòng chọn Brand để xem sản phẩm</p>}
     
                      </div>
                    </div>
                    <div><label>Nhân sự gửi</label><select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required><option value="">-- Chọn nhân sự --</option>{nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}</select></div>
                   
                    <div>
                      <label>Loại hình vận chuyển</label>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' 
              }} />Ship thường</label>
                        <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Hỏa tốc" checked={loaiShip === 'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' }} />Hỏa tốc</label>
                      </div>
                    </div>
          
                    <button type="submit" disabled={isLoading ||
              isPastDeadlineForNewOrders} style={{ width: '100%', padding: '10px', backgroundColor: (isLoading || isPastDeadlineForNewOrders) ?
              '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '1rem' }}>{isLoading ?
              'Đang xử lý...' : 'Gửi Đơn'}</button>
                    {isPastDeadlineForNewOrders && (<p style={{ color: 'red', textAlign: 'center', marginTop: '0.5rem', fontWeight: 'bold' }}>Đã quá 16h30, không thể tạo đơn hàng mới.</p>)}
                   </form>
                </div>
                <div style={{ flex: 1, 
              padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tổng Hợp Sản Phẩm (Theo Ship)</h2>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ padding: '7px', flex: 1 }} /><button onClick={handleGetSummary} disabled={isSummarizing} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: 
              '4px', cursor: 'pointer' }}>{isSummarizing ? 'Đang xử lý...' : 'Tổng hợp'}</button></div>
                    <div style={{ marginTop: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                        {rawSummaryData.length === 0 && !isSummarizing && <p style={{ textAlign: 'center', color: '#888' }}>Chưa có dữ liệu cho ngày đã chọn.</p>}
                   
                        {productSummary['Ship thường'].length > 0 && (
                            <div style={{marginBottom: '1.5rem'}}>
                                <h3 style={{color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '5px'}}>Tổng hợp Ship Thường</h3>
                 
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead>
                                <tbody>{productSummary['Ship thường'].map(item => (<tr key={`${item.ten_san_pham}-thuong`}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
         
                        </div>
                        )}
                        {productSummary['Hỏa tốc'].length > 0 && (
                            
              <div>
                                <h3 style={{color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '5px'}}>Tổng hợp Hỏa Tốc</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead>
   
                              <tbody>{productSummary['Hỏa tốc'].map(item => (<tr key={`${item.ten_san_pham}-toc`}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                            </div>
                     
                        )}
                        {rawSummaryData.length > 0 && 
                            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                                <button onClick={() => 
              handleExport({ data: rawSummaryData, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xuất File Tổng Hợp (Ship)</button>
                            </div>
                        }
                    </div>
   
              </div>
              </div>

              <div style={{ padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
                <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Báo Cáo Hiệu Suất Nhân Sự</h2>
             
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '7px' }}>
                        {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                    </select>
   
                    <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{ padding: '7px', width: '80px' }} />
                    <button onClick={handleGenerateReport} disabled={isReportLoading} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        {isReportLoading ?
              'Đang xử lý...' : 'Tạo Báo Cáo'}
                    </button>
                </div>
                {reportData.reportRows.length > 0 ?
              (
                  <div style={{width: '100%', overflowX: 'auto'}}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ backgroundColor: '#f2f2f2' }}>
                        <tr>
  
                          <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left', cursor: 'pointer' }} onClick={() => requestSort('ten_nhansu')}>
                            Nhân Sự {sortConfig.key === 'ten_nhansu' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                   
                          </th>
                          <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort('sl_order')}>
                            SL Order {sortConfig.key === 'sl_order' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
          
                          </th>
                          <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }} >AOV Đơn Order</th>
                          <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort('chi_phi_tong')}>
    
                            Chi Phí Tổng {sortConfig.key === 'chi_phi_tong' ?
              (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          {reportData.brandHeaders.map(brand => (
                              <th key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort(brand)}>
                                {brand} {sortConfig.key === brand ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                              </th>
                 
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                       
                        {sortedReportRows.map((item) => (
                          <tr key={item.nhansu_id}>
                            <td style={{ padding: '12px', border: '1px solid #ddd', fontWeight: 'bold' }}>{item.ten_nhansu}</td>
                            <td style={{ padding: '12px', 
              border: '1px solid #ddd', textAlign: 'center' }}>{item.sl_order}</td>
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(item.aov_don_order).toLocaleString('vi-VN')} đ</td>
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(item.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                
                            {reportData.brandHeaders.map(brand => (
                              <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {item.brand_counts[brand] ||
              0}
                              </td>
                            ))}
                          </tr>
                
                          ))}
                      </tbody>
                      <tfoot>
                        {totalsRow && (
                      
              <tr style={{backgroundColor: '#f2f2f2', fontWeight: 'bold'}}>
                            <td style={{ padding: '12px', border: '1px solid #ddd' }}>TỔNG CỘNG</td>
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{totalsRow.sl_order}</td>
                 
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(totalsRow.aov_don_order).toLocaleString('vi-VN')} đ</td>
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(totalsRow.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                            {reportData.brandHeaders.map(brand => (
         
                              <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalsRow.brand_counts[brand] ||
              0}
                              </td>
                            ))}
                          </tr>
                
              )}
                      </tfoot>
                    </table>
                  </div>
                ) : (
              
                <p style={{ textAlign: 'center', color: '#888' }}>
                    {isReportLoading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu cho tháng đã chọn.'}
                  </p>
                )}
              </div>

        
              <div style={{ width: '100%', overflowX: 'auto', marginTop: '2rem' }}>
                <h2 style={{ textAlign: 'center' }}>Danh Sách Đơn Hàng Đã Gửi</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                  <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => 
              setFilterIdKenh(e.target.value)} style={{ padding: '8px' }} />
                  <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} style={{ padding: '8px' }} />
                  <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                  <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} style={{ padding: '8px' }} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => 
              <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
                  <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                  <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)} style={{ padding: '8px' }}>
                    <option value="">Tất cả loại ship</option>
              
                    <option value="Ship thường">Ship thường</option>
                    <option value="Hỏa tốc">Hỏa tốc</option>
                  </select>
                  <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)} style={{ padding: '8px' }}>
                    <option value="all">Tất cả</option>
  
                    <option value="edited">Đơn đã sửa</option>
                    <option value="unedited">Đơn chưa sửa</option>
                  </select>
                  <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ padding: '7px' }} />
          
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button onClick={clearFilters} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xóa Lọc</button>
                    <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} style={{ flex: 1, padding: '8px 16px', backgroundColor: selectedOrders.size > 0 ?
              '#007bff' : '#ccc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Đóng ({selectedOrders.size}) đơn
                    </button>
                  </div>
                  {/* SỬA: Đã đổi sang hàm handleExportAll mới để xuất toàn bộ */}
                  <button onClick={handleExportAll} disabled={isLoading} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'center' }}>
                    {isLoading ? 'Đang chuẩn bị...' : 'Xuất File'}
                  </button>
                </div>
                
                {/* --- KHỐI PHÂN TRANG (PAGINATION) --- */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                    <p style={{marginBottom: '10px'}}>Tổng cộng: **{totalOrderCount}** đơn hàng ({ORDERS_PER_PAGE} đơn/trang) - Đang ở Trang {currentPage}/{totalPages}</p>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || isLoading}
                        style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #ccc', cursor: 'pointer' }}
                    >
                        Trang Trước
                    </button>
                    {pageNumbers.map(number => (
                        <button
                            key={number}
                            onClick={() => setCurrentPage(number)}
                            disabled={isLoading}
                            style={{
                                padding: '8px 12px',
                                margin: '0 5px',
                                backgroundColor: currentPage === number ? '#007bff' : '#f8f9fa',
                                color: currentPage === number ? 'white' : 'black',
                                border: '1px solid #ccc',
                                cursor: 'pointer',
                            }}
                        >
                            {number}
                        </button>
                    ))}
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || isLoading}
                        style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #ccc', cursor: 'pointer' }}
                    >
                        Trang Sau
                    </button>
                </div>
                {/* --- KẾT THÚC KHỐI PHÂN TRANG --- */}

                <div style={{ width: '100%', overflow: 'auto' }}>
   
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead style={{ backgroundColor: '#f2f2f2' }}>
                      <tr>
                        {headers.map((header) => (
       
                          <ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>
                            {header.label}
                          </ResizableHeader>
                        
              ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Đã đổi từ displayedDonHangs sang donHangs */}
                      {donHangs.map((donHang) => {
             
                        const getCellStyle = (currentValue, originalValue) => {
                            return (originalValue !== null && currentValue !== originalValue) ?
              { backgroundColor: 'red', color: 'white' } : {};
                        };
                        const sanPhamDisplay = donHang.chitiettonguis.map(ct => (<div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})</div>));
              return (
                        <tr key={donHang.id}>
                          {editingDonHang?.id === donHang.id ?
                          ( // Chế độ Sửa
               
              <>
                              <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}></td>
                              <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
       
                              <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                              <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_ho_ten} onChange={e => setEditingDonHang({...editingDonHang, koc_ho_ten: e.target.value})} /></td>
                 
                              <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_cccd} onChange={e => setEditingDonHang({...editingDonHang, koc_cccd: e.target.value})} /></td>
                              <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_id_kenh} onChange={e => setEditingDonHang({...editingDonHang, koc_id_kenh: e.target.value})} /></td>
                   
                              <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_sdt} onChange={e => setEditingDonHang({...editingDonHang, koc_sdt: e.target.value})} /></td>
                              <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_dia_chi} onChange={e => setEditingDonHang({...editingDonHang, koc_dia_chi: e.target.value})} /></td>
                     
                              <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                              <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                              <td style={{ width: `${columnWidths.nhanSu}px`, padding: 
              '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                              <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.loai_ship} onChange={e => setEditingDonHang({...editingDonHang, loai_ship: e.target.value})}><option>Ship thường</option><option>Hỏa tốc</option></select></td>
                              <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.trang_thai} onChange={(e) => setEditingDonHang({...editingDonHang, trang_thai: e.target.value})}><option>Chưa đóng đơn</option><option>Đã đóng đơn</option></select></td>
                              <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={handleUpdate} style={{padding: '5px'}}>Lưu</button><button onClick={handleCancelEdit} style={{padding: '5px'}}>Hủy</button></td>
                            </>
                   
              ) : ( // Chế độ Xem
                            <>
                              <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}><input type="checkbox" checked={selectedOrders.has(donHang.id)} onChange={() => handleSelect(donHang.id)} /></td>
             
                              <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                              <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                              <td style={{ 
              width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_ho_ten, donHang.original_koc_ho_ten) }}>{donHang.koc_ho_ten}</td>
                              <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_cccd, donHang.original_koc_cccd) }}>{donHang.koc_cccd}</td>
                              <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_id_kenh, donHang.original_koc_id_kenh) }}>{donHang.koc_id_kenh}</td>
      
                              <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_sdt, donHang.original_koc_sdt) }}>{donHang.koc_sdt}</td>
                              <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_dia_chi, donHang.original_koc_dia_chi) }}>{donHang.koc_dia_chi}</td>
                      
                              <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                              <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                              <td style={{ width: `${columnWidths.nhanSu}px`, 
              padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                              <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                              <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai) }}>{donHang.trang_thai}</td>
          
                              <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={() => handleEdit(donHang)} style={{padding: '5px'}}>Sửa</button></td>
                            </>
                          )}
           
              </tr>
                        )
                      })}
                    </tbody>
                  </table>
   
              </div>
              </div>
          </>
      )}

      {/* --- GIAO DIỆN TAB BOOKING --- */}
      {currentView === 'booking' && (
          <div style={{ display: 'flex', gap: '2rem' }}>
              {/* --- CỘT FORM 
              NHẬP BOOKING --- */}
              <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Nhập Thông Tin Booking</h2>
                  <form onSubmit={handleBookingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          
             
                      {/* Sửa: Khớp tên cột Koc_name */}
                      <div><label>Tên KOC</label><input type="text" value={bookingKocName} onChange={e => setBookingKocName(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
                      
 
                      {/* Sửa: Khớp tên cột Brand_id */}
                      <div><label>Brand</label><select value={bookingBrandId} onChange={e => setBookingBrandId(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required>
                          <option value="">-- Chọn Brand --</option>
       
                          {brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}
                      </select></div>
                      
                      {/* Sửa: Khớp tên cột san_pham_id */}
     
                      <div><label>Sản phẩm (nếu có)</label><select value={bookingSanPhamId} onChange={e => setBookingSanPhamId(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} disabled={!bookingBrandId}>
                          <option value="">-- Chọn Sản Phẩm (Nếu có) --</option>
                          {bookingSanPhams.map(sp => (<option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>))}
    
                      </select></div>
                      
                      {/* Sửa: Khớp tên cột Nhan_su */}
                      <div><label>Người Deal</label><select value={bookingNguoiDealId} onChange={e => setBookingNguoiDealId(e.target.value)} style={{ width: '100%', padding: 
              '8px', boxSizing: 'border-box' }} required>
                          <option value="">-- Chọn nhân sự --</option>
                          {nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}
                      </select></div>
             
          
                      {/* Sửa: Khớp tên cột Link_video */}
                      <div><label>Link Video</label><input type="text" value={bookingLinkVideo} onChange={e => setBookingLinkVideo(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
    
                      {/* Sửa: Khớp tên cột Id_video */}
                      <div><label>ID Video</label><input type="text" value={bookingIdVideo} onChange={e => setBookingIdVideo(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
                 
                      {/* Sửa: Khớp tên cột Ngay_booking */}
                      <div><label>Ngày Booking</label><input type="date" value={bookingNgayBooking} onChange={e => setBookingNgayBooking(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
                      {/* Sửa: Khớp tên cột Ngay_air */}
  
                      <div><label>Ngày Air</label><input type="date" value={bookingNgayAir} onChange={e => setBookingNgayAir(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
                      {/* Sửa: Khớp tên cột key_content */}
               
                      <div><label>Key Content</label><input type="text" value={bookingKeyContent} onChange={e => setBookingKeyContent(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
                      {/* Sửa: Khớp tên cột doi_tuong */}
                      <div><label>Đối tượng</label><input type="text" value={bookingDoiTuong} onChange={e => 
              setBookingDoiTuong(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
                      {/* Sửa: Khớp tên cột chat_luong */}
                      <div><label>Chất lượng</label><input type="text" value={bookingChatLuong} onChange={e => setBookingChatLuong(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
    
                      
                      {/* Sửa: Khớp tên cột Cast */}
                      <div><label>Cast/CMT</label><input type="text" value={bookingCastCmt} onChange={e => setBookingCastCmt(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                  
              
                      {/* Sửa: Khớp tên cột Cms */}
                      <div><label>Commission (%)</label><input type="number" step="0.01" value={bookingCms} onChange={e => setBookingCms(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} /></div>
                      
        
                      {/* Sửa: Khớp tên cột Thong_tin_koc */}
                      <div><label>Thông tin KOC</label><textarea value={bookingThongTinKoc} onChange={e => setBookingThongTinKoc(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', minHeight: '80px' }} /></div>
                      
                   
                      {/* Sửa: Khớp tên cột dat_kpi */}
                      <div><label style={{ display: 'flex', alignItems: 'center' }}><input type="checkbox" checked={bookingDatKpi} onChange={e => setBookingDatKpi(e.target.checked)} style={{ marginRight: '10px' }} /> Đạt KPI tháng</label></div>

                      <button type="submit" disabled={isBookingLoading} style={{ width: '100%', padding: '10px', backgroundColor: isBookingLoading ?
              '#ccc' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '1rem' }}>
                          {isBookingLoading ?
              'Đang lưu...' : 'Lưu Booking'}
                      </button>
                  </form>
              </div>

              {/* --- CỘT BẢNG HIỂN THỊ BOOKING --- */}
              <div style={{ flex: 2, padding: '2rem', 
              border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Danh Sách Booking</h2>
                  {isLoadingBookings ?
              <p>Đang tải dữ liệu booking...</p> : (
                      <div style={{ maxHeight: '80vh', overflowY: 'auto', overflowX: 'auto' }}> 
                          {bookings.length === 0 ? <p>Chưa có booking nào.</p> : (
                            
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead style={{ backgroundColor: '#f2f2f2', position: 'sticky', top: 0, zIndex: 1 }}>
                                      <tr>
          
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>KOC</th>
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>Brand</th>
          
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>Sản Phẩm</th>
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>Ngày Air</th>
        
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>Link</th>
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>Người Deal</th>
       
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>CMS (%)</th>
                                          <th style={{ padding: '12px', border: '1px solid #ddd' }}>KPI</th>
      
                                      </tr>
                                  </thead>
                                  
              <tbody>
                                      {bookings.map((booking) => (
                                          <tr key={booking.id}>
                 
                                              {/* Sửa: Khớp tên cột Koc_name */}
                                              <td style={{ padding: '12px', border: '1px solid #ddd' }}>{booking.Koc_name}</td>
           
                                              <td style={{ padding: '12px', border: '1px solid #ddd' }}>{booking.brands?.ten_brand}</td>
                                              <td style={{ padding: '12px', border: '1px solid #ddd' }}>{booking.sanphams?.ten_sanpham ||
              'N/A'}</td>
                                              {/* Sửa: Khớp tên cột Ngay_air */}
                                              <td style={{ 
              padding: '12px', border: '1px solid #ddd' }}>{booking.Ngay_air ? new Date(booking.Ngay_air).toLocaleDateString('vi-VN') : ''}</td>
                                              {/* Sửa: Khớp tên cột Link_video */}
                                     
                                              <td style={{ padding: '12px', border: '1px solid #ddd' }}><a href={booking.Link_video} target="_blank" rel="noopener noreferrer">Xem Video</a></td>
                                              {/* SỬA LỖI: Dùng booking.Nhan_su */}
                           
                                              <td style={{ padding: '12px', border: '1px solid #ddd' }}>{booking.Nhan_su?.ten_nhansu}</td>
                                              {/* Sửa: Khớp tên cột Cms */}
                     
                                              <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{booking.Cms}</td>
                                              {/* Sửa: Khớp tên cột dat_kpi */}
             
                                              <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{booking.dat_kpi ?
              '✅' : '❌'}</td>
                                          </tr>
                                      ))}
                  
              </tbody>
                              </table>
                          )}
                      </div>
      
              )}
              </div>
          </div>
      )}
    </div>
  );
 }

export default App;