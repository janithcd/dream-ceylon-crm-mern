const mongoose = require("mongoose");

const ChatConversation = require(
    "../models/ChatConversation"
);

const {
    createActivityLog,
} = require(
    "../utils/createActivityLog"
);

const VALID_STATUSES = [
    "Active",
    "Inquiry Created",
    "Human Handover",
    "Closed",
    "Abandoned",
];

function safeText(
    value,
    maximumLength = 500
) {
    return String(value ?? "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, maximumLength);
}

function escapeRegex(value) {
    return safeText(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

function buildRegex(value) {
    return {
        $regex: escapeRegex(value),
        $options: "i",
    };
}

function parsePositiveInteger(
    value,
    fallback
) {
    const parsed =
        Number.parseInt(
            value,
            10
        );

    if (
        !Number.isFinite(parsed) ||
        parsed < 1
    ) {
        return fallback;
    }

    return parsed;
}

function parseBooleanQuery(value) {
    if (
        value === true ||
        value === "true"
    ) {
        return true;
    }

    if (
        value === false ||
        value === "false"
    ) {
        return false;
    }

    return null;
}

function parseDate(value) {
    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

function getRetentionDays(status) {
    const environmentValue =
        status ===
        "Inquiry Created"
            ? process.env
                .CHAT_CONVERTED_RETENTION_DAYS
            : process.env
                .CHAT_CONVERSATION_RETENTION_DAYS;

    const fallback =
        status ===
        "Inquiry Created"
            ? 365
            : 90;

    const days =
        Number.parseInt(
            environmentValue,
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

function createExpiryDate(status) {
    const days =
        getRetentionDays(
            status
        );
    function normalizeWhatsAppNumber(
        value
    ) {
        let digits =
            safeText(
                value,
                50
            ).replace(/\D/g, "");

        /*
         * Convert international prefix
         * 0044... into 44...
         */
        if (
            digits.startsWith(
                "00"
            )
        ) {
            digits =
                digits.slice(2);
        }

        /*
         * A number beginning with zero
         * normally lacks its country code.
         */
        if (
            digits.startsWith(
                "0"
            )
        ) {
            return null;
        }

        if (
            !/^\d{8,15}$/.test(
                digits
            )
        ) {
            return null;
        }

        return digits;
    }

    function buildTravellerRequestSummary(
        messages = []
    ) {
        if (
            !Array.isArray(
                messages
            )
        ) {
            return "";
        }

        const userMessages =
            messages
                .filter(
                    (message) =>
                        message.role ===
                        "user" &&
                        !message.blocked &&
                        safeText(
                            message.content,
                            1000
                        )
                )
                .slice(-4)
                .map(
                    (
                        message,
                        index
                    ) => {
                        const content =
                            safeText(
                                message.content,
                                350
                            );

                        return `${index + 1}. ${content}`;
                    }
                );

        return userMessages.join(
            "\n"
        );
    }

    function buildDefaultHandoverMessage(
        conversation
    ) {
        const visitorName =
            safeText(
                conversation
                    ?.visitor
                    ?.fullName,
                120
            ) ||
            "Traveller";

        const requestSummary =
            buildTravellerRequestSummary(
                conversation?.messages
            );

        const summarySection =
            requestSummary ||
            "The traveller requested assistance with planning a Sri Lanka journey.";

        return [
            `Hello ${visitorName},`,
            "",
            "Thank you for contacting Dream Ceylon Journeys.",
            "",
            "I am a travel consultant from our team, and I am following up on your conversation with our Sri Lanka AI Travel Assistant.",
            "",
            "Your recent travel requests:",
            summarySection,
            "",
            `Conversation reference: ${conversation.sessionId}`,
            "",
            "We can now personally assist you with the route, travel dates, hotels, activities, private transport and final pricing.",
            "",
            "Please share any additional preferences, and we will prepare a suitable travel plan for you.",
            "",
            "Kind regards,",
            "Dream Ceylon Journeys",
        ].join("\n");
    }
    return new Date(
        Date.now() +
        days *
        24 *
        60 *
        60 *
        1000
    );
}

function buildConversationQuery(
    queryParameters
) {
    const query = {};

    const keyword =
        safeText(
            queryParameters.keyword,
            150
        );

    const status =
        safeText(
            queryParameters.status,
            50
        );

    const linked =
        parseBooleanQuery(
            queryParameters.linked
        );

    const dateFrom =
        parseDate(
            queryParameters.dateFrom
        );

    const dateTo =
        parseDate(
            queryParameters.dateTo
        );

    if (keyword) {
        const keywordRegex =
            buildRegex(keyword);

        query.$or = [
            {
                sessionId:
                keywordRegex,
            },
            {
                "visitor.fullName":
                keywordRegex,
            },
            {
                "visitor.email":
                keywordRegex,
            },
            {
                "visitor.whatsappNumber":
                keywordRegex,
            },
            {
                "visitor.country":
                keywordRegex,
            },
        ];
    }

    if (
        status &&
        VALID_STATUSES.includes(
            status
        )
    ) {
        query.status =
            status;
    }

    if (linked === true) {
        query.linkedInquiry = {
            $ne: null,
        };
    }

    if (linked === false) {
        query.linkedInquiry =
            null;
    }

    if (dateFrom || dateTo) {
        query.lastActivityAt =
            {};

        if (dateFrom) {
            query.lastActivityAt.$gte =
                dateFrom;
        }

        if (dateTo) {
            const inclusiveEndDate =
                new Date(dateTo);

            inclusiveEndDate.setHours(
                23,
                59,
                59,
                999
            );

            query.lastActivityAt.$lte =
                inclusiveEndDate;
        }
    }

    return query;
}

function buildConversationLookup(
    value
) {
    const identifier =
        safeText(value, 80);

    if (
        mongoose.Types.ObjectId.isValid(
            identifier
        )
    ) {
        return {
            $or: [
                {
                    _id:
                    identifier,
                },
                {
                    sessionId:
                    identifier,
                },
            ],
        };
    }

    return {
        sessionId:
        identifier,
    };
}

function populateLinkedInquiry(
    query
) {
    return query.populate(
        "linkedInquiry",
        [
            "fullName",
            "email",
            "whatsappNumber",
            "country",
            "status",
            "priority",
            "source",
            "travelDate",
            "numberOfTravelers",
            "createdAt",
        ].join(" ")
    );
}

function getAdminRole(req) {
    return (
        req.user?.role?.name ||
        req.user?.role ||
        ""
    );
}

async function writeActivityLog(
    data
) {
    try {
        await createActivityLog(
            data
        );
    } catch (error) {
        console.warn(
            "[Chat Conversation Activity Log]",
            error.message
        );
    }
}

// @desc    Get chat conversations
// @route   GET /api/chat-conversations
// @access  Private
const getChatConversations =
    async (req, res) => {
        try {
            const page =
                parsePositiveInteger(
                    req.query.page,
                    1
                );

            const limit =
                Math.min(
                    parsePositiveInteger(
                        req.query.limit,
                        10
                    ),
                    100
                );

            const skip =
                (page - 1) *
                limit;

            const query =
                buildConversationQuery(
                    req.query
                );

            const [
                conversations,
                totalConversations,
                activeCount,
                inquiryCreatedCount,
                humanHandoverCount,
                closedCount,
                abandonedCount,
            ] =
                await Promise.all([
                    populateLinkedInquiry(
                        ChatConversation.find(
                            query
                        )
                            .select(
                                [
                                    "sessionId",
                                    "source",
                                    "status",
                                    "visitor",
                                    "messageCount",
                                    "linkedInquiry",
                                    "startedAt",
                                    "lastActivityAt",
                                    "expiresAt",
                                    "createdAt",
                                    "updatedAt",
                                ].join(
                                    " "
                                )
                            )
                            .sort({
                                lastActivityAt:
                                    -1,
                            })
                            .skip(
                                skip
                            )
                            .limit(
                                limit
                            )
                            .lean()
                    ),

                    ChatConversation.countDocuments(
                        query
                    ),

                    ChatConversation.countDocuments(
                        {
                            status:
                                "Active",
                        }
                    ),

                    ChatConversation.countDocuments(
                        {
                            status:
                                "Inquiry Created",
                        }
                    ),

                    ChatConversation.countDocuments(
                        {
                            status:
                                "Human Handover",
                        }
                    ),

                    ChatConversation.countDocuments(
                        {
                            status:
                                "Closed",
                        }
                    ),

                    ChatConversation.countDocuments(
                        {
                            status:
                                "Abandoned",
                        }
                    ),
                ]);

            return res
                .status(200)
                .json({
                    conversations,

                    currentPage:
                    page,

                    totalPages:
                        Math.max(
                            Math.ceil(
                                totalConversations /
                                limit
                            ),
                            1
                        ),

                    totalConversations,

                    limit,

                    summary: {
                        active:
                        activeCount,

                        inquiryCreated:
                        inquiryCreatedCount,

                        humanHandover:
                        humanHandoverCount,

                        closed:
                        closedCount,

                        abandoned:
                        abandonedCount,
                    },
                });
        } catch (error) {
            console.error(
                "[Get Chat Conversations]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to load AI chat conversations.",

                    error:
                    error.message,
                });
        }
    };

// @desc    Get one chat conversation
// @route   GET /api/chat-conversations/:id
// @access  Private
const getChatConversationById =
    async (req, res) => {
        try {
            const conversation =
                await populateLinkedInquiry(
                    ChatConversation.findOne(
                        buildConversationLookup(
                            req.params.id
                        )
                    )
                ).lean();

            if (!conversation) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Chat conversation not found.",
                    });
            }

            return res
                .status(200)
                .json({
                    conversation,
                });
        } catch (error) {
            console.error(
                "[Get Chat Conversation]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to load the AI chat conversation.",

                    error:
                    error.message,
                });
        }
    };

// @desc    Update conversation status
// @route   PATCH /api/chat-conversations/:id/status
// @access  Private
const updateChatConversationStatus =
    async (req, res) => {
        try {
            const status =
                safeText(
                    req.body?.status,
                    50
                );

            if (
                !VALID_STATUSES.includes(
                    status
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "Invalid conversation status.",

                        validStatuses:
                        VALID_STATUSES,
                    });
            }

            const conversation =
                await ChatConversation.findOne(
                    buildConversationLookup(
                        req.params.id
                    )
                );

            if (!conversation) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Chat conversation not found.",
                    });
            }

            if (
                status ===
                "Inquiry Created" &&
                !conversation.linkedInquiry
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "A conversation can only be marked as Inquiry Created after it has been linked to an inquiry.",
                    });
            }

            const previousStatus =
                conversation.status;

            conversation.status =
                status;

            conversation.lastActivityAt =
                new Date();

            conversation.expiresAt =
                createExpiryDate(
                    status
                );

            await conversation.save();

            await writeActivityLog(
                {
                    req,

                    action:
                        "UPDATE",

                    module:
                        "AI Chat Conversation",

                    description:
                        `AI chat conversation status changed from ${previousStatus} to ${status}`,

                    relatedRecordId:
                    conversation._id,

                    relatedModel:
                        "ChatConversation",

                    referenceNo:
                    conversation.sessionId,

                    customerName:
                        conversation.visitor
                            ?.fullName ||
                        "Website visitor",

                    metadata: {
                        previousStatus,
                        newStatus:
                        status,

                        linkedInquiry:
                        conversation.linkedInquiry,

                        updatedByRole:
                            getAdminRole(
                                req
                            ),
                    },
                }
            );

            const updatedConversation =
                await populateLinkedInquiry(
                    ChatConversation.findById(
                        conversation._id
                    )
                ).lean();

            return res
                .status(200)
                .json({
                    message:
                        "Conversation status updated successfully.",

                    conversation:
                    updatedConversation,
                });
        } catch (error) {
            console.error(
                "[Update Chat Conversation Status]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to update the conversation status.",

                    error:
                    error.message,
                });
        }
    };
