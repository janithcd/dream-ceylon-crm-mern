const fs = require("fs");
const path = require("path");
const {
    PDFDocument,
    StandardFonts,
    rgb,
    PDFName,
    PDFString,
} = require("pdf-lib");

let brand = require("../config/brandConfig");

const {
    getDocumentBrandConfig,
} = require("../utils/documentSettings");
const PAGE = {
    width: 595.28,
    height: 841.89,
    left: 50,
    right: 545,
    contentWidth: 495,
    top: 112,
    bottom: 735,
};

const colors = {
    primary: "#0f766e",
    primaryDark: "#064e3b",
    lightGreen: "#f0fdfa",
    gold: "#f59e0b",
    goldSoft: "#fff7ed",
    text: "#111827",
    muted: "#6b7280",
    border: "#d1d5db",
    white: "#ffffff",
    redSoft: "#fef2f2",
    red: "#dc2626",
    greenSoft: "#ecfdf5",
};

const safeText = (value) => {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/•/g, "-")
        .replace(/\*\*/g, "")
        .replace(/#{1,6}\s?/g, "")
        .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, "");
};

const cleanFileName = (value) => {
    const clean = safeText(value || "quotation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return clean || "quotation";
};

const hexToRgb = (hex) => {
    const cleanHex = String(hex || "#000000").replace("#", "");

    if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
        return rgb(0, 0, 0);
    }

    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

    return rgb(r, g, b);
};

const yFromTop = (topY, height = 0) => {
    return PAGE.height - topY - height;
};

const getBrandValue = (key, fallback = "") => {
    return brand && brand[key] ? brand[key] : fallback;
};

const getMobilesText = () => {
    if (Array.isArray(brand?.mobiles)) {
        return brand.mobiles.join(" / ");
    }

    if (typeof brand?.mobiles === "string") {
        return brand.mobiles;
    }

    return "+94 77 512 4645";
};

const getWebsite = () => {
    return getBrandValue("website", "https://www.dreamceylonjourneys.com");
};

const getWhatsAppLink = () => {
    const whatsapp = getBrandValue("whatsapp", "+94775124645");
    const cleanNumber = String(whatsapp).replace(/\D/g, "");

    return cleanNumber ? `https://wa.me/${cleanNumber}` : undefined;
};

