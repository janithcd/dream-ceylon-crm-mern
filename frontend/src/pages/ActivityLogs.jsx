import { useEffect, useState } from "react";
import {
    FaCalendarAlt,
    FaCalendarDay,
    FaCalendarWeek,
    FaCheckCircle,
    FaExclamationTriangle,
    FaEye,
    FaFilter,
    FaHistory,
    FaSearch,
    FaSyncAlt,
    FaTimes,
    FaUserShield,
} from "react-icons/fa";
import api from "../api/axios";

const initialFilters = {
    keyword: "",
    module: "",
    action: "",
    status: "",
    admin: "",
    dateFrom: "",
    dateTo: "",
};

const moduleOptions = [
    "Authentication",
    "Inquiry",
    "Quotation",
    "Booking",
    "Payment",
    "Follow-Up",
    "Customer",
    "Destination",
    "Package",
    "Vehicle",
    "Settings",
    "PDF",
    "Admin",
    "System",
    "Other",
];

const actionOptions = [
    "CREATE",
    "UPDATE",
    "DELETE",
    "LOGIN",
    "LOGOUT",
    "DOWNLOAD",
    "GENERATE",
    "CONVERT",
    "COMPLETE",
    "CANCEL",
    "REFUND",
    "RESTORE",
    "OTHER",
];

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

const SummaryCard = ({
                         title,
                         value,
                         subtitle,
                         icon,
                         variant = "success",
                     }) => {
    return (
        <div className="stat-card h-100">
            <div>
                <p className="text-muted mb-1">{title}</p>

                <h3 className={`fw-bold mb-1 text-${variant}`}>
                    {value}
                </h3>

                {subtitle && (
                    <small className="text-muted">{subtitle}</small>
                )}
            </div>

            <div className="stat-icon">{icon}</div>
        </div>
    );
};

