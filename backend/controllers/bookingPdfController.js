const { formatDocumentDate } = require("../utils/documentDate");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const mongoose = require("mongoose");

const Booking = require("../models/Booking");
let brandConfig = require("../config/brandConfig");

const {
    getDocumentBrandConfig,
} = require("../utils/documentSettings");
const { createActivityLog } = require("../utils/createActivityLog");

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

const formatDate = (value) => formatDocumentDate(value);

const getTodayText = () => formatDocumentDate(new Date());

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
        .select("bookingCode bookingStatus customer selectedPackage travelStartDate travelEndDate numberOfTravelers vehicleType totalPrice currency hotelAdvanceAmount hotelAdvanceDueDate paymentDueDate")
        .populate("selectedPackage", "title");
};

const buildBookingFinancials = (booking) => {
    const totalPrice = toNumber(booking.totalPrice);
    return { totalPrice };
};

const wrapInvoiceLines = (value, font, size, maxWidth) => {
    const lines = [];
    let line = "";
    for (const word of String(value).replace(/\s+/g, " ").trim().split(" ")) {
        if (!word) continue;
        if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= maxWidth) {
            line = line ? `${line} ${word}` : word;
            continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
            if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) {
                lines.push(line);
                line = "";
            }
            line += character;
        }
    }
    if (line) lines.push(line);
    return lines;
};

const createInvoicePdf = async (booking, documentSettings = brandConfig) => {
    const pdfDoc = await PDFDocument.create();

    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    let page = pdfDoc.addPage([595.28, 841.89]);

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
                label: "Final Due",
                value: formatDocumentDate(booking.paymentDueDate, { fallback: "Not scheduled" }),
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
        "Booking Price and Target",
        [
            {
                label: "Total",
                value: formatMoney(financials.totalPrice, booking.currency),
            },
            {
                label: "Hotel Advance",
                value: toNumber(booking.hotelAdvanceAmount) > 0
                    ? formatMoney(booking.hotelAdvanceAmount, booking.currency)
                    : "Not scheduled",
            },
            {
                label: "Advance Due",
                value: formatDocumentDate(booking.hotelAdvanceDueDate, { fallback: "Not scheduled" }),
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

    page.drawText("Payment Instructions", {
        x: 45,
        y,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    const invoiceNotes = documentSettings.pdfSettings?.paymentInstructions ||
        "Please quote the booking number when making a payment.";

    const instructions = wrapInvoiceLines(invoiceNotes, fonts.regular, 9, 500);
    const clarification = wrapInvoiceLines(
        "This invoice shows the booked price and agreed targets. It does not reflect payments already recorded. Check the guest payment statement for your current balance before paying.",
        fonts.regular, 9, 500);
    for (const [index, line] of [...instructions, "", ...clarification].entries()) {
        if (!line) { y -= 10; continue; }
        if (y < 83) {
            drawFooter(page, fonts);
            page = pdfDoc.addPage([595.28, 841.89]);
            await drawWatermark(pdfDoc, page);
            await drawHeader(pdfDoc, page, fonts, "BOOKING INVOICE", `Invoice No: INV-${booking.bookingCode}`);
            y = 690;
            page.drawText("Payment Instructions (continued)", { x: 45, y, size: 12,
                font: fonts.bold, color: COLORS.primaryDark });
            y -= 25;
        }
        page.drawText(line, { x: 45, y, size: 9, font: fonts.regular,
            color: index > instructions.length ? COLORS.muted : COLORS.text });
        y -= 13;
    }

    drawFooter(page, fonts);

    return await pdfDoc.save();
};

const generateBookingInvoicePdf = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    try {
        brandConfig = await getDocumentBrandConfig();
        const booking = await getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }
        if (booking.bookingStatus === "Cancelled" ||
            !Number.isFinite(booking.totalPrice) || booking.totalPrice <= 0 ||
            Math.abs(booking.totalPrice * 100 - Math.round(booking.totalPrice * 100)) > 0.000001) {
            return res.status(409).json({
                message: "Review the booking status and price before issuing an invoice.",
            });
        }

        const pdfBytes = await createInvoicePdf(booking);

        const fileName = `dream-ceylon-invoice-${booking.bookingCode}.pdf`;

        await createActivityLog({
            req,
            action: "GENERATE",
            module: "PDF",
            description: `Booking invoice was generated for ${booking.bookingCode}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer?.fullName,
            metadata: {
                documentType: "Booking Invoice",
                filename: fileName,
                totalPrice: booking.totalPrice,
                currency: booking.currency,
                bookingStatus: booking.bookingStatus,
            },
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        return res.send(Buffer.from(pdfBytes));
    } catch (error) {
        await createActivityLog({
            req,
            action: "GENERATE",
            module: "PDF",
            description: `Booking invoice generation failed for booking ${req.params.id}`,
            relatedRecordId: req.params.id,
            relatedModel: "Booking",
            referenceNo: req.params.id,
            status: "Failed",
            metadata: {
                documentType: "Booking Invoice",
                error: error.message,
            },
        });

        res.status(500).json({
            message: "Failed to generate booking invoice PDF",
            error: error.message,
        });
    }
};


const generateBookingReceiptPdf = async (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(410).json({
        message: "The booking-level receipt is retired. Open the booking's Payments panel to download a receipt for a recorded payment, or a guest payment statement for the full balance.",
    });
};

module.exports = {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
    createInvoicePdf,
};
