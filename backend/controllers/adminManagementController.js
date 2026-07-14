const Admin = require("../models/Admin");

const {
    ALL_PERMISSIONS,
    normalizePermissions,
    resolveAdminPermissions,
} = require("../config/permissions");

const {
    createActivityLog,
} = require("../utils/createActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => ({
    $regex: escapeRegex(value),
    $options: "i",
});

const serializeAdmin = (admin) => {
    const value =
        typeof admin.toObject === "function"
            ? admin.toObject()
            : { ...admin };

    delete value.password;

    return {
        ...value,
        permissions: resolveAdminPermissions(value),
    };
};

const isLastActiveSuperAdmin = async (admin, updates = {}) => {
    if (
        admin.role !== "Super Admin" ||
        admin.status !== "Active"
    ) {
        return false;
    }

    const nextRole =
        updates.role !== undefined
            ? updates.role
            : admin.role;

    const nextStatus =
        updates.status !== undefined
            ? updates.status
            : admin.status;

    const removingSuperAdminAccess =
        nextRole !== "Super Admin" ||
        nextStatus !== "Active";

    if (!removingSuperAdminAccess) {
        return false;
    }

    const count = await Admin.countDocuments({
        role: "Super Admin",
        status: "Active",
    });

    return count <= 1;
};

// @desc    Get all admins
// @route   GET /api/admins
// @access  Private
const getAdmins = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );

        const query = {};

        if (req.query.keyword) {
            query.$or = [
                {
                    name: buildRegex(req.query.keyword),
                },
                {
                    email: buildRegex(req.query.keyword),
                },
            ];
        }

        if (req.query.role) {
            query.role = req.query.role;
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const skip = (page - 1) * limit;

        const [admins, totalAdmins] = await Promise.all([
            Admin.find(query)
                .select("-password")
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limit),

            Admin.countDocuments(query),
        ]);

        return res.status(200).json({
            admins: admins.map(serializeAdmin),
            currentPage: page,
            totalPages: Math.ceil(totalAdmins / limit) || 1,
            totalAdmins,
            availablePermissions: ALL_PERMISSIONS,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load admin accounts",
            error: error.message,
        });
    }
};

// @desc    Create admin
// @route   POST /api/admins
// @access  Private
const createAdmin = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            role = "Viewer",
            status = "Active",
            customPermissions = [],
        } = req.body;

        if (!safeText(name)) {
            return res.status(400).json({
                message: "Admin name is required.",
            });
        }

        if (!safeText(email)) {
            return res.status(400).json({
                message: "Admin email is required.",
            });
        }

        if (!password || String(password).length < 8) {
            return res.status(400).json({
                message:
                    "Password must contain at least 8 characters.",
            });
        }

        const normalizedEmail = safeText(email).toLowerCase();

        const existingAdmin = await Admin.findOne({
            email: normalizedEmail,
        });

        if (existingAdmin) {
            return res.status(400).json({
                message:
                    "An admin account already exists with this email.",
            });
        }

        const admin = await Admin.create({
            name: safeText(name),
            email: normalizedEmail,
            password,
            role,
            status,
            customPermissions:
                normalizePermissions(customPermissions),
        });

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Admin",
            description: `Admin account was created for ${admin.name}`,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                role: admin.role,
                status: admin.status,
                customPermissions: admin.customPermissions,
            },
        });

        return res.status(201).json({
            message: "Admin account created successfully",
            admin: serializeAdmin(admin),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create admin account",
            error: error.message,
        });
    }
};

// @desc    Get one admin
// @route   GET /api/admins/:id
// @access  Private
const getAdminById = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id).select(
            "-password"
        );

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        return res.status(200).json({
            admin: serializeAdmin(admin),
            availablePermissions: ALL_PERMISSIONS,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load admin account",
            error: error.message,
        });
    }
};

