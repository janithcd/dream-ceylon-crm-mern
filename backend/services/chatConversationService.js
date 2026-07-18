const crypto = require("crypto");

const ChatConversation = require(
    "../models/ChatConversation"
);

const SESSION_ID_PATTERN =
    /^dcj_[a-f0-9]{32}$/i;

function cleanText(
    value,
    maximumLength = 5000
) {
    return String(value ?? "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, maximumLength);
}

function normalizeSessionId(
    value
) {
    const sessionId =
        cleanText(value, 50);

    return SESSION_ID_PATTERN.test(
        sessionId
    )
        ? sessionId
        : null;
}

function createSessionId() {
    return (
        "dcj_" +
        crypto
            .randomBytes(16)
            .toString("hex")
    );
}

function getConfiguredDays(
    value,
    fallback
) {
    const days =
        Number.parseInt(
            value,
            10
        );

    if (
        !Number.isFinite(days) ||
        days < 1
    ) {
        return fallback;
    }

    return days;
}

function createExpiryDate(
    status = "Active"
) {
    const isConverted =
        status ===
        "Inquiry Created";

    const days = isConverted
        ? getConfiguredDays(
            process.env
                .CHAT_CONVERTED_RETENTION_DAYS,
            365
        )
        : getConfiguredDays(
            process.env
                .CHAT_CONVERSATION_RETENTION_DAYS,
            90
        );

    return new Date(
        Date.now() +
        days *
        24 *
        60 *
        60 *
        1000
    );
}

async function createConversation() {
    for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
    ) {
        try {
            return await ChatConversation.create(
                {
                    sessionId:
                        createSessionId(),

                    status: "Active",

                    expiresAt:
                        createExpiryDate(
                            "Active"
                        ),
                }
            );
        } catch (error) {
            if (
                error?.code !==
                11000
            ) {
                throw error;
            }
        }
    }

    throw new Error(
        "Unable to create a unique chat session."
    );
}

async function getOrCreateConversation(
    sessionId
) {
    const normalizedSessionId =
        normalizeSessionId(
            sessionId
        );

    if (normalizedSessionId) {
        const existingConversation =
            await ChatConversation.findOne(
                {
                    sessionId:
                    normalizedSessionId,
                }
            );

        if (
            existingConversation
        ) {
            return existingConversation;
        }
    }

    return createConversation();
}

function getConversationHistory(
    conversation,
    maximumMessages = 8
) {
    if (
        !conversation ||
        !Array.isArray(
            conversation.messages
        )
    ) {
        return [];
    }

    return conversation.messages
        .filter(
            (message) =>
                !message.blocked &&
                (
                    message.role ===
                    "user" ||
                    message.role ===
                    "assistant"
                )
        )
        .slice(-maximumMessages)
        .map((message) => ({
            role:
            message.role,

            content:
                cleanText(
                    message.content,
                    1200
                ),
        }));
}

async function saveChatExchange({
                                    sessionId,
                                    userContent,
                                    assistantContent,
                                    blocked = false,
                                }) {
    const conversation =
        await getOrCreateConversation(
            sessionId
        );

    const safeUserContent =
        blocked
            ? "A visitor message was blocked by safety moderation."
            : cleanText(
                userContent,
                1500
            );

    const safeAssistantContent =
        cleanText(
            assistantContent,
            5000
        );

    const newMessages = [];

    if (safeUserContent) {
        newMessages.push({
            role: "user",
            content:
            safeUserContent,
            blocked:
                Boolean(blocked),
            createdAt:
                new Date(),
        });
    }

    if (
        safeAssistantContent
    ) {
        newMessages.push({
            role: "assistant",
            content:
            safeAssistantContent,
            blocked: false,
            createdAt:
                new Date(),
        });
    }

    const now = new Date();

    const updatedConversation =
        await ChatConversation.findByIdAndUpdate(
            conversation._id,
            {
                $push: {
                    messages: {
                        $each:
                        newMessages,
                    },
                },

                $inc: {
                    messageCount:
                    newMessages.length,
                },

                $set: {
                    lastActivityAt:
                    now,

                    expiresAt:
                        createExpiryDate(
                            conversation.status
                        ),
                },
            },
            {
                new: true,
            }
        );

    return updatedConversation;
}

async function getPublicConversation(
    sessionId
) {
    const normalizedSessionId =
        normalizeSessionId(
            sessionId
        );

    if (!normalizedSessionId) {
        return null;
    }

    const conversation =
        await ChatConversation.findOne(
            {
                sessionId:
                normalizedSessionId,
            }
        ).lean();

    if (!conversation) {
        return null;
    }

    return {
        conversationId:
        conversation.sessionId,

        status:
        conversation.status,

        messageCount:
        conversation.messageCount,

        messages:
            conversation.messages.map(
                (
                    message,
                    index
                ) => ({
                    id:
                        `${conversation.sessionId}-${index}-${new Date(
                            message.createdAt
                        ).getTime()}`,

                    role:
                    message.role,

                    content:
                    message.content,

                    blocked:
                        Boolean(
                            message.blocked
                        ),

                    createdAt:
                    message.createdAt,
                })
            ),

        startedAt:
        conversation.startedAt,

        lastActivityAt:
        conversation.lastActivityAt,
    };
}

async function linkConversationToInquiry({
                                             sessionId,
                                             inquiryId,
                                             visitor,
                                         }) {
    const normalizedSessionId =
        normalizeSessionId(
            sessionId
        );

    if (
        !normalizedSessionId ||
        !inquiryId
    ) {
        return null;
    }

    return ChatConversation.findOneAndUpdate(
        {
            sessionId:
            normalizedSessionId,
        },
        {
            $set: {
                status:
                    "Inquiry Created",

                linkedInquiry:
                inquiryId,

                visitor: {
                    fullName:
                        cleanText(
                            visitor?.fullName,
                            120
                        ),

                    email:
                        cleanText(
                            visitor?.email,
                            160
                        ).toLowerCase(),

                    whatsappNumber:
                        cleanText(
                            visitor
                                ?.whatsappNumber,
                            40
                        ),

                    country:
                        cleanText(
                            visitor?.country,
                            100
                        ),
                },

                lastActivityAt:
                    new Date(),

                expiresAt:
                    createExpiryDate(
                        "Inquiry Created"
                    ),
            },
        },
        {
            new: true,
        }
    );
}

module.exports = {
    getOrCreateConversation,
    getConversationHistory,
    saveChatExchange,
    getPublicConversation,
    linkConversationToInquiry,
};