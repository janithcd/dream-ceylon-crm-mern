const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { createActivityLog } = require("../utils/createActivityLog");

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
    return String(value || "").trim().toLowerCase();
};

// @desc    Register a new admin
// @route   POST /api/auth/register
// @access  Public during initial setup
const registerAdmin = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email, and password are required",
            });
        }

        const existingAdmin = await Admin.findOne({ email });

        if (existingAdmin) {
            return res.status(400).json({
                message: "An admin account already exists with this email",
            });
        }

        const admin = await Admin.create({
            name,
            email,
            password,
        });

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Admin",
            description: `${admin.name || admin.email} registered an admin account`,
            admin: admin._id,
            adminName: admin.name,
            adminEmail: admin.email,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                registrationTime: new Date(),
            },
        });

        return res.status(201).json({
            _id: admin._id,
            name: admin.name,
            email: admin.email,
            token: generateToken(admin._id),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Admin registration failed",
            error: error.message,
        });
    }
};

// @desc    Login admin
// @route   POST /api/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!email || !password) {
            await createActivityLog({
                req,
                action: "LOGIN",
                module: "Authentication",
                description: `Failed login attempt for ${email || "unknown email"}`,
                adminEmail: email,
                referenceNo: email,
                status: "Failed",
                metadata: {
                    reason: "Email and password are required",
                },
            });

            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const admin = await Admin.findOne({ email });

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
                message: "Invalid email or password",
            });
        }

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
                loginTime: new Date(),
            },
        });

        return res.status(200).json({
            _id: admin._id,
            name: admin.name,
            email: admin.email,
            token: generateToken(admin._id),
        });
    } catch (error) {
        await createActivityLog({
            req,
            action: "LOGIN",
            module: "Authentication",
            description: `Login request failed for ${normalizeEmail(req.body?.email) || "unknown email"}`,
            adminEmail: normalizeEmail(req.body?.email),
            referenceNo: normalizeEmail(req.body?.email),
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

// @desc    Get logged-in admin profile
// @route   GET /api/auth/profile
// @access  Private
const getAdminProfile = async (req, res) => {
    try {
        const authenticatedAdmin = req.admin || req.user;
        const adminId = authenticatedAdmin?._id || authenticatedAdmin?.id;

        if (!adminId) {
            return res.status(401).json({
                message: "Not authorized",
            });
        }

        const admin = await Admin.findById(adminId).select("-password");

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found",
            });
        }

        return res.status(200).json(admin);
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