// @desc    Prepare a WhatsApp human handover
// @route   POST /api/chat-conversations/:id/handover
// @access  Private
const prepareWhatsAppHandover =
    async (req, res) => {
        try {
            const conversation =
                await ChatConversation.findOne(
                    buildConversationLookup(
                        req.params.id
                    )
                );

            if (!conversation) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Chat conversation not found.",
                    });
            }

            const whatsappNumber =
                normalizeWhatsAppNumber(
                    conversation
                        .visitor
                        ?.whatsappNumber
                );

            if (
                !whatsappNumber
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "A valid international WhatsApp number is required. Include the country code and remove the first local zero.",
                    });
            }

            const customMessage =
                safeText(
                    req.body
                        ?.message,
                    3000
                );

            const handoverMessage =
                customMessage ||
                buildDefaultHandoverMessage(
                    conversation
                );

            const previousStatus =
                conversation.status;

            conversation.status =
                "Human Handover";

            conversation.lastActivityAt =
                new Date();

            conversation.expiresAt =
                createExpiryDate(
                    "Human Handover"
                );

            await conversation.save();

            await writeActivityLog(
                {
                    req,

                    action:
                        "UPDATE",

                    module:
                        "AI Chat Conversation",

                    description:
                        `WhatsApp human handover was prepared for ${conversation.sessionId}`,

                    relatedRecordId:
                    conversation._id,

                    relatedModel:
                        "ChatConversation",

                    referenceNo:
                    conversation.sessionId,

                    customerName:
                        conversation
                            .visitor
                            ?.fullName ||
                        "Website visitor",

                    metadata: {
                        previousStatus,

                        newStatus:
                            "Human Handover",

                        whatsappNumber,

                        messageLength:
                        handoverMessage.length,

                        linkedInquiry:
                        conversation.linkedInquiry,

                        preparedByRole:
                            getAdminRole(
                                req
                            ),
                    },
                }
            );

            const updatedConversation =
                await populateLinkedInquiry(
                    ChatConversation.findById(
                        conversation._id
                    )
                ).lean();

            const whatsappUrl =
                `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                    handoverMessage
                )}`;

            return res
                .status(200)
                .json({
                    message:
                        "WhatsApp human handover prepared successfully.",

                    whatsappNumber,

                    handoverMessage,

                    whatsappUrl,

                    conversation:
                    updatedConversation,
                });
        } catch (error) {
            console.error(
                "[Prepare WhatsApp Handover]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to prepare the WhatsApp human handover.",

                    error:
                    error.message,
                });
        }
    };
