let openaiClient = null;

const getOpenAIClient = async () => {
    if (openaiClient) {
        return openaiClient;
    }

    const { default: OpenAI } = await import("openai");

    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    return openaiClient;
};


const generateClientReply = async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                message: "OpenAI API key is not configured in backend .env",
            });
        }

        const {
            clientName,
            country,
            clientMessage,
            travelers,
            durationDays,
            interests,
            tone,
            channel,
            language,
        } = req.body;

        if (!clientMessage && !interests) {
            return res.status(400).json({
                message: "Please provide client message or client interests",
            });
        }

        const client = await getOpenAIClient();

        const prompt = `
You are a professional travel sales assistant for Dream Ceylon Journeys, a Sri Lankan DMC.

Write a client reply using the details below.

Client name: ${clientName || "Client"}
Country: ${country || "Not provided"}
Travelers: ${travelers || "Not provided"}
Tour duration: ${durationDays || "Not provided"} days
Client interests: ${interests || "Not provided"}
Preferred tone: ${tone || "Friendly and professional"}
Reply channel: ${channel || "WhatsApp"}
Reply language: ${language || "English"}

Client message:
${clientMessage || "No direct message provided"}

Rules:
- Be polite, warm, and professional.
- Mention Dream Ceylon Journeys naturally.
- Keep the reply suitable for ${channel || "WhatsApp"}.
- Do not overpromise hotel prices or entrance fees.
- Mention that the itinerary can be customized.
- End with a helpful next step.
- Do not use too many emojis.
`;

        const response = await client.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-5.2",
            input: prompt,
        });

        res.status(200).json({
            reply: response.output_text,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate AI reply",
            error: error.message,
        });
    }
};

module.exports = {
    generateClientReply,
};