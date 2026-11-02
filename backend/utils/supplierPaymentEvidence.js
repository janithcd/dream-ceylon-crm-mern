const { createHash } = require("node:crypto");
const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const CHANNELS = ["Email", "WhatsApp", "Phone", "Other"];
const controlCharacters = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const cleanField = (value, max, min = 0) => typeof value === "string" && !controlCharacters.test(value) &&
    value.trim().length >= min && value.trim().length <= max;

const parsePaymentFile = ({ data, contentType, encodedName, kind }) => {
    if (!MIME_TYPES.includes(contentType) || !Buffer.isBuffer(data)) return { status: 415, error: "Choose a PDF, PNG or JPEG file." };
    if (!data.length || data.length > MAX_FILE_BYTES) return { status: 413, error: "Choose a non-empty file of at most 5 MB." };
    let filename;
    try { filename = typeof encodedName === "string" ? decodeURIComponent(encodedName) : ""; }
    catch { return { status: 400, error: "The filename is invalid." }; }
    if (!cleanField(filename, 150, 1) || /[/\\]/.test(filename) || filename.trim().startsWith(".")) {
        return { status: 400, error: "Use a filename of 1–150 characters without paths or control characters." };
    }
    filename = filename.trim();
    const pdf = contentType === "application/pdf" && /\.pdf$/i.test(filename) && data.length >= 16 &&
        /^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(data.subarray(0, 10).toString("ascii")) &&
        /%%EOF\s*$/.test(data.subarray(-1024).toString("latin1"));
    const png = contentType === "image/png" && /\.png$/i.test(filename) && data.length >= 45 &&
        data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        data.subarray(12, 16).toString("ascii") === "IHDR" && data.subarray(-8, -4).toString("ascii") === "IEND";
    const jpeg = contentType === "image/jpeg" && /\.jpe?g$/i.test(filename) && data.length >= 4 &&
        data[0] === 255 && data[1] === 216 && data[2] === 255 && data.at(-2) === 255 && data.at(-1) === 217;
    if (!pdf && !png && !jpeg) return { status: 415, error: "The file contents, extension and selected type must match a PDF, PNG or JPEG." };
    if (!["bank-proof", "supplier-receipt"].includes(kind)) return { status: 400, error: "Choose bank proof or a supplier receipt." };
    return { value: { filename, contentType, kind, size: data.length, data, sha256: createHash("sha256").update(data).digest("hex") } };
};

const parseAcknowledgement = (body, payment, now = new Date()) => {
    if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) return { error: "Reload this payment before updating its acknowledgement." };
    if (body.action === "reopen") {
        if (!cleanField(body.reason, 300, 3)) return { error: "Enter a reason for reopening (3–300 characters)." };
        return { value: { action: "reopen", reason: body.reason.trim() } };
    }
    if (body.action !== "acknowledge") return { error: "Choose whether to record or reopen the supplier acknowledgement." };
    const parsed = parseCalendarDate(body.acknowledgedDate, "Acknowledgement date");
    if (parsed.error || !parsed.value) return { error: parsed.error || "Enter the date the supplier acknowledged payment." };
    const date = payment.paymentDate ? new Date(payment.paymentDate) : null;
    const today = getBusinessDayBounds(now).start.getTime() + 330 * 60 * 1000;
    if (!date || Number.isNaN(date.getTime()) || parsed.value < new Date(date.toISOString().slice(0, 10)) || parsed.value.getTime() > today) {
        return { error: "The acknowledgement date must be on or after the recorded payment date and no later than today in Sri Lanka." };
    }
    if (!CHANNELS.includes(body.channel)) return { error: "Choose the channel used by the supplier." };
    if (!cleanField(body.contactName, 100, 1) || !cleanField(body.reference ?? "", 100) || !cleanField(body.note ?? "", 500)) {
        return { error: "Enter the supplier contact (up to 100 characters), optional receipt/reference (100), and optional internal note (500). Use single lines." };
    }
    if (body.confirmed !== true) return { error: "Confirm that the supplier has actually acknowledged this payment." };
    return { value: { action: "acknowledge", acknowledgedDate: parsed.value, channel: body.channel,
        contactName: body.contactName.trim(), reference: (body.reference || "").trim(), note: (body.note || "").trim() } };
};

const attachmentMetadata = (doc) => ({ _id: doc._id, kind: doc.kind, filename: doc.filename,
    contentType: doc.contentType, size: doc.size, uploadedAt: doc.uploadedAt, uploadedByName: doc.uploadedByName,
    withdrawnAt: doc.withdrawnAt, withdrawnByName: doc.withdrawnByName, withdrawalReason: doc.withdrawalReason });

module.exports = { MAX_FILE_BYTES, MIME_TYPES, CHANNELS, cleanField, parsePaymentFile, parseAcknowledgement, attachmentMetadata };
