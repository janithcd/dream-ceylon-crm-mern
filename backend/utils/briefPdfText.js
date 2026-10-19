const fs = require("node:fs");
const fontkit = require("fontkit");

// Fontsource ships each script as a small WOFF. Keep the licenses with the npm
// packages and embed only the glyphs needed in each generated PDF.
const fontFiles = [
    ...["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"]
        .map((script) => `@fontsource/noto-sans/files/noto-sans-${script}`),
    "@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala",
    "@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil",
];

const sources = fontFiles.map((name) => {
    const regular = fs.readFileSync(require.resolve(`${name}-400-normal.woff`));
    const bold = fs.readFileSync(require.resolve(`${name}-700-normal.woff`));
    return { regular, bold, coverage: fontkit.create(regular) };
});
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const cleanPdfText = (value) => String(value ?? "")
    .replace(/\s*\r?\n\s*/gu, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/→/gu, " to ")
    .normalize("NFC");

const createBriefText = (pdf) => {
    const fonts = sources.map((source, index) => {
        const regular = `brief-${index}-regular`;
        const bold = `brief-${index}-bold`;
        pdf.registerFont(regular, source.regular);
        pdf.registerFont(bold, source.bold);
        return {
            coverage: source.coverage,
            regular, bold,
        };
    });

    const runs = (value, weight) => {
        const result = [];
        for (const { segment } of segmenter.segment(cleanPdfText(value))) {
            const source = fonts.find(({ coverage }) => [...segment].every((char) =>
                coverage.hasGlyphForCodePoint(char.codePointAt(0))));
            // A missing glyph should not make the entire departure brief fail.
            // Unknown scripts and emoji use a visible placeholder.
            const glyph = source ? segment : "?";
            const font = (source || fonts[0])[weight];
            const last = result[result.length - 1];
            if (last?.font === font) last.text += glyph;
            else result.push({ text: glyph, font });
        }
        return result;
    };

    const width = (value, weight, size) => runs(value, weight)
        .reduce((sum, run) => sum + pdf.font(run.font).fontSize(size).widthOfString(run.text), 0);

    const wrap = (value, weight, size, maxWidth) => {
        const words = cleanPdfText(value).split(/\s+/u).filter(Boolean);
        const lines = [];
        let line = "";

        for (const word of words) {
            let remaining = word;
            while (remaining) {
                const candidate = line ? `${line} ${remaining}` : remaining;
                if (width(candidate, weight, size) <= maxWidth) {
                    line = candidate;
                    break;
                }
                if (line) {
                    lines.push(line);
                    line = "";
                    continue;
                }
                const graphemes = Array.from(segmenter.segment(remaining), ({ segment }) => segment);
                let count = 1;
                while (count < graphemes.length && width(graphemes.slice(0, count + 1).join(""), weight, size) <= maxWidth) {
                    count += 1;
                }
                lines.push(graphemes.slice(0, count).join(""));
                remaining = graphemes.slice(count).join("");
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : ["-"];
    };

    const draw = (value, { x, y, size, weight = "regular", color }) => {
        for (const run of runs(value, weight)) {
            pdf.font(run.font).fontSize(size).fillColor(color).text(run.text, x, y, { lineBreak: false });
            x += pdf.widthOfString(run.text);
        }
    };

    return { draw, wrap };
};

module.exports = { cleanPdfText, createBriefText };
