import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    FaBrain,
    FaCheckCircle,
    FaChevronLeft,
    FaChevronRight,
    FaComments,
    FaEnvelopeOpenText,
    FaExclamationTriangle,
    FaEye,
    FaFilter,
    FaGlobeAsia,
    FaLink,
    FaRobot,
    FaSearch,
    FaSyncAlt,
    FaTimes,
    FaUnlink,
    FaUser,
    FaChartBar,
} from "react-icons/fa";
import {
    // existing icons...
    FaInfoCircle,
} from "react-icons/fa";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

import ConversationStatusBadge from "../components/chat/ConversationStatusBadge.jsx";

import "../styles/chat-conversations.css";
import {
    useNavigate,
} from "react-router-dom";
const STATUS_OPTIONS = [
    "Active",
    "Inquiry Created",
    "Human Handover",
    "Closed",
    "Abandoned",
];

const initialFilters = {
    keyword: "",
    status: "",
    linked: "",
    dateFrom: "",
    dateTo: "",
};

const initialSummary = {
    active: 0,
    inquiryCreated: 0,
    humanHandover: 0,
    closed: 0,
    abandoned: 0,
};

const VIEW_ROLES = [
    "Super Admin",
    "Manager",
    "Sales",
    "Viewer",
];

const UPDATE_ROLES = [
    "Super Admin",
    "Manager",
    "Sales",
];

const getAdminRole = (admin) => {
    if (
        admin?.role &&
        typeof admin.role === "object"
    ) {
        return admin.role.name || "";
    }

    return admin?.role || "";
};

const formatDateTime = (value) => {
    if (!value) {
        return "Not available";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getVisitorName = (conversation) => {
    return (
        conversation?.visitor?.fullName?.trim() ||
        "Anonymous visitor"
    );
};

const getVisitorInitials = (conversation) => {
    const visitorName =
        getVisitorName(conversation);

    if (
        visitorName ===
        "Anonymous visitor"
    ) {
        return "AI";
    }

    return visitorName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) =>
            part.charAt(0).toUpperCase()
        )
        .join("");
};

const getVisiblePages = (
    currentPage,
    totalPages
) => {
    if (totalPages <= 5) {
        return Array.from(
            {
                length: totalPages,
            },
            (_, index) => index + 1
        );
    }

    let startPage = Math.max(
        currentPage - 2,
        1
    );

    let endPage = Math.min(
        startPage + 4,
        totalPages
    );

    if (
        endPage - startPage < 4
    ) {
        startPage = Math.max(
            endPage - 4,
            1
        );
    }

    return Array.from(
        {
            length:
                endPage -
                startPage +
                1,
        },
        (_, index) =>
            startPage + index
    );
};

