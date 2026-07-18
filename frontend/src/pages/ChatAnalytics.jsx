import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    useNavigate,
} from "react-router-dom";

import {
    FaArrowLeft,
    FaBan,
    FaChartBar,
    FaChartLine,
    FaComments,
    FaEnvelopeOpenText,
    FaExclamationTriangle,
    FaGlobeAsia,
    FaRobot,
    FaSyncAlt,
    FaUserCheck,
} from "react-icons/fa";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

import "../styles/chat-analytics.css";

const VIEW_ROLES = [
    "Super Admin",
    "Manager",
    "Sales",
    "Viewer",
];

const RANGE_OPTIONS = [
    {
        value: 7,
        label:
            "Last 7 days",
    },
    {
        value: 30,
        label:
            "Last 30 days",
    },
    {
        value: 90,
        label:
            "Last 90 days",
    },
    {
        value: 180,
        label:
            "Last 180 days",
    },
    {
        value: 365,
        label:
            "Last 365 days",
    },
];

const initialSummary = {
    totalConversations: 0,
    previousConversations: 0,
    conversationChange: 0,
    linkedInquiries: 0,
    conversionRate: 0,
    humanHandovers: 0,
    handoverRate: 0,
    abandoned: 0,
    abandonedRate: 0,
    active: 0,
    totalMessages: 0,
    averageMessages: 0,
};

const getAdminRole = (
    admin
) => {
    if (
        admin?.role &&
        typeof admin.role ===
        "object"
    ) {
        return (
            admin.role.name ||
            ""
        );
    }

    return admin?.role || "";
};

const formatNumber = (
    value
) => {
    return Number(
        value || 0
    ).toLocaleString(
        "en-US"
    );
};

const formatPercentage = (
    value
) => {
    return `${Number(
        value || 0
    ).toFixed(1)}%`;
};

const AnalyticsTooltip = ({
                              active,
                              payload,
                              label,
                          }) => {
    if (
        !active ||
        !Array.isArray(
            payload
        ) ||
        payload.length === 0
    ) {
        return null;
    }

    return (
        <div className="chat-analytics-tooltip">
            <strong>
                {label}
            </strong>

            {payload.map(
                (item) => (
                    <div
                        key={
                            item.dataKey
                        }
                    >
                        <span>
                            {
                                item.name
                            }
                        </span>

                        <b>
                            {formatNumber(
                                item.value
                            )}
                        </b>
                    </div>
                )
            )}
        </div>
    );
};

