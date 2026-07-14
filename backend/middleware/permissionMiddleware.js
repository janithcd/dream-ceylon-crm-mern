const {
    resolveAdminPermissions,
} = require("../config/permissions");

const authorizePermissions = (...requiredPermissions) => {
    return (req, res, next) => {
        const admin = req.admin || req.user;

        if (!admin) {
            return res.status(401).json({
                message: "Authentication is required.",
            });
        }

        if (admin.status === "Inactive") {
            return res.status(403).json({
                message: "Your admin account is inactive.",
            });
        }

        const adminPermissions = resolveAdminPermissions(admin);

        const missingPermissions = requiredPermissions.filter(
            (permission) => !adminPermissions.includes(permission)
        );

        if (missingPermissions.length > 0) {
            return res.status(403).json({
                message:
                    "You do not have permission to perform this action.",
                requiredPermissions,
                missingPermissions,
            });
        }

        req.adminPermissions = adminPermissions;

        return next();
    };
};

const authorizeAnyPermission = (...requiredPermissions) => {
    return (req, res, next) => {
        const admin = req.admin || req.user;

        if (!admin) {
            return res.status(401).json({
                message: "Authentication is required.",
            });
        }

        const adminPermissions = resolveAdminPermissions(admin);

        const hasPermission = requiredPermissions.some((permission) =>
            adminPermissions.includes(permission)
        );

        if (!hasPermission) {
            return res.status(403).json({
                message:
                    "You do not have permission to perform this action.",
                requiredPermissions,
            });
        }

        req.adminPermissions = adminPermissions;

        return next();
    };
};

module.exports = {
    authorizePermissions,
    authorizeAnyPermission,
};