const StatisticList = ({ title, items = [] }) => {
    const highestCount = Math.max(
        ...items.map((item) => Number(item.count) || 0),
        1
    );

    return (
        <div className="card border-0 shadow-sm rounded-4 h-100">
            <div className="card-body p-4">
                <h5 className="fw-bold mb-3">{title}</h5>

                {items.length === 0 ? (
                    <p className="text-muted mb-0">
                        No activity data available.
                    </p>
                ) : (
                    <div className="d-flex flex-column gap-3">
                        {items.slice(0, 8).map((item) => {
                            const percentage =
                                ((Number(item.count) || 0) / highestCount) *
                                100;

                            return (
                                <div key={item.name}>
                                    <div className="d-flex justify-content-between mb-1">
                                        <span className="small fw-semibold">
                                            {item.name || "Unknown"}
                                        </span>

                                        <span className="small text-muted">
                                            {item.count || 0}
                                        </span>
                                    </div>

                                    <div
                                        className="progress"
                                        style={{ height: "6px" }}
                                    >
                                        <div
                                            className="progress-bar"
                                            style={{
                                                width: `${percentage}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const ActivityLogs = () => {
    const [logs, setLogs] = useState([]);
    const [summaryData, setSummaryData] = useState(null);

    const [filters, setFilters] = useState(initialFilters);
    const [activeFilters, setActiveFilters] = useState(initialFilters);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLogs, setTotalLogs] = useState(0);

    const [selectedLog, setSelectedLog] = useState(null);

    const [loading, setLoading] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const [error, setError] = useState("");

    const summary = summaryData?.summary || {};
    const moduleStats = summaryData?.moduleStats || [];
    const actionStats = summaryData?.actionStats || [];

    const fetchSummary = async () => {
        try {
            setSummaryLoading(true);

            const response = await api.get("/activity-logs/summary");

            setSummaryData(response.data);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load activity summary."
            );
        } finally {
            setSummaryLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 15,
            };

            Object.entries(activeFilters).forEach(([key, value]) => {
                if (value) {
                    params[key] = value;
                }
            });

            const response = await api.get("/activity-logs", {
                params,
            });

            setLogs(response.data.logs || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalLogs(response.data.totalLogs || 0);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load activity logs."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [page, activeFilters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;

        setFilters((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleApplyFilters = (e) => {
        e.preventDefault();

        setPage(1);
        setActiveFilters(filters);
    };

    const handleResetFilters = () => {
        setFilters(initialFilters);
        setActiveFilters(initialFilters);
        setPage(1);
    };

    const handleRefresh = async () => {
        await Promise.all([fetchSummary(), fetchLogs()]);
    };

    const handleViewDetails = async (logId) => {
        try {
            setDetailsLoading(true);
            setError("");

            const response = await api.get(`/activity-logs/${logId}`);

            setSelectedLog(response.data);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load activity details."
            );
        } finally {
            setDetailsLoading(false);
        }
    };

    const closeDetails = () => {
        setSelectedLog(null);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Activity Logs</h2>

                    <p className="text-muted mb-0">
                        Review admin actions, system activity and document
                        generation history.
                    </p>
                </div>

                <button
                    className="btn btn-outline-success"
                    onClick={handleRefresh}
                    disabled={loading || summaryLoading}
                >
                    <FaSyncAlt className="me-2" />

                    {loading || summaryLoading
                        ? "Refreshing..."
                        : "Refresh"}
                </button>
            </div>

            {error && (
                <div className="alert alert-danger">
                    {error}
                </div>
            )}

            <div className="row g-4 mb-4">
                <div className="col-xl col-md-4 col-sm-6">
                    <SummaryCard
                        title="Total Activities"
                        value={summary.totalActivities || 0}
                        subtitle="all recorded actions"
                        icon={<FaHistory />}
                        variant="primary"
                    />
                </div>

                <div className="col-xl col-md-4 col-sm-6">
                    <SummaryCard
                        title="Today"
                        value={summary.todayActivities || 0}
                        subtitle="activities today"
                        icon={<FaCalendarDay />}
                        variant="success"
                    />
                </div>

                <div className="col-xl col-md-4 col-sm-6">
                    <SummaryCard
                        title="Last 7 Days"
                        value={summary.lastSevenDaysActivities || 0}
                        subtitle="weekly activity"
                        icon={<FaCalendarWeek />}
                        variant="info"
                    />
                </div>

                <div className="col-xl col-md-4 col-sm-6">
                    <SummaryCard
                        title="Last 30 Days"
                        value={summary.lastThirtyDaysActivities || 0}
                        subtitle="monthly activity"
                        icon={<FaCalendarAlt />}
                        variant="dark"
                    />
                </div>

                <div className="col-xl col-md-4 col-sm-6">
                    <SummaryCard
                        title="Failed Activities"
                        value={summary.failedActivities || 0}
                        subtitle="failed operations"
                        icon={<FaExclamationTriangle />}
                        variant="danger"
                    />
                </div>
            </div>

            <div className="row g-4 mb-4">
                <div className="col-lg-6">
                    <StatisticList
                        title="Activities by Module"
                        items={moduleStats}
                    />
                </div>

                <div className="col-lg-6">
                    <StatisticList
                        title="Activities by Action"
                        items={actionStats}
                    />
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaFilter className="text-success" />

                        <h5 className="fw-bold mb-0">
                            Search & Filters
                        </h5>
                    </div>

                    <form onSubmit={handleApplyFilters}>
                        <div className="row g-3">
                            <div className="col-12 col-lg-4">
                                <label className="form-label fw-semibold">
                                    Search
                                </label>

                                <div className="input-group">
                                    <input
                                        type="text"
                                        name="keyword"
                                        className="form-control"
                                        placeholder="Description, customer, reference..."
                                        value={filters.keyword}
                                        onChange={handleFilterChange}
                                    />

                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                    >
                                        <FaSearch />
                                    </button>
                                </div>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    Module
                                </label>

                                <select
                                    name="module"
                                    className="form-select"
                                    value={filters.module}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Modules</option>

                                    {moduleOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    Action
                                </label>

                                <select
                                    name="action"
                                    className="form-select"
                                    value={filters.action}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Actions</option>

                                    {actionOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
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
                                    <option value="Success">Success</option>
                                    <option value="Failed">Failed</option>
                                </select>
                            </div>

                            <div className="col-12 col-md-6 col-lg-2">
                                <label className="form-label fw-semibold">
                                    Admin
                                </label>

                                <input
                                    type="text"
                                    name="admin"
                                    className="form-control"
                                    placeholder="Name or email"
                                    value={filters.admin}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    From
                                </label>

                                <input
                                    type="date"
                                    name="dateFrom"
                                    className="form-control"
                                    value={filters.dateFrom}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">
                                    To
                                </label>

                                <input
                                    type="date"
                                    name="dateTo"
                                    className="form-control"
                                    value={filters.dateTo}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className="col-12 col-lg-8 d-flex align-items-end gap-2">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                >
                                    Apply Filters
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={handleResetFilters}
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
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                        <div>
                            <h5 className="fw-bold mb-1">
                                Recorded Activities
                            </h5>

                            <p className="text-muted small mb-0">
                                Total: {totalLogs} activities
                            </p>
                        </div>

                        {loading && (
                            <small className="text-muted">
                                Loading activities...
                            </small>
                        )}
                    </div>

                    {!loading && logs.length === 0 ? (
                        <div className="text-center py-5 border rounded-4">
                            <FaHistory
                                className="text-muted mb-3"
                                size={34}
                            />

                            <h6 className="fw-bold">
                                No activity records found
                            </h6>

                            <p className="text-muted mb-0">
                                Perform an action in the CRM or change the
                                filters.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Action</th>
                                    <th>Module</th>
                                    <th>Description</th>
                                    <th>Admin</th>
                                    <th>Status</th>
                                    <th className="text-end">
                                        Details
                                    </th>
                                </tr>
                                </thead>

                                <tbody>
                                {logs.map((log) => (
                                    <tr key={log._id}>
                                        <td>
                                            <small>
                                                {formatDateTime(
                                                    log.createdAt
                                                )}
                                            </small>
                                        </td>

                                        <td>
                                                <span
                                                    className={`badge ${getActionBadgeClass(
                                                        log.action
                                                    )}`}
                                                >
                                                    {log.action}
                                                </span>
                                        </td>

                                        <td>
                                                <span
                                                    className={`badge ${getModuleBadgeClass(
                                                        log.module
                                                    )}`}
                                                >
                                                    {log.module}
                                                </span>
                                        </td>

                                        <td style={{ minWidth: "280px" }}>
                                            <strong>
                                                {log.description}
                                            </strong>

                                            {(log.customerName ||
                                                log.referenceNo) && (
                                                <small className="text-muted d-block mt-1">
                                                    {log.customerName &&
                                                        `Customer: ${log.customerName}`}

                                                    {log.customerName &&
                                                        log.referenceNo &&
                                                        " | "}

                                                    {log.referenceNo &&
                                                        `Ref: ${log.referenceNo}`}
                                                </small>
                                            )}
                                        </td>

                                        <td>
                                            <div className="d-flex align-items-center gap-2">
                                                <FaUserShield className="text-muted" />

                                                <div>
                                                    <small className="fw-semibold d-block">
                                                        {log.adminName ||
                                                            log.admin
                                                                ?.name ||
                                                            "System"}
                                                    </small>

                                                    <small className="text-muted">
                                                        {log.adminEmail ||
                                                            log.admin
                                                                ?.email ||
                                                            "-"}
                                                    </small>
                                                </div>
                                            </div>
                                        </td>

                                        <td>
                                            {log.status === "Success" ? (
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

                                        <td className="text-end">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={() =>
                                                    handleViewDetails(
                                                        log._id
                                                    )
                                                }
                                                disabled={detailsLoading}
                                                title="View activity details"
                                            >
                                                <FaEye />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mt-4">
                        <button
                            className="btn btn-outline-secondary btn-sm"
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
                            className="btn btn-outline-secondary btn-sm"
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

            {selectedLog && (
                <>
                    <div
                        className="modal fade show d-block"
                        tabIndex="-1"
                        role="dialog"
                    >
                        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                            <div className="modal-content border-0 shadow rounded-4">
                                <div className="modal-header">
                                    <div>
                                        <h5 className="modal-title fw-bold">
                                            Activity Details
                                        </h5>

                                        <small className="text-muted">
                                            {formatDateTime(
                                                selectedLog.createdAt
                                            )}
                                        </small>
                                    </div>

                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={closeDetails}
                                    >
                                        <FaTimes />
                                    </button>
                                </div>

                                <div className="modal-body p-4">
                                    <div className="row g-3 mb-4">
                                        <div className="col-md-4">
                                            <div className="border rounded-4 p-3 h-100">
                                                <small className="text-muted d-block mb-2">
                                                    Action
                                                </small>

                                                <span
                                                    className={`badge ${getActionBadgeClass(
                                                        selectedLog.action
                                                    )}`}
                                                >
                                                    {selectedLog.action}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="col-md-4">
                                            <div className="border rounded-4 p-3 h-100">
                                                <small className="text-muted d-block mb-2">
                                                    Module
                                                </small>

                                                <span
                                                    className={`badge ${getModuleBadgeClass(
                                                        selectedLog.module
                                                    )}`}
                                                >
                                                    {selectedLog.module}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="col-md-4">
                                            <div className="border rounded-4 p-3 h-100">
                                                <small className="text-muted d-block mb-2">
                                                    Status
                                                </small>

                                                <span
                                                    className={`badge ${
                                                        selectedLog.status ===
                                                        "Success"
                                                            ? "text-bg-success"
                                                            : "text-bg-danger"
                                                    }`}
                                                >
                                                    {selectedLog.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="small text-muted">
                                            Description
                                        </label>

                                        <div className="border rounded-4 p-3 mt-1">
                                            {selectedLog.description || "-"}
                                        </div>
                                    </div>

                                    <div className="row g-3 mb-4">
                                        <div className="col-md-6">
                                            <label className="small text-muted">
                                                Admin
                                            </label>

                                            <div className="border rounded-4 p-3 mt-1">
                                                <strong>
                                                    {selectedLog.adminName ||
                                                        selectedLog.admin
                                                            ?.name ||
                                                        "System"}
                                                </strong>

                                                <br />

                                                <small className="text-muted">
                                                    {selectedLog.adminEmail ||
                                                        selectedLog.admin
                                                            ?.email ||
                                                        "-"}
                                                </small>
                                            </div>
                                        </div>

                                        <div className="col-md-6">
                                            <label className="small text-muted">
                                                Customer
                                            </label>

                                            <div className="border rounded-4 p-3 mt-1">
                                                {selectedLog.customerName ||
                                                    "-"}
                                            </div>
                                        </div>

                                        <div className="col-md-6">
                                            <label className="small text-muted">
                                                Reference Number
                                            </label>

                                            <div className="border rounded-4 p-3 mt-1">
                                                {selectedLog.referenceNo ||
                                                    "-"}
                                            </div>
                                        </div>

                                        <div className="col-md-6">
                                            <label className="small text-muted">
                                                Related Model
                                            </label>

                                            <div className="border rounded-4 p-3 mt-1">
                                                {selectedLog.relatedModel ||
                                                    "-"}
                                            </div>
                                        </div>
                                    </div>

                                    <h6 className="fw-bold mb-3">
                                        Request Information
                                    </h6>

                                    <div className="table-responsive mb-4">
                                        <table className="table table-bordered">
                                            <tbody>
                                            <tr>
                                                <th style={{ width: "30%" }}>
                                                    Method
                                                </th>

                                                <td>
                                                    {selectedLog.requestMethod ||
                                                        "-"}
                                                </td>
                                            </tr>

                                            <tr>
                                                <th>Path</th>

                                                <td>
                                                    {selectedLog.requestPath ||
                                                        "-"}
                                                </td>
                                            </tr>

                                            <tr>
                                                <th>IP Address</th>

                                                <td>
                                                    {selectedLog.ipAddress ||
                                                        "-"}
                                                </td>
                                            </tr>

                                            <tr>
                                                <th>User Agent</th>

                                                <td className="text-break">
                                                    {selectedLog.userAgent ||
                                                        "-"}
                                                </td>
                                            </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <h6 className="fw-bold mb-3">
                                        Metadata
                                    </h6>

                                    <pre
                                        className="bg-light border rounded-4 p-3 mb-0"
                                        style={{
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            maxHeight: "300px",
                                            overflowY: "auto",
                                        }}
                                    >
                                        {JSON.stringify(
                                            selectedLog.metadata || {},
                                            null,
                                            2
                                        )}
                                    </pre>
                                </div>

                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={closeDetails}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modal-backdrop fade show" />
                </>
            )}
        </div>
    );
};

export default ActivityLogs;