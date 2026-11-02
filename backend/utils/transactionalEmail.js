const isConfigured = () =>
    ["ZOHO_CPaaS_API_KEY", "ZOHO_CPaaS_FROM"]
        .every((name) => Boolean(process.env[name]?.trim()));

// Keep provider diagnostics useful without writing addresses, codes, or API keys to logs.
const safeCode = (value) => typeof value === "string" && /^[A-Z]{1,10}_[0-9]{1,5}$/.test(value) ? value : null;
const safeRequestId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;

const sendEmail = async (message) => {
    if (!isConfigured()) {
        throw new Error("Zoho transactional email is not configured.");
    }

    const endpoint = new URL(process.env.ZOHO_CPaaS_API_URL || "https://cpaas.zoho.com/v1.1/email");
    if (endpoint.protocol !== "https:" || !/^cpaas\.zoho\.(com|in|eu|com\.au|jp|com\.cn)$/.test(endpoint.hostname) || endpoint.pathname !== "/v1.1/email") {
        throw new Error("Use the Zoho CPaaS email API URL for your data center.");
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Zoho-enczapikey ${process.env.ZOHO_CPaaS_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: { address: process.env.ZOHO_CPaaS_FROM, name: "Dream Ceylon Journeys" },
            ...message,
        }),
        signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => null);
    const recipientAccepted = Array.isArray(result?.data) && result.data.length === 1 &&
        result.data[0]?.message === "OK";
    if (!response.ok || result?.message !== "OK" || !recipientAccepted) {
        const providerData = Array.isArray(result?.data) ? result.data[0] : result?.data;
        const details = [`HTTP ${response.status}`];
        const errorCode = safeCode(providerData?.error_code);
        const subCode = safeCode(providerData?.sub_code);
        const requestId = safeRequestId(result?.request_id);
        if (errorCode) details.push(`code ${errorCode}`);
        if (subCode) details.push(`sub-code ${subCode}`);
        if (requestId) details.push(`request ID ${requestId}`);
        const error = new Error(`Zoho CPaaS email request failed (${details.join(", ")}).`);
        // A non-2xx response with a provider rejection is safe to retry after correction.
        error.definitivelyRejected = response.status >= 400 && response.status < 500;
        throw error;
    }
    return safeRequestId(result.request_id);
};

const sendPasswordResetCode = ({ to, code }) => sendEmail({
    to: [{ email_address: { address: to } }],
    subject: "Dream Ceylon CRM password reset code",
    textbody: `Your Dream Ceylon CRM password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
});

const sendClientPaymentDocuments = ({ to, subject, textbody, attachments }) => sendEmail({
    to: [{ email_address: { address: to } }], subject, textbody,
    attachments: attachments.map(({ name, bytes }) => ({
        name, mime_type: "application/pdf", content: bytes.toString("base64"),
    })),
});

module.exports = { isConfigured, sendPasswordResetCode, sendClientPaymentDocuments };
