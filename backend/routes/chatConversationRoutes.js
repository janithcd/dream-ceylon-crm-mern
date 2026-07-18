const express =
    require("express");


const {
    getChatConversations,
    getChatConversationById,
    updateChatConversationStatus,
    prepareWhatsAppHandover,
    deleteChatConversation,
} = require(
    "../controllers/chatConversationController"
);

const {
    getChatAnalytics,
} = require(
    "../controllers/chatAnalyticsController"
);
const {
    protect,
} = require(
    "../middleware/authMiddleware"
);

const router =
    express.Router();

function getUserRole(req) {
    return (
        req.user?.role?.name ||
        req.user?.role ||
        ""
    );
}

function allowRoles(
    ...allowedRoles
) {
    return (
        req,
        res,
        next
    ) => {
        const role =
            getUserRole(req);

        if (
            !allowedRoles.includes(
                role
            )
        ) {
            return res
                .status(403)
                .json({
                    message:
                        "You do not have permission to access AI chat conversations.",
                });
        }

        next();
    };
}

/*
 * All routes below require a valid
 * CRM authentication token.
 */
router.use(protect);

/*
 * Finance users must not access
 * AI chat conversations.
 *
 * Viewer users can read conversations.
 */
router.get(
    "/",
    allowRoles(
        "Super Admin",
        "Manager",
        "Sales",
        "Viewer"
    ),
    getChatConversations
);
router.get(
    "/analytics",
    allowRoles(
        "Super Admin",
        "Manager",
        "Sales",
        "Viewer"
    ),
    getChatAnalytics
);
router.get(
    "/:id",
    allowRoles(
        "Super Admin",
        "Manager",
        "Sales",
        "Viewer"
    ),
    getChatConversationById
);

/*
 * Sales, Manager and Super Admin
 * may update conversation status.
 */
router.patch(
    "/:id/status",
    allowRoles(
        "Super Admin",
        "Manager",
        "Sales"
    ),
    updateChatConversationStatus
);
/*
 * Sales, Manager and Super Admin
 * may initiate a WhatsApp handover.
 */
router.post(
    "/:id/handover",
    allowRoles(
        "Super Admin",
        "Manager",
        "Sales"
    ),
    prepareWhatsAppHandover
);
/*
 * Only Manager and Super Admin
 * may permanently delete a conversation.
 */
router.delete(
    "/:id",
    allowRoles(
        "Super Admin",
        "Manager"
    ),
    deleteChatConversation
);

module.exports =
    router;