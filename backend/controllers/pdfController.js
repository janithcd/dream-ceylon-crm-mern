const fs = require("fs");
const path = require("path");
const {
    PDFDocument,
    StandardFonts,
    rgb,
    PDFName,
    PDFString,
} = require("pdf-lib");

const brand = require("../config/brandConfig");

const PAGE = {
    width: 595.28,
    height: 841.89,
    left: 50,
    right: 545,
    contentWidth: 495,
    top: 118,
    bottom: 735,
};

const colors = {
    primary: "#0f766e",
    primaryDark: "#064e3b",
    primarySoft: "#ccfbf1",
    lightGreen: "#f0fdfa",
    gold: "#f59e0b",
    goldSoft: "#fff7ed",
    text: "#111827",
    muted: "#6b7280",
    border: "#d1d5db",
    white: "#ffffff",
    watermark: "#f1f5f9",
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
    const clean = safeText(value || "client")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return clean || "client";
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

const getSafeUrl = (url) => {
    if (!url || typeof url !== "string") return undefined;

    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return undefined;
};

const getWhatsAppLink = () => {
    const whatsapp = getBrandValue("whatsapp", "+94775124645");
    const cleanNumber = String(whatsapp).replace(/\D/g, "");

    return cleanNumber ? `https://wa.me/${cleanNumber}` : undefined;
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

const formatToday = () => {
    return new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};

const toTitleCase = (value) => {
    const text = safeText(value).trim();

    if (!text) return "";

    return text
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

const normalizeAirportText = (value) => {
    const text = safeText(value).trim();

    if (!text) return "";

    if (/^air\s*port$/i.test(text) || /^airport$/i.test(text)) {
        return "Colombo Airport";
    }

    return text.replace(/air\s*port/gi, "Airport");
};

const normalizePdfData = (data) => {
    return {
        ...data,
        clientName: toTitleCase(data.clientName),
        country: toTitleCase(data.country),
        arrivalCity: normalizeAirportText(data.arrivalCity),
    };
};

const cleanItineraryForPdf = (text) => {
    const lines = safeText(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const cleanedLines = [];

    for (const line of lines) {
        const lowerLine = line.toLowerCase();

        if (/^[-–—]{3,}$/.test(line)) {
            continue;
        }

        if (lowerLine === "important notes" || lowerLine.startsWith("important notes")) {
            break;
        }

        if (
            lowerLine.startsWith("if you would like") ||
            lowerLine.includes("convert this into a quotation") ||
            lowerLine.includes("i can also convert")
        ) {
            break;
        }

        cleanedLines.push(line);
    }

    return cleanedLines.join("\n");
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
        const pdfPage = state.page;
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
        const existingAnnots = pdfPage.node.Annots();

        if (existingAnnots) {
            existingAnnots.push(annotationRef);
        } else {
            pdfPage.node.set(
                PDFName.of("Annots"),
                state.pdfDoc.context.obj([annotationRef])
            );
        }
    } catch (error) {
        // PDF still works even if hyperlink annotation fails
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
    const font = options.bold ? state.fonts.bold : options.font || state.fonts.regular;
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

                if (font.widthOfTextAtSize(word, size) > maxWidth) {
                    let chunk = "";

                    word.split("").forEach((char) => {
                        const testChunk = `${chunk}${char}`;

                        if (font.widthOfTextAtSize(testChunk, size) <= maxWidth) {
                            chunk = testChunk;
                        } else {
                            if (chunk) lines.push(chunk);
                            chunk = char;
                        }
                    });

                    line = chunk;
                } else {
                    line = word;
                }
            }
        });

        if (line) lines.push(line);
    });

    return lines;
};

