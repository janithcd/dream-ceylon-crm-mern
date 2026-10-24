const Inquiry = require("../models/Inquiry");
const { WINDOWS, buildLeadInsightsPipeline, summarizeLeadInsights } = require("../utils/leadInsights");

const getLeadInsights = async (req, res) => {
    const window = req.query.window || "90";
    if (typeof window !== "string" || !WINDOWS.includes(window)) {
        return res.status(400).json({ message: "Choose a valid insights period." });
    }

    try {
        const [result] = await Inquiry.aggregate(buildLeadInsightsPipeline(window));
        return res.json({ window, ...summarizeLeadInsights(result) });
    } catch (error) {
        console.error("[Lead Insights]", error);
        return res.status(500).json({ message: "Failed to load lead insights." });
    }
};

module.exports = { getLeadInsights };
