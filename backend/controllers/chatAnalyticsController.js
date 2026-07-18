const ChatConversation = require("../models/ChatConversation");

const ALLOWED_RANGES = new Set([7, 30, 90, 180, 365]);

const TOPIC_DEFINITIONS = [
    {
        name: "Itinerary & Route Planning",
        patterns: [
            /\bitinerary\b/i,
            /\broute\b/i,
            /\btrip plan\b/i,
            /\btour plan\b/i,
            /\b\d+\s*day/i,
            /\bschedule\b/i,
        ],
    },
    {
        name: "Pricing & Budget",
        patterns: [
            /\bprice\b/i,
            /\bcost\b/i,
            /\bbudget\b/i,
            /\brate\b/i,
            /\bquote\b/i,
            /\bquotation\b/i,
            /\busd\b/i,
            /\bdollar\b/i,
        ],
    },
    {
        name: "Vehicles & Transport",
        patterns: [
            /\bcar\b/i,
            /\bvan\b/i,
            /\bsuv\b/i,
            /\bvehicle\b/i,
            /\bdriver\b/i,
            /\bchauffeur\b/i,
            /\btransfer\b/i,
            /\btransport\b/i,
            /\bairport pickup\b/i,
        ],
    },
    {
        name: "Destinations",
        patterns: [
            /\bsigiriya\b/i,
            /\bkandy\b/i,
            /\bella\b/i,
            /\byala\b/i,
            /\bmirissa\b/i,
            /\bgalle\b/i,
            /\bbentota\b/i,
            /\bcolombo\b/i,
            /\banuradhapura\b/i,
            /\bpolonnaruwa\b/i,
            /\bnuwara eliya\b/i,
            /\barugam bay\b/i,
        ],
    },
    {
        name: "Wildlife & Safari",
        patterns: [
            /\bsafari\b/i,
            /\bwildlife\b/i,
            /\belephant\b/i,
            /\bleopard\b/i,
            /\byala\b/i,
            /\budawalawe\b/i,
            /\bwilpattu\b/i,
            /\bnational park\b/i,
        ],
    },
    {
        name: "Hotels & Accommodation",
        patterns: [
            /\bhotel\b/i,
            /\baccommodation\b/i,
            /\bresort\b/i,
            /\bguesthouse\b/i,
            /\broom\b/i,
            /\bovernight\b/i,
        ],
    },
    {
        name: "Train & Travel Logistics",
        patterns: [
            /\btrain\b/i,
            /\brailway\b/i,
            /\btrain ticket\b/i,
            /\btravel time\b/i,
            /\bdrive time\b/i,
            /\bkandy to ella\b/i,
        ],
    },
    {
        name: "Beach Holidays",
        patterns: [
            /\bbeach\b/i,
            /\bcoast\b/i,
            /\bmirissa\b/i,
            /\bbentota\b/i,
            /\bunawatuna\b/i,
            /\barugam bay\b/i,
            /\bwhale watching\b/i,
        ],
    },
    {
        name: "Weather & Best Time",
        patterns: [
            /\bweather\b/i,
            /\bseason\b/i,
            /\bmonsoon\b/i,
            /\bbest time\b/i,
            /\bbest month\b/i,
            /\brain\b/i,
        ],
    },
    {
        name: "Visa & Safety",
        patterns: [
            /\bvisa\b/i,
            /\beta\b/i,
            /\bsafe\b/i,
            /\bsafety\b/i,
            /\bpassport\b/i,
            /\btravel advice\b/i,
        ],
    },
    {
        name: "B2B & Travel Agents",
        patterns: [
            /\bb2b\b/i,
            /\btravel agent\b/i,
            /\btravel agency\b/i,
            /\bpartner\b/i,
            /\bdmc\b/i,
            /\bcommission\b/i,
        ],
    },
];

const parseRangeDays = (value) => {
    const parsed = Number.parseInt(value, 10);

    return ALLOWED_RANGES.has(parsed)
        ? parsed
        : 30;
};

const roundNumber = (
    value,
    decimals = 1
) => {
    const multiplier =
        10 ** decimals;

    return (
        Math.round(
            (Number(value) || 0) *
            multiplier
        ) / multiplier
    );
};

