const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Quotation = require("../models/Quotation");
const defaultBrandConfig = require("../config/brandConfig");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { parseQuotationValidUntil, getQuotationValidityState } = require("../utils/quotationValidity");
const { createBriefText } = require("../utils/briefPdfText");
const { createActivityLog } = require("../utils/createActivityLog");
const { calculateQuotationTotals } = require("../utils/quotationTotals");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT = WIDTH - 2 * MARGIN;
const green = "#064e3b";
const teal = "#0f766e";
const gold = "#f59e0b";
const ink = "#19262d";
const muted = "#586874";
const pale = "#f0fdfa";

const safeText = (value) => String(value ?? "").trim();
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
const date = (value) => formatDocumentDate(value, {
    month: "long", fallback: value ? safeText(value) : "Not provided",
});
const cleanFileName = (value) => safeText(value || "quotation").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "quotation";
const parseList = (value, fallback) => {
    if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
    if (typeof value === "string") return value.split(/\r?\n|,/u).map(safeText).filter(Boolean);
    return fallback;
};

const createQuotationPdf = async (data, totals, company = defaultBrandConfig) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true,
        size: [WIDTH, HEIGHT], margin: 0 });
    pdf.info.Title = `${data.previewLabel || "Tour quotation"} ${data.quotationNo}`;
    pdf.info.Author = company.companyName || "Dream Ceylon Journeys";
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    const draw = (value, x, top, size = 9, weight = "regular", color = ink) =>
        text.draw(value, { x, y: top, size, weight, color });
    let y = 0;
    const addPage = () => {
        pdf.addPage();
        if (company.pdfSettings?.showWatermark !== false &&
            company.logoPath && fs.existsSync(company.logoPath)) {
            try {
                pdf.save().opacity(Math.min(Math.max(Number(company.pdfSettings?.watermarkOpacity ?? 0.04), 0), 0.15));
                pdf.image(company.logoPath, 169, 296, { fit: [257, 245] });
                pdf.restore();
            } catch { pdf.restore(); /* An invalid watermark must not block a quotation. */ }
        }
        pdf.rect(0, 0, WIDTH, 94).fill("#ffffff");
        pdf.rect(0, 91, WIDTH, 3).fill(gold);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try { pdf.image(company.logoPath, 18, 8, { fit: [140, 70] }); }
            catch { /* An invalid logo must not block a quotation. */ }
        }
        const name = company.companyName || "Dream Ceylon Journeys";
        text.wrap(name, "bold", 14, 260).slice(0, 2)
            .forEach((line, index) => draw(line, 168, 17 + index * 17, 14, "bold", green));
        draw(company.tagline || "Sri Lanka Private Tours", 168, 51, 8, "regular", muted);
        draw((company.mobiles || []).join(" / "), 168, 66, 8, "bold", teal);
        if (data.previewLabel) draw(data.previewLabel, MARGIN, 77, 8, "bold", teal);
        y = 113;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 80) addPage(); };
    const section = (label) => {
        // Keep a heading with at least its first row or bullet.
        ensureSpace(85);
        y += 11;
        pdf.rect(MARGIN, y, CONTENT, 27).fill(green);
        pdf.rect(MARGIN, y + 25, CONTENT, 2).fill(gold);
        draw(label.toUpperCase(), MARGIN + 12, y + 7, 10, "bold", "#ffffff");
        y += 38;
    };
    const detail = (label, value) => {
        ensureSpace(22);
        const pageCount = pdf.bufferedPageRange().count;
        const top = y;
        draw(label, MARGIN, y, 9, "regular", muted);
        const lines = text.wrap(value || "Not provided", "bold", 9, CONTENT - 154);
        for (const line of lines) {
            const page = pdf.bufferedPageRange().count;
            ensureSpace(17);
            if (pdf.bufferedPageRange().count !== page) draw(`${label} (continued)`, MARGIN, y, 9, "regular", muted);
            draw(line, MARGIN + 154, y, 9, "bold");
            y += 16;
        }
        y += 4;
        return { pageCount, top, height: y - top };
    };
    const paragraph = (value, color = ink, indent = 0, size = 9) => {
        for (const line of text.wrap(value, "regular", size, CONTENT - indent)) {
            ensureSpace(15);
            draw(line, MARGIN + indent, y, size, "regular", color);
            y += 15;
        }
    };
    const bullet = (value) => {
        ensureSpace(22);
        pdf.circle(MARGIN + 5, y + 6, 2.4).fill(teal);
        paragraph(value, ink, 18, 9);
        y += 5;
    };
    const priceRow = (label, amount, emphasis = false) => {
        const labelLines = text.wrap(label, "bold", 9, CONTENT - 190);
        const price = money(amount, data.currency);
        const priceLines = text.wrap(price, "bold", 9, 155);
        const height = Math.max(labelLines.length, priceLines.length) * 15 + 14;
        ensureSpace(height + 5);
        pdf.rect(MARGIN, y, CONTENT, height).fill(emphasis ? green : pale);
        labelLines.forEach((line, index) =>
            draw(line, MARGIN + 11, y + 7 + index * 15, 9, "bold", emphasis ? "#ffffff" : ink));
        priceLines.forEach((line, index) =>
            draw(line, MARGIN + CONTENT - 160, y + 7 + index * 15, 9, "bold", emphasis ? "#ffffff" : green));
        y += height + 5;
    };

    addPage();
    pdf.rect(MARGIN, y, CONTENT, 90).fill(pale);
    pdf.rect(MARGIN, y, 6, 90).fill(gold);
    draw(data.isDraft ? "DRAFT QUOTATION" : "TOUR QUOTATION", MARGIN + 17, y + 14, 21, "bold", green);
    draw(`Quotation No: ${data.quotationNo}`, MARGIN + 17, y + 48, 9, "regular", muted);
    draw(`Date: ${date(data.quotationDate)}`, MARGIN + 17, y + 65, 8, "regular", muted);
    if (data.validUntil) draw(`Valid until: ${date(data.validUntil)}`,
        MARGIN + 268, y + 65, 8, "bold", green);
    y += 106;

    section("Client & tour summary");
    detail("Client name", data.clientName);
    detail("Country", data.country);
    detail("Tour", data.tourTitle);
    detail("Dates", `${date(data.travelStartDate)} to ${date(data.travelEndDate)}`);
    detail("Travelers / duration", `${data.travelers || 0} traveler(s) / ${data.durationDays || 0} day(s)`);
    detail("Vehicle", data.vehicleType);

    section("Cost breakdown");
    if (totals.vehicleTotal > 0) {
        priceRow(`${data.vehicleType} transport (${totals.vehicleDays} days x ${money(totals.vehicleDailyRate, data.currency)})`, totals.vehicleTotal);
    }
    if (totals.hotelTotal > 0) priceRow("Hotel arrangement estimate", totals.hotelTotal);
    if (totals.activitiesTotal > 0) priceRow("Activities estimate", totals.activitiesTotal);
    if (totals.entranceFeesTotal > 0) priceRow("Entrance fees estimate", totals.entranceFeesTotal);
    if (totals.otherTotal > 0) priceRow("Other costs", totals.otherTotal);
    if (totals.subtotal === 0) priceRow("Custom tour quotation", 0);
    y += 5;
    priceRow("Subtotal", totals.subtotal);
    if (totals.discount > 0) priceRow("Discount", -totals.discount);
    priceRow("Grand total", totals.grandTotal, true);
    priceRow("Advance requested", totals.advancePayment);
    priceRow("Remaining after advance", totals.balancePayment);
    y += 8;
    paragraph("The advance and remaining amounts are payment targets; this quotation does not confirm any money received.", muted);

    section("Package inclusions");
    for (const item of data.inclusions.length ? data.inclusions : ["Not provided"]) bullet(item);
    section("Package exclusions");
    for (const item of data.exclusions.length ? data.exclusions : ["Not provided"]) bullet(item);
    if (data.notes) {
        section("Additional notes");
        for (const line of String(data.notes).split(/\r?\n/u).filter((part) => part.trim())) {
            paragraph(line);
            y += 6;
        }
    }
    section("Payment terms");
    for (const term of [
        "Quotation is subject to final availability at the time of confirmation.",
        "Advance payment is required to confirm the booking.",
        "Balance payment should be completed as agreed before or during the tour.",
        "Hotels, entrance fees, activities, train tickets, and meals are included only if clearly mentioned in the quotation.",
    ]) bullet(term);

    section("Contact details");
    detail("Company", company.companyName || "Dream Ceylon Journeys");
    detail("Address", company.address);
    detail("Mobile", (company.mobiles || []).join(" / "));
    detail("Email", company.email);
    const websiteRow = detail("Website", company.website);
    if (/^https?:\/\//u.test(company.website || "") &&
        websiteRow.pageCount === pdf.bufferedPageRange().count) {
        pdf.link(MARGIN + 154, websiteRow.top, CONTENT - 154, websiteRow.height, company.website);
    }
    if (company.whatsapp) {
        const whatsappRow = detail("WhatsApp", company.whatsapp);
        const digits = String(company.whatsapp).replace(/\D/gu, "");
        if (digits.length >= 9 && digits.length <= 15 &&
            whatsappRow.pageCount === pdf.bufferedPageRange().count) {
            pdf.link(MARGIN + 154, whatsappRow.top, CONTENT - 154, whatsappRow.height,
                `https://wa.me/${digits}`);
        }
    }
    const count = pdf.bufferedPageRange().count;
    for (let index = 0; index < count; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 65).lineTo(WIDTH - MARGIN, HEIGHT - 65).strokeColor(pale).stroke();
        draw(text.fit(company.pdfSettings?.footerText || "Thank you for choosing Dream Ceylon Journeys.",
            "regular", 8, CONTENT - 50),
            MARGIN, HEIGHT - 50, 8, "regular", muted);
        draw(`${index + 1} / ${count}`, WIDTH - MARGIN - 34, HEIGHT - 50, 8, "regular", muted);
    }
    pdf.end();
    return output;
};