const getSafeUrl = (url) => {
    if (!url || typeof url !== "string") return undefined;

    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return undefined;
};

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const formatMoney = (amount, currency = "USD") => {
    return `${currency} ${toNumber(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};

const formatDate = (value) => {
    if (!value) return "Not provided";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return safeText(value);
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};

const parseList = (value, fallback = []) => {
    if (Array.isArray(value)) {
        return value.map((item) => safeText(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n|,/)
            .map((item) => safeText(item).trim())
            .filter(Boolean);
    }

    return fallback;
};

const resolveAssetPath = (filePath) => {
    if (!filePath) return null;

    if (fs.existsSync(filePath)) {
        return filePath;
    }

    const extension = path.extname(filePath);
    const basePath = extension
        ? filePath.slice(0, filePath.length - extension.length)
        : filePath;

    const possibleExtensions = [".png", ".jpg", ".jpeg"];

    for (const ext of possibleExtensions) {
        const candidate = `${basePath}${ext}`;

        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
};

const embedImageIfExists = async (pdfDoc, filePath) => {
    const resolvedPath = resolveAssetPath(filePath);

    if (!resolvedPath) return null;

    try {
        const bytes = fs.readFileSync(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();

        if (ext === ".jpg" || ext === ".jpeg") {
            return await pdfDoc.embedJpg(bytes);
        }

        if (ext === ".png") {
            return await pdfDoc.embedPng(bytes);
        }

        return null;
    } catch (error) {
        return null;
    }
};

const addLink = (state, x, topY, width, height, url) => {
    const safeUrl = getSafeUrl(url);

    if (!safeUrl) return;

    try {
        const y = yFromTop(topY, height);

        const annotation = state.pdfDoc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [x, y, x + width, y + height],
            Border: [0, 0, 0],
            A: {
                Type: "Action",
                S: "URI",
                URI: PDFString.of(safeUrl),
            },
        });

        const annotationRef = state.pdfDoc.context.register(annotation);
        const existingAnnots = state.page.node.Annots();

        if (existingAnnots) {
            existingAnnots.push(annotationRef);
        } else {
            state.page.node.set(
                PDFName.of("Annots"),
                state.pdfDoc.context.obj([annotationRef])
            );
        }
    } catch (error) {
        // Keep PDF generation working even if clickable links fail
    }
};

const drawBox = (state, x, topY, width, height, fillColor, borderColor) => {
    state.page.drawRectangle({
        x,
        y: yFromTop(topY, height),
        width,
        height,
        color: fillColor ? hexToRgb(fillColor) : undefined,
        borderColor: borderColor ? hexToRgb(borderColor) : undefined,
        borderWidth: borderColor ? 0.8 : 0,
    });
};

const drawLine = (state, x1, topY1, x2, topY2, color = colors.border) => {
    state.page.drawLine({
        start: { x: x1, y: yFromTop(topY1) },
        end: { x: x2, y: yFromTop(topY2) },
        thickness: 0.8,
        color: hexToRgb(color),
    });
};

const getTextWidth = (text, font, size) => {
    return font.widthOfTextAtSize(safeText(text), size);
};

const drawText = (state, text, x, topY, options = {}) => {
    const clean = safeText(text);
    const font = options.bold
        ? state.fonts.bold
        : options.font || state.fonts.regular;
    const size = options.size || 9;
    const width = options.width || PAGE.contentWidth;
    const color = hexToRgb(options.color || colors.text);
    let finalX = x;

    if (options.align === "center") {
        const textWidth = getTextWidth(clean, font, size);
        finalX = x + Math.max((width - textWidth) / 2, 0);
    }

    if (options.align === "right") {
        const textWidth = getTextWidth(clean, font, size);
        finalX = x + Math.max(width - textWidth, 0);
    }

    state.page.drawText(clean, {
        x: finalX,
        y: yFromTop(topY + size),
        size,
        font,
        color,
        opacity: options.opacity || 1,
    });

    if (options.underline) {
        drawLine(
            state,
            finalX,
            topY + size + 2,
            finalX + Math.min(getTextWidth(clean, font, size), width),
            topY + size + 2,
            options.color || colors.text
        );
    }

    if (options.link) {
        addLink(
            state,
            finalX,
            topY,
            Math.min(getTextWidth(clean, font, size), width),
            size + 6,
            options.link
        );
    }
};

const wrapText = (text, font, size, maxWidth) => {
    const clean = safeText(text);
    const paragraphs = clean.split(/\r?\n/);
    const lines = [];

    paragraphs.forEach((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = "";

        words.forEach((word) => {
            const testLine = line ? `${line} ${word}` : word;
            const testWidth = font.widthOfTextAtSize(testLine, size);

            if (testWidth <= maxWidth) {
                line = testLine;
            } else {
                if (line) lines.push(line);
                line = word;
            }
        });

        if (line) lines.push(line);
    });

    return lines;
};

const drawWrappedText = (state, text, x, topY, width, options = {}) => {
    const font = options.bold
        ? state.fonts.bold
        : options.font || state.fonts.regular;
    const size = options.size || 9;
    const lineHeight = options.lineHeight || size + 5;
    const lines = wrapText(text, font, size, width);
    let currentY = topY;

    lines.forEach((line) => {
        drawText(state, line, x, currentY, {
            width,
            size,
            bold: options.bold,
            color: options.color || colors.text,
            align: options.align || "left",
        });

        currentY += lineHeight;
    });

    return lines.length * lineHeight;
};

const addNewPage = (state) => {
    state.page = state.pdfDoc.addPage([PAGE.width, PAGE.height]);
    state.pages.push(state.page);

    drawWatermark(state);
    drawHeader(state);

    state.cursorY = PAGE.top;
};

const checkPageSpace = (state, neededHeight = 80) => {
    if (state.cursorY + neededHeight > PAGE.bottom) {
        addNewPage(state);
    }
};

const drawWatermark = (state) => {
    const pdfSettings = brand?.pdfSettings || {};

    if (pdfSettings.showWatermark === false) {
        return;
    }

    if (!state.images.logo) return;

    const watermarkOpacity = Number(pdfSettings.watermarkOpacity ?? 0.04);

    try {
        const scale = state.images.logo.scaleToFit(350, 220);

        state.page.drawImage(state.images.logo, {
            x: PAGE.width / 2 - scale.width / 2,
            y: PAGE.height / 2 - scale.height / 2,
            width: scale.width,
            height: scale.height,
            opacity: watermarkOpacity,
        });
    } catch (error) {
        // Ignore watermark issue
    }
};

const drawHeader = (state) => {
    const companyName = getBrandValue("companyName", "Dream Ceylon Journeys");
    const tagline = getBrandValue(
        "tagline",
        "Sri Lanka Private Tours & Tailor-Made Holidays"
    );
    const email = getBrandValue("email", "info@dreamceylonjourneys.com");

    drawBox(state, 0, 0, PAGE.width, 88, colors.white);
    drawBox(state, 0, 88, PAGE.width, 4, colors.gold);
    drawBox(state, 0, 92, PAGE.width, 1, colors.border);

    if (state.images.logo) {
        const scale = state.images.logo.scaleToFit(145, 75);

        state.page.drawImage(state.images.logo, {
            x: 18,
            y: yFromTop(7, scale.height),
            width: scale.width,
            height: scale.height,
        });
    }

    drawText(state, companyName, 172, 22, {
        color: colors.primaryDark,
        bold: true,
        size: 16,
        width: 245,
    });

    drawText(state, tagline, 172, 44, {
        color: colors.muted,
        size: 8.2,
        width: 245,
    });

    drawText(state, `Mobile: ${getMobilesText()}`, 172, 61, {
        color: colors.primary,
        bold: true,
        size: 7.8,
        width: 250,
    });

    drawText(state, "Website", 430, 27, {
        color: colors.primary,
        bold: true,
        size: 8.5,
        width: 95,
        align: "right",
        underline: true,
        link: getWebsite(),
    });

    drawText(state, email, 345, 47, {
        color: colors.muted,
        size: 7.7,
        width: 180,
        align: "right",
    });

    drawText(state, "WhatsApp", 430, 64, {
        color: colors.primary,
        bold: true,
        size: 8.5,
        width: 95,
        align: "right",
        underline: true,
        link: getWhatsAppLink(),
    });
};

const drawFooter = (state, pdfPage, pageNumber, totalPages) => {
    const companyName = getBrandValue("companyName", "Dream Ceylon Journeys");

    const footerState = {
        ...state,
        page: pdfPage,
    };

    drawLine(footerState, 50, 760, 545, 760, colors.border);

    drawText(footerState, `© ${new Date().getFullYear()} ${companyName}`, 50, 775, {
        color: colors.muted,
        size: 7.2,
        width: 170,
    });

    drawText(footerState, "Website", 235, 775, {
        color: colors.primary,
        bold: true,
        size: 7.2,
        width: 60,
        underline: true,
        link: getWebsite(),
    });

    drawText(footerState, "WhatsApp", 305, 775, {
        color: colors.primary,
        bold: true,
        size: 7.2,
        width: 70,
        underline: true,
        link: getWhatsAppLink(),
    });

    drawText(footerState, `Page ${pageNumber} of ${totalPages}`, 430, 775, {
        color: colors.muted,
        size: 7.2,
        width: 115,
        align: "right",
    });
};

const drawSectionTitle = (state, title, minimumContentHeight = 0) => {
    checkPageSpace(state, 45 + minimumContentHeight);

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 31, colors.primaryDark);
    drawBox(state, PAGE.left, y + 28, PAGE.contentWidth, 3, colors.gold);

    drawText(state, title.toUpperCase(), PAGE.left + 16, y + 9, {
        color: colors.white,
        bold: true,
        size: 11,
        width: 460,
    });

    state.cursorY = y + 45;
};

const drawQuotationTitle = (state, data) => {
    drawBox(
        state,
        PAGE.left,
        state.cursorY,
        PAGE.contentWidth,
        92,
        colors.lightGreen,
        colors.border
    );
    drawBox(state, PAGE.left, state.cursorY, 7, 92, colors.gold);

    drawText(state, "TOUR QUOTATION", PAGE.left + 20, state.cursorY + 20, {
        color: colors.primaryDark,
        bold: true,
        size: 24,
        width: 300,
    });

    drawText(state, `Quotation No: ${data.quotationNo}`, PAGE.left + 20, state.cursorY + 54, {
        color: colors.muted,
        size: 9,
        width: 230,
    });

    drawText(state, `Date: ${formatDate(data.quotationDate || new Date())}`, 330, state.cursorY + 54, {
        color: colors.muted,
        size: 9,
        width: 180,
        align: "right",
    });

    state.cursorY += 118;
};

const drawInfoCard = (state, label, value, x, y, width) => {
    drawBox(state, x, y, width, 47, colors.white, colors.border);

    drawText(state, label.toUpperCase(), x + 12, y + 9, {
        color: colors.muted,
        bold: true,
        size: 7.3,
        width: width - 24,
    });

    drawText(state, value || "Not provided", x + 12, y + 25, {
        color: colors.text,
        bold: true,
        size: 9,
        width: width - 24,
    });
};

const drawClientAndTourSummary = (state, data) => {
    drawSectionTitle(state, "Client & Tour Summary", 145);

    const cardWidth = 241.5;
    const gap = 12;

    const rows = [
        [
            { label: "Client Name", value: data.clientName },
            { label: "Country", value: data.country },
        ],
        [
            { label: "Tour Title", value: data.tourTitle },
            { label: "Travelers", value: `${data.travelers || 0} traveler(s)` },
        ],
        [
            { label: "Start Date", value: formatDate(data.travelStartDate) },
            { label: "End Date", value: formatDate(data.travelEndDate) },
        ],
        [
            { label: "Duration", value: `${data.durationDays || 0} days` },
            { label: "Vehicle", value: data.vehicleType },
        ],
    ];

    rows.forEach((row) => {
        const y = state.cursorY;

        drawInfoCard(state, row[0].label, row[0].value, PAGE.left, y, cardWidth);
        drawInfoCard(
            state,
            row[1].label,
            row[1].value,
            PAGE.left + cardWidth + gap,
            y,
            cardWidth
        );

        state.cursorY += 59;
    });

    state.cursorY += 5;
};

const drawCostTable = (state, data, totals) => {
    drawSectionTitle(state, "Cost Breakdown", 260);

    const x = PAGE.left;
    const tableWidth = PAGE.contentWidth;
    const rowHeight = 30;

    const columns = {
        item: x,
        qty: x + 255,
        rate: x + 320,
        amount: x + 395,
    };

    const rows = [];

    if (totals.vehicleTotal > 0) {
        rows.push({
            item: `${data.vehicleType || "Vehicle"} private transport`,
            qty: `${data.vehicleDays} day(s)`,
            rate: formatMoney(data.vehicleDailyRate, data.currency),
            amount: formatMoney(totals.vehicleTotal, data.currency),
        });
    }

    if (totals.hotelTotal > 0) {
        rows.push({
            item: "Hotel arrangement estimate",
            qty: "-",
            rate: "-",
            amount: formatMoney(totals.hotelTotal, data.currency),
        });
    }

    if (totals.activitiesTotal > 0) {
        rows.push({
            item: "Activities estimate",
            qty: "-",
            rate: "-",
            amount: formatMoney(totals.activitiesTotal, data.currency),
        });
    }

    if (totals.entranceFeesTotal > 0) {
        rows.push({
            item: "Entrance fees estimate",
            qty: "-",
            rate: "-",
            amount: formatMoney(totals.entranceFeesTotal, data.currency),
        });
    }

    if (totals.otherTotal > 0) {
        rows.push({
            item: "Other costs",
            qty: "-",
            rate: "-",
            amount: formatMoney(totals.otherTotal, data.currency),
        });
    }

    if (rows.length === 0) {
        rows.push({
            item: "Custom tour quotation",
            qty: "-",
            rate: "-",
            amount: formatMoney(0, data.currency),
        });
    }

    drawBox(state, x, state.cursorY, tableWidth, rowHeight, colors.primaryDark);

    drawText(state, "Item", columns.item + 12, state.cursorY + 10, {
        color: colors.white,
        bold: true,
        size: 8.5,
        width: 220,
    });

    drawText(state, "Qty", columns.qty, state.cursorY + 10, {
        color: colors.white,
        bold: true,
        size: 8.5,
        width: 55,
        align: "center",
    });

    drawText(state, "Rate", columns.rate, state.cursorY + 10, {
        color: colors.white,
        bold: true,
        size: 8.5,
        width: 70,
        align: "right",
    });

    drawText(state, "Amount", columns.amount, state.cursorY + 10, {
        color: colors.white,
        bold: true,
        size: 8.5,
        width: 90,
        align: "right",
    });

    state.cursorY += rowHeight;

    rows.forEach((row, index) => {
        checkPageSpace(state, rowHeight + 120);

        const y = state.cursorY;
        const bgColor = index % 2 === 0 ? colors.white : colors.lightGreen;

        drawBox(state, x, y, tableWidth, rowHeight, bgColor, colors.border);

        drawText(state, row.item, columns.item + 12, y + 10, {
            color: colors.text,
            size: 8.5,
            width: 225,
        });

        drawText(state, row.qty, columns.qty, y + 10, {
            color: colors.text,
            size: 8.5,
            width: 55,
            align: "center",
        });

        drawText(state, row.rate, columns.rate, y + 10, {
            color: colors.text,
            size: 8.5,
            width: 70,
            align: "right",
        });

        drawText(state, row.amount, columns.amount, y + 10, {
            color: colors.text,
            bold: true,
            size: 8.5,
            width: 90,
            align: "right",
        });

        state.cursorY += rowHeight;
    });

    state.cursorY += 15;

    const summaryX = 315;
    const summaryWidth = 230;
    const summaryRowHeight = 27;

    const summaryRows = [
        {
            label: "Subtotal",
            value: formatMoney(totals.subtotal, data.currency),
            color: colors.white,
            textColor: colors.text,
        },
        {
            label: "Discount",
            value: `- ${formatMoney(totals.discount, data.currency)}`,
            color: colors.redSoft,
            textColor: colors.red,
        },
        {
            label: "Grand Total",
            value: formatMoney(totals.grandTotal, data.currency),
            color: colors.primaryDark,
            textColor: colors.white,
        },
        {
            label: "Advance Payment",
            value: formatMoney(totals.advancePayment, data.currency),
            color: colors.goldSoft,
            textColor: colors.text,
        },
        {
            label: "Balance Payment",
            value: formatMoney(totals.balancePayment, data.currency),
            color: colors.greenSoft,
            textColor: colors.primaryDark,
        },
    ];

    summaryRows.forEach((row) => {
        checkPageSpace(state, summaryRowHeight + 30);

        const y = state.cursorY;

        drawBox(state, summaryX, y, summaryWidth, summaryRowHeight, row.color, colors.border);

        drawText(state, row.label, summaryX + 12, y + 9, {
            color: row.textColor,
            bold: true,
            size: 8.5,
            width: 95,
        });

        drawText(state, row.value, summaryX + 108, y + 9, {
            color: row.textColor,
            bold: true,
            size: 8.5,
            width: 105,
            align: "right",
        });

        state.cursorY += summaryRowHeight;
    });

    state.cursorY += 18;
};

const drawListSection = (state, title, items, options = {}) => {
    const safeItems =
        Array.isArray(items) && items.length > 0 ? items : ["Not provided"];

    const itemHeights = safeItems.map((item) => {
        const lines = wrapText(
            item,
            state.fonts.regular,
            8.8,
            PAGE.contentWidth - 48
        );

        return Math.max(20, lines.length * 12 + 8);
    });

    const boxHeight = Math.max(
        90,
        itemHeights.reduce((total, height) => total + height, 0) + 24
    );

    drawSectionTitle(state, title, boxHeight + 20);

    const y = state.cursorY;

    drawBox(
        state,
        PAGE.left,
        y,
        PAGE.contentWidth,
        boxHeight,
        options.background || colors.white,
        colors.border
    );

    let itemY = y + 17;

    safeItems.forEach((item, index) => {
        drawBox(
            state,
            PAGE.left + 14,
            itemY + 4,
            6,
            6,
            options.bulletColor || colors.gold
        );

        drawWrappedText(state, item, PAGE.left + 30, itemY, PAGE.contentWidth - 48, {
            size: 8.8,
            lineHeight: 12,
            color: colors.text,
        });

        itemY += itemHeights[index];
    });

    state.cursorY = y + boxHeight + 18;
};

const drawNotesSection = (state, notes) => {
    if (!notes) return;

    const cleanNotes = safeText(notes).trim();

    if (!cleanNotes) return;

    const lines = wrapText(
        cleanNotes,
        state.fonts.regular,
        9,
        PAGE.contentWidth - 32
    );

    const boxHeight = Math.max(80, lines.length * 14 + 30);

    drawSectionTitle(state, "Additional Notes", boxHeight + 20);

    const y = state.cursorY;

    drawBox(
        state,
        PAGE.left,
        y,
        PAGE.contentWidth,
        boxHeight,
        colors.lightGreen,
        colors.border
    );

    drawWrappedText(
        state,
        cleanNotes,
        PAGE.left + 16,
        y + 17,
        PAGE.contentWidth - 32,
        {
            size: 9,
            lineHeight: 14,
            color: colors.text,
        }
    );

    state.cursorY = y + boxHeight + 18;
};

const drawPaymentTerms = (state) => {
    drawSectionTitle(state, "Payment Terms", 135);

    const terms = [
        "Quotation is subject to final availability at the time of confirmation.",
        "Advance payment is required to confirm the booking.",
        "Balance payment should be completed as agreed before or during the tour.",
        "Entrance fees, hotel costs, activity charges, train tickets, and meals are included only if clearly mentioned in the quotation.",
    ];

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 128, colors.goldSoft, colors.border);

    let termY = y + 17;

    terms.forEach((term) => {
        drawBox(state, PAGE.left + 14, termY + 4, 6, 6, colors.primary);

        const usedHeight = drawWrappedText(
            state,
            term,
            PAGE.left + 30,
            termY,
            PAGE.contentWidth - 48,
            {
                size: 8.8,
                lineHeight: 12,
                color: colors.text,
            }
        );

        termY += Math.max(24, usedHeight + 8);
    });

    state.cursorY = y + 148;
};

const drawContactSection = (state) => {
    drawSectionTitle(state, "Contact Details", 220);

    const companyName = getBrandValue("companyName", "Dream Ceylon Journeys");
    const address = getBrandValue("address", "Sri Lanka");
    const email = getBrandValue("email", "info@dreamceylonjourneys.com");
    const socialLinks = Array.isArray(brand?.socialLinks) ? brand.socialLinks : [];

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 205, colors.primaryDark);

    drawText(state, "Ready to confirm your Sri Lanka journey?", PAGE.left + 25, y + 24, {
        color: colors.gold,
        bold: true,
        size: 15,
        width: PAGE.contentWidth - 50,
        align: "center",
    });

    drawWrappedText(
        state,
        `${companyName} can customize this quotation based on your final route, hotels, activities, and travel preferences.`,
        PAGE.left + 40,
        y + 52,
        PAGE.contentWidth - 80,
        {
            color: colors.white,
            size: 8.8,
            lineHeight: 13,
            align: "center",
        }
    );

    drawText(state, `Address: ${address}`, PAGE.left + 35, y + 90, {
        color: "#d1fae5",
        size: 8,
        width: PAGE.contentWidth - 70,
        align: "center",
    });

    drawText(state, `Mobile: ${getMobilesText()} | Email: ${email}`, PAGE.left + 35, y + 108, {
        color: colors.white,
        bold: true,
        size: 8,
        width: PAGE.contentWidth - 70,
        align: "center",
    });

    drawBox(state, PAGE.left + 170, y + 129, 155, 22, colors.gold);

    drawText(state, "Visit Website", PAGE.left + 170, y + 137, {
        color: colors.primaryDark,
        bold: true,
        size: 8,
        width: 155,
        align: "center",
        link: getWebsite(),
    });

    const visibleSocialLinks = socialLinks.slice(0, 4);
    const buttonWidth = 92;
    const buttonGap = 16;
    const totalButtonsWidth =
        visibleSocialLinks.length * buttonWidth +
        Math.max(visibleSocialLinks.length - 1, 0) * buttonGap;

    let socialX = PAGE.left + (PAGE.contentWidth - totalButtonsWidth) / 2;
    const socialY = y + 165;

    visibleSocialLinks.forEach((item) => {
        drawBox(state, socialX, socialY, buttonWidth, 20, colors.gold);

        drawText(state, item.name, socialX + 6, socialY + 7, {
            color: colors.primaryDark,
            bold: true,
            size: 7.2,
            width: buttonWidth - 12,
            align: "center",
            link: item.url,
        });

        socialX += buttonWidth + buttonGap;
    });

    state.cursorY = y + 225;
};

const calculateQuotationTotals = (body) => {
    const durationDays = Math.max(toNumber(body.durationDays), 0);
    const vehicleDays = Math.max(toNumber(body.vehicleDays || durationDays), 0);
    const vehicleDailyRate = Math.max(toNumber(body.vehicleDailyRate), 0);

    const hotelTotal = Math.max(toNumber(body.hotelCost), 0);
    const activitiesTotal = Math.max(toNumber(body.activitiesCost), 0);
    const entranceFeesTotal = Math.max(toNumber(body.entranceFeesCost), 0);
    const otherTotal = Math.max(toNumber(body.otherCost), 0);

    const vehicleTotal = vehicleDays * vehicleDailyRate;
    const subtotal =
        vehicleTotal +
        hotelTotal +
        activitiesTotal +
        entranceFeesTotal +
        otherTotal;

    const discount = Math.min(Math.max(toNumber(body.discount), 0), subtotal);
    const grandTotal = Math.max(subtotal - discount, 0);
    const advancePayment = Math.min(
        Math.max(toNumber(body.advancePayment), 0),
        grandTotal
    );
    const balancePayment = Math.max(grandTotal - advancePayment, 0);

    return {
        durationDays,
        vehicleDays,
        vehicleDailyRate,
        vehicleTotal,
        hotelTotal,
        activitiesTotal,
        entranceFeesTotal,
        otherTotal,
        subtotal,
        discount,
        grandTotal,
        advancePayment,
        balancePayment,
    };
};

// @desc    Generate quotation PDF
// @route   POST /api/quotations/pdf
// @access  Private
const generateQuotationPdf = async (req, res) => {
    try {
        brand = await getDocumentBrandConfig();
        const {
            clientName,
            country,
            quotationDate,
            tourTitle,
            travelStartDate,
            travelEndDate,
            travelers,
            durationDays,
            vehicleType,
            vehicleDailyRate,
            vehicleDays,
            hotelCost,
            activitiesCost,
            entranceFeesCost,
            otherCost,
            discount,
            advancePayment,
            currency = "USD",
            inclusions,
            exclusions,
            notes,
        } = req.body;

        if (!clientName || !tourTitle) {
            return res.status(400).json({
                message: "Client name and tour title are required",
            });
        }

        const totals = calculateQuotationTotals(req.body);

        const data = {
            quotationNo: `DCJ-Q-${Date.now().toString().slice(-6)}`,
            clientName: safeText(clientName),
            country: safeText(country || "Not provided"),
            quotationDate: quotationDate || new Date(),
            tourTitle: safeText(tourTitle),
            travelStartDate,
            travelEndDate,
            travelers: toNumber(travelers),
            durationDays: totals.durationDays,
            vehicleType: safeText(vehicleType || "Private Vehicle"),
            vehicleDailyRate: totals.vehicleDailyRate,
            vehicleDays: totals.vehicleDays,
            hotelCost: toNumber(hotelCost),
            activitiesCost: toNumber(activitiesCost),
            entranceFeesCost: toNumber(entranceFeesCost),
            otherCost: toNumber(otherCost),
            discount: toNumber(discount),
            advancePayment: toNumber(advancePayment),
            currency: safeText(currency || "USD"),
            inclusions: parseList(inclusions, [
                "Private air-conditioned vehicle",
                "Professional chauffeur guide",
                "Airport pickup and drop-off",
                "Customized tour route planning",
                "Water bottles during transfers",
            ]),
            exclusions: parseList(exclusions, [
                "Hotel accommodation unless mentioned",
                "Entrance fees unless mentioned",
                "Activity fees unless mentioned",
                "Meals unless mentioned",
                "Personal expenses",
            ]),
            notes: safeText(notes),
        };

        const pdfDoc = await PDFDocument.create();

        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const logoImage = await embedImageIfExists(pdfDoc, brand?.logoPath);

        const firstPage = pdfDoc.addPage([PAGE.width, PAGE.height]);

        const state = {
            pdfDoc,
            page: firstPage,
            pages: [firstPage],
            cursorY: PAGE.top,
            fonts: {
                regular: regularFont,
                bold: boldFont,
            },
            images: {
                logo: logoImage,
            },
        };

        drawWatermark(state);
        drawHeader(state);

        drawQuotationTitle(state, data);
        drawClientAndTourSummary(state, data);
        drawCostTable(state, data, totals);

        drawListSection(state, "Package Inclusions", data.inclusions, {
            background: colors.lightGreen,
            bulletColor: colors.primary,
        });

        drawListSection(state, "Package Exclusions", data.exclusions, {
            background: colors.white,
            bulletColor: colors.red,
        });

        drawNotesSection(state, data.notes);
        drawPaymentTerms(state);
        drawContactSection(state);

        const pages = pdfDoc.getPages();

        pages.forEach((pdfPage, index) => {
            drawFooter(state, pdfPage, index + 1, pages.length);
        });

        pdfDoc.setTitle("Dream Ceylon Journeys Tour Quotation");
        pdfDoc.setAuthor(getBrandValue("companyName", "Dream Ceylon Journeys"));
        pdfDoc.setSubject("Client Tour Quotation");

        const pdfBytes = await pdfDoc.save();

        const filename = `dream-ceylon-quotation-${cleanFileName(clientName)}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );
        res.setHeader("Content-Length", pdfBytes.length);

        res.status(200).send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error("Quotation PDF Generation Error:", error);

        res.status(500).json({
            message: "Failed to generate quotation PDF",
            error: error.message,
        });
    }
};

module.exports = {
    generateQuotationPdf,
};