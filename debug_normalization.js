const normalizeProductName = (rawName) => {
    if (!rawName) return '';
    const name = rawName.trim().toLowerCase();

    console.log(`Processing: "${name}"`);

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
    if (shimmerKeywords.some(k => name.includes(k))) {
        console.log("Matched Shimmer");
        return "Bodymist nhũ";
    }

    // 3. Bodymist Baddie Barbie
    if (name.includes("baddie barbie")) return "Bodymist Baddie Barbie";

    // 4. Bodymist (Check mùi hoặc chữ "105ml" hoặc chính chữ "bodymist" đứng một mình hoặc kèm mùi)
    const isBodymistScent = bodymistScents.some(s => {
        const match = name.includes(s);
        if (match) console.log(`Matched scent: ${s}`);
        return match;
    });
    const is105ml = /105\s*ml/.test(name);
    if (is105ml) console.log("Matched 105ml regex");

    if (isBodymistScent || is105ml) return "Bodymist";

    if (name === "bodymist" || name === "body mist") return "Bodymist";


    return "NO MATCH";
};

const testStrings = [
    "Dark night 105ml",
    "dark night 105ml",
    "Hide and seek 105ml",
    "Body oil",
    "Bodymist Baddie Barbie"
];

testStrings.forEach(s => {
    console.log(`"${s}" -> "${normalizeProductName(s)}"`);
    console.log("---");
});
