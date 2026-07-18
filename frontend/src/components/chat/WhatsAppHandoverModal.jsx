import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    FaCheckCircle,
    FaCopy,
    FaExclamationTriangle,
    FaTimes,
    FaWhatsapp,
} from "react-icons/fa";

import api from "../../api/axios";

const getVisitorName = (
    conversation
) => {
    return (
        conversation
            ?.visitor
            ?.fullName
            ?.trim() ||
        "Traveller"
    );
};

const buildRequestSummary = (
    conversation
) => {
    if (
        !Array.isArray(
            conversation
                ?.messages
        )
    ) {
        return "";
    }

    return conversation.messages
        .filter(
            (message) =>
                message.role ===
                "user" &&
                !message.blocked &&
                message.content
                    ?.trim()
        )
        .slice(-4)
        .map(
            (
                message,
                index
            ) =>
                `${index + 1}. ${message.content
                    .trim()
                    .slice(
                        0,
                        350
                    )}`
        )
        .join("\n");
};

const buildDefaultMessage = (
    conversation
) => {
    const visitorName =
        getVisitorName(
            conversation
        );

    const requestSummary =
        buildRequestSummary(
            conversation
        ) ||
        "The traveller requested assistance with planning a Sri Lanka journey.";

    return [
        `Hello ${visitorName},`,
        "",
        "Thank you for contacting Dream Ceylon Journeys.",
        "",
        "I am a travel consultant from our team, and I am following up on your conversation with our Sri Lanka AI Travel Assistant.",
        "",
        "Your recent travel requests:",
        requestSummary,
        "",
        `Conversation reference: ${conversation?.sessionId || "Not available"}`,
        "",
        "We can now personally assist you with the route, travel dates, hotels, activities, private transport and final pricing.",
        "",
        "Please share any additional preferences, and we will prepare a suitable travel plan for you.",
        "",
        "Kind regards,",
        "Dream Ceylon Journeys",
    ].join("\n");
};

const copyText = async (
    value
) => {
    if (
        navigator.clipboard &&
        window.isSecureContext
    ) {
        await navigator.clipboard.writeText(
            value
        );

        return;
    }

    const textArea =
        document.createElement(
            "textarea"
        );

    textArea.value =
        value;

    textArea.style.position =
        "fixed";

    textArea.style.opacity =
        "0";

    document.body.appendChild(
        textArea
    );

    textArea.focus();
    textArea.select();

    document.execCommand(
        "copy"
    );

    textArea.remove();
};

