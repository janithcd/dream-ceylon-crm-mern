import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    useNavigate,
    useParams,
} from "react-router-dom";

import {
    FaArrowLeft,
    FaCalendarAlt,
    FaCheckCircle,
    FaClock,
    FaComments,
    FaEnvelope,
    FaExclamationTriangle,
    FaExternalLinkAlt,
    FaGlobeAsia,
    FaInfoCircle,
    FaLink,
    FaPhone,
    FaRobot,
    FaShieldAlt,
    FaSyncAlt,
    FaTimes,
    FaTrash,
    FaUnlink,
    FaUser,
    FaWhatsapp,
} from "react-icons/fa";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

import ConversationStatusBadge from "../components/chat/ConversationStatusBadge";
import WhatsAppHandoverModal from "../components/chat/WhatsAppHandoverModal";

import "../styles/chat-conversation-details.css";

const STATUS_OPTIONS = [
    "Active",
    "Inquiry Created",
    "Human Handover",
    "Closed",
    "Abandoned",
];

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

const DELETE_ROLES = [
    "Super Admin",
    "Manager",
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

const getVisitorName = (
    conversation
) => {
    return (
        conversation?.visitor?.fullName?.trim() ||
        "Anonymous visitor"
    );
};

const getVisitorInitials = (
    conversation
) => {
    const name =
        getVisitorName(
            conversation
        );

    if (
        name ===
        "Anonymous visitor"
    ) {
        return "AI";
    }

    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) =>
            part
                .charAt(0)
                .toUpperCase()
        )
        .join("");
};

const formatDateTime = (
    value
) => {
    if (!value) {
        return "Not available";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "Not available";
    }

    return date.toLocaleString(
        "en-US",
        {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }
    );
};

const formatDate = (
    value
) => {
    if (!value) {
        return "Not provided";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "Not provided";
    }

    return date.toLocaleDateString(
        "en-US",
        {
            year: "numeric",
            month: "long",
            day: "numeric",
        }
    );
};

const getLinkedInquiryId = (
    linkedInquiry
) => {
    if (!linkedInquiry) {
        return "";
    }

    if (
        typeof linkedInquiry ===
        "string"
    ) {
        return linkedInquiry;
    }

    return (
        linkedInquiry._id ||
        linkedInquiry.id ||
        ""
    );
};