// @desc    Update admin
// @route   PUT /api/admins/:id
// @access  Private
const updateAdmin = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        if (
            await isLastActiveSuperAdmin(admin, {
                role: req.body.role,
                status: req.body.status,
            })
        ) {
            return res.status(400).json({
                message:
                    "The final active Super Admin cannot be demoted or disabled.",
            });
        }

        const previousValues = {
            name: admin.name,
            email: admin.email,
            role: admin.role,
            status: admin.status,
            customPermissions: admin.customPermissions,
        };

        if (req.body.name !== undefined) {
            admin.name = safeText(req.body.name);
        }

        if (req.body.email !== undefined) {
            const normalizedEmail = safeText(
                req.body.email
            ).toLowerCase();

            const duplicateAdmin = await Admin.findOne({
                email: normalizedEmail,
                _id: {
                    $ne: admin._id,
                },
            });

            if (duplicateAdmin) {
                return res.status(400).json({
                    message:
                        "Another admin already uses this email address.",
                });
            }

            admin.email = normalizedEmail;
        }

        if (req.body.role !== undefined) {
            admin.role = req.body.role;
        }

        if (req.body.status !== undefined) {
            admin.status = req.body.status;
        }

        if (req.body.customPermissions !== undefined) {
            admin.customPermissions = normalizePermissions(
                req.body.customPermissions
            );
        }

        await admin.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Admin",
            description: `Admin account ${admin.name} was updated`,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                previousValues,
                updatedFields: Object.keys(req.body || {}),
                currentRole: admin.role,
                currentStatus: admin.status,
            },
        });

        return res.status(200).json({
            message: "Admin account updated successfully",
            admin: serializeAdmin(admin),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update admin account",
            error: error.message,
        });
    }
};

// @desc    Update admin status
// @route   PATCH /api/admins/:id/status
// @access  Private
const updateAdminStatus = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        const requestedStatus = req.body.status;

        if (!["Active", "Inactive"].includes(requestedStatus)) {
            return res.status(400).json({
                message:
                    "Status must be Active or Inactive.",
            });
        }

        const currentAdminId = String(
            req.admin?._id || req.user?._id || ""
        );

        if (
            String(admin._id) === currentAdminId &&
            requestedStatus === "Inactive"
        ) {
            return res.status(400).json({
                message:
                    "You cannot disable your own admin account.",
            });
        }

        if (
            await isLastActiveSuperAdmin(admin, {
                status: requestedStatus,
            })
        ) {
            return res.status(400).json({
                message:
                    "The final active Super Admin cannot be disabled.",
            });
        }

        const previousStatus = admin.status;
        admin.status = requestedStatus;

        await admin.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Admin",
            description: `${admin.name}'s admin account was set to ${admin.status}`,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                previousStatus,
                newStatus: admin.status,
                role: admin.role,
            },
        });

        return res.status(200).json({
            message: "Admin status updated successfully",
            admin: serializeAdmin(admin),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update admin status",
            error: error.message,
        });
    }
};

// @desc    Reset admin password
// @route   PATCH /api/admins/:id/password
// @access  Private
const resetAdminPassword = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        const password = req.body.password;

        if (!password || String(password).length < 8) {
            return res.status(400).json({
                message:
                    "Password must contain at least 8 characters.",
            });
        }

        admin.password = password;
        await admin.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Admin",
            description: `Password was reset for ${admin.name}`,
            relatedRecordId: admin._id,
            relatedModel: "Admin",
            referenceNo: admin.email,
            metadata: {
                role: admin.role,
            },
        });

        return res.status(200).json({
            message: "Admin password reset successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to reset admin password",
            error: error.message,
        });
    }
};

// @desc    Delete admin
// @route   DELETE /api/admins/:id
// @access  Private
const deleteAdmin = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);

        if (!admin) {
            return res.status(404).json({
                message: "Admin account not found.",
            });
        }

        const currentAdminId = String(
            req.admin?._id || req.user?._id || ""
        );

        if (String(admin._id) === currentAdminId) {
            return res.status(400).json({
                message:
                    "You cannot delete your own admin account.",
            });
        }

        if (
            await isLastActiveSuperAdmin(admin, {
                status: "Inactive",
            })
        ) {
            return res.status(400).json({
                message:
                    "The final active Super Admin cannot be deleted.",
            });
        }

        const deletedAdmin = {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            status: admin.status,
        };

        await admin.deleteOne();

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Admin",
            description: `Admin account ${deletedAdmin.name} was deleted`,
            relatedRecordId: deletedAdmin.id,
            relatedModel: "Admin",
            referenceNo: deletedAdmin.email,
            metadata: {
                role: deletedAdmin.role,
                status: deletedAdmin.status,
            },
        });

        return res.status(200).json({
            message: "Admin account deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete admin account",
            error: error.message,
        });
    }
};

module.exports = {
    getAdmins,
    createAdmin,
    getAdminById,
    updateAdmin,
    updateAdminStatus,
    resetAdminPassword,
    deleteAdmin,
};