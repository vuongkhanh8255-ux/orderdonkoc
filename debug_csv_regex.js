const csvRow = '746123912831,Sữa rửa mặt sạch sâu,5000000,10,100';
const matches = csvRow.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
console.log(matches.map(m => m.replace(/^"|"$/g, '').trim()));
