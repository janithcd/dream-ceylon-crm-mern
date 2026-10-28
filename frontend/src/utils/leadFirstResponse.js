export const buildLeadFirstResponse = (inquiry) => {
    const name = String(inquiry.fullName || "").trim().replace(/\s+/g, " ").slice(0, 80) || "there";
    return {
        number: String(inquiry.whatsappNumber || "").trim(),
        email: String(inquiry.email || "").trim(),
        subject: "Your Sri Lanka travel inquiry",
        message: `Hello ${name},\n\nThank you for sharing your Sri Lanka travel plans with Dream Ceylon Journeys. We are reviewing your request and would be happy to help you plan your journey. Please let us know if you have any questions in the meantime.\n\nKind regards,\nDream Ceylon Journeys`,
    };
};
