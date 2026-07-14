const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const Booking = require("../models/Booking");
let brandConfig = require("../config/brandConfig");

const {
    getDocumentBrandConfig,
} = require("../utils/documentSettings");

const COLORS = {
    primary: rgb(0.05, 0.46, 0.42),
    primaryDark: rgb(0.04, 0.28, 0.26),
    text: rgb(0.12, 0.16, 0.22),
    muted: rgb(0.45, 0.50, 0.58),
    light: rgb(0.95, 0.97, 0.98),
    border: rgb(0.82, 0.86, 0.90),
    white: rgb(1, 1, 1),
    danger: rgb(0.82, 0.10, 0.10),
    warning: rgb(0.86, 0.48, 0.05),
};

const safeText = (value, fallback = "-") => {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    return String(value);
};

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const formatMoney = (amount, currency = "USD") => {
    const number = toNumber(amount);

    return `${currency} ${number.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};

const formatDate = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const getTodayText = () => {
    return new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const drawText = (page, text, x, y, options = {}) => {
    const {
        font,
        size = 10,
        color = COLORS.text,
        maxWidth,
        lineHeight = size + 4,
    } = options;

    const value = safeText(text, "");

    if (!maxWidth) {
        page.drawText(value, {
            x,
            y,
            size,
            font,
            color,
        });

        return y - lineHeight;
    }

    const words = value.split(" ");
    let line = "";
    let currentY = y;

    words.forEach((word) => {
        const testLine = line ? `${line} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, size);

        if (width > maxWidth && line) {
            page.drawText(line, {
                x,
                y: currentY,
                size,
                font,
                color,
            });

            line = word;
            currentY -= lineHeight;
        } else {
            line = testLine;
        }
    });

    if (line) {
        page.drawText(line, {
            x,
            y: currentY,
            size,
            font,
            color,
        });
    }

    return currentY - lineHeight;
};

const drawRectangle = (page, x, y, width, height, color, borderColor = null) => {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        color,
        borderColor: borderColor || color,
        borderWidth: borderColor ? 1 : 0,
    });
};

const drawLine = (page, x1, y1, x2, y2, color = COLORS.border) => {
    page.drawLine({
        start: {
            x: x1,
            y: y1,
        },
        end: {
            x: x2,
            y: y2,
        },
        thickness: 1,
        color,
    });
};

const loadImage = async (pdfDoc, imagePath) => {
    try {
        if (!imagePath || !fs.existsSync(imagePath)) {
            return null;
        }

        const imageBytes = fs.readFileSync(imagePath);
        const extension = path.extname(imagePath).toLowerCase();

        if (extension === ".jpg" || extension === ".jpeg") {
            return await pdfDoc.embedJpg(imageBytes);
        }

        return await pdfDoc.embedPng(imageBytes);
    } catch (error) {
        return null;
    }
};

const drawLogo = async (pdfDoc, page, x, y, maxWidth = 95, maxHeight = 60) => {
    const logo = await loadImage(pdfDoc, brandConfig.logoPath);

    if (!logo) {
        page.drawText(brandConfig.companyName || "Dream Ceylon Journeys", {
            x,
            y: y + 20,
            size: 16,
            font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
            color: COLORS.primary,
        });

        return;
    }

    const scaled = logo.scale(1);
    const ratio = Math.min(maxWidth / scaled.width, maxHeight / scaled.height);

    page.drawImage(logo, {
        x,
        y,
        width: scaled.width * ratio,
        height: scaled.height * ratio,
    });
};

const drawWatermark = async (pdfDoc, page) => {
    const pdfSettings = brandConfig?.pdfSettings || {};

    if (pdfSettings.showWatermark === false) {
        return;
    }

    const watermarkOpacity = Number(pdfSettings.watermarkOpacity ?? 0.06);

    const logo = await loadImage(pdfDoc, brandConfig.logoPath);

    if (!logo) {
        return;
    }

    const { width, height } = page.getSize();
    const scaled = logo.scale(1);
    const targetWidth = 260;
    const ratio = targetWidth / scaled.width;
    const targetHeight = scaled.height * ratio;

    page.drawImage(logo, {
        x: (width - targetWidth) / 2,
        y: (height - targetHeight) / 2,
        width: targetWidth,
        height: targetHeight,
        opacity: watermarkOpacity,
    });
};