const ChatAnalytics = () => {
    const navigate =
        useNavigate();

    const {
        admin,
    } = useAuth();

    const adminRole =
        getAdminRole(
            admin
        );

    const canView =
        VIEW_ROLES.includes(
            adminRole
        );

    const [
        days,
        setDays,
    ] = useState(30);

    const [
        analytics,
        setAnalytics,
    ] = useState(null);

    const [
        loading,
        setLoading,
    ] = useState(true);

    const [
        refreshing,
        setRefreshing,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState("");

    const summary = {
        ...initialSummary,
        ...(
            analytics?.summary ||
            {}
        ),
    };

    const dailyTrend =
        useMemo(
            () =>
                Array.isArray(
                    analytics?.dailyTrend
                )
                    ? analytics.dailyTrend
                    : [],
            [
                analytics,
            ]
        );

    const statusBreakdown =
        useMemo(
            () =>
                Array.isArray(
                    analytics?.statusBreakdown
                )
                    ? analytics.statusBreakdown
                    : [],
            [
                analytics,
            ]
        );

    const countryBreakdown =
        useMemo(
            () =>
                Array.isArray(
                    analytics?.countryBreakdown
                )
                    ? analytics.countryBreakdown
                    : [],
            [
                analytics,
            ]
        );

    const topicBreakdown =
        useMemo(
            () =>
                Array.isArray(
                    analytics?.topicBreakdown
                )
                    ? analytics.topicBreakdown
                    : [],
            [
                analytics,
            ]
        );

    const fetchAnalytics =
        useCallback(
            async ({
                       refresh =
                       false,
                   } = {}) => {
                if (!canView) {
                    setLoading(
                        false
                    );

                    return;
                }

                try {
                    if (
                        refresh
                    ) {
                        setRefreshing(
                            true
                        );
                    } else {
                        setLoading(
                            true
                        );
                    }

                    setError("");

                    const response =
                        await api.get(
                            "/chat-conversations/analytics",
                            {
                                params: {
                                    days,
                                },
                            }
                        );

                    setAnalytics(
                        response.data ||
                        null
                    );
                } catch (
                    requestError
                    ) {
                    setError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        requestError
                            .response
                            ?.data
                            ?.error ||
                        "Failed to load AI conversation analytics."
                    );
                } finally {
                    setLoading(
                        false
                    );

                    setRefreshing(
                        false
                    );
                }
            },
            [
                canView,
                days,
            ]
        );

    useEffect(() => {
        void fetchAnalytics();
    }, [
        fetchAnalytics,
    ]);

    if (!admin) {
        return (
            <div className="chat-analytics-loading">
                <div
                    className="spinner-border text-success"
                    role="status"
                >
                    <span className="visually-hidden">
                        Loading...
                    </span>
                </div>
            </div>
        );
    }

    if (!canView) {
        return (
            <div className="alert alert-danger d-flex gap-3">
                <FaExclamationTriangle className="mt-1" />

                <div>
                    <h5>
                        Access denied
                    </h5>

                    <p className="mb-0">
                        Your account
                        cannot view AI
                        conversation
                        analytics.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-analytics-page">
            <div className="chat-analytics-header">
                <div>
                    <button
                        type="button"
                        className="btn btn-link chat-analytics-back"
                        onClick={() =>
                            navigate(
                                "/chat-conversations"
                            )
                        }
                    >
                        <FaArrowLeft />

                        Back to AI
                        Conversations
                    </button>

                    <div className="chat-analytics-eyebrow">
                        <FaRobot />

                        Website AI
                        Assistant
                    </div>

                    <h2 className="fw-bold mb-1">
                        AI Conversation
                        Analytics
                    </h2>

                    <p className="text-muted mb-0">
                        Measure chatbot
                        engagement,
                        inquiries and human
                        handovers.
                    </p>
                </div>

                <div className="chat-analytics-controls">
                    <select
                        className="form-select"
                        value={
                            days
                        }
                        onChange={(
                            event
                        ) =>
                            setDays(
                                Number(
                                    event
                                        .target
                                        .value
                                )
                            )
                        }
                        disabled={
                            loading ||
                            refreshing
                        }
                    >
                        {RANGE_OPTIONS.map(
                            (
                                option
                            ) => (
                                <option
                                    key={
                                        option.value
                                    }
                                    value={
                                        option.value
                                    }
                                >
                                    {
                                        option.label
                                    }
                                </option>
                            )
                        )}
                    </select>

                    <button
                        type="button"
                        className="btn btn-outline-success"
                        onClick={() =>
                            void fetchAnalytics(
                                {
                                    refresh:
                                        true,
                                }
                            )
                        }
                        disabled={
                            loading ||
                            refreshing
                        }
                    >
                        <FaSyncAlt
                            className={`me-2 ${
                                refreshing
                                    ? "fa-spin"
                                    : ""
                            }`}
                        />

                        {refreshing
                            ? "Refreshing..."
                            : "Refresh"}
                    </button>
                </div>
            </div>

            {error && (
                <div
                    className="alert alert-danger d-flex gap-2"
                    role="alert"
                >
                    <FaExclamationTriangle className="mt-1" />

                    <span>
                        {error}
                    </span>
                </div>
            )}

            {loading ? (
                <div className="chat-analytics-loading">
                    <div
                        className="spinner-border text-success"
                        role="status"
                    >
                        <span className="visually-hidden">
                            Loading...
                        </span>
                    </div>

                    <p className="text-muted mb-0">
                        Calculating AI
                        conversation
                        analytics...
                    </p>
                </div>
            ) : (
                <>
                    <div className="row g-3 mb-4">
                        <div className="col-12 col-md-6 col-xl">
                            <div className="chat-metric-card">
                                <div className="chat-metric-icon metric-conversations">
                                    <FaComments />
                                </div>

                                <div>
                                    <span>
                                        Conversations
                                    </span>

                                    <strong>
                                        {formatNumber(
                                            summary.totalConversations
                                        )}
                                    </strong>

                                    <small
                                        className={
                                            summary.conversationChange >=
                                            0
                                                ? "metric-positive"
                                                : "metric-negative"
                                        }
                                    >
                                        {summary.conversationChange >=
                                        0
                                            ? "+"
                                            : ""}
                                        {formatPercentage(
                                            summary.conversationChange
                                        )}{" "}
                                        vs previous
                                        period
                                    </small>
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-md-6 col-xl">
                            <div className="chat-metric-card">
                                <div className="chat-metric-icon metric-conversion">
                                    <FaEnvelopeOpenText />
                                </div>

                                <div>
                                    <span>
                                        Inquiry
                                        Conversion
                                    </span>

                                    <strong>
                                        {formatPercentage(
                                            summary.conversionRate
                                        )}
                                    </strong>

                                    <small>
                                        {formatNumber(
                                            summary.linkedInquiries
                                        )}{" "}
                                        linked
                                        inquiries
                                    </small>
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-md-6 col-xl">
                            <div className="chat-metric-card">
                                <div className="chat-metric-icon metric-handover">
                                    <FaUserCheck />
                                </div>

                                <div>
                                    <span>
                                        Human
                                        Handover
                                    </span>

                                    <strong>
                                        {formatPercentage(
                                            summary.handoverRate
                                        )}
                                    </strong>

                                    <small>
                                        {formatNumber(
                                            summary.humanHandovers
                                        )}{" "}
                                        conversations
                                    </small>
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-md-6 col-xl">
                            <div className="chat-metric-card">
                                <div className="chat-metric-icon metric-messages">
                                    <FaChartLine />
                                </div>

                                <div>
                                    <span>
                                        Average
                                        Messages
                                    </span>

                                    <strong>
                                        {Number(
                                            summary.averageMessages ||
                                            0
                                        ).toFixed(
                                            1
                                        )}
                                    </strong>

                                    <small>
                                        {formatNumber(
                                            summary.totalMessages
                                        )}{" "}
                                        total
                                        messages
                                    </small>
                                </div>
                            </div>
                        </div>

                        <div className="col-12 col-md-6 col-xl">
                            <div className="chat-metric-card">
                                <div className="chat-metric-icon metric-abandoned">
                                    <FaBan />
                                </div>

                                <div>
                                    <span>
                                        Abandoned
                                    </span>

                                    <strong>
                                        {formatPercentage(
                                            summary.abandonedRate
                                        )}
                                    </strong>

                                    <small>
                                        {formatNumber(
                                            summary.abandoned
                                        )}{" "}
                                        conversations
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <section className="chat-analytics-card mb-4">
                        <div className="chat-analytics-card-header">
                            <div>
                                <h5>
                                    Conversation
                                    Activity
                                </h5>

                                <p>
                                    New conversations
                                    and stored
                                    messages by day.
                                </p>
                            </div>

                            <FaChartLine />
                        </div>

                        <div className="chat-chart-large">
                            {dailyTrend.length >
                            0 ? (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                >
                                    <AreaChart
                                        data={
                                            dailyTrend
                                        }
                                        margin={{
                                            top: 15,
                                            right: 20,
                                            left: -10,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={
                                                false
                                            }
                                        />

                                        <XAxis
                                            dataKey="label"
                                            minTickGap={
                                                25
                                            }
                                        />

                                        <YAxis
                                            allowDecimals={
                                                false
                                            }
                                        />

                                        <Tooltip
                                            content={
                                                <AnalyticsTooltip />
                                            }
                                        />

                                        <Legend />

                                        <Area
                                            type="monotone"
                                            dataKey="conversations"
                                            name="Conversations"
                                            stroke="#008d86"
                                            fill="#008d86"
                                            fillOpacity={
                                                0.14
                                            }
                                            strokeWidth={
                                                2
                                            }
                                        />

                                        <Area
                                            type="monotone"
                                            dataKey="messages"
                                            name="Messages"
                                            stroke="#c62d52"
                                            fill="#c62d52"
                                            fillOpacity={
                                                0.08
                                            }
                                            strokeWidth={
                                                2
                                            }
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="chat-chart-empty">
                                    No activity data
                                    available.
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="row g-4 mb-4">
                        <div className="col-12 col-xl-6">
                            <section className="chat-analytics-card h-100">
                                <div className="chat-analytics-card-header">
                                    <div>
                                        <h5>
                                            Conversation
                                            Status
                                        </h5>

                                        <p>
                                            Current
                                            workflow
                                            status
                                            distribution.
                                        </p>
                                    </div>

                                    <FaChartBar />
                                </div>

                                <div className="chat-chart-medium">
                                    {statusBreakdown.length >
                                    0 ? (
                                        <ResponsiveContainer
                                            width="100%"
                                            height="100%"
                                        >
                                            <BarChart
                                                data={
                                                    statusBreakdown
                                                }
                                                layout="vertical"
                                                margin={{
                                                    top: 5,
                                                    right: 20,
                                                    left: 25,
                                                    bottom: 5,
                                                }}
                                            >
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    horizontal={
                                                        false
                                                    }
                                                />

                                                <XAxis
                                                    type="number"
                                                    allowDecimals={
                                                        false
                                                    }
                                                />

                                                <YAxis
                                                    type="category"
                                                    dataKey="status"
                                                    width={
                                                        115
                                                    }
                                                />

                                                <Tooltip
                                                    content={
                                                        <AnalyticsTooltip />
                                                    }
                                                />

                                                <Bar
                                                    dataKey="count"
                                                    name="Conversations"
                                                    fill="#008d86"
                                                    radius={[
                                                        0,
                                                        6,
                                                        6,
                                                        0,
                                                    ]}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="chat-chart-empty">
                                            No status
                                            data
                                            available.
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="col-12 col-xl-6">
                            <section className="chat-analytics-card h-100">
                                <div className="chat-analytics-card-header">
                                    <div>
                                        <h5>
                                            Visitor
                                            Countries
                                        </h5>

                                        <p>
                                            Top
                                            countries
                                            supplied
                                            during chat
                                            inquiries.
                                        </p>
                                    </div>

                                    <FaGlobeAsia />
                                </div>

                                <div className="chat-chart-medium">
                                    {countryBreakdown.length >
                                    0 ? (
                                        <ResponsiveContainer
                                            width="100%"
                                            height="100%"
                                        >
                                            <BarChart
                                                data={
                                                    countryBreakdown
                                                }
                                                layout="vertical"
                                                margin={{
                                                    top: 5,
                                                    right: 20,
                                                    left: 25,
                                                    bottom: 5,
                                                }}
                                            >
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    horizontal={
                                                        false
                                                    }
                                                />

                                                <XAxis
                                                    type="number"
                                                    allowDecimals={
                                                        false
                                                    }
                                                />

                                                <YAxis
                                                    type="category"
                                                    dataKey="country"
                                                    width={
                                                        105
                                                    }
                                                />

                                                <Tooltip
                                                    content={
                                                        <AnalyticsTooltip />
                                                    }
                                                />

                                                <Bar
                                                    dataKey="count"
                                                    name="Conversations"
                                                    fill="#fec52e"
                                                    radius={[
                                                        0,
                                                        6,
                                                        6,
                                                        0,
                                                    ]}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="chat-chart-empty">
                                            Country
                                            details
                                            have not
                                            been
                                            collected
                                            yet.
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>

                    <section className="chat-analytics-card">
                        <div className="chat-analytics-card-header">
                            <div>
                                <h5>
                                    Common Traveller
                                    Topics
                                </h5>

                                <p>
                                    Topics detected
                                    from traveller
                                    messages during
                                    the selected
                                    period.
                                </p>
                            </div>

                            <FaRobot />
                        </div>

                        <div className="chat-chart-topics">
                            {topicBreakdown.length >
                            0 ? (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                >
                                    <BarChart
                                        data={
                                            topicBreakdown
                                        }
                                        layout="vertical"
                                        margin={{
                                            top: 5,
                                            right: 20,
                                            left: 65,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            horizontal={
                                                false
                                            }
                                        />

                                        <XAxis
                                            type="number"
                                            allowDecimals={
                                                false
                                            }
                                        />

                                        <YAxis
                                            type="category"
                                            dataKey="topic"
                                            width={
                                                165
                                            }
                                        />

                                        <Tooltip
                                            content={
                                                <AnalyticsTooltip />
                                            }
                                        />

                                        <Bar
                                            dataKey="count"
                                            name="Topic Mentions"
                                            fill="#c62d52"
                                            radius={[
                                                0,
                                                6,
                                                6,
                                                0,
                                            ]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="chat-chart-empty">
                                    More traveller
                                    conversations
                                    are needed to
                                    identify common
                                    topics.
                                </div>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default ChatAnalytics;