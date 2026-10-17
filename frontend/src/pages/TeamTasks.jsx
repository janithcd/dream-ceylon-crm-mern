import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaClipboardList, FaHandPaper, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { notifyTasksChanged } from "../utils/taskEvents";

const emptyData = {
    items: [], summary: { open: 0, unassigned: 0, assigned: 0, high: 0, overdue: 0, today: 0, upcoming: 0, noDue: 0 },
    total: 0, page: 1, totalPages: 1,
};

const assignmentChoices = [
    { value: "unassigned", label: "Unassigned", count: "unassigned" },
    { value: "all", label: "All open", count: "open" },
    { value: "assigned", label: "Assigned", count: "assigned" },
];

const dateChoices = [
    { value: "all", label: "Any date" },
    { value: "overdue", label: "Overdue", count: "overdue" },
    { value: "today", label: "Today", count: "today" },
    { value: "upcoming", label: "Upcoming", count: "upcoming" },
    { value: "noDue", label: "No due date", count: "noDue" },
];

const dueStatus = (dueDate, today) => {
    if (!dueDate) return { label: "No due date", color: "secondary" };
    const due = toCalendarDateInput(dueDate);
    if (due < today) return { label: "Overdue", color: "danger" };
    if (due === today) return { label: "Today", color: "warning" };
    return { label: "Upcoming", color: "primary" };
};

const TeamTasks = () => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [assignment, setAssignment] = useState("unassigned");
    const [dateFilter, setDateFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let active = true;
        api.get("/bookings/team-tasks", { params: { assignment, dateFilter, priorityFilter, page } })
            .then((response) => {
                if (active) setData(response.data);
            })
            .catch((requestError) => {
                if (active) {
                    setData(emptyData);
                    setError(requestError.response?.data?.message || "Failed to load team tasks.");
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [assignment, dateFilter, priorityFilter, page, reloadKey]);

    const changeFilter = (setter, current, value) => {
        if (current === value && page === 1) return;
        setLoading(true);
        setError("");
        setNotice("");
        setter(value);
        setPage(1);
    };

    const refresh = () => {
        setLoading(true);
        setError("");
        setReloadKey((key) => key + 1);
    };

    const claimTask = async (task) => {
        if (busyId || !canUpdate) return;
        setBusyId(task._id);
        setError("");
        setNotice("");
        try {
            await api.patch(`/bookings/${task.bookingId}/preparation-tasks/${task._id}/claim`);
            notifyTasksChanged();
            setNotice(`You took “${task.title}”. It is now in My Tasks.`);
            setLoading(true);
            if (assignment === "unassigned" && page > 1 && data.items.length === 1) setPage(page - 1);
            else setReloadKey((key) => key + 1);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Failed to take the task.");
            setLoading(true);
            setReloadKey((key) => key + 1);
        } finally {
            setBusyId("");
        }
    };

    const today = todayCalendarDate();

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1"><FaClipboardList className="me-2 text-primary" />Team Tasks</h3>
                    <p className="text-muted mb-0">Open preparation tasks across active bookings. Dates follow Sri Lanka time.</p>
                </div>
                <button type="button" className="btn btn-outline-primary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}</div>}

            <div className="row g-3 mb-4">
                {[
                    { label: "Open tasks", count: data.summary.open, color: "primary" },
                    { label: "Unassigned", count: data.summary.unassigned, color: "danger" },
                    { label: "Overdue", count: data.summary.overdue, color: "danger" },
                    { label: "Due today", count: data.summary.today, color: "warning" },
                    { label: "High priority", count: data.summary.high, color: "primary" },
                ].map((item) => (
                    <div key={item.label} className="col-6 col-md-4 col-xl">
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
                    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Task assignment">
                        {assignmentChoices.map((choice) => (
                            <button key={choice.value} type="button" className={`btn btn-sm ${assignment === choice.value ? "btn-primary" : "btn-outline-primary"}`} onClick={() => changeFilter(setAssignment, assignment, choice.value)}>
                                {choice.label} ({data.summary[choice.count]})
                            </button>
                        ))}
                    </div>
                    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Task due date">
                        {dateChoices.map((choice) => (
                            <button key={choice.value} type="button" className={`btn btn-sm ${dateFilter === choice.value ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => changeFilter(setDateFilter, dateFilter, choice.value)}>
                                {choice.label}{choice.count ? ` (${data.summary[choice.count]})` : ""}
                            </button>
                        ))}
                    </div>
                    <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Task priority">
                        <button type="button" className={`btn btn-sm ${priorityFilter === "all" ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => changeFilter(setPriorityFilter, priorityFilter, "all")}>All priorities</button>
                        <button type="button" className={`btn btn-sm ${priorityFilter === "high" ? "btn-danger" : "btn-outline-danger"}`} onClick={() => changeFilter(setPriorityFilter, priorityFilter, "high")}>High priority ({data.summary.high})</button>
                    </div>

                    {loading ? (
                        <p className="text-muted mb-0">Loading team tasks...</p>
                    ) : !data.items.length ? (
                        <p className="text-muted mb-0">No open tasks in this view.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle mb-0">
                                <thead><tr><th>Task</th><th>Booking / client</th><th>Owner</th><th>Due</th><th className="text-end">Actions</th></tr></thead>
                                <tbody>
                                    {data.items.map((task) => {
                                        const due = dueStatus(task.dueDate, today);
                                        return (
                                            <tr key={`${task.bookingId}-${task._id}`}>
                                                <td className="fw-semibold">
                                                    {task.title}
                                                    {task.priority === "High" && <span className="badge text-bg-danger ms-2">High</span>}
                                                    {task.priority === "Low" && <span className="badge text-bg-secondary ms-2">Low</span>}
                                                    {task.notes && <small className="d-block fw-normal text-muted mt-1" style={{ whiteSpace: "pre-wrap" }}>{task.notes}</small>}
                                                </td>
                                                <td><div>{task.bookingCode}</div><small className="text-muted">{task.customerName || "-"}</small></td>
                                                <td>
                                                    {task.assignee?.name || (task.assignedTo ? "Former admin" : "Unassigned")}
                                                    {task.assignee?.status === "Inactive" && <small className="text-muted d-block">Inactive</small>}
                                                </td>
                                                <td><div>{formatCalendarDate(task.dueDate)}</div><span className={`badge text-bg-${due.color}`}>{due.label}</span></td>
                                                <td className="text-end">
                                                    <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                        <Link to={`/bookings?keyword=${encodeURIComponent(task.bookingCode)}`} className="btn btn-sm btn-outline-primary">Booking</Link>
                                                        {canUpdate && !task.assignedTo && (
                                                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => claimTask(task)} disabled={Boolean(busyId || loading)}>
                                                                <FaHandPaper className="me-1" />Take task
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

export default TeamTasks;
