// src/components/RunnerLoader.jsx
// Loader "chạy bộ" màu cam — tái dùng cho mọi trạng thái "Đang tải…" trong app.
// CSS ở index.css (.runner-loader), keyframes rl-* (cũng có trong index.html cho splash).
export default function RunnerLoader({ label = 'Đang tải dữ liệu…' }) {
  return (
    <div className="runner-loader">
      <div className="rl-stage">
        <div className="loader">
          <span><span /><span /><span /><span /></span>
          <div className="base"><span /><div className="face" /></div>
        </div>
        <div className="longfazers"><span /><span /><span /><span /></div>
      </div>
      {label && <div className="rl-label">{label}</div>}
    </div>
  );
}
