const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const {
    createActivityLog,
} = require("../utils/createActivityLog");

const {
    resolveAdminPermissions,
} = require("../config/permissions");

const generateToken = (adminId) => {
    return jwt.sign(
        {
            id: adminId,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "30d",
        }
    );
};

const normalizeEmail = (value) => {
    return String(value || "")
        .trim()
        .toLowerCase();
};

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const serializeAdmin = (admin) => {
    return {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role || "Viewer",
        status: admin.status || "Active",
        customPermissions: admin.customPermissions || [],
        permissions: resolveAdminPermissions(admin),
        lastLoginAt: admin.lastLoginAt || null,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
    };
};


const registerAdmin = async (req, res) => {
    try {
        const name = safeText(req.body.name);
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required.",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters.",
            });
        }

        const totalAdmins = await Admin.countDocuments();

        if (totalAdmins > 0) {
            return res.status(403).json({
                message:
                    "Public admin registration is disabled. New admin accounts must be created by a Super Admin.",
            });
        }

        const existingAdmin = await Admin.findOne({
            email,
        });

        if (existingAdmin) {
            return res.status(400).json({
                message: "An admin account already exists with this email.",
            });
        }

        const admin = await Admin.create({
            name,
            email,
            password,
            role: "Super Admin",
            status: "Active",
            customPermissions: [],
        });

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Admin",
            description: `${admin.name} registered the first Super Admin account`,
            admin: admin._id,
            adminName: admin.name,
            adminEmail: admin.email,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                role: admin.role,
                status: admin.status,
                registrationTime: new Date(),
            },
        });

        const serializedAdmin = serializeAdmin(admin);

        return res.status(201).json({
            ...serializedAdmin,
            token: generateToken(admin._id),
        });
    } catch (error) {
        await createActivityLog({
            req,
            action: "CREATE",
            module: "Admin",
            description: `Admin registration failed for ${
                normalizeEmail(req.body?.email) || "unknown email"
            }`,
            adminEmail: normalizeEmail(req.body?.email),
            referenceNo: normalizeEmail(req.body?.email),
            status: "Failed",
            metadata: {
                reason: error.message,
            },
        });

        return res.status(500).json({
            message: "Admin registration failed",
            error: error.message,
        });
    }
};


const loginAdmin = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!email || !password) {
            await createActivityLog({
                req,
                action: "LOGIN",
                module: "Authentication",
                description: `Failed login attempt for ${
                    email || "unknown email"
                }`,
                adminEmail: email,
                referenceNo: email,
                status: "Failed",
                metadata: {
                    reason: "Email and password are required",
                },
            });

            return res.status(400).json({
                message: "Email and password are required.",
            });
        }

        const admin = await Admin.findOne({
            email,
        });

        const passwordMatches =
            admin && typeof admin.matchPassword === "function"
                ? await admin.matchPassword(password)
                : false;

        if (!admin || !passwordMatches) {
            await createActivityLog({
                req,
                action: "LOGIN",
                module: "Authentication",
                description: `Failed login attempt for ${email}`,
                admin: admin?._id || null,
                adminName: admin?.name || "",
                adminEmail: email,
                relatedRecordId: admin?._id || null,
                relatedModel: admin ? "Admin" : "",
                referenceNo: email,
                status: "Failed",
                metadata: {
                    reason: "Invalid email or password",
                },
            });

            return res.status(401).json({
                message: "Invalid email or password.",
            });
        }

        if (admin.status === "Inactive") {
            await createActivityLog({
                req,
                action: "LOGIN",
                module: "Authentication",
                description: `Inactive admin login attempt for ${admin.email}`,
                admin: admin._id,
                adminName: admin.name,
                adminEmail: admin.email,
                relatedRecordId: admin._id,
                relatedModel: "Admin",
                referenceNo: admin.email,
                status: "Failed",
                metadata: {
                    reason: "Admin account is inactive",
                    role: admin.role,
                },
            });

            return res.status(403).json({
                message:
                    "Your admin account is inactive. Contact the Super Admin.",
            });
        }

        admin.lastLoginAt = new Date();

        await createActivityLog({
            req,
            action: "LOGIN",
            module: "Authentication",
            description: `${admin.name || admin.email} logged into the CRM`,
            admin: admin._id,
            adminName: admin.name,
            adminEmail: admin.email,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                loginTime: admin.lastLoginAt,
                role: admin.role,
            },
        });

        const serializedAdmin = serializeAdmin(admin);

        return res.status(200).json({
            ...serializedAdmin,
            token: generateToken(admin._id),
        });
    } catch (error) {
        const email = normalizeEmail(req.body?.email);

        await createActivityLog({
            req,
            action: "LOGIN",
            module: "Authentication",
            description: `Login request failed for ${
                email || "unknown email"
            }`,
            adminEmail: email,
            referenceNo: email,
            status: "Failed",
            metadata: {
                reason: error.message,
            },
        });

        return res.status(500).json({
            message: "Login failed",
            error: error.message,
        });
    }
};


const getAdminProfile = async (req, res) => {
    try {
        const authenticatedAdmin = req.admin || req.user;

        const adminId =
            authenticatedAdmin?._id ||
            authenticatedAdmin?.id;

        if (!adminId) {
            return res.status(401).json({
                message: "Not authorized.",
            });
        }

        const admin = await Admin.findById(adminId).select("-password");

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        if (admin.status === "Inactive") {
            return res.status(403).json({
                message:
                    "Your admin account is inactive. Contact the Super Admin.",
            });
        }

        return res.status(200).json(
            serializeAdmin(admin)
        );
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load admin profile",
            error: error.message,
        });
    }
};

module.exports = {
    registerAdmin,
    loginAdmin,
    getAdminProfile,
};