import XLSX from 'xlsx-js-style';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env={}; for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const m=l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);if(m){let v=m[2].trim().replace(/\r/g,'');if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);env[m[1]]=v;}}
const supabase=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
const round=v=>Math.round(Number(String(v??'').replace(/[^\d.-]/g,''))||0);
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLowerCase().replace(/\s+/g,'');
const ymd=s=>{if(typeof s!=='number'||!(s>40000))return '';const o=XLSX.SSF.parse_date_code(s);return o?`${o.y}-${String(o.m).padStart(2,'0')}-${String(o.d).padStart(2,'0')}`:'';};
const strong=(ch,cast,date,brand,name)=>[norm(ch),round(cast),date,norm(brand),norm(name)].join('|');
const dbCount=new Map();
for(let off=0;;off+=1000){const{data}=await supabase.from('koc_payments').select('channel_link,cast_net,pay_date,brand,full_name').range(off,off+999);if(!data||!data.length)break;for(const r of data){const s=strong(r.channel_link,r.cast_net,txt(r.pay_date).slice(0,10),r.brand,r.full_name);dbCount.set(s,(dbCount.get(s)||0)+1);}if(data.length<1000)break;}
const wb=XLSX.readFile('C:/Users/ASUS/Desktop/BOOKING KOC GUIDELINE.xlsx',{cellStyles:true});
const sheets=[['3.1. THANH TOÁN STELLA 2026','STELLA'],['3.2. THANH TOÁN OPTIMAX 2026','OPTIMAX'],['3.1 THANH TOÁN STELLA 2025','STELLA']];
const bySig=new Map();
for(const[name,dco]of sheets){
  const ws=wb.Sheets[name];const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  const hdr=(aoa[0]||[]).map(c=>String(c).toUpperCase().replace(/\s+/g,' ').trim());
  const ci=(...ns)=>{for(let i=0;i<hdr.length;i++)if(ns.some(n=>hdr[i].includes(n)))return i;return -1;};
  const C={ngay:ci('NGÀY'),ns:ci('NHÂN SỰ'),cty:ci('CÔNG TY'),brand:ci('BRAND'),kenh:ci('LINK KÊNH'),cast:ci('CAST'),pit:ci('PIT'),tong:ci('TỔNG'),stk:ci('SỐ TÀI KHOẢN','TÀI KHOẢN'),bank:ci('NGÂN HÀNG'),nguoi:ci('NGƯỜI THỤ HƯỞNG','THỤ HƯỞNG'),hoten:ci('HỌ VÀ TÊN','HỌ TÊN'),cccd:ci('SỐ CCCD','CCCD'),mst:ci('MÃ SỐ THUẾ','MST'),air:ci('LINK AIR'),hd:ci('HỢP ĐỒNG')};
  for(let i=1;i<aoa.length;i++){
    const r=aoa[i];const cast=round(r[C.cast]);const ba=txt(r[C.stk]),bn=txt(r[C.bank]),fn=txt(r[C.hoten])||txt(r[C.nguoi]),ch=txt(r[C.kenh]),brand=txt(r[C.brand]),date=ymd(r[C.ngay]);
    if(!(cast>0||ch||fn))continue; if(!ba||!bn||!fn)continue;
    const s=strong(ch||fn,cast,date,brand,fn);
    const aCell=ws[XLSX.utils.encode_cell({r:i,c:C.ngay>=0?C.ngay:0})];const yellow=(aCell?.s?.fgColor?.rgb||'').toUpperCase()==='FFFF00';
    const pit=round(r[C.pit]);
    const p={pay_date:date||null,staff:C.ns>=0?(txt(r[C.ns])||null):null,company:txt(r[C.cty])||dco,brand:brand||null,channel_link:ch||null,cast_net:cast,pit,total:round(r[C.tong])||(cast+pit),bank_account:ba||null,bank_name:bn||null,beneficiary:txt(r[C.nguoi])||null,full_name:fn||null,cccd:txt(r[C.cccd])||null,tax_code:txt(r[C.mst])||txt(r[C.cccd])||null,air_link:C.air>=0?(txt(r[C.air])||null):null,contract_link:C.hd>=0?(txt(r[C.hd])||null):null,accountant_approved:yellow,note:null};
    if(!bySig.has(s))bySig.set(s,[]); bySig.get(s).push(p);
  }
}
const toInsert=[];
for(const[s,rows]of bySig){const have=dbCount.get(s)||0; if(rows.length>have) toInsert.push(...rows.slice(have));}
console.log('Bổ sung',toInsert.length,'dòng (đủ TT, đã sót). Vàng:',toInsert.filter(x=>x.accountant_approved).length);
let ok=0,fail=0;
for(let i=0;i<toInsert.length;i+=300){const b=toInsert.slice(i,i+300);const{error}=await supabase.from('koc_payments').insert(b);if(error){fail+=b.length;console.log('ERR',error.message);}else ok+=b.length;}
console.log('DONE ok',ok,'fail',fail);