const ChatConversationDetails =
    () => {
        const {
            id,
        } = useParams();

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

        const canUpdate =
            UPDATE_ROLES.includes(
                adminRole
            );

        const canDelete =
            DELETE_ROLES.includes(
                adminRole
            );

        const [
            conversation,
            setConversation,
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
            statusLoading,
            setStatusLoading,
        ] = useState(false);

        const [
            deleteLoading,
            setDeleteLoading,
        ] = useState(false);

        const [
            error,
            setError,
        ] = useState("");

        const [
            success,
            setSuccess,
        ] = useState("");

        const [
            notFound,
            setNotFound,
        ] = useState(false);

        const [
            showInquiryModal,
            setShowInquiryModal,
        ] = useState(false);

        const [
            inquiryLoading,
            setInquiryLoading,
        ] = useState(false);

        const [
            inquiryError,
            setInquiryError,
        ] = useState("");

        const [
            inquiryDetails,
            setInquiryDetails,
        ] = useState(null);

        const [
            showHandoverModal,
            setShowHandoverModal,
        ] = useState(false);

        const messages =
            useMemo(() => {
                if (
                    !Array.isArray(
                        conversation?.messages
                    )
                ) {
                    return [];
                }

                return conversation.messages;
            }, [
                conversation,
            ]);

        const linkedInquiry =
            conversation?.linkedInquiry ||
            null;

        const linkedInquiryId =
            getLinkedInquiryId(
                linkedInquiry
            );

        const fetchConversation =
            useCallback(
                async ({
                           showRefreshLoader =
                           false,
                       } = {}) => {
                    if (
                        !canView ||
                        !id
                    ) {
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
                            setLoading(
                                true
                            );
                        }

                        setError("");
                        setNotFound(
                            false
                        );

                        const response =
                            await api.get(
                                `/chat-conversations/${encodeURIComponent(
                                    id
                                )}`
                            );

                        const loadedConversation =
                            response.data
                                ?.conversation;

                        if (
                            !loadedConversation
                        ) {
                            setNotFound(
                                true
                            );

                            setConversation(
                                null
                            );

                            return;
                        }

                        setConversation(
                            loadedConversation
                        );
                    } catch (
                        requestError
                        ) {
                        if (
                            requestError
                                .response
                                ?.status ===
                            404
                        ) {
                            setNotFound(
                                true
                            );

                            setConversation(
                                null
                            );
                        } else {
                            setError(
                                requestError
                                    .response
                                    ?.data
                                    ?.message ||
                                requestError
                                    .response
                                    ?.data
                                    ?.error ||
                                "Failed to load the AI chat conversation."
                            );
                        }
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
                    id,
                ]
            );

        useEffect(() => {
            void fetchConversation();
        }, [
            fetchConversation,
        ]);

        useEffect(() => {
            if (
                !showInquiryModal
            ) {
                return undefined;
            }

            const previousOverflow =
                document.body
                    .style
                    .overflow;

            document.body.style.overflow =
                "hidden";

            const handleEscape =
                (event) => {
                    if (
                        event.key ===
                        "Escape"
                    ) {
                        setShowInquiryModal(
                            false
                        );
                    }
                };

            document.addEventListener(
                "keydown",
                handleEscape
            );

            return () => {
                document.body.style.overflow =
                    previousOverflow;

                document.removeEventListener(
                    "keydown",
                    handleEscape
                );
            };
        }, [
            showInquiryModal,
        ]);

        const clearMessages =
            () => {
                setError("");
                setSuccess("");
            };

        const refreshConversation =
            async () => {
                clearMessages();

                await fetchConversation(
                    {
                        showRefreshLoader:
                            true,
                    }
                );
            };

        const updateStatus =
            async (
                newStatus
            ) => {
                if (
                    !canUpdate ||
                    !conversation ||
                    !newStatus ||
                    newStatus ===
                    conversation.status
                ) {
                    return;
                }

                if (
                    newStatus ===
                    "Inquiry Created" &&
                    !linkedInquiryId
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

                if (
                    !confirmed
                ) {
                    return;
                }

                try {
                    clearMessages();

                    setStatusLoading(
                        true
                    );

                    const response =
                        await api.patch(
                            `/chat-conversations/${conversation._id}/status`,
                            {
                                status:
                                newStatus,
                            }
                        );

                    setConversation(
                        response.data
                            ?.conversation ||
                        {
                            ...conversation,
                            status:
                            newStatus,
                        }
                    );

                    setSuccess(
                        response.data
                            ?.message ||
                        "Conversation status updated successfully."
                    );
                } catch (
                    requestError
                    ) {
                    setError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        "Failed to update the conversation status."
                    );
                } finally {
                    setStatusLoading(
                        false
                    );
                }
            };

        const closeConversation =
            () => {
                void updateStatus(
                    "Closed"
                );
            };

        const deleteConversation =
            async () => {
                if (
                    !canDelete ||
                    !conversation
                ) {
                    return;
                }

                const visitorName =
                    getVisitorName(
                        conversation
                    );

                const confirmed =
                    window.confirm(
                        `Permanently delete the AI conversation for ${visitorName}?\n\nThis action cannot be undone.`
                    );

                if (
                    !confirmed
                ) {
                    return;
                }

                try {
                    clearMessages();

                    setDeleteLoading(
                        true
                    );

                    await api.delete(
                        `/chat-conversations/${conversation._id}`
                    );

                    navigate(
                        "/chat-conversations",
                        {
                            replace:
                                true,
                        }
                    );
                } catch (
                    requestError
                    ) {
                    setError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        "Failed to delete the chat conversation."
                    );

                    setDeleteLoading(
                        false
                    );
                }
            };

        const openLinkedInquiry =
            async () => {
                if (
                    !linkedInquiryId
                ) {
                    return;
                }

                setShowInquiryModal(
                    true
                );

                setInquiryLoading(
                    true
                );

                setInquiryError(
                    ""
                );

                setInquiryDetails(
                    null
                );

                try {
                    const response =
                        await api.get(
                            `/inquiries/${linkedInquiryId}`
                        );

                    setInquiryDetails(
                        response.data
                            ?.inquiry ||
                        response.data
                    );
                } catch (
                    requestError
                    ) {
                    setInquiryError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        "Failed to load the linked inquiry."
                    );
                } finally {
                    setInquiryLoading(
                        false
                    );
                }
            };

        const closeInquiryModal =
            () => {
                setShowInquiryModal(
                    false
                );

                setInquiryDetails(
                    null
                );

                setInquiryError(
                    ""
                );
            };

        const handleHandoverComplete =
            (
                updatedConversation,
                successMessage
            ) => {
                if (
                    updatedConversation
                ) {
                    setConversation(
                        updatedConversation
                    );
                } else {
                    setConversation(
                        (previous) => ({
                            ...previous,
                            status:
                                "Human Handover",
                        })
                    );
                }

                setShowHandoverModal(
                    false
                );

                setError("");

                setSuccess(
                    successMessage ||
                    "WhatsApp human handover prepared successfully."
                );
            };

        if (!admin) {
            return (
                <div className="chat-details-loading-page">
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
                <div className="alert alert-danger d-flex align-items-start gap-3">
                    <FaExclamationTriangle className="mt-1 flex-shrink-0" />

                    <div>
                        <h5 className="alert-heading mb-1">
                            Access denied
                        </h5>

                        <p className="mb-0">
                            Your account
                            cannot view AI
                            chat conversations.
                        </p>
                    </div>
                </div>
            );
        }

        if (loading) {
            return (
                <div className="chat-details-loading-page">
                    <div
                        className="spinner-border text-success"
                        role="status"
                    >
                        <span className="visually-hidden">
                            Loading...
                        </span>
                    </div>

                    <p className="mb-0 text-muted">
                        Loading the
                        conversation...
                    </p>
                </div>
            );
        }

        if (notFound) {
            return (
                <div className="chat-details-not-found">
                    <div className="chat-details-not-found-icon">
                        <FaRobot />
                    </div>

                    <h3>
                        Conversation not
                        found
                    </h3>

                    <p className="text-muted">
                        This conversation may
                        have expired, been
                        deleted or no longer be
                        available.
                    </p>

                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={() =>
                            navigate(
                                "/chat-conversations"
                            )
                        }
                    >
                        <FaArrowLeft className="me-2" />

                        Back to Conversations
                    </button>
                </div>
            );
        }

        if (!conversation) {
            return (
                <div className="alert alert-danger">
                    Conversation data could
                    not be loaded.
                </div>
            );
        }

        return (
            <div className="chat-conversation-details-page">
                {/* Header */}
                <div className="chat-details-header">
                    <div>
                        <button
                            type="button"
                            className="btn btn-link chat-back-button"
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

                        <div className="chat-details-eyebrow">
                            <FaRobot />

                            Website AI Assistant
                        </div>

                        <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2">
                            <h2 className="fw-bold mb-0">
                                {getVisitorName(
                                    conversation
                                )}
                            </h2>

                            <ConversationStatusBadge
                                status={
                                    conversation.status
                                }
                            />
                        </div>

                        <p className="text-muted mt-2 mb-0 chat-session-id">
                            {
                                conversation.sessionId
                            }
                        </p>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="btn btn-outline-success"
                            onClick={
                                refreshConversation
                            }
                            disabled={
                                refreshing ||
                                statusLoading ||
                                deleteLoading
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

                        {canUpdate && (
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={() => {
                                    clearMessages();

                                    setShowHandoverModal(
                                        true
                                    );
                                }}
                                disabled={
                                    statusLoading ||
                                    deleteLoading ||
                                    !conversation
                                        .visitor
                                        ?.whatsappNumber
                                }
                                title={
                                    conversation
                                        .visitor
                                        ?.whatsappNumber
                                        ? "Prepare a WhatsApp human handover"
                                        : "The visitor has not provided a WhatsApp number"
                                }
                            >
                                <FaWhatsapp className="me-2" />

                                WhatsApp Handover
                            </button>
                        )}

                        {canUpdate &&
                            conversation.status !==
                            "Closed" && (
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={
                                        closeConversation
                                    }
                                    disabled={
                                        statusLoading ||
                                        deleteLoading
                                    }
                                >
                                    <FaCheckCircle className="me-2" />

                                    Close
                                </button>
                            )}
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

                <div className="chat-details-layout">
                    {/* Transcript */}
                    <main className="chat-transcript-card">
                        <div className="chat-transcript-header">
                            <div>
                                <h5 className="mb-1">
                                    Full Conversation
                                </h5>

                                <p className="text-muted mb-0">
                                    Complete traveller
                                    and assistant
                                    message history.
                                </p>
                            </div>

                            <div className="chat-transcript-count">
                                <FaComments />

                                <strong>
                                    {Number(
                                            conversation.messageCount
                                        ) ||
                                        messages.length}
                                </strong>

                                messages
                            </div>
                        </div>

                        <div className="chat-transcript-body">
                            {messages.length ===
                            0 ? (
                                <div className="chat-transcript-empty">
                                    <FaComments />

                                    <h5>
                                        No messages
                                        stored
                                    </h5>

                                    <p className="text-muted mb-0">
                                        This
                                        conversation
                                        does not
                                        contain saved
                                        messages.
                                    </p>
                                </div>
                            ) : (
                                messages.map(
                                    (
                                        message,
                                        index
                                    ) => {
                                        const isUser =
                                            message.role ===
                                            "user";

                                        return (
                                            <div
                                                key={`${message.role}-${message.createdAt || index}-${index}`}
                                                className={`chat-detail-message ${
                                                    isUser
                                                        ? "chat-detail-message-user"
                                                        : "chat-detail-message-assistant"
                                                }`}
                                            >
                                                <div className="chat-detail-message-avatar">
                                                    {isUser ? (
                                                        <FaUser />
                                                    ) : (
                                                        <FaRobot />
                                                    )}
                                                </div>

                                                <div className="chat-detail-message-content">
                                                    <div className="chat-detail-message-meta">
                                                        <strong>
                                                            {isUser
                                                                ? "Traveller"
                                                                : "Dream Ceylon AI"}
                                                        </strong>

                                                        <span>
                                                            {formatDateTime(
                                                                message.createdAt
                                                            )}
                                                        </span>
                                                    </div>

                                                    <div className="chat-detail-message-bubble">
                                                        {
                                                            message.content
                                                        }
                                                    </div>

                                                    {message.blocked && (
                                                        <span className="chat-blocked-message">
                                                            <FaShieldAlt />

                                                            Blocked by
                                                            safety
                                                            moderation
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                )
                            )}
                        </div>
                    </main>

                    {/* Sidebar */}
                    <aside className="chat-details-sidebar">
                        {/* Status */}
                        <section className="chat-details-side-card">
                            <div className="chat-side-card-title">
                                <FaInfoCircle />

                                Conversation Status
                            </div>

                            <ConversationStatusBadge
                                status={
                                    conversation.status
                                }
                            />

                            {canUpdate ? (
                                <div className="mt-3">
                                    <label
                                        htmlFor="conversation-status"
                                        className="form-label small fw-semibold"
                                    >
                                        Change status
                                    </label>

                                    <select
                                        id="conversation-status"
                                        className="form-select"
                                        value={
                                            conversation.status
                                        }
                                        disabled={
                                            statusLoading ||
                                            deleteLoading
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            void updateStatus(
                                                event
                                                    .target
                                                    .value
                                            )
                                        }
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
                                                        !linkedInquiryId
                                                    }
                                                >
                                                    {
                                                        status
                                                    }
                                                </option>
                                            )
                                        )}
                                    </select>

                                    {statusLoading && (
                                        <small className="text-muted d-block mt-2">
                                            Updating
                                            status...
                                        </small>
                                    )}
                                </div>
                            ) : (
                                <p className="text-muted small mt-3 mb-0">
                                    Your account has
                                    read-only access.
                                </p>
                            )}
                        </section>

                        {/* Visitor */}
                        <section className="chat-details-side-card">
                            <div className="chat-side-card-title">
                                <FaUser />

                                Visitor Information
                            </div>

                            <div className="chat-visitor-profile">
                                <div className="chat-detail-visitor-avatar">
                                    {getVisitorInitials(
                                        conversation
                                    )}
                                </div>

                                <div>
                                    <strong>
                                        {getVisitorName(
                                            conversation
                                        )}
                                    </strong>

                                    <span>
                                        {conversation
                                                .visitor
                                                ?.country ||
                                            "Country not provided"}
                                    </span>
                                </div>
                            </div>

                            <div className="chat-contact-list">
                                <div>
                                    <FaEnvelope />

                                    {conversation
                                        .visitor
                                        ?.email ? (
                                        <a
                                            href={`mailto:${conversation.visitor.email}`}
                                        >
                                            {
                                                conversation
                                                    .visitor
                                                    .email
                                            }
                                        </a>
                                    ) : (
                                        <span>
                                            Email not
                                            provided
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <FaPhone />

                                    {conversation
                                        .visitor
                                        ?.whatsappNumber ? (
                                        <a
                                            href={`tel:${conversation.visitor.whatsappNumber}`}
                                        >
                                            {
                                                conversation
                                                    .visitor
                                                    .whatsappNumber
                                            }
                                        </a>
                                    ) : (
                                        <span>
                                            Phone not
                                            provided
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <FaGlobeAsia />

                                    <span>
                                        {conversation
                                                .visitor
                                                ?.country ||
                                            "Country not provided"}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Linked inquiry */}
                        <section className="chat-details-side-card">
                            <div className="chat-side-card-title">
                                {linkedInquiryId ? (
                                    <FaLink />
                                ) : (
                                    <FaUnlink />
                                )}

                                Linked Inquiry
                            </div>

                            {linkedInquiryId ? (
                                <>
                                    <div className="chat-linked-inquiry-details">
                                        <strong>
                                            {linkedInquiry
                                                    ?.fullName ||
                                                getVisitorName(
                                                    conversation
                                                )}
                                        </strong>

                                        <span>
                                            Status:{" "}
                                            {linkedInquiry
                                                    ?.status ||
                                                "Available"}
                                        </span>

                                        <span>
                                            Priority:{" "}
                                            {linkedInquiry
                                                    ?.priority ||
                                                "Medium"}
                                        </span>

                                        <span>
                                            Source:{" "}
                                            {linkedInquiry
                                                    ?.source ||
                                                "Website"}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        className="btn btn-success w-100 mt-3"
                                        onClick={
                                            openLinkedInquiry
                                        }
                                    >
                                        <FaExternalLinkAlt className="me-2" />

                                        Open Linked
                                        Inquiry
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary w-100 mt-2"
                                        onClick={() =>
                                            navigate(
                                                "/inquiries"
                                            )
                                        }
                                    >
                                        Go to Inquiry
                                        Module
                                    </button>
                                </>
                            ) : (
                                <div className="chat-no-inquiry">
                                    <FaUnlink />

                                    <p className="mb-0">
                                        The visitor has
                                        not submitted an
                                        inquiry from this
                                        conversation.
                                    </p>
                                </div>
                            )}
                        </section>

                        {/* Timeline */}
                        <section className="chat-details-side-card">
                            <div className="chat-side-card-title">
                                <FaClock />

                                Timeline
                            </div>

                            <div className="chat-timeline-list">
                                <div>
                                    <FaCalendarAlt />

                                    <span>
                                        <small>
                                            Started
                                        </small>

                                        <strong>
                                            {formatDateTime(
                                                conversation.startedAt
                                            )}
                                        </strong>
                                    </span>
                                </div>

                                <div>
                                    <FaClock />

                                    <span>
                                        <small>
                                            Last activity
                                        </small>

                                        <strong>
                                            {formatDateTime(
                                                conversation.lastActivityAt
                                            )}
                                        </strong>
                                    </span>
                                </div>

                                <div>
                                    <FaShieldAlt />

                                    <span>
                                        <small>
                                            Stored until
                                        </small>

                                        <strong>
                                            {formatDateTime(
                                                conversation.expiresAt
                                            )}
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Delete */}
                        {canDelete && (
                            <section className="chat-details-side-card chat-danger-card">
                                <div className="chat-side-card-title text-danger">
                                    <FaTrash />

                                    Danger Zone
                                </div>

                                <p className="small text-muted">
                                    Permanently
                                    remove this
                                    conversation and
                                    its message
                                    history.
                                </p>

                                <button
                                    type="button"
                                    className="btn btn-outline-danger w-100"
                                    disabled={
                                        deleteLoading ||
                                        statusLoading
                                    }
                                    onClick={
                                        deleteConversation
                                    }
                                >
                                    <FaTrash className="me-2" />

                                    {deleteLoading
                                        ? "Deleting..."
                                        : "Delete Conversation"}
                                </button>
                            </section>
                        )}
                    </aside>
                </div>

                {/* WhatsApp handover modal */}
                {showHandoverModal && (
                    <WhatsAppHandoverModal
                        conversation={
                            conversation
                        }
                        onClose={() =>
                            setShowHandoverModal(
                                false
                            )
                        }
                        onComplete={
                            handleHandoverComplete
                        }
                    />
                )}

                {/* Linked inquiry modal */}
                {showInquiryModal && (
                    <div
                        className="chat-inquiry-modal-overlay"
                        role="presentation"
                        onMouseDown={
                            closeInquiryModal
                        }
                    >
                        <section
                            className="chat-inquiry-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="linked-inquiry-title"
                            onMouseDown={(
                                event
                            ) =>
                                event.stopPropagation()
                            }
                        >
                            <header className="chat-inquiry-modal-header">
                                <div>
                                    <div className="chat-details-eyebrow">
                                        <FaLink />

                                        CRM Inquiry
                                    </div>

                                    <h4
                                        id="linked-inquiry-title"
                                        className="mb-0"
                                    >
                                        Linked Inquiry
                                        Details
                                    </h4>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-light btn-sm"
                                    onClick={
                                        closeInquiryModal
                                    }
                                    aria-label="Close inquiry details"
                                >
                                    <FaTimes />
                                </button>
                            </header>

                            <div className="chat-inquiry-modal-body">
                                {inquiryLoading ? (
                                    <div className="chat-inquiry-modal-loading">
                                        <div
                                            className="spinner-border text-success"
                                            role="status"
                                        >
                                            <span className="visually-hidden">
                                                Loading...
                                            </span>
                                        </div>

                                        <p className="mb-0 text-muted">
                                            Loading
                                            inquiry...
                                        </p>
                                    </div>
                                ) : inquiryError ? (
                                    <div className="alert alert-danger mb-0">
                                        {
                                            inquiryError
                                        }
                                    </div>
                                ) : inquiryDetails ? (
                                    <>
                                        <div className="chat-inquiry-heading">
                                            <div>
                                                <h4 className="mb-1">
                                                    {inquiryDetails.fullName ||
                                                        "Customer inquiry"}
                                                </h4>

                                                <p className="text-muted mb-0">
                                                    {inquiryDetails.email ||
                                                        "No email provided"}
                                                </p>
                                            </div>

                                            <span className="badge text-bg-success">
                                                {inquiryDetails.status ||
                                                    "New"}
                                            </span>
                                        </div>

                                        <div className="chat-inquiry-details-grid">
                                            <div>
                                                <span>
                                                    WhatsApp
                                                </span>

                                                <strong>
                                                    {inquiryDetails.whatsappNumber ||
                                                        "Not provided"}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Country
                                                </span>

                                                <strong>
                                                    {inquiryDetails.country ||
                                                        "Not provided"}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Travel Date
                                                </span>

                                                <strong>
                                                    {formatDate(
                                                        inquiryDetails.travelDate
                                                    )}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Travellers
                                                </span>

                                                <strong>
                                                    {Number(
                                                            inquiryDetails.numberOfTravelers
                                                        ) ||
                                                        1}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Priority
                                                </span>

                                                <strong>
                                                    {inquiryDetails.priority ||
                                                        "Medium"}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Source
                                                </span>

                                                <strong>
                                                    {inquiryDetails.source ||
                                                        "Website"}
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="chat-inquiry-text-section">
                                            <span>
                                                Customer
                                                Message
                                            </span>

                                            <div>
                                                {inquiryDetails.message ||
                                                    "No inquiry message was provided."}
                                            </div>
                                        </div>

                                        {inquiryDetails.adminNotes && (
                                            <div className="chat-inquiry-text-section">
                                                <span>
                                                    Admin Notes
                                                </span>

                                                <div>
                                                    {
                                                        inquiryDetails.adminNotes
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="alert alert-warning mb-0">
                                        Inquiry data is
                                        unavailable.
                                    </div>
                                )}
                            </div>

                            <footer className="chat-inquiry-modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={
                                        closeInquiryModal
                                    }
                                >
                                    Close
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-success"
                                    onClick={() => {
                                        closeInquiryModal();

                                        navigate(
                                            "/inquiries"
                                        );
                                    }}
                                >
                                    Go to Inquiry
                                    Module
                                </button>
                            </footer>
                        </section>
                    </div>
                )}
            </div>
        );
    };

export default ChatConversationDetails;