// LandingOrders.jsx
// Đặt file này vào: C:\Users\ASUS\koc-tool\src\components\ (hoặc src\tabs\)
// Rồi import + thêm vào tab navigation trong App.jsx

import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://xkyhvcmnkrxdtmwtghln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5MDg5MTYsImV4cCI6MjA3MzQ4NDkxNn0.WPQAAZ8NnwXKvf7dqzsimGl_jfSDClfwZgDYvfjVDQs";

const STATUS_OPTIONS = ["Mới", "Đã xác nhận", "Đang giao", "Đã giao", "Hủy"];

const STATUS_COLORS = {
  Mới: { bg: "#fff3cd", color: "#856404", border: "#ffc107" },
  "Đã xác nhận": { bg: "#cff4fc", color: "#055160", border: "#0dcaf0" },
  "Đang giao": { bg: "#d1ecf1", color: "#0c5460", border: "#17a2b8" },
  "Đã giao": { bg: "#d4edda", color: "#155724", border: "#28a745" },
  Hủy: { bg: "#f8d7da", color: "#721c24", border: "#dc3545" },
};

const PACKAGE_LABELS = {
  "1_chai": "Dùng Thử (1 chai - 285k)",
  "2_chai": "60 Ngày (2 chai - 360k)",
  "3_chai": "90 Ngày (3 chai - 990k)",
};

async function fetchOrders(statusFilter) {
  let url = `${SUPABASE_URL}/rest/v1/landing_orders?select=*&order=created_at.desc`;
  if (statusFilter && statusFilter !== "Tất cả") {
    url += `&status=eq.${encodeURIComponent(statusFilter)}`;
  }
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error("Fetch failed");
  return res.json();
}

async function updateStatus(id, status) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/landing_orders?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status }),
    }
  );
  return res.ok;
}

export default function LandingOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Tất cả");
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrders(statusFilter);
      setOrders(data);
    } catch (e) {
      setError("Không thể tải dữ liệu. Kiểm tra lại kết nối.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    const ok = await updateStatus(id, newStatus);
    if (ok) {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
      );
    }
    setUpdatingId(null);
  };

  // Summary counts
  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length;
    return acc;
  }, {});
  const total = orders.length;

  return (
    <div style={{ padding: "24px", fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
            🛒 Đơn hàng Landing Page
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            realsteelvietnam.io.vn · Real Steel Serum
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "1px solid #ddd",
            background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6, color: "#333",
          }}
        >
          {loading ? "⏳ Đang tải..." : "🔄 Làm mới"}
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[["Tổng đơn", total, "#1048c8"], ...STATUS_OPTIONS.map((s) => [s, counts[s] || 0, STATUS_COLORS[s]?.border])].map(
          ([label, val, color]) => (
            <div
              key={label}
              style={{
                background: "#fff", borderRadius: 10, padding: "14px 16px",
                border: `1.5px solid ${color}22`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{label}</div>
            </div>
          )
        )}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["Tất cả", ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all .15s",
              background: statusFilter === s ? "#1048c8" : "#f0f2f5",
              color: statusFilter === s ? "#fff" : "#555",
              border: statusFilter === s ? "1px solid #1048c8" : "1px solid transparent",
            }}
          >
            {s} {s !== "Tất cả" && counts[s] ? `(${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#856404" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eee", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#999" }}>⏳ Đang tải đơn hàng...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#999" }}>
            📭 Chưa có đơn hàng {statusFilter !== "Tất cả" ? `"${statusFilter}"` : ""}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #eee" }}>
                  {["#", "Thời gian", "Họ tên", "SĐT", "Địa chỉ", "Gói mua", "Ghi chú", "Trạng thái"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#444", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", color: "#999", fontWeight: 600 }}>#{o.id}</td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap", color: "#555" }}>
                      {new Date(o.created_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1a1a2e" }}>{o.ho_ten}</td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <a href={`tel:${o.so_dien_thoai}`} style={{ color: "#1048c8", fontWeight: 600, textDecoration: "none" }}>
                        {o.so_dien_thoai}
                      </a>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#555", maxWidth: 200 }}>{o.dia_chi}</td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span style={{
                        background: "#eef2ff", color: "#1048c8",
                        padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600
                      }}>
                        {PACKAGE_LABELS[o.goi_san_pham] || o.goi_san_pham}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#777", maxWidth: 160, fontSize: 12 }}>
                      {o.ghi_chu || <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <select
                        value={o.status}
                        disabled={updatingId === o.id}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        style={{
                          padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: `1.5px solid ${STATUS_COLORS[o.status]?.border || "#ddd"}`,
                          background: STATUS_COLORS[o.status]?.bg || "#f5f5f5",
                          color: STATUS_COLORS[o.status]?.color || "#333",
                          cursor: "pointer",
                        }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {updatingId === o.id && <span style={{ marginLeft: 6, fontSize: 11, color: "#999" }}>lưu...</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: "#bbb", textAlign: "right" }}>
        Tổng: {orders.length} đơn · Nguồn: Supabase landing_orders
      </p>
    </div>
  );
}
