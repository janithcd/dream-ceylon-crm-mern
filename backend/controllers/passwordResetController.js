const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const transactionalEmail = require("../utils/transactionalEmail");

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUEST_MESSAGE = "If this is an active CRM account, a reset code will be sent to its email address.";
const INVALID_CODE_MESSAGE = "The code is invalid or expired. Request a new code if needed.";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const hashCode = (adminId, code) => crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(`${adminId}:${code}`).digest("hex");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const requestPasswordReset = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!transactionalEmail.isConfigured()) {
        return res.status(503).json({ message: "Password recovery is temporarily unavailable. Contact your administrator." });
    }

    try {
        const admin = await Admin.findOne({ email, status: "Active" }).select("_id");
        if (admin) {
            const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
            const codeHash = hashCode(admin._id, code);
            const now = Date.now();
            // The conditional update makes the cooldown effective across app instances.
            const claimed = await Admin.findOneAndUpdate(
                {
                    _id: admin._id,
                    email,
                    status: "Active",
                    $or: [
                        { "passwordReset.sentAt": { $lte: new Date(now - RESEND_COOLDOWN_MS) } },
                        { "passwordReset.sentAt": { $exists: false } },
                    ],
                },
                {
                    $set: {
                        passwordReset: {
                            codeHash,
                            expiresAt: new Date(now + CODE_LIFETIME_MS),
                            sentAt: new Date(now),
                            attempts: 0,
                        },
                    },
                },
                { projection: { email: 1 } }
            );
            if (claimed) {
                // Respond without exposing whether an account triggered a network call.
                void transactionalEmail.sendPasswordResetCode({ to: email, code }).then((requestId) => {
                    console.info(`Password reset email accepted by Zoho CPaaS${requestId ? ` (request ID ${requestId})` : ""}.`);
                }).catch(async (error) => {
                    // Only remove this exact request, so a later request cannot be erased.
                    try {
                        await Admin.updateOne(
                            { _id: admin._id, "passwordReset.codeHash": codeHash },
                            { $unset: { passwordReset: "" } }
                        );
                    } catch (rollbackError) {
                        console.error("Password reset delivery cleanup failed:", rollbackError.message);
                    }
                    console.error("Password reset email delivery failed:", error.message);
                });
            }
        }
        return res.status(200).json({ message: REQUEST_MESSAGE });
    } catch (error) {
        console.error("Password reset request failed:", error);
        return res.status(500).json({ message: "Password recovery is temporarily unavailable." });
    }
};

const verifyResetCode = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "");
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ message: INVALID_CODE_MESSAGE });
    }

    try {
        const admin = await Admin.findOne({ email, status: "Active" }).select("_id");
        if (!admin) {
            return res.status(400).json({ message: INVALID_CODE_MESSAGE });
        }
        const codeHash = hashCode(admin._id, code);
        const token = crypto.randomBytes(32).toString("hex");
        const now = new Date();
        const eligible = {
            _id: admin._id,
            email,
            status: "Active",
            "passwordReset.expiresAt": { $gt: now },
            "passwordReset.attempts": { $lt: MAX_ATTEMPTS },
        };
        const verified = await Admin.findOneAndUpdate(
            { ...eligible, "passwordReset.codeHash": codeHash },
            {
                $set: {
                    "passwordReset.tokenHash": hashToken(token),
                    "passwordReset.tokenExpiresAt": new Date(now.getTime() + TOKEN_LIFETIME_MS),
                },
                $unset: {
                    "passwordReset.codeHash": "",
                    "passwordReset.expiresAt": "",
                    "passwordReset.sentAt": "",
                    "passwordReset.attempts": "",
                },
            },
            { projection: { _id: 1 } }
        );
        if (!verified) {
            await Admin.updateOne(
                { ...eligible, "passwordReset.codeHash": { $exists: true, $ne: codeHash } },
                { $inc: { "passwordReset.attempts": 1 } }
            );
            return res.status(400).json({ message: INVALID_CODE_MESSAGE });
        }
        return res.status(200).json({ resetToken: token, message: "Code verified. Set a new password." });
    } catch (error) {
        console.error("Password reset code verification failed:", error);
        return res.status(500).json({ message: "Password recovery is temporarily unavailable." });
    }
};

const resetPassword = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const resetToken = String(req.body?.resetToken || "");
    const password = req.body?.password;
    if (!validEmail(email) || !/^[a-f0-9]{64}$/.test(resetToken)) {
        return res.status(400).json({ message: "Reset session is invalid or expired. Request a new code." });
    }
    if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ message: "Use a password of at least 12 characters and at most 72 bytes." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = await Admin.findOneAndUpdate(
            {
                email,
                status: "Active",
                "passwordReset.tokenHash": hashToken(resetToken),
                "passwordReset.tokenExpiresAt": { $gt: new Date() },
            },
            {
                $set: { password: hashedPassword },
                $inc: { tokenVersion: 1 },
                $unset: { passwordReset: "" },
            },
            { projection: { _id: 1 }, runValidators: true }
        );
        if (!admin) {
            return res.status(400).json({ message: "Reset session is invalid or expired. Request a new code." });
        }
        return res.status(200).json({ message: "Password changed. Sign in with your new password." });
    } catch (error) {
        console.error("Password reset failed:", error);
        return res.status(500).json({ message: "Password recovery is temporarily unavailable." });
    }
};

module.exports = { requestPasswordReset, verifyResetCode, resetPassword };
