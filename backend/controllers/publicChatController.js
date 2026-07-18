const {
    generateTravelAssistantReply,
} = require(
    "../services/travelAssistantService"
);

const {
    getOrCreateConversation,
    getConversationHistory,
    saveChatExchange,
    getPublicConversation,
} = require(
    "../services/chatConversationService"
);

const requestBuckets =
    new Map();

function getRateLimitConfig() {
    const maximumRequests =
        Number.parseInt(
            process.env
                .TRAVEL_ASSISTANT_RATE_LIMIT,
            10
        );

    const windowMinutes =
        Number.parseInt(
            process.env
                .TRAVEL_ASSISTANT_RATE_WINDOW_MINUTES,
            10
        );

    return {
        maximumRequests:
            Number.isFinite(
                maximumRequests
            ) &&
            maximumRequests > 0
                ? maximumRequests
                : 12,

        windowMilliseconds:
            (
                Number.isFinite(
                    windowMinutes
                ) &&
                windowMinutes > 0
                    ? windowMinutes
                    : 10
            ) *
            60 *
            1000,
    };
}

function getClientIdentifier(req) {
    const forwardedFor =
        req.headers[
            "x-forwarded-for"
            ];

    if (
        typeof forwardedFor ===
        "string"
    ) {
        return forwardedFor
            .split(",")[0]
            .trim();
    }

    return (
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
    );
}

function checkRateLimit(req) {
    const {
        maximumRequests,
        windowMilliseconds,
    } = getRateLimitConfig();

    const identifier =
        getClientIdentifier(req);

    const now = Date.now();

    const existingBucket =
        requestBuckets.get(
            identifier
        );

    if (
        !existingBucket ||
        now >=
        existingBucket.resetAt
    ) {
        const newBucket = {
            count: 1,

            resetAt:
                now +
                windowMilliseconds,
        };

        requestBuckets.set(
            identifier,
            newBucket
        );

        return {
            allowed: true,

            remaining:
                maximumRequests -
                1,

            resetAt:
            newBucket.resetAt,
        };
    }

    if (
        existingBucket.count >=
        maximumRequests
    ) {
        return {
            allowed: false,

            remaining: 0,

            resetAt:
            existingBucket
                .resetAt,
        };
    }

    existingBucket.count += 1;

    return {
        allowed: true,

        remaining:
            Math.max(
                maximumRequests -
                existingBucket.count,
                0
            ),

        resetAt:
        existingBucket
            .resetAt,
    };
}

function cleanMessage(
    value,
    maximumLength
) {
    return String(value ?? "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, maximumLength);
}

const chatWithTravelAssistant =
    async (req, res) => {
        const rateLimit =
            checkRateLimit(req);

        res.set(
            "X-RateLimit-Remaining",
            String(
                rateLimit.remaining
            )
        );

        res.set(
            "X-RateLimit-Reset",
            String(
                Math.ceil(
                    rateLimit.resetAt /
                    1000
                )
            )
        );

        if (!rateLimit.allowed) {
            return res
                .status(429)
                .json({
                    success: false,

                    message:
                        "You have sent several messages in a short period. Please wait a few minutes before trying again.",
                });
        }

        try {
            const message =
                cleanMessage(
                    req.body?.message,
                    1500
                );

            if (!message) {
                return res
                    .status(400)
                    .json({
                        success: false,

                        message:
                            "Please enter a message.",
                    });
            }

            const conversation =
                await getOrCreateConversation(
                    req.body
                        ?.conversationId
                );

            const storedHistory =
                getConversationHistory(
                    conversation,
                    8
                );

            const fallbackHistory =
                Array.isArray(
                    req.body?.history
                )
                    ? req.body.history
                    : [];

            const result =
                await generateTravelAssistantReply(
                    {
                        message,

                        history:
                            storedHistory
                                .length > 0
                                ? storedHistory
                                : fallbackHistory,
                    }
                );

            const savedConversation =
                await saveChatExchange(
                    {
                        sessionId:
                        conversation
                            .sessionId,

                        userContent:
                        message,

                        assistantContent:
                        result.reply,

                        blocked:
                        result.blocked,
                    }
                );

            return res
                .status(200)
                .json({
                    success: true,

                    conversationId:
                    savedConversation
                        .sessionId,

                    reply:
                    result.reply,

                    blocked:
                    result.blocked,

                    suggestedActions: [
                        {
                            id:
                                "create-inquiry",

                            label:
                                "Send this plan to our team",

                            type:
                                "internal",

                            value:
                                "create-inquiry",
                        },
                        {
                            id:
                                "plan-tour",

                            label:
                                "Open full inquiry form",

                            type:
                                "anchor",

                            value:
                                "#plan-your-tour",
                        },
                        {
                            id:
                                "whatsapp",

                            label:
                                "Chat on WhatsApp",

                            type:
                                "external",

                            value:
                                "https://wa.me/94775124645",
                        },
                    ],
                });
        } catch (error) {
            console.error(
                "[Public Travel Assistant]",
                {
                    message:
                    error.message,

                    status:
                    error.status,

                    code:
                    error.code,

                    type:
                    error.type,
                }
            );

            if (
                error.status === 429 ||
                error.code ===
                "rate_limit_exceeded"
            ) {
                return res
                    .status(503)
                    .json({
                        success: false,

                        message:
                            "The travel assistant is temporarily busy. Please try again shortly or contact us on WhatsApp.",
                    });
            }

            if (
                error.status === 401
            ) {
                return res
                    .status(503)
                    .json({
                        success: false,

                        message:
                            "The travel assistant is temporarily unavailable.",
                    });
            }

            return res
                .status(
                    error.statusCode ||
                    500
                )
                .json({
                    success: false,

                    message:
                        error.statusCode ===
                        400
                            ? error.message
                            : "The travel assistant is temporarily unavailable. Please try again or contact our team on WhatsApp.",
                });
        }
    };

const getSavedConversation =
    async (req, res) => {
        try {
            const conversation =
                await getPublicConversation(
                    req.params
                        .conversationId
                );

            if (!conversation) {
                return res
                    .status(404)
                    .json({
                        success: false,

                        message:
                            "Conversation not found.",
                    });
            }

            return res
                .status(200)
                .json({
                    success: true,

                    ...conversation,
                });
        } catch (error) {
            console.error(
                "[Get Chat Conversation]",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        "Failed to load the conversation.",
                });
        }
    };

const getTravelAssistantHealth =
    async (req, res) => {
        return res
            .status(200)
            .json({
                success: true,

                service:
                    "Dream Ceylon Travel Assistant",

                configured:
                    Boolean(
                        process.env
                            .OPENAI_API_KEY &&
                        (
                            process.env
                                .OPENAI_TRAVEL_ASSISTANT_MODEL ||
                            process.env
                                .OPENAI_MODEL
                        )
                    ),

                conversationStorage:
                    true,

                timestamp:
                    new Date()
                        .toISOString(),
            });
    };

module.exports = {
    chatWithTravelAssistant,
    getSavedConversation,
    getTravelAssistantHealth,
};