const ChatConversations = () => {
    const { admin } = useAuth();
    const navigate =
        useNavigate();
    const adminRole =
        getAdminRole(admin);

    const canView =
        VIEW_ROLES.includes(
            adminRole
        );

    const canUpdate =
        UPDATE_ROLES.includes(
            adminRole
        );

    const [
        conversations,
        setConversations,
    ] = useState([]);

    const [
        summary,
        setSummary,
    ] = useState(
        initialSummary
    );

    const [
        filters,
        setFilters,
    ] = useState(
        initialFilters
    );

    const [
        activeFilters,
        setActiveFilters,
    ] = useState(
        initialFilters
    );

    const [
        page,
        setPage,
    ] = useState(1);

    const [
        totalPages,
        setTotalPages,
    ] = useState(1);

    const [
        totalConversations,
        setTotalConversations,
    ] = useState(0);

    const [
        loading,
        setLoading,
    ] = useState(true);

    const [
        refreshing,
        setRefreshing,
    ] = useState(false);

    const [
        statusLoadingId,
        setStatusLoadingId,
    ] = useState("");

    const [
        error,
        setError,
    ] = useState("");

    const [
        success,
        setSuccess,
    ] = useState("");

    const [
        selectedConversation,
        setSelectedConversation,
    ] = useState(null);

    const visiblePages =
        useMemo(
            () =>
                getVisiblePages(
                    page,
                    totalPages
                ),
            [
                page,
                totalPages,
            ]
        );

    const fetchConversations =
        useCallback(
            async ({
                       showRefreshLoader =
                       false,
                   } = {}) => {
                if (!canView) {
                    setLoading(false);
                    return;
                }

                try {
                    if (
                        showRefreshLoader
                    ) {
                        setRefreshing(
                            true
                        );
                    } else {
                        setLoading(true);
                    }

                    setError("");

                    const params = {
                        page,
                        limit: 10,
                    };

                    Object.entries(
                        activeFilters
                    ).forEach(
                        ([
                             key,
                             value,
                         ]) => {
                            if (
                                value !==
                                "" &&
                                value !==
                                null &&
                                value !==
                                undefined
                            ) {
                                params[key] =
                                    value;
                            }
                        }
                    );

                    const response =
                        await api.get(
                            "/chat-conversations",
                            {
                                params,
                            }
                        );

                    const responseData =
                        response.data ||
                        {};

                    setConversations(
                        Array.isArray(
                            responseData.conversations
                        )
                            ? responseData.conversations
                            : []
                    );

                    setSummary({
                        ...initialSummary,
                        ...(
                            responseData.summary ||
                            {}
                        ),
                    });

                    setTotalPages(
                        Math.max(
                            Number(
                                responseData.totalPages
                            ) || 1,
                            1
                        )
                    );

                    setTotalConversations(
                        Number(
                            responseData.totalConversations
                        ) || 0
                    );
                } catch (requestError) {
                    setError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        requestError
                            .response
                            ?.data
                            ?.error ||
                        "Failed to load AI chat conversations."
                    );

                    setConversations(
                        []
                    );
                } finally {
                    setLoading(false);
                    setRefreshing(
                        false
                    );
                }
            },
            [
                activeFilters,
                canView,
                page,
            ]
        );

    useEffect(() => {
        void fetchConversations();
    }, [fetchConversations]);

    const clearMessages = () => {
        setError("");
        setSuccess("");
    };

    const handleFilterChange = (
        event
    ) => {
        const {
            name,
            value,
        } = event.target;

        setFilters(
            (previous) => ({
                ...previous,
                [name]: value,
            })
        );
    };

    const applyFilters = (
        event
    ) => {
        event.preventDefault();

        clearMessages();
        setPage(1);
        setActiveFilters(
            filters
        );
    };

    const resetFilters = () => {
        clearMessages();

        setFilters(
            initialFilters
        );

        setActiveFilters(
            initialFilters
        );

        setPage(1);
    };

    const refreshConversations =
        async () => {
            clearMessages();

            await fetchConversations(
                {
                    showRefreshLoader:
                        true,
                }
            );
        };

    const handleStatusChange =
        async (
            conversation,
            newStatus
        ) => {
            if (
                !canUpdate ||
                !newStatus ||
                newStatus ===
                conversation.status
            ) {
                return;
            }

            if (
                newStatus ===
                "Inquiry Created" &&
                !conversation.linkedInquiry
            ) {
                setError(
                    "This conversation cannot be marked as Inquiry Created because it is not linked to an inquiry."
                );

                return;
            }

            const confirmed =
                window.confirm(
                    `Change this conversation from "${conversation.status}" to "${newStatus}"?`
                );

            if (!confirmed) {
                return;
            }

            try {
                clearMessages();

                setStatusLoadingId(
                    conversation._id
                );

                const response =
                    await api.patch(
                        `/chat-conversations/${conversation._id}/status`,
                        {
                            status:
                            newStatus,
                        }
                    );

                setSuccess(
                    response.data
                        ?.message ||
                    "Conversation status updated successfully."
                );

                await fetchConversations();
            } catch (requestError) {
                setError(
                    requestError
                        .response
                        ?.data
                        ?.message ||
                    "Failed to update the conversation status."
                );
            } finally {
                setStatusLoadingId(
                    ""
                );
            }
        };

    const openSummary = (
        conversation
    ) => {
        setSelectedConversation(
            conversation
        );
    };

    const closeSummary = () => {
        setSelectedConversation(
            null
        );
    };

    if (!canView) {
        return (
            <div className="alert alert-danger d-flex align-items-start gap-3">
                <FaExclamationTriangle className="mt-1 flex-shrink-0" />

                <div>
                    <h5 className="alert-heading mb-1">
                        Access denied
                    </h5>

                    <p className="mb-0">
                        Your account does
                        not have permission
                        to view AI chat
                        conversations.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-conversations-page">
            {/* Header */}
            <div className="d-flex flex-column flex-xl-row justify-content-between align-items-xl-center gap-3 mb-4">
                <div>
                    <div className="chat-page-eyebrow">
                        <FaRobot />

                        Website AI Assistant
                    </div>

                    <h2 className="fw-bold mb-1">
                        AI Chat Conversations
                    </h2>

                    <p className="text-muted mb-0">
                        Review traveller
                        conversations,
                        linked inquiries and
                        human handover
                        requests.
                    </p>
                </div>

                <div className="d-flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={() =>
                            navigate(
                                "/chat-conversations/analytics"
                            )
                        }
                    >
                        <FaChartBar className="me-2" />

                        View Analytics
                    </button>

                    <button
                        type="button"
                        className="btn btn-outline-success"
                        onClick={
                            refreshConversations
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

            {/* Alerts */}
            {error && (
                <div
                    className="alert alert-danger d-flex align-items-start gap-2"
                    role="alert"
                >
                    <FaExclamationTriangle className="mt-1 flex-shrink-0" />

                    <span>
                        {error}
                    </span>
                </div>
            )}

            {success && (
                <div
                    className="alert alert-success d-flex align-items-start gap-2"
                    role="status"
                >
                    <FaCheckCircle className="mt-1 flex-shrink-0" />

                    <span>
                        {success}
                    </span>
                </div>
            )}

            {/* Summary cards */}
            <div className="row g-3 mb-4">
                <div className="col-6 col-xl">
                    <div className="chat-summary-card chat-summary-active">
                        <div className="chat-summary-icon">
                            <FaComments />
                        </div>

                        <div>
                            <span>
                                Active
                            </span>

                            <strong>
                                {
                                    summary.active
                                }
                            </strong>
                        </div>
                    </div>
                </div>

                <div className="col-6 col-xl">
                    <div className="chat-summary-card chat-summary-inquiry">
                        <div className="chat-summary-icon">
                            <FaEnvelopeOpenText />
                        </div>

                        <div>
                            <span>
                                Inquiry Created
                            </span>

                            <strong>
                                {
                                    summary.inquiryCreated
                                }
                            </strong>
                        </div>
                    </div>
                </div>

                <div className="col-6 col-xl">
                    <div className="chat-summary-card chat-summary-handover">
                        <div className="chat-summary-icon">
                            <FaUser />
                        </div>

                        <div>
                            <span>
                                Human Handover
                            </span>

                            <strong>
                                {
                                    summary.humanHandover
                                }
                            </strong>
                        </div>
                    </div>
                </div>

                <div className="col-6 col-xl">
                    <div className="chat-summary-card chat-summary-closed">
                        <div className="chat-summary-icon">
                            <FaCheckCircle />
                        </div>

                        <div>
                            <span>
                                Closed
                            </span>

                            <strong>
                                {
                                    summary.closed
                                }
                            </strong>
                        </div>
                    </div>
                </div>

                <div className="col-12 col-xl">
                    <div className="chat-summary-card chat-summary-abandoned">
                        <div className="chat-summary-icon">
                            <FaUnlink />
                        </div>

                        <div>
                            <span>
                                Abandoned
                            </span>

                            <strong>
                                {
                                    summary.abandoned
                                }
                            </strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card border-0 shadow-sm mb-4">
                <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaFilter className="text-success" />

                        <h5 className="mb-0">
                            Filter Conversations
                        </h5>
                    </div>

                    <form
                        onSubmit={
                            applyFilters
                        }
                    >
                        <div className="row g-3">
                            <div className="col-12 col-lg-4">
                                <label
                                    htmlFor="chat-keyword"
                                    className="form-label"
                                >
                                    Search
                                </label>

                                <div className="input-group">
                                    <span className="input-group-text bg-white">
                                        <FaSearch />
                                    </span>

                                    <input
                                        id="chat-keyword"
                                        type="search"
                                        name="keyword"
                                        value={
                                            filters.keyword
                                        }
                                        onChange={
                                            handleFilterChange
                                        }
                                        className="form-control"
                                        placeholder="Visitor, email, country or session ID"
                                    />
                                </div>
                            </div>

                            <div className="col-6 col-lg-2">
                                <label
                                    htmlFor="chat-status"
                                    className="form-label"
                                >
                                    Status
                                </label>

                                <select
                                    id="chat-status"
                                    name="status"
                                    value={
                                        filters.status
                                    }
                                    onChange={
                                        handleFilterChange
                                    }
                                    className="form-select"
                                >
                                    <option value="">
                                        All statuses
                                    </option>

                                    {STATUS_OPTIONS.map(
                                        (
                                            status
                                        ) => (
                                            <option
                                                key={
                                                    status
                                                }
                                                value={
                                                    status
                                                }
                                            >
                                                {
                                                    status
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div className="col-6 col-lg-2">
                                <label
                                    htmlFor="chat-linked"
                                    className="form-label"
                                >
                                    Inquiry Link
                                </label>

                                <select
                                    id="chat-linked"
                                    name="linked"
                                    value={
                                        filters.linked
                                    }
                                    onChange={
                                        handleFilterChange
                                    }
                                    className="form-select"
                                >
                                    <option value="">
                                        All conversations
                                    </option>

                                    <option value="true">
                                        Linked
                                    </option>

                                    <option value="false">
                                        Not linked
                                    </option>
                                </select>
                            </div>

                            <div className="col-6 col-lg-2">
                                <label
                                    htmlFor="chat-date-from"
                                    className="form-label"
                                >
                                    From
                                </label>

                                <input
                                    id="chat-date-from"
                                    type="date"
                                    name="dateFrom"
                                    value={
                                        filters.dateFrom
                                    }
                                    onChange={
                                        handleFilterChange
                                    }
                                    className="form-control"
                                />
                            </div>

                            <div className="col-6 col-lg-2">
                                <label
                                    htmlFor="chat-date-to"
                                    className="form-label"
                                >
                                    To
                                </label>

                                <input
                                    id="chat-date-to"
                                    type="date"
                                    name="dateTo"
                                    value={
                                        filters.dateTo
                                    }
                                    onChange={
                                        handleFilterChange
                                    }
                                    className="form-control"
                                />
                            </div>
                        </div>

                        <div className="d-flex flex-wrap gap-2 mt-3">
                            <button
                                type="submit"
                                className="btn btn-success"
                                disabled={
                                    loading
                                }
                            >
                                <FaSearch className="me-2" />

                                Apply Filters
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={
                                    resetFilters
                                }
                                disabled={
                                    loading
                                }
                            >
                                <FaTimes className="me-2" />

                                Reset
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Conversation table */}
            <div className="card border-0 shadow-sm">
                <div className="card-header bg-white border-0 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 py-3">
                    <div>
                        <h5 className="mb-1">
                            Conversations
                        </h5>

                        <small className="text-muted">
                            {
                                totalConversations
                            }{" "}
                            conversation
                            {totalConversations ===
                            1
                                ? ""
                                : "s"}{" "}
                            found
                        </small>
                    </div>

                    <small className="text-muted">
                        Page {page} of{" "}
                        {totalPages}
                    </small>
                </div>

                <div className="card-body p-0">
                    {loading ? (
                        <div className="chat-loading-state">
                            <div
                                className="spinner-border text-success"
                                role="status"
                            >
                                <span className="visually-hidden">
                                    Loading...
                                </span>
                            </div>

                            <p className="mb-0 text-muted">
                                Loading AI
                                conversations...
                            </p>
                        </div>
                    ) : conversations.length ===
                    0 ? (
                        <div className="chat-empty-state">
                            <div className="chat-empty-icon">
                                <FaRobot />
                            </div>

                            <h5>
                                No conversations
                                found
                            </h5>

                            <p className="text-muted mb-0">
                                New website AI
                                conversations will
                                appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle chat-conversation-table mb-0">
                                <thead>
                                <tr>
                                    <th>
                                        Visitor
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                    <th>
                                        Messages
                                    </th>

                                    <th>
                                        Linked Inquiry
                                    </th>

                                    <th>
                                        Last Activity
                                    </th>

                                    <th className="text-end">
                                        Actions
                                    </th>
                                </tr>
                                </thead>

                                <tbody>
                                {conversations.map(
                                    (
                                        conversation
                                    ) => {
                                        const isUpdating =
                                            statusLoadingId ===
                                            conversation._id;

                                        const linkedInquiry =
                                            conversation.linkedInquiry;

                                        return (
                                            <tr
                                                key={
                                                    conversation._id
                                                }
                                            >
                                                <td
                                                    style={{
                                                        minWidth:
                                                            "230px",
                                                    }}
                                                >
                                                    <div className="d-flex align-items-center gap-3">
                                                        <div className="chat-visitor-avatar">
                                                            {getVisitorInitials(
                                                                conversation
                                                            )}
                                                        </div>

                                                        <div className="min-width-0">
                                                            <div className="fw-semibold text-dark">
                                                                {getVisitorName(
                                                                    conversation
                                                                )}
                                                            </div>

                                                            <small className="text-muted d-block text-truncate">
                                                                {conversation
                                                                        .visitor
                                                                        ?.email ||
                                                                    conversation.sessionId}
                                                            </small>

                                                            {conversation
                                                                .visitor
                                                                ?.country && (
                                                                <small className="text-muted d-flex align-items-center gap-1 mt-1">
                                                                    <FaGlobeAsia />

                                                                    {
                                                                        conversation
                                                                            .visitor
                                                                            .country
                                                                    }
                                                                </small>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td
                                                    style={{
                                                        minWidth:
                                                            "175px",
                                                    }}
                                                >
                                                    <ConversationStatusBadge
                                                        status={
                                                            conversation.status
                                                        }
                                                    />

                                                    {canUpdate && (
                                                        <select
                                                            value={
                                                                conversation.status
                                                            }
                                                            onChange={(
                                                                event
                                                            ) =>
                                                                void handleStatusChange(
                                                                    conversation,
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            disabled={
                                                                isUpdating
                                                            }
                                                            className="form-select form-select-sm mt-2 chat-status-select"
                                                            aria-label={`Change status for ${getVisitorName(
                                                                conversation
                                                            )}`}
                                                        >
                                                            {STATUS_OPTIONS.map(
                                                                (
                                                                    status
                                                                ) => (
                                                                    <option
                                                                        key={
                                                                            status
                                                                        }
                                                                        value={
                                                                            status
                                                                        }
                                                                        disabled={
                                                                            status ===
                                                                            "Inquiry Created" &&
                                                                            !linkedInquiry
                                                                        }
                                                                    >
                                                                        {
                                                                            status
                                                                        }
                                                                    </option>
                                                                )
                                                            )}
                                                        </select>
                                                    )}
                                                </td>

                                                <td>
                                                    <div className="chat-message-count">
                                                        <FaComments />

                                                        <strong>
                                                            {Number(
                                                                    conversation.messageCount
                                                                ) ||
                                                                0}
                                                        </strong>
                                                    </div>
                                                </td>

                                                <td
                                                    style={{
                                                        minWidth:
                                                            "190px",
                                                    }}
                                                >
                                                    {linkedInquiry ? (
                                                        <div className="chat-linked-inquiry">
                                                            <FaLink />

                                                            <div>
                                                                    <span className="d-block fw-semibold">
                                                                        {linkedInquiry.fullName ||
                                                                            "Linked inquiry"}
                                                                    </span>

                                                                <small>
                                                                    {linkedInquiry.status ||
                                                                        "Available"}
                                                                </small>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="chat-not-linked">
                                                                <FaUnlink />

                                                                Not linked
                                                            </span>
                                                    )}
                                                </td>

                                                <td
                                                    style={{
                                                        minWidth:
                                                            "175px",
                                                    }}
                                                >
                                                        <span className="small text-dark">
                                                            {formatDateTime(
                                                                conversation.lastActivityAt
                                                            )}
                                                        </span>

                                                    <small className="d-block text-muted mt-1">
                                                        Started{" "}
                                                        {formatDateTime(
                                                            conversation.startedAt
                                                        )}
                                                    </small>
                                                </td>

                                                <td className="text-end">
                                                    <div className="d-inline-flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn btn-outline-secondary btn-sm"
                                                            onClick={() =>
                                                                openSummary(
                                                                    conversation
                                                                )
                                                            }
                                                        >
                                                            <FaInfoCircle className="me-1" />

                                                            Quick View
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="btn btn-outline-success btn-sm"
                                                            onClick={() =>
                                                                navigate(
                                                                    `/chat-conversations/${conversation._id}`
                                                                )
                                                            }
                                                        >
                                                            <FaEye className="me-1" />

                                                            Open
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }
                                )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {!loading &&
                    totalPages > 1 && (
                        <div className="card-footer bg-white border-0 py-3">
                            <div className="d-flex flex-column flex-md-row align-items-center justify-content-between gap-3">
                                <small className="text-muted">
                                    Showing page{" "}
                                    {page} of{" "}
                                    {totalPages}
                                </small>

                                <nav aria-label="AI conversation pagination">
                                    <ul className="pagination pagination-sm mb-0">
                                        <li
                                            className={`page-item ${
                                                page <=
                                                1
                                                    ? "disabled"
                                                    : ""
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className="page-link"
                                                onClick={() =>
                                                    setPage(
                                                        (
                                                            current
                                                        ) =>
                                                            Math.max(
                                                                current -
                                                                1,
                                                                1
                                                            )
                                                    )
                                                }
                                                disabled={
                                                    page <=
                                                    1
                                                }
                                                aria-label="Previous page"
                                            >
                                                <FaChevronLeft />
                                            </button>
                                        </li>

                                        {visiblePages.map(
                                            (
                                                pageNumber
                                            ) => (
                                                <li
                                                    key={
                                                        pageNumber
                                                    }
                                                    className={`page-item ${
                                                        pageNumber ===
                                                        page
                                                            ? "active"
                                                            : ""
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        className="page-link"
                                                        onClick={() =>
                                                            setPage(
                                                                pageNumber
                                                            )
                                                        }
                                                    >
                                                        {
                                                            pageNumber
                                                        }
                                                    </button>
                                                </li>
                                            )
                                        )}

                                        <li
                                            className={`page-item ${
                                                page >=
                                                totalPages
                                                    ? "disabled"
                                                    : ""
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className="page-link"
                                                onClick={() =>
                                                    setPage(
                                                        (
                                                            current
                                                        ) =>
                                                            Math.min(
                                                                current +
                                                                1,
                                                                totalPages
                                                            )
                                                    )
                                                }
                                                disabled={
                                                    page >=
                                                    totalPages
                                                }
                                                aria-label="Next page"
                                            >
                                                <FaChevronRight />
                                            </button>
                                        </li>
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    )}
            </div>

            {/* Summary modal */}
            {selectedConversation && (
                <div
                    className="chat-modal-overlay"
                    role="presentation"
                    onMouseDown={
                        closeSummary
                    }
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="chat-summary-title"
                        className="chat-summary-modal"
                        onMouseDown={(
                            event
                        ) =>
                            event.stopPropagation()
                        }
                    >
                        <div className="chat-summary-modal-header">
                            <div>
                                <div className="chat-page-eyebrow">
                                    <FaBrain />

                                    Conversation
                                    Summary
                                </div>

                                <h4
                                    id="chat-summary-title"
                                    className="mb-0"
                                >
                                    {getVisitorName(
                                        selectedConversation
                                    )}
                                </h4>
                            </div>

                            <button
                                type="button"
                                className="btn btn-light btn-sm"
                                onClick={
                                    closeSummary
                                }
                                aria-label="Close conversation summary"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="chat-summary-modal-body">
                            <div className="mb-4">
                                <ConversationStatusBadge
                                    status={
                                        selectedConversation.status
                                    }
                                />
                            </div>

                            <div className="chat-summary-grid">
                                <div>
                                    <span>
                                        Session ID
                                    </span>

                                    <strong className="chat-session-value">
                                        {
                                            selectedConversation.sessionId
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Message Count
                                    </span>

                                    <strong>
                                        {Number(
                                                selectedConversation.messageCount
                                            ) ||
                                            0}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Email
                                    </span>

                                    <strong>
                                        {selectedConversation
                                                .visitor
                                                ?.email ||
                                            "Not provided"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        WhatsApp
                                    </span>

                                    <strong>
                                        {selectedConversation
                                                .visitor
                                                ?.whatsappNumber ||
                                            "Not provided"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Country
                                    </span>

                                    <strong>
                                        {selectedConversation
                                                .visitor
                                                ?.country ||
                                            "Not provided"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Source
                                    </span>

                                    <strong>
                                        {selectedConversation.source ||
                                            "Website AI Chat"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Started
                                    </span>

                                    <strong>
                                        {formatDateTime(
                                            selectedConversation.startedAt
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Last Activity
                                    </span>

                                    <strong>
                                        {formatDateTime(
                                            selectedConversation.lastActivityAt
                                        )}
                                    </strong>
                                </div>
                            </div>

                            <div className="chat-summary-link-box mt-4">
                                {selectedConversation.linkedInquiry ? (
                                    <>
                                        <FaLink />

                                        <div>
                                            <strong className="d-block">
                                                Linked to inquiry
                                            </strong>

                                            <span>
                                                {selectedConversation
                                                        .linkedInquiry
                                                        .fullName ||
                                                    "Customer inquiry"}{" "}
                                                ·{" "}
                                                {selectedConversation
                                                        .linkedInquiry
                                                        .status ||
                                                    "Available"}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <FaUnlink />

                                        <div>
                                            <strong className="d-block">
                                                No linked inquiry
                                            </strong>

                                            <span>
                                                The visitor
                                                has not yet
                                                submitted an
                                                inquiry.
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="chat-summary-modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={
                                    closeSummary
                                }
                            >
                                Close
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default ChatConversations;