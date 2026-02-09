const sheetId = '11yicmEef0XG1dHbVXHL0BgT1oS9Wx_Hq';
const gid = '626517460';
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

async function testFetch() {
    try {
        console.log("Fetching:", url);
        const res = await fetch(url);
        const text = await res.text();

        console.log("\n=== FIRST 5 LINES ===");
        const lines = text.split('\n').slice(0, 5);
        lines.forEach((line, i) => console.log(`${i}: ${line}`));

        console.log("\n=== PARSING TEST ===");
        const rows = text.split('\n').map(row => {
            const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            return matches.map(m => m.replace(/^"|"$/g, '').trim());
        });

        // Find header
        let headerIdx = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
            const row = rows[i];
            if (row.some(cell => cell && (cell.toLowerCase().includes('id video') || cell.toLowerCase().includes('video id')))) {
                headerIdx = i;
                break;
            }
        }

        console.log(`Header found at row: ${headerIdx}`);
        if (headerIdx >= 0) {
            console.log("Header:", rows[headerIdx]);
            console.log("\n=== FIRST DATA ROW ===");
            const dataRow = rows[headerIdx + 1];
            console.log("Raw:", dataRow);

            // Test number parsing
            const testNum = dataRow[2]; // Assuming GMV is column 2
            console.log(`\nTest parsing "${testNum}":`);

            let str = String(testNum).trim();
            if ((str.match(/\./g) || []).length > 1) {
                str = str.replace(/\./g, '');
            } else if (/\.\d{3}$/.test(str) && !str.includes(',')) {
                str = str.replace(/\./g, '');
            } else {
                str = str.replace(/,/g, '');
            }
            console.log(`Cleaned: "${str}"`);
            console.log(`Parsed: ${parseFloat(str)}`);
        }

    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

testFetch();
