const mongoose = require("mongoose");
const ActivityLog = require("../models/ActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const normalizeObjectId = (value) => {
    if (!value) {
        return null;
    }

    const possibleId =
        typeof value === "object" && value !== null
            ? value._id || value.id
            : value;

    if (!possibleId || !mongoose.Types.ObjectId.isValid(possibleId)) {
        return null;
    }

    return new mongoose.Types.ObjectId(possibleId);
};

const getAdminFromRequest = (req) => {
    const admin = req?.admin || req?.user || null;

    return {
        adminId: normalizeObjectId(admin),
        adminName: safeText(admin?.name || admin?.fullName),
        adminEmail: safeText(admin?.email).toLowerCase(),
    };
};

const getIpAddress = (req) => {
    const forwardedFor = req?.headers?.["x-forwarded-for"];

    if (forwardedFor) {
        return safeText(forwardedFor).split(",")[0].trim();
    }

    return safeText(
        req?.ip ||
        req?.socket?.remoteAddress ||
        req?.connection?.remoteAddress
    );
};

const createActivityLog = async ({
                                     req = null,
                                     action = "OTHER",
                                     module = "Other",
                                     description,
                                     admin = null,
                                     adminName = "",
                                     adminEmail = "",
                                     relatedRecordId = null,
                                     relatedModel = "",
                                     referenceNo = "",
                                     customerName = "",
                                     metadata = {},
                                     status = "Success",
                                 }) => {
    try {
        const requestAdmin = getAdminFromRequest(req);

        const resolvedAdminId =
            normalizeObjectId(admin) || requestAdmin.adminId || null;

        const resolvedAdminName =
            safeText(adminName) || requestAdmin.adminName || "";

        const resolvedAdminEmail =
            safeText(adminEmail).toLowerCase() ||
            requestAdmin.adminEmail ||
            "";

        return await ActivityLog.create({
            action,
            module,
            description: safeText(description) || "Activity recorded",
            admin: resolvedAdminId,
            adminName: resolvedAdminName,
            adminEmail: resolvedAdminEmail,
            relatedRecordId: normalizeObjectId(relatedRecordId),
            relatedModel: safeText(relatedModel),
            referenceNo: safeText(referenceNo),
            customerName: safeText(customerName),
            ipAddress: getIpAddress(req),
            userAgent: safeText(req?.headers?.["user-agent"]),
            requestMethod: safeText(req?.method).toUpperCase(),
            requestPath: safeText(req?.originalUrl || req?.path),
            metadata:
                metadata && typeof metadata === "object"
                    ? metadata
                    : {
                        value: metadata,
                    },
            status,
        });
    } catch (error) {
        /*
         * Activity logging must never break the main CRM operation.
         * We report the error in the server console and return null.
         */
        console.error("Activity log creation failed:", error.message);
        return null;
    }
};

module.exports = {
    createActivityLog,
};