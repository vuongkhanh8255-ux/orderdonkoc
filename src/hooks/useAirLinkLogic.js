// src/hooks/useAirLinkLogic.js
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useAirLinkLogic = () => {
  const AIRLINKS_PER_PAGE = 500;
  const [airLinks, setAirLinks] = useState([]);
  const [isLoadingAirLinks, setIsLoadingAirLinks] = useState(false);
  const [filterAlKenh, setFilterAlKenh] = useState('');
  const [filterAlBrand, setFilterAlBrand] = useState('');
  const [filterAlNhanSu, setFilterAlNhanSu] = useState('');
  const [filterAlDate, setFilterAlDate] = useState('');
  const [airLinksCurrentPage, setAirLinksCurrentPage] = useState(1);
  const [airLinksTotalCount, setAirLinksTotalCount] = useState(0);
  const [airReportMonth, setAirReportMonth] = useState(new Date().getMonth() + 1);
  const [airReportYear, setAirReportYear] = useState(new Date().getFullYear());
  const [airReportData, setAirReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isAirReportLoading, setIsAirReportLoading] = useState(false);
  const [airSortConfig, setAirSortConfig] = useState({ key: 'chi_phi_cast', direction: 'desc' });

  const loadAirLinks = async () => {
    setIsLoadingAirLinks(true);
    const startIndex = (airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE;
    const endIndex = startIndex + AIRLINKS_PER_PAGE - 1;
    let query = supabase.from('air_links').select(`id, created_at, link_air_koc, id_kenh, id_video, "cast", cms_brand, ngay_air, san_pham, ngay_booking, brands ( ten_brand ), nhansu ( ten_nhansu )`, { count: 'exact' });
    if (filterAlKenh) query = query.ilike('id_kenh', `%${filterAlKenh}%`);
    if (filterAlBrand) query = query.eq('brand_id', filterAlBrand);
    if (filterAlNhanSu) query = query.eq('nhansu_id', filterAlNhanSu);
    if (filterAlDate) { const d = `${filterAlDate}T00:00:00.000Z`; const e = `${filterAlDate}T23:59:59.999Z`; query = query.gte('ngay_air', d).lte('ngay_air', e); }
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(startIndex, endIndex);
    if (error) alert("Lỗi AirLinks: " + error.message); else { setAirLinks(data || []); setAirLinksTotalCount(count || 0); }
    setIsLoadingAirLinks(false);
  };

  const handleDeleteAirLink = async (id, url) => { if(window.confirm(`Xóa link ${url}?`)) { setIsLoadingAirLinks(true); await supabase.from('air_links').delete().eq('id', id); loadAirLinks(); setIsLoadingAirLinks(false); } };
  
  useEffect(() => { loadAirLinks(); }, [airLinksCurrentPage, filterAlKenh, filterAlBrand, filterAlNhanSu, filterAlDate]);

  return { airLinks, setAirLinks, isLoadingAirLinks, filterAlKenh, setFilterAlKenh, filterAlBrand, setFilterAlBrand, filterAlNhanSu, setFilterAlNhanSu, filterAlDate, setFilterAlDate, airLinksCurrentPage, setAirLinksCurrentPage, airLinksTotalCount, loadAirLinks, handleDeleteAirLink, airReportMonth, setAirReportMonth, airReportYear, setAirReportYear, airReportData, setAirReportData, isAirReportLoading, airSortConfig, setAirSortConfig };
};