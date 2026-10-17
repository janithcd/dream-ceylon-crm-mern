import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaClipboardCheck, FaSyncAlt, FaUndo } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { notifyTasksChanged } from "../utils/taskEvents";

const emptyData = {
    items: [], summary: { open: 0, completed: 0, overdue: 0, today: 0, upcoming: 0, noDue: 0 },
    total: 0, page: 1, totalPages: 1,
};

const dateChoices = [
    { value: "all", label: "All open", count: "open" },
    { value: "overdue", label: "Overdue", count: "overdue" },
    { value: "today", label: "Today", count: "today" },
    { value: "upcoming", label: "Upcoming", count: "upcoming" },
    { value: "noDue", label: "No due date", count: "noDue" },
];

const dueStatus = (task, today) => {
    if (task.completedAt) return { label: "Completed", color: "success" };
    if (!task.dueDate) return { label: "No due date", color: "secondary" };
    const due = toCalendarDateInput(task.dueDate);
    if (due < today) return { label: "Overdue", color: "danger" };
    if (due === today) return { label: "Today", color: "warning" };
    return { label: "Upcoming", color: "primary" };
};

const MyTasks = () => {
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [status, setStatus] = useState("open");
    const [dateFilter, setDateFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let active = true;
        api.get("/bookings/my-tasks", { params: { status, dateFilter, page } })
            .then((response) => {
                if (active) setData(response.data);
            })
            .catch((err) => {
                if (active) {
                    setData(emptyData);
                    setError(err.response?.data?.message || "Failed to load your tasks.");
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [status, dateFilter, page, reloadKey]);

    const changeStatus = (value) => {
        if (status === value && dateFilter === "all" && page === 1) return;
        setLoading(true);
        setError("");
        setNotice("");
        setStatus(value);
        setDateFilter("all");
        setPage(1);
    };

    const changeDateFilter = (value) => {
        if (dateFilter === value && page === 1) return;
        setLoading(true);
        setError("");
        setNotice("");
        setDateFilter(value);
        setPage(1);
    };

    const refresh = () => {
        setLoading(true);
        setError("");
        setReloadKey((key) => key + 1);
    };

    const toggleCompleted = async (task) => {
        if (busyId) return;
        try {
            setBusyId(task._id);
            setError("");
            setNotice("");
            const completed = !task.completedAt;
            await api.patch(`/bookings/${task.bookingId}/preparation-tasks/${task._id}`, { completed });
            notifyTasksChanged();
            setNotice(completed ? "Task completed." : "Task reopened.");
            setLoading(true);
            if (page > 1 && data.items.length === 1) setPage(page - 1);
            else setReloadKey((key) => key + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update the task.");
        } finally {
            setBusyId("");
        }
    };

    const today = todayCalendarDate();

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1"><FaClipboardCheck className="me-2 text-primary" />My Tasks</h3>
                    <p className="text-muted mb-0">Your preparation tasks across active bookings. Dates follow Sri Lanka time.</p>
                </div>
                <button type="button" className="btn btn-outline-primary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}</div>}

            <div className="row g-3 mb-4">
                {[
                    { label: "Open", count: data.summary.open, color: "primary" },
                    { label: "Overdue", count: data.summary.overdue, color: "danger" },
                    { label: "Due today", count: data.summary.today, color: "warning" },
                    { label: "Upcoming", count: data.summary.upcoming, color: "success" },
                ].map((item) => (
                    <div key={item.label} className="col-6 col-lg-3">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                            <div className="card-body p-3">
                                <small className="text-muted">{item.label}</small>
                                <h3 className={`fw-bold text-${item.color} mb-0`}>{item.count}</h3>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-4">
                    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Task status">
                        <button type="button" className={`btn btn-sm ${status === "open" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => changeStatus("open")}>Open ({data.summary.open})</button>
                        <button type="button" className={`btn btn-sm ${status === "completed" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => changeStatus("completed")}>Completed ({data.summary.completed})</button>
                    </div>
                    {status === "open" && (
                        <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Task due date">
                            {dateChoices.map((choice) => (
                                <button key={choice.value} type="button" className={`btn btn-sm ${dateFilter === choice.value ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => changeDateFilter(choice.value)}>
                                    {choice.label} ({data.summary[choice.count]})
                                </button>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <p className="text-muted mb-0">Loading tasks...</p>
                    ) : !data.items.length ? (
                        <p className="text-muted mb-0">No tasks in this view.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle mb-0">
                                <thead><tr>
                                    <th>Task</th><th>Booking / client</th><th>Due</th><th>Departure</th><th className="text-end">Actions</th>
                                </tr></thead>
                                <tbody>
                                    {data.items.map((task) => {
                                        const taskStatus = dueStatus(task, today);
                                        return (
                                            <tr key={`${task.bookingId}-${task._id}`}>
                                                <td className="fw-semibold">{task.title}</td>
                                                <td><div>{task.bookingCode}</div><small className="text-muted">{task.customerName || "-"}</small></td>
                                                <td>
                                                    <div>{task.dueDate ? formatCalendarDate(task.dueDate) : "-"}</div>
                                                    <span className={`badge text-bg-${taskStatus.color}`}>{taskStatus.label}</span>
                                                    {task.completedAt && <small className="d-block text-muted mt-1">Finished {formatCalendarDate(task.completedAt)}</small>}
                                                </td>
                                                <td>{formatCalendarDate(task.travelStartDate)}</td>
                                                <td className="text-end">
                                                    <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => navigate(`/bookings?keyword=${encodeURIComponent(task.bookingCode)}`)} aria-label={`Open booking ${task.bookingCode}`}>
                                                            Booking
                                                        </button>
                                                        {canUpdate && (
                                                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => toggleCompleted(task)} disabled={Boolean(busyId || loading)}>
                                                                {task.completedAt ? <FaUndo className="me-1" /> : <FaCheckCircle className="me-1" />}
                                                                {task.completedAt ? "Reopen" : "Complete"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && data.totalPages > 1 && (
                        <div className="d-flex justify-content-between align-items-center mt-3">
                            <small className="text-muted">Page {data.page} of {data.totalPages} · {data.total} tasks</small>
                            <div className="d-flex gap-2">
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.totalPages} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyTasks;
