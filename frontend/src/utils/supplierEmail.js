export const buildSupplierMailtoUrl = ({ recipient, subject, body }) => {
    const email = String(recipient || "").trim();
    const title = String(subject || "").trim();
    const message = String(body || "").trim();
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) || email.length > 254 ||
        !title || title.length > 160 || !message || message.length > 1800) return "";
    return `mailto:${email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
};