const calculateRate = (
    part,
    total
) => {
    const numericTotal =
        Number(total) || 0;

    if (numericTotal < 1) {
        return 0;
    }

    return roundNumber(
        ((Number(part) || 0) /
            numericTotal) *
        100,
        1
    );
};

const calculateChange = (
    current,
    previous
) => {
    const currentValue =
        Number(current) || 0;

    const previousValue =
        Number(previous) || 0;

    if (
        previousValue === 0
    ) {
        return currentValue > 0
            ? 100
            : 0;
    }

    return roundNumber(
        ((currentValue -
                previousValue) /
            previousValue) *
        100,
        1
    );
};

const getDateKey = (
    value
) =>
    new Date(value)
        .toISOString()
        .slice(0, 10);

const buildEmptyDailyTrend = (
    startDate,
    days
) => {
    return Array.from(
        {
            length: days,
        },
        (_, index) => {
            const date =
                new Date(
                    startDate
                );

            date.setUTCDate(
                date.getUTCDate() +
                index
            );

            return {
                date:
                    getDateKey(
                        date
                    ),

                label:
                    date.toLocaleDateString(
                        "en-US",
                        {
                            month:
                                "short",

                            day:
                                "numeric",

                            timeZone:
                                "UTC",
                        }
                    ),

                conversations: 0,
                messages: 0,
            };
        }
    );
};

const buildTopicBreakdown = (
    conversations = []
) => {
    const topicCounts =
        new Map(
            TOPIC_DEFINITIONS.map(
                (topic) => [
                    topic.name,
                    0,
                ]
            )
        );

    let totalMatchedMentions =
        0;

    conversations.forEach(
        (conversation) => {
            const messages =
                Array.isArray(
                    conversation.messages
                )
                    ? conversation.messages
                    : [];

            messages
                .filter(
                    (message) =>
                        message.role ===
                        "user" &&
                        !message.blocked &&
                        typeof message.content ===
                        "string" &&
                        message.content.trim()
                )
                .forEach(
                    (message) => {
                        const content =
                            message.content.trim();

                        TOPIC_DEFINITIONS.forEach(
                            (
                                topic
                            ) => {
                                const matchesTopic =
                                    topic.patterns.some(
                                        (
                                            pattern
                                        ) =>
                                            pattern.test(
                                                content
                                            )
                                    );

                                if (
                                    !matchesTopic
                                ) {
                                    return;
                                }

                                topicCounts.set(
                                    topic.name,

                                    (
                                        topicCounts.get(
                                            topic.name
                                        ) ||
                                        0
                                    ) +
                                    1
                                );

                                totalMatchedMentions +=
                                    1;
                            }
                        );
                    }
                );
        }
    );

    return Array.from(
        topicCounts.entries()
    )
        .map(
            ([
                 topic,
                 count,
             ]) => ({
                topic,
                count,

                percentage:
                    calculateRate(
                        count,
                        totalMatchedMentions
                    ),
            })
        )
        .filter(
            (item) =>
                item.count > 0
        )
        .sort(
            (first, second) =>
                second.count -
                first.count
        )
        .slice(0, 8);
};

const buildMessageCountExpression =
    () => ({
        $size: {
            $ifNull: [
                "$messages",
                [],
            ],
        },
    });