const drawHeader = async (pdfDoc, page, fonts, documentTitle, documentNo) => {
    const { width, height } = page.getSize();


    drawRectangle(page, 0, height - 110, width, 110, COLORS.light);


    await drawLogo(pdfDoc, page, 40, height - 130, 200, 160);

    page.drawText(documentTitle, {
        x: width - 245,
        y: height - 52,
        size: 24,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    page.drawText(documentNo, {
        x: width - 245,
        y: height - 74,
        size: 10,
        font: fonts.regular,
        color: COLORS.muted,
    });

    drawLine(page, 45, height - 125, width - 45, height - 125, COLORS.border);
};

const drawCompanyInfo = (page, fonts, y) => {
    const x = 45;

    page.drawText(brandConfig.companyName || "Dream Ceylon Journeys", {
        x,
        y,
        size: 14,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    page.drawText(brandConfig.tagline || "Sri Lanka Private Tours", {
        x,
        y,
        size: 9,
        font: fonts.regular,
        color: COLORS.muted,
    });

    y -= 15;

    const contactLine = [
        brandConfig.address,
        brandConfig.mobiles?.join(" / "),
        brandConfig.email,
        brandConfig.website,
    ]
        .filter(Boolean)
        .join(" | ");

    drawText(page, contactLine, x, y, {
        font: fonts.regular,
        size: 8,
        color: COLORS.muted,
        maxWidth: 500,
        lineHeight: 12,
    });
};

const drawInfoBox = (page, fonts, title, rows, x, y, width, height) => {
    drawRectangle(page, x, y - height, width, height, COLORS.white, COLORS.border);

    page.drawText(title, {
        x: x + 14,
        y: y - 22,
        size: 11,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    let currentY = y - 42;

    rows.forEach((row) => {
        page.drawText(row.label, {
            x: x + 14,
            y: currentY,
            size: 8,
            font: fonts.regular,
            color: COLORS.muted,
        });

        drawText(page, row.value, x + 110, currentY, {
            font: fonts.bold,
            size: 8.5,
            color: COLORS.text,
            maxWidth: width - 125,
            lineHeight: 11,
        });

        currentY -= 18;
    });
};

const drawStatusBadge = (page, fonts, label, x, y, color = COLORS.primary) => {
    drawRectangle(page, x, y - 18, 115, 24, color);

    page.drawText(label, {
        x: x + 12,
        y: y - 10,
        size: 9,
        font: fonts.bold,
        color: COLORS.white,
    });
};

const drawTableHeader = (page, fonts, x, y, widths, headers) => {
    const totalWidth = widths.reduce((sum, item) => sum + item, 0);

    drawRectangle(page, x, y - 24, totalWidth, 24, COLORS.primaryDark);

    let currentX = x;

    headers.forEach((header, index) => {
        page.drawText(header, {
            x: currentX + 8,
            y: y - 16,
            size: 8,
            font: fonts.bold,
            color: COLORS.white,
        });

        currentX += widths[index];
    });
};

const drawTableRow = (page, fonts, x, y, widths, values, fillColor = COLORS.white) => {
    const rowHeight = 28;
    const totalWidth = widths.reduce((sum, item) => sum + item, 0);

    drawRectangle(page, x, y - rowHeight, totalWidth, rowHeight, fillColor, COLORS.border);

    let currentX = x;

    values.forEach((value, index) => {
        drawText(page, value, currentX + 8, y - 17, {
            font: index === values.length - 1 ? fonts.bold : fonts.regular,
            size: 8.5,
            color: COLORS.text,
            maxWidth: widths[index] - 16,
            lineHeight: 10,
        });

        currentX += widths[index];
    });
};

const drawFooter = (page, fonts) => {
    const { width } = page.getSize();

    drawLine(page, 45, 55, width - 45, 55, COLORS.border);

    page.drawText(brandConfig.pdfSettings?.footerText || "Thank you for choosing Dream Ceylon Journeys.", {
        x: 45,
        y: 38,
        size: 8,
        font: fonts.regular,
        color: COLORS.muted,
    });

    page.drawText(brandConfig.website || "", {
        x: width - 210,
        y: 38,
        size: 8,
        font: fonts.regular,
        color: COLORS.primary,
    });
};

const getBookingById = async (bookingId) => {
    return await Booking.findById(bookingId)
        .populate("selectedPackage", "title durationDays category overview")
        .populate("inquiry", "fullName email whatsappNumber country status message");
};

const buildBookingFinancials = (booking) => {
    const totalPrice = toNumber(booking.totalPrice);
    const advancePayment = toNumber(booking.advancePayment);
    const balancePayment = Math.max(totalPrice - advancePayment, 0);

    return {
        totalPrice,
        advancePayment,
        balancePayment,
    };
};

const createInvoicePdf = async (booking) => {
    const pdfDoc = await PDFDocument.create();

    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const page = pdfDoc.addPage([595.28, 841.89]);

    await drawWatermark(pdfDoc, page);
    await drawHeader(
        pdfDoc,
        page,
        fonts,
        "BOOKING INVOICE",
        `Invoice No: INV-${booking.bookingCode}`
    );

    drawCompanyInfo(page, fonts, 700);

    const financials = buildBookingFinancials(booking);

    drawStatusBadge(page, fonts, booking.bookingStatus || "Confirmed", 435, 700);

    drawInfoBox(
        page,
        fonts,
        "Client Details",
        [
            {
                label: "Name",
                value: booking.customer?.fullName,
            },
            {
                label: "Email",
                value: booking.customer?.email,
            },
            {
                label: "WhatsApp",
                value: booking.customer?.whatsappNumber,
            },
            {
                label: "Country",
                value: booking.customer?.country,
            },
        ],
        45,
        650,
        245,
        120
    );

    drawInfoBox(
        page,
        fonts,
        "Booking Details",
        [
            {
                label: "Booking Code",
                value: booking.bookingCode,
            },
            {
                label: "Start Date",
                value: formatDate(booking.travelStartDate),
            },
            {
                label: "End Date",
                value: formatDate(booking.travelEndDate),
            },
            {
                label: "Travelers",
                value: `${booking.numberOfTravelers || 0}`,
            },
        ],
        305,
        650,
        245,
        120
    );

    let y = 500;

    page.drawText("Invoice Items", {
        x: 45,
        y,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    const tableX = 45;
    const widths = [240, 95, 95, 115];

    drawTableHeader(page, fonts, tableX, y, widths, [
        "Description",
        "Vehicle",
        "Status",
        "Amount",
    ]);

    y -= 24;

    drawTableRow(
        page,
        fonts,
        tableX,
        y,
        widths,
        [
            booking.selectedPackage?.title ||
            `Sri Lanka Private Tour Booking - ${booking.bookingCode}`,
            booking.vehicleType || "-",
            booking.bookingStatus || "-",
            formatMoney(financials.totalPrice, booking.currency),
        ],
        COLORS.white
    );

    y -= 50;

    drawInfoBox(
        page,
        fonts,
        "Tour Summary",
        [
            {
                label: "Package",
                value: booking.selectedPackage?.title || "Custom private tour",
            },
            {
                label: "Vehicle",
                value: booking.vehicleType,
            },
            {
                label: "Payment",
                value: booking.paymentStatus,
            },
            {
                label: "Issued Date",
                value: getTodayText(),
            },
        ],
        45,
        y,
        245,
        122
    );

    drawInfoBox(
        page,
        fonts,
        "Payment Summary",
        [
            {
                label: "Total",
                value: formatMoney(financials.totalPrice, booking.currency),
            },
            {
                label: "Advance",
                value: formatMoney(financials.advancePayment, booking.currency),
            },
            {
                label: "Balance",
                value: formatMoney(financials.balancePayment, booking.currency),
            },
            {
                label: "Currency",
                value: booking.currency,
            },
        ],
        305,
        y,
        245,
        122
    );

    y -= 155;

    page.drawText("Notes", {
        x: 45,
        y,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    const invoiceNotes =
        booking.adminNotes ||
        booking.specialRequests ||
        "This invoice is generated for the confirmed travel booking. Final balance should be settled according to the agreed payment terms.";

    drawText(page, invoiceNotes, 45, y, {
        font: fonts.regular,
        size: 9,
        color: COLORS.text,
        maxWidth: 500,
        lineHeight: 13,
    });

    drawFooter(page, fonts);

    return await pdfDoc.save();
};

const createReceiptPdf = async (booking) => {
    const pdfDoc = await PDFDocument.create();

    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const page = pdfDoc.addPage([595.28, 841.89]);

    await drawWatermark(pdfDoc, page);
    await drawHeader(
        pdfDoc,
        page,
        fonts,
        "PAYMENT RECEIPT",
        `Receipt No: REC-${booking.bookingCode}`
    );

    drawCompanyInfo(page, fonts, 700);

    const financials = buildBookingFinancials(booking);

    const receiptColor =
        booking.paymentStatus === "Paid" ? COLORS.primary : COLORS.warning;

    drawStatusBadge(
        page,
        fonts,
        booking.paymentStatus || "Payment Received",
        410,
        700,
        receiptColor
    );

    drawInfoBox(
        page,
        fonts,
        "Received From",
        [
            {
                label: "Name",
                value: booking.customer?.fullName,
            },
            {
                label: "Email",
                value: booking.customer?.email,
            },
            {
                label: "WhatsApp",
                value: booking.customer?.whatsappNumber,
            },
            {
                label: "Country",
                value: booking.customer?.country,
            },
        ],
        45,
        650,
        245,
        120
    );

    drawInfoBox(
        page,
        fonts,
        "Booking Reference",
        [
            {
                label: "Booking Code",
                value: booking.bookingCode,
            },
            {
                label: "Tour Start",
                value: formatDate(booking.travelStartDate),
            },
            {
                label: "Tour End",
                value: formatDate(booking.travelEndDate),
            },
            {
                label: "Receipt Date",
                value: getTodayText(),
            },
        ],
        305,
        650,
        245,
        120
    );

    let y = 495;

    drawRectangle(page, 45, y - 120, 505, 120, COLORS.light, COLORS.border);

    page.drawText("Payment Received", {
        x: 65,
        y: y - 35,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    page.drawText(formatMoney(financials.advancePayment, booking.currency), {
        x: 65,
        y: y - 78,
        size: 28,
        font: fonts.bold,
        color: COLORS.primary,
    });

    page.drawText("Advance payment / received amount", {
        x: 65,
        y: y - 98,
        size: 9,
        font: fonts.regular,
        color: COLORS.muted,
    });

    y -= 160;

    const tableX = 45;
    const widths = [250, 145, 150];

    drawTableHeader(page, fonts, tableX, y, widths, [
        "Description",
        "Payment Status",
        "Amount",
    ]);

    y -= 24;

    drawTableRow(
        page,
        fonts,
        tableX,
        y,
        widths,
        [
            booking.selectedPackage?.title || "Sri Lanka private tour booking",
            booking.paymentStatus || "-",
            formatMoney(financials.advancePayment, booking.currency),
        ],
        COLORS.white
    );

    y -= 60;

    drawInfoBox(
        page,
        fonts,
        "Booking Amount Summary",
        [
            {
                label: "Total Price",
                value: formatMoney(financials.totalPrice, booking.currency),
            },
            {
                label: "Paid Amount",
                value: formatMoney(financials.advancePayment, booking.currency),
            },
            {
                label: "Balance",
                value: formatMoney(financials.balancePayment, booking.currency),
            },
            {
                label: "Currency",
                value: booking.currency,
            },
        ],
        45,
        y,
        505,
        120
    );

    y -= 155;

    page.drawText("Receipt Notes", {
        x: 45,
        y,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    const receiptNotes =
        "This receipt confirms the payment received for the above booking. Please keep this receipt for your records. Remaining balance, if any, should be paid according to the agreed payment terms.";

    drawText(page, receiptNotes, 45, y, {
        font: fonts.regular,
        size: 9,
        color: COLORS.text,
        maxWidth: 500,
        lineHeight: 13,
    });

    drawFooter(page, fonts);

    return await pdfDoc.save();
};


const generateBookingInvoicePdf = async (req, res) => {
    try {
        brandConfig = await getDocumentBrandConfig();
        const booking = await getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const pdfBytes = await createInvoicePdf(booking);

        const fileName = `dream-ceylon-invoice-${booking.bookingCode}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        return res.send(Buffer.from(pdfBytes));
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate booking invoice PDF",
            error: error.message,
        });
    }
};


const generateBookingReceiptPdf = async (req, res) => {
    try {
        brandConfig = await getDocumentBrandConfig();
        const booking = await getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const pdfBytes = await createReceiptPdf(booking);

        const fileName = `dream-ceylon-receipt-${booking.bookingCode}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        return res.send(Buffer.from(pdfBytes));
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate booking receipt PDF",
            error: error.message,
        });
    }
};

module.exports = {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
};