import https from 'https';

const fetchJson = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => resolve(JSON.parse(raw)));
  }).on('error', reject);
});

const urls = {
  Product: 'https://admin-apis.bluecore.vn/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&replaceUnicode=false&sectionName=Stella_api_product&size=500',
  Traffic: 'https://admin-apis.bluecore.vn/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&replaceUnicode=false&sectionName=Stella_api_traffic&size=500',
  Ads: 'https://admin-apis.bluecore.vn/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&replaceUnicode=false&sectionName=stella_api_tongquanads&size=500',
};

async function main() {
  for (const [name, url] of Object.entries(urls)) {
    try {
      const data = await fetchJson(url);
      const rows = data.result.map(x => x._source);
      const dateKeys = name === 'Ads' ? ['col_9PJS783P', 'created_at'] : ['created_at'];
      
      let min = Infinity;
      let max = -Infinity;
      let valid = 0;
      
      for (const row of rows) {
        let ts = null;
        for (const k of dateKeys) {
          if (row[k]) { ts = row[k]; break; }
        }
        if (ts) {
          if (ts < min) min = ts;
          if (ts > max) max = ts;
          valid++;
        }
      }
      
      console.log(`\n--- ${name} API ---`);
      console.log(`Total data in DB: ${data.count_row}`);
      console.log(`Rows fetched in API call (size=500): ${rows.length}`);
      
      if (valid > 0) {
        console.log(`Min Date (Cũ nhất): ${new Date(min).toLocaleDateString('vi-VN')} (${new Date(min).toLocaleString('vi-VN')})`);
        console.log(`Max Date (Mới nhất): ${new Date(max).toLocaleDateString('vi-VN')} (${new Date(max).toLocaleString('vi-VN')})`);
      }
      
      // Look at the first and last row's date to see sorting
      if (rows.length > 0) {
        const firstTs = rows[0][dateKeys[0]] || rows[0]['created_at'];
        const lastTs = rows[rows.length-1][dateKeys[0]] || rows[rows.length-1]['created_at'];
        console.log(`Row 1 Date (Đầu data): ${new Date(firstTs).toLocaleDateString('vi-VN')}`);
        console.log(`Row ${rows.length} Date (Cuối data): ${new Date(lastTs).toLocaleDateString('vi-VN')}`);
      }

    } catch (e) {
      console.error(name, e.message);
    }
  }
}

main();