const generateQuotationPdf = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const { clientName, tourTitle, validUntil } = req.body || {};
        if (!safeText(clientName) || !safeText(tourTitle)) {
            return res.status(400).json({ message: "Client name and tour title are required" });
        }
        const validity = parseQuotationValidUntil(validUntil);
        if (validity.error) return res.status(400).json({ message: validity.error });
        const totals = calculateQuotationTotals(req.body);
        const travelers = Number(req.body.travelers);
        const data = {
            // An unsaved browser payload is a preview, never an official numbered quotation.
            quotationNo: "DRAFT", previewLabel: "DRAFT - NOT SAVED", isDraft: true,
            clientName: safeText(clientName), country: safeText(req.body.country || "Not provided"),
            quotationDate: req.body.quotationDate || new Date(), validUntil: validity.value,
            tourTitle: safeText(tourTitle), travelStartDate: req.body.travelStartDate,
            travelEndDate: req.body.travelEndDate, travelers: Number.isFinite(travelers) ? travelers : 0,
            durationDays: totals.durationDays, vehicleType: safeText(req.body.vehicleType || "Private Vehicle"),
            currency: safeText(req.body.currency || "USD"),
            inclusions: parseList(req.body.inclusions, ["Private air-conditioned vehicle", "Professional chauffeur guide",
                "Airport pickup and drop-off", "Customized tour route planning", "Water bottles during transfers"]),
            exclusions: parseList(req.body.exclusions, ["Hotel accommodation unless mentioned", "Entrance fees unless mentioned",
                "Activity fees unless mentioned", "Meals unless mentioned", "Personal expenses"]),
            notes: safeText(req.body.notes).replace(/\*\*/gu, "").replace(/^\s*#{1,6}\s*/gmu, ""),
        };
        const company = await getDocumentBrandConfig();
        const bytes = await createQuotationPdf(data, totals, company);
        const filename = `dream-ceylon-draft-quotation-${cleanFileName(clientName)}.pdf`;
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Draft quotation PDF was generated for ${data.clientName}`,
            relatedModel: "Quotation",
            referenceNo: data.quotationNo, customerName: data.clientName,
            metadata: { documentType: "Draft Quotation", filename, tourTitle: data.tourTitle,
                currency: data.currency, grandTotal: totals.grandTotal,
                advancePayment: totals.advancePayment, balancePayment: totals.balancePayment,
                validUntil: data.validUntil, pageCount: (bytes.toString("latin1").match(/\/Type \/Page\b/g) || []).length },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", bytes.length);
        return res.status(200).send(bytes);
    } catch (error) {
        console.error("Quotation PDF generation failed:", error);
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Quotation PDF generation failed for ${safeText(req.body?.clientName) || "client"}`,
            relatedModel: "Quotation",
            customerName: safeText(req.body?.clientName), status: "Failed",
            metadata: { documentType: "Quotation", tourTitle: safeText(req.body?.tourTitle), error: error.message },
        });
        return res.status(500).json({ message: "Failed to generate quotation PDF" });
    }
};

