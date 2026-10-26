const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildOperationsBrief } = require("../utils/operationsBrief");
const { createActivityLog } = require("../utils/createActivityLog");
const { createBriefText } = require("../utils/briefPdfText");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ink = "#1f2b33";
const muted = "#616e7a";
const green = "#0a6157";
const pale = "#edf7f5";

const createOperationsBriefPdf = async (brief, company, generatedAt = new Date()) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    const generated = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo", year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(generatedAt);
    let y;

    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, PAGE_WIDTH, 107).fill(pale);
        text.draw(text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 14, CONTENT_WIDTH)[0], {
            x: MARGIN, y: 24, size: 14, weight: "bold", color: green,
        });
        text.draw("TRIP OPERATIONS BRIEF", { x: MARGIN, y: 46, size: 17, weight: "bold", color: ink });
        text.draw(`${brief.bookingCode} | ${brief.bookingStatus} | Generated ${generated} Sri Lanka time`, {
            x: MARGIN, y: 76, size: 8, color: muted,
        });
        y = 132;
    };

    const ensureSpace = (height) => {
        if (y + height > PAGE_HEIGHT - 66) addPage();
    };

    const write = (value, { weight = "regular", size = 9, color = ink, indent = 0, lineHeight = 14 } = {}) => {
        const lines = text.wrap(value, weight, size, CONTENT_WIDTH - indent);
        for (const line of lines) {
            ensureSpace(lineHeight);
            text.draw(line, { x: MARGIN + indent, y, size, weight, color });
            y += lineHeight;
        }
    };

    const section = (title) => {
        ensureSpace(47);
        y += 9;
        pdf.rect(MARGIN, y, CONTENT_WIDTH, 23).fill(pale);
        text.draw(title, { x: MARGIN + 9, y: y + 5, size: 10, weight: "bold", color: green });
        y += 31;
    };

    addPage();
    write("INTERNAL USE ONLY - Confirm all supplier arrangements before departure.", { weight: "bold", size: 9, color: green });
    y += 6;
    section("Guest and trip");
    for (const line of brief.guest) write(line, { size: 10, lineHeight: 17 });

    for (const group of brief.sections) {
        section(`${group.title} (${group.items.length})`);
        if (group.notice) write(group.notice, { color: muted });
        if (group.items.length === 0) {
            write(group.empty, { color: muted });
            continue;
        }
        for (const item of group.items) {
            ensureSpace(45);
            write(item.title, { weight: "bold", size: 11, lineHeight: 18 });
            for (const line of item.lines) write(line, { indent: 10, size: 9.5, color: muted, lineHeight: 14 });
            y += 7;
        }
    }

    const totalPages = pdf.bufferedPageRange().count;
    for (let index = 0; index < totalPages; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, PAGE_HEIGHT - 52).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 52).strokeColor(pale).stroke();
        text.draw("Internal operations copy. No prices or private staff notes are included.", {
            x: MARGIN, y: PAGE_HEIGHT - 42, size: 8, color: muted,
        });
        text.draw(`${index + 1} / ${totalPages}`, { x: PAGE_WIDTH - MARGIN - 27, y: PAGE_HEIGHT - 42, size: 8, color: muted });
    }

    pdf.end();
    return output;
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
