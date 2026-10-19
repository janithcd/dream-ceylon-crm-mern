const mongoose = require("mongoose");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildOperationsBrief } = require("../utils/operationsBrief");
const { createActivityLog } = require("../utils/createActivityLog");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ink = rgb(0.12, 0.17, 0.2);
const muted = rgb(0.38, 0.43, 0.48);
const green = rgb(0.04, 0.38, 0.34);
const pale = rgb(0.93, 0.97, 0.96);

// Standard PDF fonts support WinAnsi. Replace unsupported characters so a guest name
// or pasted route never turns an otherwise valid handover into a server error.
const pdfText = (value) => String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, " to ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");

const wrapText = (text, font, size, maxWidth) => {
    const words = pdfText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    for (const word of words) {
        let remaining = word;
        while (remaining) {
            const candidate = line ? `${line} ${remaining}` : remaining;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
                line = candidate;
                break;
            }
            if (line) {
                lines.push(line);
                line = "";
                continue;
            }
            let count = 1;
            while (count < remaining.length && font.widthOfTextAtSize(remaining.slice(0, count + 1), size) <= maxWidth) {
                count += 1;
            }
            lines.push(remaining.slice(0, count));
            remaining = remaining.slice(count);
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
};

const createOperationsBriefPdf = async (brief, company, generatedAt = new Date()) => {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const generated = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo", year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(generatedAt);
    let page;
    let y;

    const addPage = () => {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 107, width: PAGE_WIDTH, height: 107, color: pale });
        page.drawText(wrapText(company.companyName || "Dream Ceylon Journeys", bold, 14, CONTENT_WIDTH)[0], {
            x: MARGIN, y: PAGE_HEIGHT - 39, size: 14, font: bold, color: green,
        });
        page.drawText("TRIP OPERATIONS BRIEF", { x: MARGIN, y: PAGE_HEIGHT - 65, size: 17, font: bold, color: ink });
        page.drawText(pdfText(`${brief.bookingCode} | ${brief.bookingStatus} | Generated ${generated} Sri Lanka time`), {
            x: MARGIN, y: PAGE_HEIGHT - 83, size: 8, font: regular, color: muted,
        });
        y = PAGE_HEIGHT - 132;
    };

    const ensureSpace = (height) => {
        if (y - height < 66) addPage();
    };

    const write = (text, { font = regular, size = 9, color = ink, indent = 0, lineHeight = 14 } = {}) => {
        const lines = wrapText(text, font, size, CONTENT_WIDTH - indent);
        for (const line of lines) {
            ensureSpace(lineHeight);
            page.drawText(line, { x: MARGIN + indent, y, size, font, color });
            y -= lineHeight;
        }
    };

    const section = (title) => {
        ensureSpace(47);
        y -= 9;
        page.drawRectangle({ x: MARGIN, y: y - 8, width: CONTENT_WIDTH, height: 23, color: pale });
        page.drawText(pdfText(title), { x: MARGIN + 9, y: y - 1, size: 10, font: bold, color: green });
        y -= 31;
    };

    addPage();
    write("INTERNAL USE ONLY - Confirm all supplier arrangements before departure.", { font: bold, size: 9, color: green });
    y -= 6;
    section("Guest and trip");
    for (const line of brief.guest) write(line, { size: 10, lineHeight: 17 });

    for (const group of brief.sections) {
        section(`${group.title} (${group.items.length})`);
        if (group.items.length === 0) {
            write(group.empty, { color: muted });
            continue;
        }
        for (const item of group.items) {
            ensureSpace(45);
            write(item.title, { font: bold, size: 11, lineHeight: 18 });
            for (const line of item.lines) write(line, { indent: 10, size: 9.5, color: muted, lineHeight: 14 });
            y -= 7;
        }
    }

    const totalPages = pdf.getPageCount();
    pdf.getPages().forEach((sheet, index) => {
        sheet.drawLine({ start: { x: MARGIN, y: 52 }, end: { x: PAGE_WIDTH - MARGIN, y: 52 }, thickness: 1, color: pale });
        sheet.drawText("Internal operations copy. No prices or private staff notes are included.", {
            x: MARGIN, y: 35, size: 8, font: regular, color: muted,
        });
        sheet.drawText(`${index + 1} / ${totalPages}`, { x: PAGE_WIDTH - MARGIN - 27, y: 35, size: 8, font: regular, color: muted });
    });

    return pdf.save();
};

const generateOperationsBriefPdf = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id)
            .populate("preparationTasks.assignedTo", "name");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.bookingStatus === "Cancelled") {
            return res.status(409).json({ message: "Cancelled bookings cannot have a departure brief" });
        }

        const company = await getDocumentBrandConfig();
        const brief = buildOperationsBrief(booking);
        const pdfBytes = await createOperationsBriefPdf(brief, company);
        const filename = `dream-ceylon-operations-${booking.bookingCode}.pdf`;

        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Operations brief generated for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: { documentType: "Operations Brief", filename },
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error("Operations brief generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate operations brief" });
    }
};

module.exports = { createOperationsBriefPdf, generateOperationsBriefPdf };
