// src/hooks/useContractLogic.js
import { useState } from 'react';

// --- CÁC HÀM ĐỌC SỐ (Giữ nguyên) ---
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

// --- LOGIC CHÍNH ---
export const useContractLogic = () => {
  const [contractData, setContractData] = useState({
        benB_ten: '', benB_sdt: '', benB_diaChi: '', benB_cccd: '', benB_mst: '', 
        benB_stk: '', benB_nganHang: '', benB_nguoiThuHuong: '',
        soHopDong: '', ngayKy: new Date().toISOString().split('T')[0], 
        ngayThucHien: new Date().toISOString().split('T')[0],
        sanPham: '', linkSanPham: '', linkKenh: '', soLuong: 1, donGia: 0,
        benA_ten: "CÔNG TY TNHH ĐỘNG \nHỌC STELLA", benA_diaChi: "9/11 Nguyễn Huy Tưởng, Phường Gia Định, Thành phố Hồ Chí Minh",
        benA_mst: "0314421133", benA_nguoiDaiDien: "VÕ HUÂN", benA_chucVu: "Giám đốc",
  });
  const [contractHTML, setContractHTML] = useState('');
  const [isOutputVisible, setIsOutputVisible] = useState(false);
  const [copyMessage, setCopyMessage] = useState({ text: '', type: 'hidden' });

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

    // ĐÂY LÀ ĐOẠN BẠN CẦN: HTML ĐẦY ĐỦ, KHÔNG RÚT GỌN
    const contractTemplate = `
<style>
    #contractContent { background-color: white; line-height: 1.6; font-family: 'Times New Roman', Times, serif; font-size: 13pt; }
    #contractContent table { width: 100%; border-collapse: collapse; border: 1px solid black; }
    #contractContent th, #contractContent td { border: 1px solid black; padding: 8px; vertical-align: top; }
    #contractContent .no-border-table, #contractContent .no-border-table td { border: none !important; padding: 2px 0; }
    #contractContent h1, h2 { text-align: center; font-weight: bold; }
    #contractContent .center-text { text-align: center; }
    #contractContent .bold-text { font-weight: bold; }
    @media print {
        body * { visibility: hidden; }
        #outputContainer, #outputContainer * { visibility: visible; }
        #outputContainer { position: absolute; left: 0; top: 0; width: 100%; height: auto; box-shadow: none; border: none; }
        #contractContent { max-height: none; overflow: visible; }
    }
</style>
<div id="contractContent">
    <div class="center-text">
        <p class="bold-text">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
        <p class="bold-text">Độc lập - Tự do - Hạnh phúc</p>
        <p>---- o0o ----</p>
    </div>
    <br>
    <h2>HỢP ĐỒNG DỊCH VỤ</h2>
    <p class="center-text">Số: ${data.soHopDong}</p>
    <br>
    <p>Căn cứ Bộ luật Dân sự 2015 số 91/2015/QH13 ngày 24/11/2015;</p>
    <p>Căn cứ Luật Thương Mại số 36/2005/QH11 ngày 14/06/2005;</p>
    <p>Căn cứ Luật Quảng Cáo số 16/2012/QH13 ngày 21/06/2012 và các văn bản hướng dẫn liên quan;</p>
    <p>Căn cứ nhu cầu và khả năng của các bên</p>
    <br>
    <p>Hôm nay, ${ngayKy.full}, chúng tôi gồm:</p>
    <table class="no-border-table" style="width: 100%;">
        <tr>
            <td style="width: 20%;" class="bold-text">BÊN A</td>
            <td style="width: 80%;" class="bold-text">: ${data.benA_ten.toUpperCase()}</td>
        </tr>
        <tr>
            <td>Địa chỉ</td>
            <td>: ${data.benA_diaChi}</td>
        </tr>
        <tr>
            <td>Mã số thuế</td>
            <td>: ${data.benA_mst}</td>
        </tr>
        <tr>
            <td>Người đại diện</td>
            <td>: <span class="bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Chức vụ: ${data.benA_chucVu}</td>
        </tr>
    </table>
    <p>Và</p>
    <table class="no-border-table" style="width: 100%;">
        <tr>
            <td style="width: 20%;" class="bold-text">BÊN B</td>
            <td style="width: 80%;" class="bold-text">: ${data.benB_ten.toUpperCase()}</td>
        </tr>
        <tr>
            <td>Địa chỉ</td>
            <td>: ${data.benB_diaChi}</td>
        </tr>
        <tr>
            <td>SĐT</td>
            <td>: ${data.benB_sdt}</td>
        </tr>
        <tr>
            <td>CCCD</td>
            <td>: ${data.benB_cccd}</td>
        </tr>
        <tr>
            <td>MST</td>
            <td>: ${data.benB_mst}</td>
        </tr>
        <tr>
            <td>Số tài khoản</td>
            <td>: ${data.benB_stk}</td>
        </tr>
        <tr>
            <td>Ngân hàng</td>
            <td>: ${data.benB_nganHang.toUpperCase()}</td>
        </tr>
        <tr>
            <td>Người thụ hưởng</td>
            <td>: ${data.benB_nguoiThuHuong.toUpperCase()}</td>
        </tr>
    </table>
    <br>
    <p>Hai Bên thống nhất ký kết hợp đồng với các điều khoản và điều kiện sau đây:</p>
    <p class="bold-text">ĐIỀU 1: NỘI DUNG HỢP ĐỒNG</p>
    <p>1.1. Bên A mời Bên B đồng ý nhận cung cấp dịch vụ quảng cáo và Bên A đồng ý sử dụng dịch vụ quảng cáo trên kênh của B, cụ thể như sau:</p>
    <p style="padding-left: 20px;">a. Thời gian: ${ngayThucHien.ngay}/${ngayThucHien.thang}/${ngayThucHien.nam}</p>
    <p style="padding-left: 20px;">b. Sản phẩm: ${data.sanPham}</p>
    <p style="padding-left: 20px;">c. Link sản phẩm: ${data.linkSanPham}</p>
    <p style="padding-left: 20px;">d. Nội dung công việc cụ thể:</p>
    <table>
        <thead>
            <tr>
                <th class="center-text">STT</th>
                <th class="center-text">Link kênh Tiktok</th>
                <th class="center-text">Hạng mục</th>
                <th class="center-text">Số lượng</th>
                <th class="center-text">Đơn giá</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="center-text">1</td>
                <td>${data.linkKenh}</td>
                <td class="center-text">video</td>
                <td class="center-text">${String(data.soLuong).padStart(2, '0')}</td>
                <td style="text-align: right;">${formatCurrency(data.donGia)}</td>
            </tr>
            <tr>
                <td colspan="4" class="bold-text">Tổng giá trị hợp đồng</td>
                <td style="text-align: right;" class="bold-text">${formatCurrency(tongGiaTri)}</td>
            </tr>
            <tr>
                <td colspan="4">Thuế TNCN 10%</td>
                <td style="text-align: right;">${formatCurrency(thueTNCN)}</td>
            </tr>
            <tr>
                <td colspan="4" class="bold-text">TỔNG CỘNG</td>
                <td style="text-align: right;" class="bold-text">${formatCurrency(tongCong)}</td>
            </tr>
        </tbody>
    </table>
    <p><i>(Bằng chữ: ${tongCongChu}.)</i></p>
    <p>1.2. Nội dung nghiệm thu công việc:</p>
    <table>
        <thead>
            <tr>
                <th class="center-text">STT</th>
                <th class="center-text">Hạng mục</th>
                <th class="center-text">Nội dung nghiệm thu</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="center-text">1</td>
                <td>Demo (video)</td>
                <td>Gửi Demo trước từ 3-5 ngày kể từ ngày đăng video</td>
            </tr>
            <tr>
                <td class="center-text">2</td>
                <td>Link Post (Url)</td>
                <td>Check video đã gắn đúng link sản phẩm</td>
            </tr>
            <tr>
                <td class="center-text">3</td>
                <td>Cung cấp mã quảng cáo</td>
                <td>Code ads 365 ngày hoặc uỷ quyền kênh</td>
            </tr>
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
        <tr>
            <td class="center-text bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</td>
            <td class="center-text bold-text">${data.benB_ten.toUpperCase()}</td>
        </tr>
    </table>
</div>`;
    
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
    setTimeout(() => { setCopyMessage({ text: '', type: 'hidden' }); }, 3000);
  };

  return {
    contractData, setContractData,
    contractHTML, setContractHTML,
    isOutputVisible, setIsOutputVisible,
    copyMessage, setCopyMessage,
    handleContractFormChange,
    handleGenerateContract,
    handleCopyToClipboard
  };
};