const WhatsAppHandoverModal =
    ({
         conversation,
         onClose,
         onComplete,
     }) => {
        const defaultMessage =
            useMemo(
                () =>
                    buildDefaultMessage(
                        conversation
                    ),
                [
                    conversation,
                ]
            );

        const [
            message,
            setMessage,
        ] = useState(
            defaultMessage
        );

        const [
            loading,
            setLoading,
        ] = useState(false);

        const [
            copying,
            setCopying,
        ] = useState(false);

        const [
            copied,
            setCopied,
        ] = useState(false);

        const [
            error,
            setError,
        ] = useState("");

        const whatsappNumber =
            conversation
                ?.visitor
                ?.whatsappNumber ||
            "";

        useEffect(() => {
            setMessage(
                defaultMessage
            );
        }, [
            defaultMessage,
        ]);

        useEffect(() => {
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
                        "Escape" &&
                        !loading
                    ) {
                        onClose();
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
            loading,
            onClose,
        ]);

        const handleCopy =
            async () => {
                if (
                    !message.trim()
                ) {
                    return;
                }

                try {
                    setCopying(
                        true
                    );

                    setError("");

                    await copyText(
                        message
                    );

                    setCopied(
                        true
                    );

                    window.setTimeout(
                        () =>
                            setCopied(
                                false
                            ),
                        2500
                    );
                } catch {
                    setError(
                        "The message could not be copied."
                    );
                } finally {
                    setCopying(
                        false
                    );
                }
            };

        const handleSubmit =
            async (
                event
            ) => {
                event.preventDefault();

                const cleanMessage =
                    message.trim();

                if (
                    !cleanMessage
                ) {
                    setError(
                        "Please enter a WhatsApp handover message."
                    );

                    return;
                }

                if (
                    !whatsappNumber
                ) {
                    setError(
                        "This visitor has not provided a WhatsApp number."
                    );

                    return;
                }

                /*
                 * Open a blank tab immediately
                 * to avoid browser popup blocking
                 * after the API request completes.
                 */
                const whatsappWindow =
                    window.open(
                        "about:blank",
                        "_blank"
                    );

                if (
                    whatsappWindow
                ) {
                    whatsappWindow.opener =
                        null;
                }

                try {
                    setLoading(
                        true
                    );

                    setError("");

                    const response =
                        await api.post(
                            `/chat-conversations/${conversation._id}/handover`,
                            {
                                message:
                                cleanMessage,
                            }
                        );

                    const whatsappUrl =
                        response.data
                            ?.whatsappUrl;

                    if (
                        !whatsappUrl
                    ) {
                        throw new Error(
                            "The WhatsApp link was not returned."
                        );
                    }

                    if (
                        whatsappWindow
                    ) {
                        whatsappWindow.location.href =
                            whatsappUrl;
                    } else {
                        window.open(
                            whatsappUrl,
                            "_blank",
                            "noopener,noreferrer"
                        );
                    }

                    onComplete(
                        response.data
                            ?.conversation,

                        response.data
                            ?.message ||
                        "WhatsApp human handover prepared successfully."
                    );
                } catch (
                    requestError
                    ) {
                    if (
                        whatsappWindow
                    ) {
                        whatsappWindow.close();
                    }

                    setError(
                        requestError
                            .response
                            ?.data
                            ?.message ||
                        requestError
                            .message ||
                        "Failed to prepare the WhatsApp handover."
                    );
                } finally {
                    setLoading(
                        false
                    );
                }
            };

        return (
            <div
                className="chat-handover-overlay"
                role="presentation"
                onMouseDown={() => {
                    if (
                        !loading
                    ) {
                        onClose();
                    }
                }}
            >
                <section
                    className="chat-handover-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="whatsapp-handover-title"
                    onMouseDown={(
                        event
                    ) =>
                        event.stopPropagation()
                    }
                >
                    <header className="chat-handover-header">
                        <div>
                            <div className="chat-handover-eyebrow">
                                <FaWhatsapp />

                                Human
                                Handover
                            </div>

                            <h4
                                id="whatsapp-handover-title"
                                className="mb-1"
                            >
                                Continue on
                                WhatsApp
                            </h4>

                            <p className="text-muted mb-0">
                                Review or edit
                                the message
                                before opening
                                the customer’s
                                WhatsApp chat.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={
                                onClose
                            }
                            disabled={
                                loading
                            }
                            aria-label="Close WhatsApp handover"
                        >
                            <FaTimes />
                        </button>
                    </header>

                    <form
                        onSubmit={
                            handleSubmit
                        }
                    >
                        <div className="chat-handover-body">
                            {error && (
                                <div
                                    className="alert alert-danger d-flex align-items-start gap-2"
                                    role="alert"
                                >
                                    <FaExclamationTriangle className="mt-1 flex-shrink-0" />

                                    <span>
                                        {
                                            error
                                        }
                                    </span>
                                </div>
                            )}

                            <div className="chat-handover-recipient">
                                <div className="chat-handover-recipient-icon">
                                    <FaWhatsapp />
                                </div>

                                <div>
                                    <small>
                                        WhatsApp
                                        recipient
                                    </small>

                                    <strong>
                                        {getVisitorName(
                                            conversation
                                        )}
                                    </strong>

                                    <span>
                                        {whatsappNumber ||
                                            "No WhatsApp number provided"}
                                    </span>
                                </div>
                            </div>

                            {!whatsappNumber && (
                                <div className="alert alert-warning mt-3 mb-0">
                                    Add a valid
                                    international
                                    WhatsApp number
                                    to the linked
                                    inquiry before
                                    continuing.
                                </div>
                            )}

                            <div className="mt-4">
                                <div className="d-flex justify-content-between align-items-center gap-3 mb-2">
                                    <label
                                        htmlFor="handover-message"
                                        className="form-label fw-semibold mb-0"
                                    >
                                        Prepared
                                        message
                                    </label>

                                    <small className="text-muted">
                                        {
                                            message.length
                                        }
                                        /3000
                                    </small>
                                </div>

                                <textarea
                                    id="handover-message"
                                    className="form-control chat-handover-textarea"
                                    rows={14}
                                    maxLength={
                                        3000
                                    }
                                    value={
                                        message
                                    }
                                    onChange={(
                                        event
                                    ) => {
                                        setMessage(
                                            event
                                                .target
                                                .value
                                        );

                                        if (
                                            error
                                        ) {
                                            setError(
                                                ""
                                            );
                                        }
                                    }}
                                    disabled={
                                        loading
                                    }
                                />
                            </div>

                            <div className="chat-handover-notice">
                                <FaCheckCircle />

                                <span>
                                    Opening
                                    WhatsApp will
                                    also mark this
                                    conversation as
                                    <strong>
                                        {" "}
                                        Human
                                        Handover
                                    </strong>
                                    .
                                </span>
                            </div>
                        </div>

                        <footer className="chat-handover-footer">
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={
                                    onClose
                                }
                                disabled={
                                    loading
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-success"
                                onClick={
                                    handleCopy
                                }
                                disabled={
                                    loading ||
                                    copying ||
                                    !message.trim()
                                }
                            >
                                {copied ? (
                                    <>
                                        <FaCheckCircle className="me-2" />

                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <FaCopy className="me-2" />

                                        {copying
                                            ? "Copying..."
                                            : "Copy Message"}
                                    </>
                                )}
                            </button>

                            <button
                                type="submit"
                                className="btn btn-success"
                                disabled={
                                    loading ||
                                    !message.trim() ||
                                    !whatsappNumber
                                }
                            >
                                <FaWhatsapp className="me-2" />

                                {loading
                                    ? "Preparing..."
                                    : "Open WhatsApp"}
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        );
    };

export default WhatsAppHandoverModal;