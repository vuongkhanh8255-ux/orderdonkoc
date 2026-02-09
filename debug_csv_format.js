const sheetId = '11yicmEef0XG1dHbVXHL0BgT1oS9Wx_Hq';
const gid = '626517460';
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

async function checkCsv() {
    try {
        console.log("Fetching:", url);
        const res = await fetch(url);
        const text = await res.text();
        console.log("--- RAW CSV SNEAK PEEK ---");
        const lines = text.split('\n').slice(0, 10);
        lines.forEach((line, i) => console.log(`${i}: ${line}`));
    } catch (e) {
        console.error(e);
    }
}

checkCsv();
