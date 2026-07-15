import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    FaCheckCircle,
    FaExclamationTriangle,
    FaEye,
    FaHistory,
    FaSyncAlt,
    FaUserShield,
} from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";

const formatDateTime = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getActionBadgeClass = (action) => {
    switch (action) {
        case "CREATE":
            return "text-bg-success";

        case "UPDATE":
            return "text-bg-primary";

        case "DELETE":
            return "text-bg-danger";

        case "LOGIN":
            return "text-bg-info";

        case "LOGOUT":
            return "text-bg-secondary";

        case "DOWNLOAD":
        case "GENERATE":
            return "text-bg-dark";

        case "CONVERT":
            return "text-bg-warning";

        case "COMPLETE":
            return "text-bg-success";

        case "CANCEL":
            return "text-bg-secondary";

        case "REFUND":
            return "text-bg-warning";

        case "RESTORE":
            return "text-bg-info";

        default:
            return "text-bg-secondary";
    }
};

const getModuleBadgeClass = (moduleName) => {
    switch (moduleName) {
        case "Authentication":
            return "bg-info-subtle text-info-emphasis";

        case "Inquiry":
            return "bg-primary-subtle text-primary-emphasis";

        case "Quotation":
            return "bg-success-subtle text-success-emphasis";

        case "Booking":
            return "bg-dark-subtle text-dark-emphasis";

        case "Payment":
            return "bg-warning-subtle text-warning-emphasis";

        case "Follow-Up":
            return "bg-danger-subtle text-danger-emphasis";

        case "Settings":
            return "bg-secondary-subtle text-secondary-emphasis";

        case "PDF":
            return "bg-info-subtle text-info-emphasis";

        default:
            return "bg-light text-dark";
    }
};

const DashboardRecentActivity = () => {
    const { loading: permissionsLoading, hasPermission } = usePermissions();
    const canViewActivityLogs = hasPermission("activityLog.view");
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const fetchRecentActivities = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError("");

            const response = await api.get("/activity-logs/summary");

            setActivities(response.data.recentActivities || []);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load recent activities."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (!permissionsLoading && canViewActivityLogs) {
            fetchRecentActivities();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissionsLoading, canViewActivityLogs]);

    if (permissionsLoading || !canViewActivityLogs) {
        return null;
    }

    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                    <div className="d-flex align-items-start gap-3">
                        <div className="stat-icon">
                            <FaHistory />
                        </div>

                        <div>
                            <h5 className="fw-bold mb-1">
                                Recent CRM Activity
                            </h5>

                            <p className="text-muted small mb-0">
                                Latest actions performed inside the admin system.
                            </p>
                        </div>
                    </div>

                    <div className="d-flex gap-2">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => fetchRecentActivities(true)}
                            disabled={refreshing}
                        >
                            <FaSyncAlt className="me-2" />

                            {refreshing ? "Refreshing..." : "Refresh"}
                        </button>

                        <Link
                            to="/activity-logs"
                            className="btn btn-sm btn-primary"
                        >
                            <FaEye className="me-2" />
                            View All
                        </Link>
                    </div>
                </div>

                {error && (
                    <div className="alert alert-danger mb-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5 text-muted">
                        Loading recent activities...
                    </div>
                ) : activities.length === 0 ? (
                    <div className="text-center py-5 border rounded-4">
                        <FaHistory
                            className="text-muted mb-3"
                            size={32}
                        />

                        <h6 className="fw-bold">
                            No activity records available
                        </h6>

                        <p className="text-muted mb-0">
                            New CRM actions will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Action</th>
                                <th>Module</th>
                                <th>Description</th>
                                <th>Admin</th>
                                <th>Status</th>
                            </tr>
                            </thead>

                            <tbody>
                            {activities.map((activity) => (
                                <tr key={activity._id}>
                                    <td style={{ minWidth: "145px" }}>
                                        <small>
                                            {formatDateTime(
                                                activity.createdAt
                                            )}
                                        </small>
                                    </td>

                                    <td>
                                            <span
                                                className={`badge ${getActionBadgeClass(
                                                    activity.action
                                                )}`}
                                            >
                                                {activity.action}
                                            </span>
                                    </td>

                                    <td>
                                            <span
                                                className={`badge ${getModuleBadgeClass(
                                                    activity.module
                                                )}`}
                                            >
                                                {activity.module}
                                            </span>
                                    </td>

                                    <td style={{ minWidth: "280px" }}>
                                        <strong className="d-block">
                                            {activity.description}
                                        </strong>

                                        {(activity.customerName ||
                                            activity.referenceNo) && (
                                            <small className="text-muted">
                                                {activity.customerName &&
                                                    `Customer: ${activity.customerName}`}

                                                {activity.customerName &&
                                                    activity.referenceNo &&
                                                    " | "}

                                                {activity.referenceNo &&
                                                    `Ref: ${activity.referenceNo}`}
                                            </small>
                                        )}
                                    </td>

                                    <td style={{ minWidth: "150px" }}>
                                        <div className="d-flex align-items-center gap-2">
                                            <FaUserShield className="text-muted" />

                                            <div>
                                                <small className="fw-semibold d-block">
                                                    {activity.adminName ||
                                                        activity.admin
                                                            ?.name ||
                                                        "System"}
                                                </small>

                                                <small className="text-muted">
                                                    {activity.adminEmail ||
                                                        activity.admin
                                                            ?.email ||
                                                        "-"}
                                                </small>
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        {activity.status === "Success" ? (
                                            <span className="badge text-bg-success">
                                                    <FaCheckCircle className="me-1" />
                                                    Success
                                                </span>
                                        ) : (
                                            <span className="badge text-bg-danger">
                                                    <FaExclamationTriangle className="me-1" />
                                                    Failed
                                                </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activities.length > 0 && (
                    <div className="text-center mt-4">
                        <Link
                            to="/activity-logs"
                            className="btn btn-outline-primary"
                        >
                            <FaHistory className="me-2" />
                            Open Complete Activity History
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardRecentActivity;