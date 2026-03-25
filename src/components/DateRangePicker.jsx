// src/components/DateRangePicker.jsx
import { useState, useRef, useEffect } from 'react';

const DAYS_VN = ['T2','T3','T4','T5','T6','T7','CN'];

/* ── helpers ── */
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const sameDay = (a,b) => a && b && startOfDay(a).getTime() === startOfDay(b).getTime();
const isBetween = (d,a,b) => {
  if (!d||!a||!b) return false;
  const t = startOfDay(d).getTime();
  const [lo,hi] = a<=b ? [a,b]:[b,a];
  return t > lo.getTime() && t < hi.getTime();
};
const monthStart = (y,m) => new Date(y,m,1);
const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
// 0=Sun,1=Mon … → we want Mon=0
const weekdayMon = (d) => (d.getDay()+6)%7;

const fmtDate = (d) => d ? d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

/* ── single month calendar ── */
const MonthGrid = ({ year,month,rangeStart,rangeEnd,hovered,onDayClick,onDayHover }) => {
  const first = monthStart(year,month);
  const offset = weekdayMon(first); // blank cells before day 1
  const days   = daysInMonth(year,month);
  const cells  = [];
  for(let i=0; i<offset; i++) cells.push(null);
  for(let d=1; d<=days; d++) cells.push(new Date(year,month,d));

  const teal   = '#0D9488';
  const tealLt = '#CCFBF1';

  return (
    <div>
      {/* day-of-week header */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
        {DAYS_VN.map(d=>(
          <div key={d} style={{textAlign:'center',fontSize:'0.7rem',fontWeight:700,color:'#9ca3af',padding:'4px 0'}}>{d}</div>
        ))}
      </div>
      {/* day cells */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px 0'}}>
        {cells.map((date,i)=>{
          if(!date) return <div key={i} />;
          const isStart = sameDay(date,rangeStart);
          const isEnd   = sameDay(date,rangeEnd);
          const isRange = isBetween(date,rangeStart, rangeEnd||hovered);
          const isHov   = sameDay(date,hovered) && !rangeEnd;
          const isToday = sameDay(date,new Date());
          const baseStyle = {
            height:32, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'0.82rem', cursor:'pointer', userSelect:'none', position:'relative',
            transition:'background 0.12s',
            borderRadius: (isStart&&isEnd) ? 99
              : isStart ? '99px 0 0 99px'
              : isEnd   ? '0 99px 99px 0'
              : 0,
            background: (isStart||isEnd) ? teal
              : isRange   ? tealLt
              : isHov     ? tealLt
              : 'transparent',
            color: (isStart||isEnd) ? '#fff'
              : isToday ? teal
              : '#111',
            fontWeight: (isStart||isEnd||isToday) ? 800 : 400,
          };
          return (
            <div key={i} style={baseStyle}
              onClick={()=>onDayClick(date)}
              onMouseEnter={()=>onDayHover(date)}
              onMouseLeave={()=>onDayHover(null)}
            >
              {date.getDate()}
              {isToday && !isStart && !isEnd && (
                <span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',
                  width:4,height:4,borderRadius:'50%',background:teal}} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── header with nav ── */
const MonthHeader = ({year,month,onPrev,onNext,showPrev=true,showNext=true}) => {
  const MONTHS_VN=['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
    'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const navBtn = (show,onClick,label) => show ? (
    <button onClick={onClick} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',
      fontSize:'1rem',padding:'2px 6px',borderRadius:6,lineHeight:1}}>
      {label}
    </button>
  ) : <div style={{width:28}} />;
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      {navBtn(showPrev,onPrev,'‹')}
      <span style={{fontWeight:800,fontSize:'0.88rem',color:'#111'}}>
        {MONTHS_VN[month]} / {year}
      </span>
      {navBtn(showNext,onNext,'›')}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Main component
   Props:
     value: { start: Date|null, end: Date|null }
     onChange: ({start, end}) => void
     onClose: () => void
   ═══════════════════════════════════════════════════════════ */
const DateRangePicker = ({ value, onChange, onClose, anchorDate }) => {
  const today      = startOfDay(anchorDate || new Date());
  const initLeft   = value?.start ? new Date(value.start.getFullYear(), value.start.getMonth(), 1)
                                  : new Date(today.getFullYear(), today.getMonth()-1, 1);
  const initRight  = new Date(initLeft.getFullYear(), initLeft.getMonth()+1, 1);

  const [leftYear,  setLeftYear]  = useState(initLeft.getFullYear());
  const [leftMonth, setLeftMonth] = useState(initLeft.getMonth());
  const [hovered,   setHovered]   = useState(null);
  const [selecting, setSelecting] = useState(!value?.start || !value?.end); // true = picking start

  // derive right month
  const rightMonth = (leftMonth + 1) % 12;
  const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;

  const navLeft  = (dir) => {
    const d = new Date(leftYear, leftMonth + dir, 1);
    setLeftYear(d.getFullYear());
    setLeftMonth(d.getMonth());
  };

  const handleDayClick = (date) => {
    if (selecting || !value?.start) {
      // first click → set start
      onChange({ start: startOfDay(date), end: null });
      setSelecting(false);
    } else {
      // second click → set end; ensure start <= end
      let s = value.start;
      let e = startOfDay(date);
      if (e < s) { [s,e] = [e,s]; }
      onChange({ start: s, end: e });
      setSelecting(true); // ready for new selection
    }
  };

  const applyQuick = (days) => {
    const end   = startOfDay(today);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    onChange({ start, end });
    setSelecting(true);
    onClose && onClose();
  };

  const teal = '#0D9488';
  const quickBtnStyle = (active) => ({
    padding:'6px 14px', borderRadius:8, border:`1.5px solid ${active?teal:'#e5e7eb'}`,
    background: active ? teal : '#fff', color: active ? '#fff' : '#374151',
    fontSize:'0.8rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap'
  });

  const rangeStart = value?.start || null;
  const rangeEnd   = value?.end   || null;

  // shared day click / hover
  const monthProps = (y,m) => ({
    year:y, month:m,
    rangeStart, rangeEnd,
    hovered: selecting ? null : hovered,
    onDayClick: handleDayClick,
    onDayHover: (d) => !selecting && setHovered(d),
  });

  const isQuick7  = rangeEnd && rangeStart &&
    Math.round((rangeEnd-rangeStart)/86400000)===6 &&
    sameDay(rangeEnd, today);
  const isQuick28  = rangeEnd && rangeStart &&
    Math.round((rangeEnd-rangeStart)/86400000)===27 &&
    sameDay(rangeEnd, today);

  return (
    <div style={{
      background:'#fff', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.14)',
      border:'1px solid #e5e7eb', padding:'20px 20px 16px', zIndex:1000,
      fontFamily:"'Outfit', sans-serif",
    }}>
      {/* top row: quick shortcuts + display */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <button style={quickBtnStyle(isQuick7)}  onClick={()=>applyQuick(7)}>7 ngày qua</button>
        <button style={quickBtnStyle(isQuick28)} onClick={()=>applyQuick(28)}>28 ngày qua</button>
        <div style={{flex:1}}/>
        <div style={{fontSize:'0.8rem',color:'#6b7280',fontWeight:600}}>
          {rangeStart ? fmtDate(rangeStart) : '—'}
          {' → '}
          {rangeEnd ? fmtDate(rangeEnd) : (selecting ? '—' : 'chọn ngày kết thúc')}
        </div>
      </div>

      {/* dual-month calendars */}
      <div style={{display:'flex',gap:24}}>
        {/* LEFT */}
        <div style={{minWidth:220}}>
          <MonthHeader year={leftYear} month={leftMonth}
            onPrev={()=>navLeft(-1)} onNext={()=>navLeft(1)}
            showPrev={true} showNext={true} />
          <MonthGrid {...monthProps(leftYear, leftMonth)} />
        </div>
        {/* divider */}
        <div style={{width:1,background:'#f3f4f6',margin:'0 4px'}}/>
        {/* RIGHT */}
        <div style={{minWidth:220}}>
          <MonthHeader year={rightYear} month={rightMonth}
            onPrev={()=>navLeft(-1)} onNext={()=>navLeft(1)}
            showPrev={false} showNext={false} />
          <MonthGrid {...monthProps(rightYear, rightMonth)} />
        </div>
      </div>

      {/* hint */}
      <div style={{marginTop:12,fontSize:'0.75rem',color:'#9ca3af',textAlign:'center'}}>
        {selecting && !rangeStart ? 'Chọn ngày bắt đầu' :
         !selecting && rangeStart && !rangeEnd ? 'Chọn ngày kết thúc' :
         rangeStart && rangeEnd ? `${Math.round((rangeEnd-rangeStart)/86400000)+1} ngày được chọn` : ''}
      </div>

      {/* action buttons */}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:14}}>
        <button onClick={()=>{onChange({start:null,end:null});setSelecting(true);}}
          style={{padding:'7px 16px',borderRadius:9,border:'1.5px solid #e5e7eb',
            background:'#fff',color:'#6b7280',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>
          Đặt lại
        </button>
        <button onClick={onClose}
          style={{padding:'7px 20px',borderRadius:9,border:'none',
            background: teal,color:'#fff',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>
          Áp dụng
        </button>
      </div>
    </div>
  );
};

export default DateRangePicker;
