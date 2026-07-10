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

// @desc    Generate AI client reply
// @route   POST /api/ai/client-reply
// @access  Private
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
            usage: response.usage || null,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate AI reply",
            error: error.message,
        });
    }
};

// @desc    Generate AI itinerary
// @route   POST /api/ai/itinerary
// @access  Private
const generateItinerary = async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                message: "OpenAI API key is not configured in backend .env",
            });
        }

        const {
            clientName,
            country,
            travelers,
            durationDays,
            interests,
            preferredDestinations,
            travelStyle,
            budgetLevel,
            vehicleType,
            arrivalCity,
            endingPreference,
            language,
        } = req.body;

        if (!durationDays || !interests) {
            return res.status(400).json({
                message: "Please provide duration days and interests",
            });
        }

        const client = await getOpenAIClient();

        const prompt = `
You are a senior Sri Lanka tour planner for Dream Ceylon Journeys, a Sri Lankan DMC.

Create a realistic day-by-day Sri Lanka itinerary using the details below.

Client name: ${clientName || "Client"}
Country: ${country || "Not provided"}
Travelers: ${travelers || "Not provided"}
Duration: ${durationDays} days
Interests: ${interests}
Preferred destinations: ${preferredDestinations || "Not provided"}
Travel style: ${travelStyle || "Comfortable private tour"}
Budget level: ${budgetLevel || "Mid-range"}
Vehicle type: ${vehicleType || "Private vehicle"}
Arrival city/airport: ${arrivalCity || "Colombo / Bandaranaike International Airport"}
Ending preference: ${endingPreference || "Beach relaxation or Colombo depending on route"}
Language: ${language || "English"}

Rules:
- Make the itinerary realistic for driving distances in Sri Lanka.
- Do not include too many destinations in one day.
- Include culture, wildlife, hill country, beaches, food, train ride, or activities only if relevant to the client's interests.
- Mention that hotels, entrance fees, and activities can be customized separately.
- Use clear day-by-day formatting.
- Include a short intro and a short note at the end.
- Do not add exact hotel names unless asked.
- Do not overpromise wildlife sightings.
- Keep it professional and useful for sending to a client.
`;

        const response = await client.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-5.2",
            input: prompt,
        });

        res.status(200).json({
            itinerary: response.output_text,
            usage: response.usage || null,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate AI itinerary",
            error: error.message,
        });
    }
};

module.exports = {
    generateClientReply,
    generateItinerary,
};