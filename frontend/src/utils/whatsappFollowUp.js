const looksLikePhoneNumber = (value) => {
    const text = String(value || "").trim();
    return /^\+?[\d\s().-]+$/.test(text) && text.replace(/\D/g, "").length >= 7;
};

export const getWhatsAppContact = (followUp) => {
    const candidates = [
        followUp.customerContact,
        followUp.inquiry?.whatsappNumber,
        followUp.quotation?.inquiry?.whatsappNumber,
        followUp.booking?.customer?.whatsappNumber,
    ];

    return (
        candidates.find((candidate) => normalizeWhatsAppNumber(candidate))?.trim() ||
        candidates.find(looksLikePhoneNumber)?.trim() ||
        ""
    );
};

export const normalizeWhatsAppNumber = (value) => {
    if (!looksLikePhoneNumber(value)) {
        return "";
    }

    const digits = value.replace(/\D/g, "");
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
};

export const buildWhatsAppFollowUpMessage = (followUp) => {
    const name =
        followUp.customerName?.trim() ||
        followUp.inquiry?.fullName?.trim() ||
        followUp.quotation?.clientName?.trim() ||
        followUp.booking?.customer?.fullName?.trim() ||
        "there";
    const greeting = `Hello ${name}, this is Dream Ceylon Journeys.`;
    const bookingCode = followUp.booking?.bookingCode;
    const quotationNo = followUp.quotation?.quotationNo;

    if (followUp.type === "Payment") {
        return `${greeting} I am following up on the payment for your booking${bookingCode ? ` ${bookingCode}` : ""}. Please let us know if you need any help. Thank you!`;
    }

    if (quotationNo || followUp.type === "Quotation") {
        return `${greeting} I am following up on your quotation${quotationNo ? ` ${quotationNo}` : ""} for your Sri Lanka trip. Please let us know if you have any questions. Thank you!`;
    }

    if (bookingCode || followUp.type === "Booking") {
        return `${greeting} I am checking in about your booking${bookingCode ? ` ${bookingCode}` : ""}. Please let us know if you need any assistance. Thank you!`;
    }

    return `${greeting} I am following up on your Sri Lanka travel plans. Please let us know how we can help. Thank you!`;
};

export const buildWhatsAppUrl = (number, message) => {
    const digits = normalizeWhatsAppNumber(number);
    if (!digits || !message.trim()) {
        return "";
    }

    return `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`;
};
