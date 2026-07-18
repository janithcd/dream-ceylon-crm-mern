const STATUS_CLASS_NAMES = {
    Active: "chat-status-active",
    "Inquiry Created": "chat-status-inquiry",
    "Human Handover": "chat-status-handover",
    Closed: "chat-status-closed",
    Abandoned: "chat-status-abandoned",
};

const ConversationStatusBadge = ({
                                     status = "Active",
                                 }) => {
    const statusClassName =
        STATUS_CLASS_NAMES[status] ||
        "chat-status-default";

    return (
        <span
            className={`chat-status-badge ${statusClassName}`}
        >
            <span
                className="chat-status-dot"
                aria-hidden="true"
            />

            {status}
        </span>
    );
};

export default ConversationStatusBadge;