const drawWrappedText = (state, text, x, topY, width, options = {}) => {
    const font = options.bold ? state.fonts.bold : options.font || state.fonts.regular;
    const size = options.size || 9.3;
    const lineHeight = options.lineHeight || size + 5;
    const lines = wrapText(text, font, size, width);
    let currentY = topY;

    lines.forEach((line) => {
        drawText(state, line, x, currentY, {
            width,
            size,
            bold: options.bold,
            font,
            color: options.color || colors.text,
            align: options.align || "left",
            opacity: options.opacity || 1,
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
    if (state.images.logo) {
        try {
            const image = state.images.logo;
            const scale = image.scaleToFit(360, 220);

            state.page.drawImage(image, {
                x: PAGE.width / 2 - scale.width / 2,
                y: PAGE.height / 2 - scale.height / 2,
                width: scale.width,
                height: scale.height,
                opacity: 0.045,
            });

            return;
        } catch (error) {
            // fallback below
        }
    }

    drawText(state, "DREAM CEYLON JOURNEYS", 75, 410, {
        color: colors.watermark,
        bold: true,
        size: 34,
        width: 500,
        opacity: 0.35,
    });
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
    } else {
        drawText(state, "DCJ", 60, 38, {
            color: colors.primaryDark,
            bold: true,
            size: 14,
            width: 50,
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

const drawCover = (state, data) => {
    const companyName = getBrandValue("companyName", "Dream Ceylon Journeys");
    const tagline = getBrandValue(
        "tagline",
        "Sri Lanka Private Tours & Tailor-Made Holidays"
    );

    drawBox(state, 0, 0, PAGE.width, PAGE.height, colors.white);

    drawBox(state, 0, 0, PAGE.width, 22, colors.primaryDark);
    drawBox(state, 0, 22, PAGE.width, 5, colors.gold);

    drawText(state, "CLIENT TOUR PROPOSAL", 50, 48, {
        color: colors.primaryDark,
        bold: true,
        size: 10,
        width: PAGE.contentWidth,
        align: "center",
    });

    drawBox(state, 45, 78, 505, 245, colors.lightGreen, colors.border);
    drawBox(state, 45, 78, 8, 245, colors.gold);

    if (state.images.logo) {
        const scale = state.images.logo.scaleToFit(520, 250);

        state.page.drawImage(state.images.logo, {
            x: PAGE.width / 2 - scale.width / 2,
            y: yFromTop(76, scale.height),
            width: scale.width,
            height: scale.height,
        });
    } else {
        drawText(state, companyName, 70, 145, {
            color: colors.primaryDark,
            bold: true,
            size: 32,
            width: 455,
            align: "center",
        });
    }

    drawText(state, tagline, 70, 285, {
        color: colors.primary,
        bold: true,
        size: 10.5,
        width: 455,
        align: "center",
    });

    drawText(state, "Sri Lanka Private Tour Itinerary", 50, 374, {
        color: colors.primaryDark,
        bold: true,
        size: 26,
        width: PAGE.contentWidth,
        align: "center",
    });

    drawText(state, `Prepared on ${formatToday()}`, 50, 412, {
        color: colors.muted,
        size: 10,
        width: PAGE.contentWidth,
        align: "center",
    });

    drawBox(state, 80, 462, 435, 118, colors.goldSoft, colors.border);
    drawBox(state, 80, 462, 435, 6, colors.gold);

    drawText(state, "Prepared For", 100, 486, {
        color: colors.gold,
        bold: true,
        size: 9,
        width: 395,
        align: "center",
    });

    drawText(state, data.clientName || "Valued Client", 100, 514, {
        color: colors.primaryDark,
        bold: true,
        size: 18,
        width: 395,
        align: "center",
    });

    drawText(
        state,
        `${data.durationDays || "Custom"} Days | ${
            data.travelers || "Custom"
        } Traveler(s) | ${data.country || "International Client"}`,
        100,
        546,
        {
            color: colors.text,
            bold: true,
            size: 10,
            width: 395,
            align: "center",
        }
    );

    const chipY = 625;
    const chipWidth = 151;
    const gap = 21;

    const chips = [
        { label: "Travel Style", value: data.travelStyle || "Private Tour" },
        { label: "Budget Level", value: data.budgetLevel || "Mid-range" },
        { label: "Vehicle", value: data.vehicleType || "Private Vehicle" },
    ];

    chips.forEach((chip, index) => {
        const x = PAGE.left + index * (chipWidth + gap);

        drawBox(state, x, chipY, chipWidth, 58, colors.white, colors.border);
        drawBox(state, x, chipY, chipWidth, 5, colors.primaryDark);

        drawText(state, chip.label.toUpperCase(), x + 12, chipY + 15, {
            color: colors.muted,
            bold: true,
            size: 7.5,
            width: chipWidth - 24,
            align: "center",
        });

        drawText(state, chip.value, x + 12, chipY + 34, {
            color: colors.primaryDark,
            bold: true,
            size: 9.5,
            width: chipWidth - 24,
            align: "center",
        });
    });

    drawText(state, companyName, 50, 725, {
        color: colors.primaryDark,
        bold: true,
        size: 10,
        width: PAGE.contentWidth,
        align: "center",
    });

    drawText(state, `${getMobilesText()} | ${getWebsite()}`, 50, 742, {
        color: colors.muted,
        size: 8,
        width: PAGE.contentWidth,
        align: "center",
    });
};

const drawSectionTitle = (state, title, minimumContentHeight = 0) => {
    checkPageSpace(state, 48 + minimumContentHeight);

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

const drawInfoGrid = (state, items) => {
    const gap = 12;
    const cardWidth = (PAGE.contentWidth - gap) / 2;
    const cardHeight = 52;

    for (let i = 0; i < items.length; i += 2) {
        checkPageSpace(state, cardHeight + 12);

        const rowY = state.cursorY;
        const rowItems = items.slice(i, i + 2);

        rowItems.forEach((item, index) => {
            const x = PAGE.left + index * (cardWidth + gap);

            drawBox(state, x, rowY, cardWidth, cardHeight, colors.white, colors.border);
            drawBox(state, x, rowY, 5, cardHeight, colors.gold);

            drawText(state, item.label.toUpperCase(), x + 16, rowY + 10, {
                color: colors.muted,
                bold: true,
                size: 7.3,
                width: cardWidth - 28,
            });

            drawText(state, item.value || "Not provided", x + 16, rowY + 27, {
                color: colors.text,
                bold: true,
                size: 9.1,
                width: cardWidth - 28,
            });
        });

        state.cursorY = rowY + cardHeight + 12;
    }
};

const drawWideCard = (state, label, value) => {
    checkPageSpace(state, 85);

    const y = state.cursorY;
    const textLines = wrapText(value || "Not provided", state.fonts.regular, 9.2, 460);
    const cardHeight = Math.max(72, textLines.length * 13 + 42);

    checkPageSpace(state, cardHeight + 12);

    drawBox(state, PAGE.left, y, PAGE.contentWidth, cardHeight, colors.lightGreen, colors.border);
    drawBox(state, PAGE.left, y, 5, cardHeight, colors.primary);

    drawText(state, label.toUpperCase(), PAGE.left + 16, y + 12, {
        color: colors.primaryDark,
        bold: true,
        size: 7.5,
        width: 460,
    });

    drawWrappedText(state, value || "Not provided", PAGE.left + 16, y + 31, 460, {
        size: 9.2,
        lineHeight: 13,
        color: colors.text,
    });

    state.cursorY = y + cardHeight + 12;
};

const drawClientSummary = (state, data) => {
    drawSectionTitle(state, "Client & Trip Summary");

    drawInfoGrid(state, [
        { label: "Client Name", value: data.clientName },
        { label: "Country", value: data.country },
        { label: "Travelers", value: data.travelers },
        {
            label: "Duration",
            value: data.durationDays ? `${data.durationDays} days` : "",
        },
        { label: "Budget Level", value: data.budgetLevel },
        { label: "Travel Style", value: data.travelStyle },
        { label: "Vehicle Type", value: data.vehicleType },
        { label: "Arrival", value: data.arrivalCity },
        { label: "Ending Preference", value: data.endingPreference },
        { label: "Language", value: data.language },
    ]);

    drawWideCard(state, "Client Interests", data.interests);
    drawWideCard(state, "Preferred Destinations / Route", data.preferredDestinations);
};

const drawVehicleSection = (state, data) => {
    drawSectionTitle(state, "Selected Vehicle", 176);

    const vehicleType = data.vehicleType || "Private Vehicle";
    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 150, colors.goldSoft, colors.border);
    drawBox(state, PAGE.left, y, 9, 150, colors.gold);

    drawText(state, vehicleType, 75, y + 22, {
        color: colors.primaryDark,
        bold: true,
        size: 17,
        width: 245,
    });

    const vehicleRateMap = {
        Car: "Starting from 80 USD per day",
        SUV: "Starting from 95 USD per day",
        Van: "Starting from 110 USD per day",
        "Mini Bus": "Price on request",
    };

    drawText(state, vehicleRateMap[vehicleType] || "Price depends on final route", 75, y + 49, {
        color: colors.gold,
        bold: true,
        size: 10,
        width: 250,
    });

    drawWrappedText(
        state,
        "A comfortable private vehicle with an experienced chauffeur guide can be arranged based on the final route, luggage requirements, and number of travelers.",
        75,
        y + 74,
        250,
        {
            size: 9.2,
            lineHeight: 13,
            color: colors.text,
        }
    );

    if (state.images.vehicle) {
        const scale = state.images.vehicle.scaleToFit(160, 90);

        state.page.drawImage(state.images.vehicle, {
            x: 350,
            y: yFromTop(y + 30, scale.height),
            width: scale.width,
            height: scale.height,
        });
    } else {
        drawBox(state, 350, y + 30, 160, 90, colors.white, colors.border);

        drawText(state, "Vehicle image", 390, y + 68, {
            color: colors.muted,
            size: 9,
            width: 90,
        });
    }

    state.cursorY = y + 178;
};

const addParagraph = (state, text, options = {}) => {
    const font = options.bold ? state.fonts.bold : state.fonts.regular;
    const size = options.size || 9.4;
    const width = options.width || PAGE.contentWidth;
    const lineHeight = options.lineHeight || size + 5;
    const lines = wrapText(text, font, size, width);
    const neededHeight = lines.length * lineHeight + 8;

    checkPageSpace(state, neededHeight);

    const usedHeight = drawWrappedText(
        state,
        text,
        options.x || PAGE.left,
        state.cursorY,
        width,
        {
            size,
            lineHeight,
            bold: options.bold,
            color: options.color || colors.text,
        }
    );

    state.cursorY += usedHeight + 4;
};

const drawDayHeading = (state, line) => {
    const match = line.match(/^day\s*(\d+)\s*[:\-]?\s*(.*)$/i);
    const dayNumber = match ? match[1] : "";
    const dayTitle = match ? match[2] : line;

    checkPageSpace(state, 50);

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 36, colors.primaryDark);
    drawBox(state, 64, y + 7, 62, 22, colors.gold);

    drawText(state, dayNumber ? `DAY ${dayNumber}` : "DAY", 73, y + 14, {
        color: colors.white,
        bold: true,
        size: 8,
        width: 44,
        align: "center",
    });

    drawText(state, dayTitle || line, 140, y + 12, {
        color: colors.white,
        bold: true,
        size: 10.3,
        width: 380,
    });

    state.cursorY = y + 49;
};

const drawBulletLine = (state, line) => {
    const cleanLine = safeText(line.replace(/^[-*]\s+/, ""));
    const font = state.fonts.regular;
    const size = 9.3;
    const width = 455;
    const lines = wrapText(cleanLine, font, size, width);
    const neededHeight = lines.length * 14 + 8;

    checkPageSpace(state, neededHeight);

    const y = state.cursorY;

    drawBox(state, 61, y + 5, 6, 6, colors.gold);

    const usedHeight = drawWrappedText(state, cleanLine, 75, y, width, {
        size,
        lineHeight: 14,
        color: colors.text,
    });

    state.cursorY = y + usedHeight + 5;
};

const drawItinerarySection = (state, generatedItinerary) => {
    drawSectionTitle(state, "Day-by-Day Itinerary", 90);

    const lines = cleanItineraryForPdf(generatedItinerary)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        addParagraph(state, "No itinerary content provided.");
        return;
    }

    lines.forEach((line) => {
        const isDayHeading = /^day\s*\d+/i.test(line);
        const isBullet = /^[-*]\s+/.test(line);

        if (isDayHeading) {
            drawDayHeading(state, line);
            return;
        }

        if (isBullet) {
            drawBulletLine(state, line);
            return;
        }

        addParagraph(state, line);
    });
};

const drawImportantNotes = (state) => {
    drawSectionTitle(state, "Important Notes", 155);

    const notes = [
        "This itinerary is a suggested travel plan and can be customized according to arrival time, interests, pace, and budget.",
        "Hotels, entrance fees, meals, activity fees, and train tickets are not included unless clearly mentioned in the final quotation.",
        "Wildlife sightings are based on natural conditions and cannot be guaranteed.",
        "Travel times may change depending on weather, traffic, road conditions, and seasonal factors.",
        "Final confirmation will be provided after checking availability and client requirements.",
    ];

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 140, colors.lightGreen, colors.border);

    let noteY = y + 17;

    notes.forEach((note) => {
        drawBox(state, 63, noteY + 4, 6, 6, colors.primary);

        drawWrappedText(state, note, 80, noteY, 440, {
            size: 8.7,
            lineHeight: 12,
            color: colors.text,
        });

        noteY += 24;
    });

    state.cursorY = y + 165;
};

const drawContactSection = (state) => {
    drawSectionTitle(state, "Contact & Social Media", 215);

    const companyName = getBrandValue("companyName", "Dream Ceylon Journeys");
    const address = getBrandValue("address", "Sri Lanka");
    const email = getBrandValue("email", "info@dreamceylonjourneys.com");
    const socialLinks = Array.isArray(brand?.socialLinks) ? brand.socialLinks : [];

    const y = state.cursorY;

    drawBox(state, PAGE.left, y, PAGE.contentWidth, 195, colors.primaryDark);

    drawText(state, "Ready to customize this journey?", 75, y + 24, {
        color: colors.gold,
        bold: true,
        size: 16,
        width: 445,
        align: "center",
    });

    drawWrappedText(
        state,
        `${companyName} can personalize this itinerary based on your preferred hotels, activities, travel pace, and budget.`,
        85,
        y + 53,
        425,
        {
            color: colors.white,
            size: 9.2,
            lineHeight: 13,
            align: "center",
        }
    );

    drawText(state, `Address: ${address}`, 80, y + 92, {
        color: "#d1fae5",
        size: 8.2,
        width: 435,
        align: "center",
    });

    drawText(state, `Mobile: ${getMobilesText()}`, 80, y + 112, {
        color: colors.white,
        bold: true,
        size: 8.8,
        width: 435,
        align: "center",
    });

    drawText(state, `Email: ${email}`, 80, y + 129, {
        color: "#d1fae5",
        size: 8.3,
        width: 435,
        align: "center",
    });

    drawText(state, "Visit Website", 210, y + 148, {
        color: colors.gold,
        bold: true,
        size: 9,
        width: 175,
        align: "center",
        underline: true,
        link: getWebsite(),
    });

    let socialX = 95;
    const socialY = y + 170;

    socialLinks.slice(0, 4).forEach((item) => {
        drawBox(state, socialX, socialY, 92, 20, colors.gold);

        drawText(state, item.name, socialX + 7, socialY + 7, {
            color: colors.primaryDark,
            bold: true,
            size: 7.2,
            width: 78,
            align: "center",
            link: item.url,
        });

        socialX += 102;
    });

    state.cursorY = y + 218;
};

const generateItineraryPdf = async (req, res) => {
    try {
        const {
            generatedItinerary,
            clientName,
            country,
            travelers,
            durationDays,
            interests,
            preferredDestinations,
            travelStyle,
            budgetLevel,
            vehicleType,
            arrivalCity,
            endingPreference,
            language,
        } = req.body;

        if (!generatedItinerary) {
            return res.status(400).json({
                message: "Generated itinerary is required to create PDF",
            });
        }

        const data = normalizePdfData({
            clientName,
            country,
            travelers,
            durationDays,
            interests,
            preferredDestinations,
            travelStyle,
            budgetLevel,
            vehicleType,
            arrivalCity,
            endingPreference,
            language,
        });

        const pdfDoc = await PDFDocument.create();

        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const vehicleImages = brand?.vehicleImages || {};
        const vehicleImagePath =
            vehicleImages[vehicleType] || vehicleImages.default || null;

        const logoImage = await embedImageIfExists(pdfDoc, brand?.logoPath);
        const vehicleImage = await embedImageIfExists(pdfDoc, vehicleImagePath);

        const coverPage = pdfDoc.addPage([PAGE.width, PAGE.height]);

        const state = {
            pdfDoc,
            page: coverPage,
            pages: [coverPage],
            cursorY: PAGE.top,
            fonts: {
                regular: regularFont,
                bold: boldFont,
            },
            images: {
                logo: logoImage,
                vehicle: vehicleImage,
            },
        };

        drawCover(state, data);

        addNewPage(state);

        drawClientSummary(state, data);
        drawVehicleSection(state, data);
        drawItinerarySection(state, generatedItinerary);
        drawImportantNotes(state);
        drawContactSection(state);

        const pages = pdfDoc.getPages();

        pages.forEach((pdfPage, index) => {
            if (index > 0) {
                drawFooter(state, pdfPage, index + 1, pages.length);
            }
        });

        pdfDoc.setTitle("Sri Lanka Tour Itinerary");
        pdfDoc.setAuthor(getBrandValue("companyName", "Dream Ceylon Journeys"));
        pdfDoc.setSubject("Client Tour Itinerary");

        const pdfBytes = await pdfDoc.save();

        const filename = `dream-ceylon-itinerary-${cleanFileName(clientName)}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );
        res.setHeader("Content-Length", pdfBytes.length);

        res.status(200).send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error("PDF Generation Error:", error);

        res.status(500).json({
            message: "Failed to generate itinerary PDF",
            error: error.message,
        });
    }
};

module.exports = {
    generateItineraryPdf,
};