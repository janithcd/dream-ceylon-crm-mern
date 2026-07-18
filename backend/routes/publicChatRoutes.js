const express =
    require("express");

const {
    chatWithTravelAssistant,
    getSavedConversation,
    getTravelAssistantHealth,
} = require(
    "../controllers/publicChatController"
);

const router =
    express.Router();

router.get(
    "/health",
    getTravelAssistantHealth
);

router.get(
    "/conversation/:conversationId",
    getSavedConversation
);

router.post(
    "/chat",
    chatWithTravelAssistant
);

module.exports = router;