import XLSX from 'xlsx-js-style';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env={}; for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const m=l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);if(m){let v=m[2].trim().replace(/\r/g,'');if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);env[m[1]]=v;}}
const supabase=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
const round=v=>Math.round(Number(String(v??'').replace(/[^\d.-]/g,''))||0);
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLowerCase().replace(/\s+/g,'');
const serialToYmd=s=>{if(typeof s!=='number'||!(s>40000))return '';const o=XLSX.SSF.parse_date_code(s);return o?`${o.y}-${String(o.m).padStart(2,'0')}-${String(o.d).padStart(2,'0')}`:'';};
const strong=(ch,cast,date,brand,name)=>[norm(ch),round(cast),date,norm(brand),norm(name)].join('|');
// DB strong sigs
const dbSet=new Set(); let dbN=0;
for(let off=0;;off+=1000){const{data}=await supabase.from('koc_payments').select('channel_link,cast_net,pay_date,brand,full_name').range(off,off+999);if(!data||!data.length)break;for(const r of data){dbSet.add(strong(r.channel_link,r.cast_net,txt(r.pay_date).slice(0,10),r.brand,r.full_name));dbN++;}if(data.length<1000)break;}
console.log('DB rows:',dbN,'| distinct strong-sig:',dbSet.size);
// parse 3 sheets
const wb=XLSX.readFile('C:/Users/ASUS/Desktop/BOOKING KOC GUIDELINE.xlsx',{cellStyles:true});
const sheets=['3.1. THANH TOÁN STELLA 2026','3.2. THANH TOÁN OPTIMAX 2026','3.1 THANH TOÁN STELLA 2025'];
let complete=0, missed=[];
for(const name of sheets){
  const ws=wb.Sheets[name];const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  const hdr=(aoa[0]||[]).map(c=>String(c).toUpperCase().replace(/\s+/g,' ').trim());
  const ci=(...ns)=>{for(let i=0;i<hdr.length;i++)if(ns.some(n=>hdr[i].includes(n)))return i;return -1;};
  const C={ngay:ci('NGÀY'),cty:ci('CÔNG TY'),brand:ci('BRAND'),kenh:ci('LINK KÊNH'),cast:ci('CAST'),stk:ci('SỐ TÀI KHOẢN','TÀI KHOẢN'),bank:ci('NGÂN HÀNG'),nguoi:ci('NGƯỜI THỤ HƯỞNG','THỤ HƯỞNG'),hoten:ci('HỌ VÀ TÊN','HỌ TÊN')};
  for(let i=1;i<aoa.length;i++){
    const r=aoa[i];const cast=round(r[C.cast]);const ba=txt(r[C.stk]),bn=txt(r[C.bank]),fn=txt(r[C.hoten])||txt(r[C.nguoi]),ch=txt(r[C.kenh]),brand=txt(r[C.brand]),date=serialToYmd(r[C.ngay]);
    if(!(cast>0||ch||fn))continue;
    if(!ba||!bn||!fn)continue;        // incomplete → đúng ra bị loại
    complete++;
    const s=strong(ch||fn,cast,date,brand,fn);
    if(!dbSet.has(s)) missed.push({sheet:name.slice(4,14),date,brand,name:fn,cast,ch:ch.slice(0,40)});
  }
}
console.log('Excel COMPLETE rows (3 sheet):',complete);
console.log('=> BỊ SÓT (đủ TT nhưng KHÔNG có trong DB):',missed.length);
missed.slice(0,20).forEach(m=>console.log('  ',m.sheet,m.date,m.brand,'|',m.name,'|',m.cast));
if(missed.length) fs.writeFileSync('scripts/_missed.json',JSON.stringify(missed));