// @desc    Get AI conversation analytics
// @route   GET /api/chat-conversations/analytics
// @access  Private
const getChatAnalytics =
    async (req, res) => {
        try {
            const days =
                parseRangeDays(
                    req.query.days
                );

            const now =
                new Date();

            const startDate =
                new Date(now);

            startDate.setUTCHours(
                0,
                0,
                0,
                0
            );

            startDate.setUTCDate(
                startDate.getUTCDate() -
                (days - 1)
            );

            const previousStartDate =
                new Date(
                    startDate
                );

            previousStartDate.setUTCDate(
                previousStartDate.getUTCDate() -
                days
            );

            const previousEndDate =
                new Date(
                    startDate.getTime() -
                    1
                );

            const currentMatch = {
                startedAt: {
                    $gte:
                    startDate,

                    $lte:
                    now,
                },
            };

            const previousMatch = {
                startedAt: {
                    $gte:
                    previousStartDate,

                    $lte:
                    previousEndDate,
                },
            };

            const [
                summaryResults,
                previousConversations,
                statusResults,
                countryResults,
                dailyResults,
                topicConversationRecords,
            ] =
                await Promise.all([
                    ChatConversation.aggregate(
                        [
                            {
                                $match:
                                currentMatch,
                            },

                            {
                                $group: {
                                    _id:
                                        null,

                                    totalConversations:
                                        {
                                            $sum:
                                                1,
                                        },

                                    linkedInquiries:
                                        {
                                            $sum: {
                                                $cond:
                                                    [
                                                        {
                                                            $ne:
                                                                [
                                                                    {
                                                                        $ifNull:
                                                                            [
                                                                                "$linkedInquiry",
                                                                                null,
                                                                            ],
                                                                    },

                                                                    null,
                                                                ],
                                                        },

                                                        1,
                                                        0,
                                                    ],
                                            },
                                        },

                                    humanHandovers:
                                        {
                                            $sum: {
                                                $cond:
                                                    [
                                                        {
                                                            $eq:
                                                                [
                                                                    "$status",
                                                                    "Human Handover",
                                                                ],
                                                        },

                                                        1,
                                                        0,
                                                    ],
                                            },
                                        },

                                    abandoned:
                                        {
                                            $sum: {
                                                $cond:
                                                    [
                                                        {
                                                            $eq:
                                                                [
                                                                    "$status",
                                                                    "Abandoned",
                                                                ],
                                                        },

                                                        1,
                                                        0,
                                                    ],
                                            },
                                        },

                                    active:
                                        {
                                            $sum: {
                                                $cond:
                                                    [
                                                        {
                                                            $eq:
                                                                [
                                                                    "$status",
                                                                    "Active",
                                                                ],
                                                        },

                                                        1,
                                                        0,
                                                    ],
                                            },
                                        },

                                    totalMessages:
                                        {
                                            $sum:
                                                buildMessageCountExpression(),
                                        },
                                },
                            },
                        ]
                    ),

                    ChatConversation.countDocuments(
                        previousMatch
                    ),

                    ChatConversation.aggregate(
                        [
                            {
                                $match:
                                currentMatch,
                            },

                            {
                                $group: {
                                    _id: {
                                        $ifNull:
                                            [
                                                "$status",
                                                "Unknown",
                                            ],
                                    },

                                    count: {
                                        $sum:
                                            1,
                                    },
                                },
                            },

                            {
                                $sort: {
                                    count:
                                        -1,
                                },
                            },
                        ]
                    ),

                    ChatConversation.aggregate(
                        [
                            {
                                $match:
                                currentMatch,
                            },

                            {
                                $set: {
                                    normalizedCountry:
                                        {
                                            $trim: {
                                                input:
                                                    {
                                                        $convert:
                                                            {
                                                                input:
                                                                    "$visitor.country",

                                                                to:
                                                                    "string",

                                                                onError:
                                                                    "",

                                                                onNull:
                                                                    "",
                                                            },
                                                    },
                                            },
                                        },
                                },
                            },

                            {
                                $match: {
                                    normalizedCountry:
                                        {
                                            $ne:
                                                "",
                                        },
                                },
                            },

                            {
                                $group: {
                                    _id:
                                        "$normalizedCountry",

                                    count: {
                                        $sum:
                                            1,
                                    },
                                },
                            },

                            {
                                $sort: {
                                    count:
                                        -1,
                                },
                            },
                        ]
                    ),

                    ChatConversation.aggregate(
                        [
                            {
                                $match:
                                currentMatch,
                            },

                            {
                                $set: {
                                    analyticsMessageCount:
                                        buildMessageCountExpression(),
                                },
                            },

                            {
                                $group: {
                                    _id: {
                                        $dateToString:
                                            {
                                                format:
                                                    "%Y-%m-%d",

                                                date:
                                                    "$startedAt",

                                                timezone:
                                                    "UTC",
                                            },
                                    },

                                    conversations:
                                        {
                                            $sum:
                                                1,
                                        },

                                    messages:
                                        {
                                            $sum:
                                                "$analyticsMessageCount",
                                        },
                                },
                            },

                            {
                                $sort: {
                                    _id:
                                        1,
                                },
                            },
                        ]
                    ),

                    ChatConversation.find(
                        currentMatch
                    )
                        .select(
                            "messages"
                        )
                        .sort({
                            startedAt:
                                -1,
                        })
                        .limit(
                            2000
                        )
                        .lean(),
                ]);

            const summary =
                summaryResults[0] ||
                {
                    totalConversations:
                        0,

                    linkedInquiries:
                        0,

                    humanHandovers:
                        0,

                    abandoned:
                        0,

                    active:
                        0,

                    totalMessages:
                        0,
                };

            const totalConversations =
                Number(
                    summary.totalConversations
                ) || 0;

            const totalMessages =
                Number(
                    summary.totalMessages
                ) || 0;

            const linkedInquiries =
                Number(
                    summary.linkedInquiries
                ) || 0;

            const humanHandovers =
                Number(
                    summary.humanHandovers
                ) || 0;

            const abandoned =
                Number(
                    summary.abandoned
                ) || 0;

            const dailyTrend =
                buildEmptyDailyTrend(
                    startDate,
                    days
                );

            const dailyResultMap =
                new Map(
                    dailyResults.map(
                        (item) => [
                            item._id,
                            item,
                        ]
                    )
                );

            dailyTrend.forEach(
                (item) => {
                    const matched =
                        dailyResultMap.get(
                            item.date
                        );

                    if (!matched) {
                        return;
                    }

                    item.conversations =
                        Number(
                            matched.conversations
                        ) || 0;

                    item.messages =
                        Number(
                            matched.messages
                        ) || 0;
                }
            );

            const knownCountryTotal =
                countryResults.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        (
                            Number(
                                item.count
                            ) ||
                            0
                        ),
                    0
                );

            const countryBreakdown =
                countryResults
                    .slice(
                        0,
                        10
                    )
                    .map(
                        (item) => ({
                            country:
                            item._id,

                            count:
                                Number(
                                    item.count
                                ) || 0,

                            percentage:
                                calculateRate(
                                    item.count,
                                    knownCountryTotal
                                ),
                        })
                    );

            return res
                .status(200)
                .json({
                    generatedAt:
                    now,

                    range: {
                        days,
                        startDate,
                        endDate:
                        now,
                        previousStartDate,
                        previousEndDate,
                    },

                    summary: {
                        totalConversations,

                        previousConversations:
                            Number(
                                previousConversations
                            ) || 0,

                        conversationChange:
                            calculateChange(
                                totalConversations,
                                previousConversations
                            ),

                        linkedInquiries,

                        conversionRate:
                            calculateRate(
                                linkedInquiries,
                                totalConversations
                            ),

                        humanHandovers,

                        handoverRate:
                            calculateRate(
                                humanHandovers,
                                totalConversations
                            ),

                        abandoned,

                        abandonedRate:
                            calculateRate(
                                abandoned,
                                totalConversations
                            ),

                        active:
                            Number(
                                summary.active
                            ) || 0,

                        totalMessages,

                        averageMessages:
                            totalConversations >
                            0
                                ? roundNumber(
                                    totalMessages /
                                    totalConversations,
                                    1
                                )
                                : 0,
                    },

                    statusBreakdown:
                        statusResults.map(
                            (item) => ({
                                status:
                                item._id,

                                count:
                                    Number(
                                        item.count
                                    ) || 0,

                                percentage:
                                    calculateRate(
                                        item.count,
                                        totalConversations
                                    ),
                            })
                        ),

                    dailyTrend,

                    countryBreakdown,

                    topicBreakdown:
                        buildTopicBreakdown(
                            topicConversationRecords
                        ),
                });
        } catch (error) {
            console.error(
                "[Get Chat Analytics]",
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        "Failed to load AI conversation analytics.",

                    error:
                    error.message,
                });
        }
    };

module.exports = {
    getChatAnalytics,
};