const generateSavedQuotationPdf = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid quotation ID" });
    }
    try {
        const quotation = await Quotation.findById(req.params.id).lean();
        if (!quotation) return res.status(404).json({ message: "Quotation not found" });
        const totals = calculateQuotationTotals(quotation);
        const pricingMismatch = ["grandTotal", "advancePayment", "balancePayment"].some((key) => {
            const saved = Number(quotation.totals?.[key]);
            return !Number.isFinite(saved) || Math.abs(saved - totals[key]) > 0.009;
        });
        if (pricingMismatch ||
            !["USD", "LKR", "EUR", "GBP"].includes(quotation.currency)) {
            return res.status(409).json({ message: "Saved quotation pricing needs review before issuing a PDF." });
        }
        const isDraft = quotation.status === "Draft";
        const previewLabel = isDraft ? "DRAFT - FOR REVIEW" :
            quotation.status === "Expired" || quotation.status === "Rejected" ?
                `${quotation.status.toUpperCase()} - DO NOT SEND` :
                getQuotationValidityState(quotation) === "pastDue" ? "VALIDITY PASSED - REVIEW RATES" : "";
        const data = {
            quotationNo: quotation.quotationNo,
            quotationDate: quotation.createdAt,
            validUntil: quotation.validUntil,
            clientName: quotation.clientName,
            country: quotation.country,
            tourTitle: quotation.tourTitle,
            travelStartDate: quotation.travelStartDate,
            travelEndDate: quotation.travelEndDate,
            travelers: quotation.travelers,
            durationDays: quotation.durationDays,
            vehicleType: quotation.vehicleType,
            currency: quotation.currency,
            previewLabel, isDraft,
            inclusions: parseList(quotation.inclusions, []),
            exclusions: parseList(quotation.exclusions, []),
            notes: safeText(quotation.notes).replace(/\*\*/gu, "").replace(/^\s*#{1,6}\s*/gmu, ""),
        };
        const company = await getDocumentBrandConfig();
        const bytes = await createQuotationPdf(data, totals, company);
        const filename = `dream-ceylon-${isDraft ? "draft-quotation" : "quotation"}-${cleanFileName(quotation.clientName)}.pdf`;
        await createActivityLog({ req, action: "GENERATE", module: "PDF",
            description: `Saved quotation PDF ${quotation.quotationNo} was generated`,
            relatedRecordId: quotation._id, relatedModel: "Quotation",
            referenceNo: quotation.quotationNo, customerName: quotation.clientName,
            metadata: { documentType: "Quotation", filename, currency: quotation.currency,
                grandTotal: totals.grandTotal, status: quotation.status } });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(bytes);
    } catch (error) {
        console.error("Saved quotation PDF generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate saved quotation PDF" });
    }
};

module.exports = { generateQuotationPdf, generateSavedQuotationPdf, createQuotationPdf, calculateQuotationTotals };
