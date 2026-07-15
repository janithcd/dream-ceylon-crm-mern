import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FaCheckCircle,
    FaEdit,
    FaExclamationTriangle,
    FaKey,
    FaSave,
    FaSearch,
    FaShieldAlt,
    FaSyncAlt,
    FaTimes,
    FaToggleOff,
    FaToggleOn,
    FaTrash,
    FaUserPlus,
    FaUsersCog,
} from "react-icons/fa";

import api from "../api/axios";
import {
    PERMISSION_GROUPS,
    ROLE_OPTIONS,
    STATUS_OPTIONS,
} from "../config/permissions";
import PermissionGuard from "../components/PermissionGuard";

const initialFilters = {
    keyword: "",
    role: "",
    status: "",
};

const initialAdminForm = {
    name: "",
    email: "",
    password: "",
    role: "Viewer",
    status: "Active",
    customPermissions: [],
};

const formatDateTime = (value) => {
    if (!value) {
        return "Never";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Never";
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getRoleBadgeClass = (role) => {
    switch (role) {
        case "Super Admin":
            return "text-bg-danger";
        case "Manager":
            return "text-bg-primary";
        case "Sales":
            return "text-bg-success";
        case "Finance":
            return "text-bg-warning";
        case "Viewer":
            return "text-bg-secondary";
        default:
            return "text-bg-dark";
    }
};

const Admins = () => {
    const [admins, setAdmins] = useState([]);
    const [currentAdmin, setCurrentAdmin] = useState(null);
    const [availablePermissions, setAvailablePermissions] = useState([]);

    const [filters, setFilters] = useState(initialFilters);
    const [activeFilters, setActiveFilters] = useState(initialFilters);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalAdmins, setTotalAdmins] = useState(0);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminModalMode, setAdminModalMode] = useState("create");
    const [selectedAdminId, setSelectedAdminId] = useState("");
    const [adminForm, setAdminForm] = useState(initialAdminForm);

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordAdmin, setPasswordAdmin] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const permissionSet = useMemo(
        () => new Set(availablePermissions),
        [availablePermissions]
    );

    const visiblePermissionGroups = useMemo(() => {
        if (permissionSet.size === 0) {
            return PERMISSION_GROUPS;
        }

        return PERMISSION_GROUPS.map((group) => ({
            ...group,
            permissions: group.permissions.filter(([permission]) =>
                permissionSet.has(permission)
            ),
        })).filter((group) => group.permissions.length > 0);
    }, [permissionSet]);

    const fetchCurrentAdmin = useCallback(async () => {
        try {
            const response = await api.get("/auth/profile");
            setCurrentAdmin(response.data?.admin || response.data);
        } catch {
            setCurrentAdmin(null);
        }
    }, []);

    const fetchAdmins = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 12,
            };

            Object.entries(activeFilters).forEach(([key, value]) => {
                if (value) {
                    params[key] = value;
                }
            });

            const response = await api.get("/admins", { params });

            setAdmins(response.data?.admins || []);
            setAvailablePermissions(
                response.data?.availablePermissions || []
            );
            setTotalAdmins(response.data?.totalAdmins || 0);
            setTotalPages(response.data?.totalPages || 1);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Failed to load admin accounts."
            );
        } finally {
            setLoading(false);
        }
    }, [page, activeFilters]);

    useEffect(() => {
        fetchCurrentAdmin();
    }, [fetchCurrentAdmin]);

    useEffect(() => {
        fetchAdmins();
    }, [fetchAdmins]);

    useEffect(() => {
        const shouldLockBodyScroll =
            showAdminModal || showPasswordModal;

        if (!shouldLockBodyScroll) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showAdminModal, showPasswordModal]);

    const clearMessages = () => {
        setError("");
        setSuccess("");
    };

    const handleFilterChange = (event) => {
        const { name, value } = event.target;

        setFilters((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const applyFilters = (event) => {
        event.preventDefault();
        setPage(1);
        setActiveFilters(filters);
    };

    const resetFilters = () => {
        setFilters(initialFilters);
        setActiveFilters(initialFilters);
        setPage(1);
    };

    const openCreateModal = () => {
        clearMessages();
        setAdminModalMode("create");
        setSelectedAdminId("");
        setAdminForm(initialAdminForm);
        setShowAdminModal(true);
    };

    const openEditModal = (admin) => {
        clearMessages();
        setAdminModalMode("edit");
        setSelectedAdminId(admin._id);
        setAdminForm({
            name: admin.name || "",
            email: admin.email || "",
            password: "",
            role: admin.role || "Viewer",
            status: admin.status || "Active",
            customPermissions: Array.isArray(admin.customPermissions)
                ? admin.customPermissions
                : [],
        });
        setShowAdminModal(true);
    };

    const closeAdminModal = () => {
        if (saving) {
            return;
        }

        setShowAdminModal(false);
        setSelectedAdminId("");
        setAdminForm(initialAdminForm);
    };

    const handleAdminFormChange = (event) => {
        const { name, value } = event.target;

        setAdminForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const toggleCustomPermission = (permission) => {
        setAdminForm((previous) => {
            const exists = previous.customPermissions.includes(permission);

            return {
                ...previous,
                customPermissions: exists
                    ? previous.customPermissions.filter(
                        (item) => item !== permission
                    )
                    : [...previous.customPermissions, permission],
            };
        });
    };

    const selectAllCustomPermissions = () => {
        const permissions =
            availablePermissions.length > 0
                ? availablePermissions
                : PERMISSION_GROUPS.flatMap((group) =>
                    group.permissions.map(([permission]) => permission)
                );

        setAdminForm((previous) => ({
            ...previous,
            customPermissions: [...new Set(permissions)],
        }));
    };

    const clearCustomPermissions = () => {
        setAdminForm((previous) => ({
            ...previous,
            customPermissions: [],
        }));
    };

    const saveAdmin = async (event) => {
        event.preventDefault();
        clearMessages();

        if (!adminForm.name.trim()) {
            setError("Admin name is required.");
            return;
        }

        if (!adminForm.email.trim()) {
            setError("Admin email is required.");
            return;
        }

        if (
            adminModalMode === "create" &&
            adminForm.password.length < 8
        ) {
            setError("Password must contain at least 8 characters.");
            return;
        }

        try {
            setSaving(true);

            const payload = {
                name: adminForm.name.trim(),
                email: adminForm.email.trim().toLowerCase(),
                role: adminForm.role,
                status: adminForm.status,
                customPermissions: adminForm.customPermissions,
            };

            if (adminModalMode === "create") {
                payload.password = adminForm.password;
                await api.post("/admins", payload);
                setSuccess("Admin account created successfully.");
            } else {
                await api.put(`/admins/${selectedAdminId}`, payload);
                setSuccess("Admin account updated successfully.");
            }

            setShowAdminModal(false);
            setSelectedAdminId("");
            setAdminForm(initialAdminForm);
            await fetchAdmins();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                `Failed to ${
                    adminModalMode === "create" ? "create" : "update"
                } admin account.`
            );
        } finally {
            setSaving(false);
        }
    };

    const toggleAdminStatus = async (admin) => {
        clearMessages();

        const nextStatus =
            admin.status === "Active" ? "Inactive" : "Active";

        const confirmed = window.confirm(
            `Set ${admin.name}'s account to ${nextStatus}?`
        );

        if (!confirmed) {
            return;
        }

        try {
            setActionLoadingId(admin._id);

            await api.patch(`/admins/${admin._id}/status`, {
                status: nextStatus,
            });

            setSuccess(
                `${admin.name}'s account is now ${nextStatus}.`
            );

            await fetchAdmins();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Failed to update admin status."
            );
        } finally {
            setActionLoadingId("");
        }
    };

    const openPasswordResetModal = (admin) => {
        clearMessages();
        setPasswordAdmin(admin);
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordModal(true);
    };

    const closePasswordModal = () => {
        if (saving) {
            return;
        }

        setShowPasswordModal(false);
        setPasswordAdmin(null);
        setNewPassword("");
        setConfirmPassword("");
    };

    const resetAdminPassword = async (event) => {
        event.preventDefault();
        clearMessages();

        if (newPassword.length < 8) {
            setError("Password must contain at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Password confirmation does not match.");
            return;
        }

        try {
            setSaving(true);

            await api.patch(`/admins/${passwordAdmin._id}/password`, {
                password: newPassword,
            });

            setSuccess(
                `Password reset successfully for ${passwordAdmin.name}.`
            );

            setShowPasswordModal(false);
            setPasswordAdmin(null);
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Failed to reset admin password."
            );
        } finally {
            setSaving(false);
        }
    };

    const deleteAdmin = async (admin) => {
        clearMessages();

        const confirmed = window.confirm(
            `Delete ${admin.name}'s admin account permanently? This cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        try {
            setActionLoadingId(admin._id);

            await api.delete(`/admins/${admin._id}`);

            setSuccess("Admin account deleted successfully.");

            if (admins.length === 1 && page > 1) {
                setPage((previous) => previous - 1);
            } else {
                await fetchAdmins();
            }
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Failed to delete admin account."
            );
        } finally {
            setActionLoadingId("");
        }
    };

    const refreshPage = async () => {
        clearMessages();
        await Promise.all([fetchCurrentAdmin(), fetchAdmins()]);
    };

    const currentAdminId = String(currentAdmin?._id || "");

    return (
        <div>
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
                <div>
                    <h2 className="fw-bold mb-1">Admin Management</h2>
                    <p className="text-muted mb-0">
                        Create accounts, assign roles and control access to the CRM.
                    </p>
                </div>

                <div className="d-flex gap-2">
                    <button
                        type="button"
                        className="btn btn-outline-success"
                        onClick={refreshPage}
                        disabled={loading}
                    >
                        <FaSyncAlt className="me-2" />
                        Refresh
                    </button>

                    <PermissionGuard permission="admin.create">
                        <button
                            type="button"
                            className="btn btn-success"
                            onClick={openCreateModal}
                        >
                            <FaUserPlus className="me-2" />
                            Add Admin
                        </button>
                    </PermissionGuard>
                </div>
            </div>

            {error && (
                <div className="alert alert-danger d-flex align-items-center gap-2">
                    <FaExclamationTriangle />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="alert alert-success d-flex align-items-center gap-2">
                    <FaCheckCircle />
                    <span>{success}</span>
                </div>
            )}

            <div className="row g-4 mb-4">
                <div className="col-md-4">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">Total Admins</p>
                            <h3 className="fw-bold mb-0">{totalAdmins}</h3>
                        </div>
                        <div className="stat-icon">
                            <FaUsersCog />
                        </div>
                    </div>
                </div>

                <div className="col-md-4">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">Active on This Page</p>
                            <h3 className="fw-bold text-success mb-0">
                                {
                                    admins.filter(
                                        (admin) => admin.status === "Active"
                                    ).length
                                }
                            </h3>
                        </div>
                        <div className="stat-icon">
                            <FaToggleOn />
                        </div>
                    </div>
                </div>

                <div className="col-md-4">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">Your Role</p>
                            <h5 className="fw-bold mb-0">
                                {currentAdmin?.role || "Loading..."}
                            </h5>
                        </div>
                        <div className="stat-icon">
                            <FaShieldAlt />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <form onSubmit={applyFilters}>
                        <div className="row g-3 align-items-end">
                            <div className="col-lg-5">
                                <label className="form-label fw-semibold">
                                    Search
                                </label>

                                <div className="input-group">
                                    <span className="input-group-text">
                                        <FaSearch />
                                    </span>
                                    <input
                                        type="text"
                                        name="keyword"
                                        className="form-control"
                                        value={filters.keyword}
                                        onChange={handleFilterChange}
                                        placeholder="Search by name or email"
                                    />
                                </div>
                            </div>

                            <div className="col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    Role
                                </label>
                                <select
                                    name="role"
                                    className="form-select"
                                    value={filters.role}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Roles</option>
                                    {ROLE_OPTIONS.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    Status
                                </label>
                                <select
                                    name="status"
                                    className="form-select"
                                    value={filters.status}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Statuses</option>
                                    {STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-md-4 col-lg-3 d-flex gap-2">
                                <button
                                    type="submit"
                                    className="btn btn-primary flex-grow-1"
                                >
                                    Apply
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={resetFilters}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-4">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <h5 className="fw-bold mb-1">Admin Accounts</h5>
                            <p className="text-muted small mb-0">
                                {totalAdmins} account{totalAdmins === 1 ? "" : "s"} found
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-5 text-muted">
                            Loading admin accounts...
                        </div>
                    ) : admins.length === 0 ? (
                        <div className="text-center py-5 border rounded-4">
                            <FaUsersCog
                                size={34}
                                className="text-muted mb-3"
                            />
                            <h6 className="fw-bold">No admin accounts found</h6>
                            <p className="text-muted mb-0">
                                Change the filters or create a new account.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Admin</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Permissions</th>
                                    <th>Last Login</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {admins.map((admin) => {
                                    const isCurrentAdmin =
                                        String(admin._id) === currentAdminId;
                                    const isBusy =
                                        actionLoadingId === admin._id;

                                    return (
                                        <tr key={admin._id}>
                                            <td style={{ minWidth: "220px" }}>
                                                <div className="fw-semibold">
                                                    {admin.name}
                                                    {isCurrentAdmin && (
                                                        <span className="badge text-bg-info ms-2">
                                                                You
                                                            </span>
                                                    )}
                                                </div>
                                                <small className="text-muted">
                                                    {admin.email}
                                                </small>
                                            </td>

                                            <td>
                                                    <span
                                                        className={`badge ${getRoleBadgeClass(
                                                            admin.role
                                                        )}`}
                                                    >
                                                        {admin.role}
                                                    </span>
                                            </td>

                                            <td>
                                                    <span
                                                        className={`badge ${
                                                            admin.status === "Active"
                                                                ? "text-bg-success"
                                                                : "text-bg-secondary"
                                                        }`}
                                                    >
                                                        {admin.status}
                                                    </span>
                                            </td>

                                            <td>
                                                <strong>
                                                    {admin.permissions?.length || 0}
                                                </strong>
                                                <small className="text-muted d-block">
                                                    {admin.customPermissions?.length || 0} custom
                                                </small>
                                            </td>

                                            <td style={{ minWidth: "165px" }}>
                                                <small>
                                                    {formatDateTime(
                                                        admin.lastLoginAt
                                                    )}
                                                </small>
                                            </td>

                                            <td className="text-end">
                                                <div className="d-inline-flex flex-wrap justify-content-end gap-2">
                                                    <PermissionGuard permission="admin.update">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-primary"
                                                            onClick={() =>
                                                                openEditModal(admin)
                                                            }
                                                            disabled={isBusy}
                                                            title="Edit admin"
                                                        >
                                                            <FaEdit />
                                                        </button>
                                                    </PermissionGuard>

                                                    <PermissionGuard permission="admin.update">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-warning"
                                                            onClick={() =>
                                                                openPasswordResetModal(
                                                                    admin
                                                                )
                                                            }
                                                            disabled={isBusy}
                                                            title="Reset password"
                                                        >
                                                            <FaKey />
                                                        </button>
                                                    </PermissionGuard>

                                                    <PermissionGuard permission="admin.update">
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${
                                                                admin.status === "Active"
                                                                    ? "btn-outline-secondary"
                                                                    : "btn-outline-success"
                                                            }`}
                                                            onClick={() =>
                                                                toggleAdminStatus(
                                                                    admin
                                                                )
                                                            }
                                                            disabled={
                                                                isBusy ||
                                                                (isCurrentAdmin &&
                                                                    admin.status ===
                                                                    "Active")
                                                            }
                                                            title={
                                                                isCurrentAdmin
                                                                    ? "You cannot disable your own account"
                                                                    : admin.status ===
                                                                    "Active"
                                                                        ? "Disable admin"
                                                                        : "Activate admin"
                                                            }
                                                        >
                                                            {admin.status ===
                                                            "Active" ? (
                                                                <FaToggleOff />
                                                            ) : (
                                                                <FaToggleOn />
                                                            )}
                                                        </button>
                                                    </PermissionGuard>

                                                    <PermissionGuard permission="admin.delete">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={() =>
                                                                deleteAdmin(admin)
                                                            }
                                                            disabled={
                                                                isBusy ||
                                                                isCurrentAdmin
                                                            }
                                                            title={
                                                                isCurrentAdmin
                                                                    ? "You cannot delete your own account"
                                                                    : "Delete admin"
                                                            }
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </PermissionGuard>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mt-4">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={page <= 1 || loading}
                            onClick={() =>
                                setPage((previous) => previous - 1)
                            }
                        >
                            Previous
                        </button>

                        <small className="text-muted">
                            Page {page} of {totalPages}
                        </small>

                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={page >= totalPages || loading}
                            onClick={() =>
                                setPage((previous) => previous + 1)
                            }
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {showAdminModal && (
                <>
                    <div
                        className="modal fade show d-block"
                        tabIndex="-1"
                        role="dialog"
                        aria-modal="true"
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 1055,
                            overflow: "hidden",
                            padding: "12px",
                        }}
                    >
                        <div
                            className="modal-dialog modal-xl"
                            style={{
                                width: "100%",
                                maxWidth: "1200px",
                                height: "calc(100dvh - 24px)",
                                maxHeight: "calc(100dvh - 24px)",
                                margin: "0 auto",
                            }}
                        >
                            <div
                                className="modal-content border-0 shadow rounded-4"
                                style={{
                                    height: "100%",
                                    maxHeight: "100%",
                                    overflow: "hidden",
                                }}
                            >
                                <form
                                    onSubmit={saveAdmin}
                                    style={{
                                        height: "100%",
                                        minHeight: 0,
                                        display: "flex",
                                        flexDirection: "column",
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        className="modal-header"
                                        style={{
                                            flex: "0 0 auto",
                                        }}
                                    >
                                        <div>
                                            <h5 className="modal-title fw-bold">
                                                {adminModalMode === "create"
                                                    ? "Create Admin Account"
                                                    : "Edit Admin Account"}
                                            </h5>
                                            <small className="text-muted">
                                                Role permissions are granted automatically.
                                                Custom permissions add extra access.
                                            </small>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={closeAdminModal}
                                            disabled={saving}
                                        >
                                            <FaTimes />
                                        </button>
                                    </div>

                                    <div
                                        className="modal-body p-4"
                                        style={{
                                            flex: "1 1 auto",
                                            minHeight: 0,
                                            overflowY: "auto",
                                            overflowX: "hidden",
                                            overscrollBehavior: "contain",
                                            WebkitOverflowScrolling: "touch",
                                        }}
                                    >
                                        <div className="row g-3 mb-4">
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold">
                                                    Full Name
                                                </label>
                                                <input
                                                    type="text"
                                                    name="name"
                                                    className="form-control"
                                                    value={adminForm.name}
                                                    onChange={handleAdminFormChange}
                                                    required
                                                />
                                            </div>

                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold">
                                                    Email
                                                </label>
                                                <input
                                                    type="email"
                                                    name="email"
                                                    className="form-control"
                                                    value={adminForm.email}
                                                    onChange={handleAdminFormChange}
                                                    required
                                                />
                                            </div>

                                            {adminModalMode === "create" && (
                                                <div className="col-md-6">
                                                    <label className="form-label fw-semibold">
                                                        Temporary Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        name="password"
                                                        className="form-control"
                                                        value={adminForm.password}
                                                        onChange={handleAdminFormChange}
                                                        minLength={8}
                                                        required
                                                    />
                                                    <small className="text-muted">
                                                        Minimum 8 characters.
                                                    </small>
                                                </div>
                                            )}

                                            <div className="col-md-3">
                                                <label className="form-label fw-semibold">
                                                    Role
                                                </label>
                                                <select
                                                    name="role"
                                                    className="form-select"
                                                    value={adminForm.role}
                                                    onChange={handleAdminFormChange}
                                                >
                                                    {ROLE_OPTIONS.map((role) => (
                                                        <option
                                                            key={role}
                                                            value={role}
                                                        >
                                                            {role}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="col-md-3">
                                                <label className="form-label fw-semibold">
                                                    Status
                                                </label>
                                                <select
                                                    name="status"
                                                    className="form-select"
                                                    value={adminForm.status}
                                                    onChange={handleAdminFormChange}
                                                >
                                                    {STATUS_OPTIONS.map(
                                                        (status) => (
                                                            <option
                                                                key={status}
                                                                value={status}
                                                            >
                                                                {status}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-3">
                                            <div>
                                                <h6 className="fw-bold mb-1">
                                                    Additional Custom Permissions
                                                </h6>
                                                <p className="text-muted small mb-0">
                                                    These permissions are added on top of
                                                    the selected role.
                                                </p>
                                            </div>

                                            <div className="d-flex gap-2">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={
                                                        selectAllCustomPermissions
                                                    }
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={clearCustomPermissions}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>

                                        <div className="row g-3">
                                            {visiblePermissionGroups.map(
                                                (group) => (
                                                    <div
                                                        className="col-lg-4 col-md-6"
                                                        key={group.title}
                                                    >
                                                        <div className="border rounded-4 p-3 h-100">
                                                            <h6 className="fw-bold mb-3">
                                                                {group.title}
                                                            </h6>

                                                            <div className="d-flex flex-column gap-2">
                                                                {group.permissions.map(
                                                                    ([permission, label]) => (
                                                                        <label
                                                                            className="form-check d-flex align-items-start gap-2 mb-0"
                                                                            key={permission}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                className="form-check-input mt-1"
                                                                                checked={adminForm.customPermissions.includes(
                                                                                    permission
                                                                                )}
                                                                                onChange={() =>
                                                                                    toggleCustomPermission(
                                                                                        permission
                                                                                    )
                                                                                }
                                                                            />
                                                                            <span>
                                                                                <span className="small fw-semibold d-block">
                                                                                    {label}
                                                                                </span>
                                                                                <code className="small">
                                                                                    {permission}
                                                                                </code>
                                                                            </span>
                                                                        </label>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>

                                    <div
                                        className="modal-footer"
                                        style={{
                                            flex: "0 0 auto",
                                            background: "#ffffff",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={closeAdminModal}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="submit"
                                            className="btn btn-success"
                                            disabled={saving}
                                        >
                                            <FaSave className="me-2" />
                                            {saving
                                                ? "Saving..."
                                                : adminModalMode === "create"
                                                    ? "Create Admin"
                                                    : "Save Changes"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="modal-backdrop fade show" />
                </>
            )}

            {showPasswordModal && passwordAdmin && (
                <>
                    <div
                        className="modal fade show d-block"
                        tabIndex="-1"
                        role="dialog"
                    >
                        <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content border-0 shadow rounded-4">
                                <form onSubmit={resetAdminPassword}>
                                    <div className="modal-header">
                                        <div>
                                            <h5 className="modal-title fw-bold">
                                                Reset Password
                                            </h5>
                                            <small className="text-muted">
                                                {passwordAdmin.name} · {passwordAdmin.email}
                                            </small>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={closePasswordModal}
                                            disabled={saving}
                                        >
                                            <FaTimes />
                                        </button>
                                    </div>

                                    <div className="modal-body p-4">
                                        <div className="mb-3">
                                            <label className="form-label fw-semibold">
                                                New Password
                                            </label>
                                            <input
                                                type="password"
                                                className="form-control"
                                                value={newPassword}
                                                onChange={(event) =>
                                                    setNewPassword(
                                                        event.target.value
                                                    )
                                                }
                                                minLength={8}
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="form-label fw-semibold">
                                                Confirm New Password
                                            </label>
                                            <input
                                                type="password"
                                                className="form-control"
                                                value={confirmPassword}
                                                onChange={(event) =>
                                                    setConfirmPassword(
                                                        event.target.value
                                                    )
                                                }
                                                minLength={8}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="modal-footer">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={closePasswordModal}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="submit"
                                            className="btn btn-warning"
                                            disabled={saving}
                                        >
                                            <FaKey className="me-2" />
                                            {saving
                                                ? "Resetting..."
                                                : "Reset Password"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="modal-backdrop fade show" />
                </>
            )}
        </div>
    );
};

export default Admins;
