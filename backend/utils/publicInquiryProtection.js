const { createHash } = require("node:crypto");

const PUBLIC_INQUIRY_CONFIRMATION = "Thank you. Your inquiry has been submitted successfully.";
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_FIELD_LIMITS = Object.freeze({
    fullName: 120,
    email: 254,
    whatsappNumber: 40,
    country: 120,
    message: 5000,
});

const acknowledgeWithoutRecord = (res) => res.status(200).json({
    message: PUBLIC_INQUIRY_CONFIRMATION,
    inquiry: null,
    chatConversationLinked: false,
});

const validatePublicInquiry = (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ message: "Please check the inquiry details." });
    }

    // The website adds this visually hidden field. Real visitors leave it empty.
    if (body.websiteUrl !== undefined &&
        (typeof body.websiteUrl !== "string" || body.websiteUrl.trim())) {
        return acknowledgeWithoutRecord(res);
    }

    for (const [field, limit] of Object.entries(PUBLIC_FIELD_LIMITS)) {
        if (body[field] !== undefined &&
            (typeof body[field] !== "string" || body[field].trim().length > limit)) {
            return res.status(400).json({ message: `Please check ${field} (maximum ${limit} characters).` });
        }
    }

    return next();
};

const normalize = (value) => String(value ?? "").trim().replace(/\s+/gu, " ").toLowerCase();

const publicInquiryFingerprint = (payload) => createHash("sha256")
    .update(JSON.stringify([
        normalize(payload.fullName), normalize(payload.email),
        normalize(payload.whatsappNumber), normalize(payload.country),
        normalize(payload.message), normalize(payload.travelDate),
        payload.numberOfTravelers, String(payload.interestedPackage || ""),
    ]))
    .digest("hex");

module.exports = {
    PUBLIC_INQUIRY_CONFIRMATION,
    DUPLICATE_WINDOW_MS,
    acknowledgeWithoutRecord,
    validatePublicInquiry,
    publicInquiryFingerprint,
};
