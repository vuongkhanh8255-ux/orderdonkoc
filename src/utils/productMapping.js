export const normalizeProductName = (rawName) => {
    if (!rawName) return '';
    const name = rawName.trim().toLowerCase();

    // 1. Bodymist (Các mùi lẻ -> "Bodymist")
    const bodymistScents = [
        "stop and stare", "tự do", "talk 2 much", "sunset on palms", "money honey",
        "love wins", "irich", "hide and seek", "hạnh phúc", "funky fresh",
        "độc lập", "dawn on paradise", "dark night", "care free",
        "blinded love", "be lover"
    ];
    // Check "Bodymist nhũ" trước vì nó có chữ "Bodymist"
    // 2. Bodymist Nhũ
    const shimmerKeywords = [
        "shimmer", "dark velvet", "black queen", "aura tears", "sayderella", "phêfairy", "mêmand"
    ];
    if (shimmerKeywords.some(k => name.includes(k))) return "Bodymist nhũ";

    // 3. Bodymist Baddie Barbie
    if (name.includes("baddie barbie")) return "Bodymist Baddie Barbie";

    // 4. Bodymist (Check mùi hoặc chữ "105ml" hoặc chính chữ "bodymist" đứng một mình hoặc kèm mùi)
    // Logic: Nếu chứa mùi trong list OR chứa "105ml" (đặc trưng bodymist thường) -> Bodymist
    // Tuy nhiên cần cẩn thận với "Bodymist nhũ" đã check ở trên.
    const isBodymistScent = bodymistScents.some(s => name.includes(s));
    const is105ml = /105\s*ml/.test(name);

    if (isBodymistScent || is105ml) return "Bodymist";

    // Check lại lần nữa nếu user nhập "Bodymist" mà không rớt vào case Nhũ/Barbie
    if (name === "bodymist" || name === "body mist") return "Bodymist";


    // 5. Nước hoa sáp
    const balmKeywords = ["balm", "lofi", "friendzone", "shaymen", "túi mù"];
    if (balmKeywords.some(k => name.includes(k))) return "Nước hoa sáp";

    // 6. Son Milaganics (Gấc, Dừa, Trà xanh, Nha đam)
    if (name.includes("son gấc") || name.includes("son dừa") || name.includes("son trà xanh") || name.includes("son dưỡng nha đam")) return "Son Milaganics";

    // 7. Son Masube
    if (name.includes("vita glow") || name.includes("rouge bloom")) return "Son Masube";

    // [NEW] Mặt nạ môi Kissable Masube
    if (name.includes("wacabe kissable") || name.includes("mặt nạ môi")) return "Mặt nạ môi Kissable Masube";

    // [NEW] Muối tắm Healmi
    const healmiKeywords = ["love aura", "wellness manifesting", "fortune claim"];
    if (healmiKeywords.some(k => name.includes(k))) return "Muối tắm Healmi";

    // 8. Bột Milaganics (Yến mạch, Trà xanh, Đậu đỏ)
    if (name.includes("yến mạch") || (name.includes("milaganics") && (name.includes("trà xanh") || name.includes("đậu đỏ")))) {
        // Lưu ý: Son trà xanh đã check ở trên. Ở đây check Bột.
        // Để an toàn, check keywords rõ hơn
        if (name.includes("bột")) return "Bột Milaganics";
    }
    // Fix cụ thể cho messy input
    if (name.includes("bột yến mạch")) return "Bột Milaganics";
    if (name.includes("bột đậu đỏ")) return "Bột Milaganics";
    if (name.includes("bột trà xanh") && name.includes("milaganics")) return "Bột Milaganics";


    // 9. Bột Moaw
    if (name.includes("moaw") || name.includes("tắm trắng thảo mộc")) return "Bột Moaw";

    // 10. Body oil (bao gồm Dầu Olive)
    // Note: User said "Dầu Olive 250ml", "Love oil" -> Body oil
    if (name.includes("body oil") || name.includes("love oil") || name.includes("dầu olive")) return "Body oil";

    // 11. Bộ bưởi Milaganics
    const buoiKeywords = ["xịt bưởi", "xả bưởi", "serum bưởi", "gội bưởi"];
    if (buoiKeywords.some(k => name.includes(k))) return "Bộ bưởi Milaganics";

    // Các case đặc biệt khác từ ảnh/yêu cầu
    if (name.includes("sachi")) return "Sachi";
    if (name.includes("hair serum")) return "Hair Serum";
    if (name.includes("sữa rửa mặt hoa cúc")) return "Sữa rửa mặt hoa cúc";
    if (name.includes("toner hoa cúc")) return "Toner hoa cúc";
    if (name.includes("gel nha đam")) return "Gel nha đam";
    if (name.includes("mask tràm trà")) return "Mask tràm trà";
    if (name.includes("mặt nạ tràm trà")) return "Mask tràm trà"; // Gom chung

    // Default: Giữ nguyên nếu không match
    // Cần Capitalize chữ cái đầu cho đẹp nếu giữ nguyên
    return rawName.charAt(0).toUpperCase() + rawName.slice(1);
};
