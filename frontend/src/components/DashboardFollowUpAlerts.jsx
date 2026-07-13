import { useEffect, useMemo, useState } from "react";
import {
    FaArrowRight,
    FaBell,
    FaCheckCircle,
    FaExclamationTriangle,
    FaSyncAlt,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const priorityOrder = {
    Urgent: 1,
    High: 2,
    Medium: 3,
    Low: 4,
};

const formatDate = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const getPriorityBadgeClass = (priority) => {
    switch (priority) {
        case "Urgent":
            return "text-bg-danger";
        case "High":
            return "text-bg-warning";
        case "Medium":
            return "text-bg-primary";
        case "Low":
            return "text-bg-secondary";
        default:
            return "text-bg-secondary";
    }
};

const getDateStatus = (followUpDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const date = new Date(followUpDate);
    date.setHours(0, 0, 0, 0);

    if (date < today) {
        return {
            label: "Overdue",
            className: "text-danger",
        };
    }

    if (date.getTime() === today.getTime()) {
        return {
            label: "Today",
            className: "text-success",
        };
    }

    return {
        label: "Upcoming",
        className: "text-muted",
    };
};

const SmallSummaryCard = ({ title, value, subtitle, icon, variant }) => {
    return (
        <div className="border rounded-4 p-3 h-100 bg-white">
            <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <p className="text-muted mb-1">{title}</p>
                    <h4 className={`fw-bold text-${variant} mb-1`}>{value}</h4>
                    <small className="text-muted">{subtitle}</small>
                </div>

                <div className={`text-${variant}`}>{icon}</div>
            </div>
        </div>
    );
};

const DashboardFollowUpAlerts = () => {
    const navigate = useNavigate();

    const [summary, setSummary] = useState({
        totalPending: 0,
        today: 0,
        overdue: 0,
        upcoming: 0,
        completed: 0,
        urgent: 0,
    });

    const [importantFollowUps, setImportantFollowUps] = useState([]);
    const [loading, setLoading] = useState(false);
    const [completeLoadingId, setCompleteLoadingId] = useState("");
    const [error, setError] = useState("");

    const hasAlerts = useMemo(() => {
        return (
            Number(summary.today || 0) > 0 ||
            Number(summary.overdue || 0) > 0 ||
            Number(summary.urgent || 0) > 0
        );
    }, [summary]);

    const mergeFollowUps = (lists) => {
        const map = new Map();

        lists.flat().forEach((item) => {
            if (item?._id) {
                map.set(item._id, item);
            }
        });

        return Array.from(map.values())
            .sort((a, b) => {
                const dateA = new Date(a.followUpDate).getTime();
                const dateB = new Date(b.followUpDate).getTime();

                if (dateA !== dateB) {
                    return dateA - dateB;
                }

                return (
                    (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5)
                );
            })
            .slice(0, 6);
    };

    const fetchFollowUpAlerts = async () => {
        try {
            setLoading(true);
            setError("");

            const summaryResponse = await api.get("/follow-ups/summary");

            const [overdueResponse, todayResponse, urgentResponse] =
                await Promise.all([
                    api.get("/follow-ups", {
                        params: {
                            dateFilter: "overdue",
                            limit: 5,
                        },
                    }),
                    api.get("/follow-ups", {
                        params: {
                            dateFilter: "today",
                            limit: 5,
                        },
                    }),
                    api.get("/follow-ups", {
                        params: {
                            status: "Pending",
                            priority: "Urgent",
                            limit: 5,
                        },
                    }),
                ]);

            setSummary(summaryResponse.data || {});

            const merged = mergeFollowUps([
                overdueResponse.data.followUps || [],
                todayResponse.data.followUps || [],
                urgentResponse.data.followUps || [],
            ]);

            setImportantFollowUps(merged);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load follow-up alerts."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFollowUpAlerts();
    }, []);

    const handleComplete = async (followUp) => {
        const confirmComplete = window.confirm(
            "Mark this follow-up as completed?"
        );

        if (!confirmComplete) {
            return;
        }

        try {
            setCompleteLoadingId(followUp._id);
            setError("");

            await api.patch(`/follow-ups/${followUp._id}/complete`, {
                notes: followUp.notes,
            });

            fetchFollowUpAlerts();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to complete follow-up."
            );
        } finally {
            setCompleteLoadingId("");
        }
    };

    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                    <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                            <FaBell className={hasAlerts ? "text-danger" : "text-success"} />
                            <h5 className="fw-bold mb-0">Follow-Up Alerts</h5>
                        </div>

                        <p className="text-muted mb-0">
                            Today, overdue, and urgent reminders that need admin attention.
                        </p>
                    </div>

                    <div className="d-flex gap-2">
                        <button
                            className="btn btn-outline-success"
                            onClick={fetchFollowUpAlerts}
                            disabled={loading}
                        >
                            <FaSyncAlt className="me-2" />
                            Refresh
                        </button>

                        <button
                            className="btn btn-success"
                            onClick={() => navigate("/follow-ups")}
                        >
                            Manage Follow-Ups
                            <FaArrowRight className="ms-2" />
                        </button>
                    </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                <div className="row g-3 mb-4">
                    <div className="col-xl-3 col-md-6">
                        <SmallSummaryCard
                            title="Today"
                            value={summary.today || 0}
                            subtitle="follow-ups today"
                            icon={<FaBell size={22} />}
                            variant="success"
                        />
                    </div>

                    <div className="col-xl-3 col-md-6">
                        <SmallSummaryCard
                            title="Overdue"
                            value={summary.overdue || 0}
                            subtitle="missed reminders"
                            icon={<FaExclamationTriangle size={22} />}
                            variant="danger"
                        />
                    </div>

                    <div className="col-xl-3 col-md-6">
                        <SmallSummaryCard
                            title="Urgent"
                            value={summary.urgent || 0}
                            subtitle="urgent pending"
                            icon={<FaExclamationTriangle size={22} />}
                            variant="warning"
                        />
                    </div>

                    <div className="col-xl-3 col-md-6">
                        <SmallSummaryCard
                            title="Pending"
                            value={summary.totalPending || 0}
                            subtitle="all pending"
                            icon={<FaBell size={22} />}
                            variant="primary"
                        />
                    </div>
                </div>

                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="fw-bold mb-0">Important Follow-Ups</h6>

                    {loading && <small className="text-muted">Loading...</small>}
                </div>

                {importantFollowUps.length === 0 ? (
                    <div className="text-center py-4 border rounded-4">
                        <FaCheckCircle className="text-success mb-2" size={28} />
                        <h6 className="fw-bold mb-1">No urgent follow-ups right now</h6>
                        <p className="text-muted mb-0">
                            Today, overdue, and urgent follow-ups will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                            <tr>
                                <th>Reminder</th>
                                <th>Client</th>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Priority</th>
                                <th className="text-end">Action</th>
                            </tr>
                            </thead>

                            <tbody>
                            {importantFollowUps.map((followUp) => {
                                const dateStatus = getDateStatus(followUp.followUpDate);

                                return (
                                    <tr key={followUp._id}>
                                        <td>
                                            <h6 className="mb-1">{followUp.title}</h6>
                                            {followUp.notes && (
                                                <small className="text-muted">{followUp.notes}</small>
                                            )}
                                        </td>

                                        <td>
                                            <h6 className="mb-1">
                                                {followUp.customerName || "-"}
                                            </h6>
                                            <small className="text-muted">
                                                {followUp.customerContact || "-"}
                                            </small>
                                        </td>

                                        <td>
                                            <strong>{formatDate(followUp.followUpDate)}</strong>
                                            <br />
                                            <small className={dateStatus.className}>
                                                {dateStatus.label}
                                            </small>
                                        </td>

                                        <td>{followUp.type}</td>

                                        <td>
                        <span
                            className={`badge ${getPriorityBadgeClass(
                                followUp.priority
                            )}`}
                        >
                          {followUp.priority}
                        </span>
                                        </td>

                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-success"
                                                onClick={() => handleComplete(followUp)}
                                                disabled={completeLoadingId === followUp._id}
                                                title="Mark completed"
                                            >
                                                <FaCheckCircle />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardFollowUpAlerts;