const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const protect = async (req, res, next) => {
    try {
        let token = "";

        const authorizationHeader = req.headers.authorization;

        if (
            authorizationHeader &&
            authorizationHeader.startsWith("Bearer ")
        ) {
            token = authorizationHeader.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({
                message: "Not authorized. Authentication token is missing.",
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const adminId =
            decoded.id ||
            decoded._id ||
            decoded.adminId;

        if (!adminId) {
            return res.status(401).json({
                message: "Invalid authentication token.",
            });
        }

        const admin = await Admin.findById(adminId).select("-password");

        if (!admin) {
            return res.status(401).json({
                message: "Admin account no longer exists.",
            });
        }

        if (admin.status === "Inactive") {
            return res.status(403).json({
                message:
                    "Your admin account is inactive. Contact the Super Admin.",
            });
        }

        req.admin = admin;
        req.user = admin;

        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                message: "Your login session has expired. Please log in again.",
            });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                message: "Invalid authentication token.",
            });
        }

        return res.status(500).json({
            message: "Authentication failed",
            error: error.message,
        });
    }
};

module.exports = {
    protect,
};