// @desc    Delete a chat conversation
// @route   DELETE /api/chat-conversations/:id
// @access  Private
const deleteChatConversation =
    async (req, res) => {
        try {
            const conversation =
                await ChatConversation.findOne(
                    buildConversationLookup(
                        req.params.id
                    )
                );

            if (!conversation) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Chat conversation not found.",
                    });
            }

            const deletedDetails =
                {
                    id:
                    conversation._id,

                    sessionId:
                    conversation.sessionId,

                    status:
                    conversation.status,

                    visitorName:
                        conversation.visitor
                            ?.fullName ||
                        "Website visitor",

                    messageCount:
                    conversation.messageCount,

                    linkedInquiry:
                    conversation.linkedInquiry,
                };

            await conversation.deleteOne();

            await writeActivityLog(
                {
                    req,

                    action:
                        "DELETE",

                    module:
                        "AI Chat Conversation",

                    description:
                        `AI chat conversation ${deletedDetails.sessionId} was deleted`,

                    relatedRecordId:
                    deletedDetails.id,

                    relatedModel:
                        "ChatConversation",

                    referenceNo:
                    deletedDetails.sessionId,

                    customerName:
                    deletedDetails.visitorName,

                    metadata: {
                        status:
                        deletedDetails.status,

                        messageCount:
                        deletedDetails.messageCount,

                        linkedInquiry:
                        deletedDetails.linkedInquiry,

                        deletedByRole:
                            getAdminRole(
                                req
                            ),
                    },
                }
            );

            return res
                .status(200)
                .json({
                    message:
                        "Chat conversation deleted successfully.",
                });
        } catch (error) {
            console.error(
                "[Delete Chat Conversation]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to delete the chat conversation.",

                    error:
                    error.message,
                });
        }
    };

module.exports = {
    getChatConversations,
    getChatConversationById,
    updateChatConversationStatus,
    prepareWhatsAppHandover,
    deleteChatConversation,
};