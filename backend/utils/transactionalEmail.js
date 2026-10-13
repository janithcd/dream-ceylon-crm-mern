const isConfigured = () =>
    ["ZOHO_CPaaS_API_KEY", "ZOHO_CPaaS_FROM"]
        .every((name) => Boolean(process.env[name]?.trim()));

const sendPasswordResetCode = async ({ to, code }) => {
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
            from: { address: process.env.ZOHO_CPaaS_FROM, name: "Dream Ceylon CRM" },
            to: [{ email_address: { address: to } }],
            subject: "Dream Ceylon CRM password reset code",
            textbody: `Your Dream Ceylon CRM password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        throw new Error(`Zoho transactional email returned HTTP ${response.status}.`);
    }
};

module.exports = { isConfigured, sendPasswordResetCode };
