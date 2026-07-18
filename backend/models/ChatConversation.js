const mongoose = require("mongoose");

const chatMessageSchema =
    new mongoose.Schema(
        {
            role: {
                type: String,
                enum: [
                    "user",
                    "assistant",
                ],
                required: true,
            },

            content: {
                type: String,
                required: true,
                trim: true,
                maxlength: 5000,
            },

            blocked: {
                type: Boolean,
                default: false,
            },

            createdAt: {
                type: Date,
                default: Date.now,
            },
        },
        {
            _id: false,
        }
    );

const chatConversationSchema =
    new mongoose.Schema(
        {
            sessionId: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                index: true,
            },

            source: {
                type: String,
                enum: [
                    "Website AI Chat",
                ],
                default:
                    "Website AI Chat",
            },

            status: {
                type: String,
                enum: [
                    "Active",
                    "Inquiry Created",
                    "Human Handover",
                    "Closed",
                    "Abandoned",
                ],
                default: "Active",
                index: true,
            },

            messages: {
                type: [
                    chatMessageSchema,
                ],
                default: [],
            },

            messageCount: {
                type: Number,
                default: 0,
                min: 0,
            },

            visitor: {
                fullName: {
                    type: String,
                    trim: true,
                    default: "",
                },

                email: {
                    type: String,
                    lowercase: true,
                    trim: true,
                    default: "",
                },

                whatsappNumber: {
                    type: String,
                    trim: true,
                    default: "",
                },

                country: {
                    type: String,
                    trim: true,
                    default: "",
                },
            },

            linkedInquiry: {
                type:
                mongoose.Schema.Types
                    .ObjectId,

                ref: "Inquiry",

                default: null,

                index: true,
            },

            startedAt: {
                type: Date,
                default: Date.now,
            },

            lastActivityAt: {
                type: Date,
                default: Date.now,
                index: true,
            },

            expiresAt: {
                type: Date,
                required: true,
            },
        },
        {
            timestamps: true,
        }
    );

chatConversationSchema.index(
    {
        expiresAt: 1,
    },
    {
        expireAfterSeconds: 0,
    }
);

chatConversationSchema.index({
    status: 1,
    lastActivityAt: -1,
});

const ChatConversation =
    mongoose.model(
        "ChatConversation",
        chatConversationSchema
    );

module.exports =
    ChatConversation;