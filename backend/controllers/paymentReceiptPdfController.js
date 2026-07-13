const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const BookingPayment = require("../models/BookingPayment");
const brandConfig = require("../config/brandConfig");

const COLORS = {
    primary: rgb(0.05, 0.46, 0.42),
    primaryDark: rgb(0.04, 0.28, 0.26),
    text: rgb(0.12, 0.16, 0.22),
    muted: rgb(0.45, 0.5, 0.58),
    light: rgb(0.95, 0.97, 0.98),
    border: rgb(0.82, 0.86, 0.9),
    white: rgb(1, 1, 1),
    warning: rgb(0.86, 0.48, 0.05),
    danger: rgb(0.82, 0.1, 0.1),
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
        opacity: 0.06,
    });
};

const drawHeader = async (pdfDoc, page, fonts, documentTitle, documentNo) => {
    const { width, height } = page.getSize();

    drawRectangle(page, 0, height - 110, width, 110, COLORS.light);

    // Same large logo size as your updated invoice/receipt
    await drawLogo(pdfDoc, page, 40, height - 130, 200, 160);

    page.drawText(documentTitle, {
        x: width - 265,
        y: height - 52,
        size: 23,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    page.drawText(documentNo, {
        x: width - 265,
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

        drawText(page, row.value, x + 112, currentY, {
            font: fonts.bold,
            size: 8.5,
            color: COLORS.text,
            maxWidth: width - 130,
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

const drawFooter = (page, fonts) => {
    const { width } = page.getSize();

    drawLine(page, 45, 55, width - 45, 55, COLORS.border);

    page.drawText("Thank you for choosing Dream Ceylon Journeys.", {
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

const getPaymentById = async (paymentId) => {
    return await BookingPayment.findById(paymentId).populate({
        path: "booking",
        select:
            "bookingCode customer selectedPackage travelStartDate travelEndDate numberOfTravelers vehicleType totalPrice advancePayment currency paymentStatus bookingStatus",
        populate: {
            path: "selectedPackage",
            select: "title durationDays category overview",
        },
    });
};

const createPaymentReceiptPdf = async (payment) => {
    const pdfDoc = await PDFDocument.create();

    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const page = pdfDoc.addPage([595.28, 841.89]);

    const booking = payment.booking;

    await drawWatermark(pdfDoc, page);

    const title =
        payment.status === "Refunded" ? "REFUND RECEIPT" : "PAYMENT RECEIPT";

    await drawHeader(
        pdfDoc,
        page,
        fonts,
        title,
        `Receipt No: ${payment.paymentNo}`
    );

    drawCompanyInfo(page, fonts, 700);

    const statusColor =
        payment.status === "Received"
            ? COLORS.primary
            : payment.status === "Refunded"
                ? COLORS.warning
                : COLORS.danger;

    drawStatusBadge(page, fonts, payment.status || "Received", 420, 700, statusColor);

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
                label: "Travelers",
                value: `${booking.numberOfTravelers || 0}`,
            },
        ],
        305,
        650,
        245,
        120
    );

    let y = 495;

    drawRectangle(page, 45, y - 125, 505, 125, COLORS.light, COLORS.border);

    page.drawText(
        payment.status === "Refunded" ? "Refund Amount" : "Payment Received",
        {
            x: 65,
            y: y - 35,
            size: 13,
            font: fonts.bold,
            color: COLORS.primaryDark,
        }
    );

    page.drawText(formatMoney(payment.amount, payment.currency), {
        x: 65,
        y: y - 80,
        size: 30,
        font: fonts.bold,
        color: payment.status === "Refunded" ? COLORS.warning : COLORS.primary,
    });

    page.drawText(`${payment.paymentType} via ${payment.paymentMethod}`, {
        x: 65,
        y: y - 103,
        size: 9,
        font: fonts.regular,
        color: COLORS.muted,
    });

    y -= 165;

    drawInfoBox(
        page,
        fonts,
        "Payment Details",
        [
            {
                label: "Payment No",
                value: payment.paymentNo,
            },
            {
                label: "Payment Date",
                value: formatDate(payment.paymentDate),
            },
            {
                label: "Payment Type",
                value: payment.paymentType,
            },
            {
                label: "Payment Method",
                value: payment.paymentMethod,
            },
            {
                label: "Reference",
                value: payment.referenceNumber || "-",
            },
        ],
        45,
        y,
        245,
        140
    );

    const totalPrice = toNumber(booking.totalPrice);
    const paidAmount = toNumber(booking.advancePayment);
    const balance = Math.max(totalPrice - paidAmount, 0);

    drawInfoBox(
        page,
        fonts,
        "Booking Payment Summary",
        [
            {
                label: "Total Price",
                value: formatMoney(totalPrice, booking.currency),
            },
            {
                label: "Total Paid",
                value: formatMoney(paidAmount, booking.currency),
            },
            {
                label: "Balance",
                value: formatMoney(balance, booking.currency),
            },
            {
                label: "Payment Status",
                value: booking.paymentStatus,
            },
            {
                label: "Issued Date",
                value: getTodayText(),
            },
        ],
        305,
        y,
        245,
        140
    );

    y -= 175;

    page.drawText("Receipt Notes", {
        x: 45,
        y,
        size: 13,
        font: fonts.bold,
        color: COLORS.primaryDark,
    });

    y -= 18;

    const receiptNotes =
        payment.notes ||
        "This receipt confirms the payment received for the above booking. Please keep this receipt for your records.";

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

// @desc    Generate receipt PDF for a single booking payment
// @route   POST /api/payment-receipts/:id
// @access  Private
const generateSinglePaymentReceiptPdf = async (req, res) => {
    try {
        const payment = await getPaymentById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        if (!payment.booking) {
            return res.status(404).json({
                message: "Booking not found for this payment",
            });
        }

        const pdfBytes = await createPaymentReceiptPdf(payment);

        const fileName = `dream-ceylon-payment-receipt-${payment.paymentNo}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        return res.send(Buffer.from(pdfBytes));
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate payment receipt PDF",
            error: error.message,
        });
    }
};

module.exports = {
    generateSinglePaymentReceiptPdf,
};