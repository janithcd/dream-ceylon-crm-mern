import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaBell, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { TASKS_CHANGED_EVENT } from "../utils/taskEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const TaskAlert = () => {
    const location = useLocation();
    const containerRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let active = true;
        let latestRequest = 0;

        const refresh = () => {
            const request = ++latestRequest;
            api.get("/bookings/my-tasks", { params: { status: "open", dateFilter: "all", page: 1 } })
                .then((response) => {
                    if (!active || request !== latestRequest) return;
                    setData(response.data);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load task alerts.");
                })
                .finally(() => {
                    if (active && request === latestRequest) setLoading(false);
                });
        };

        const onVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };

        refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener(TASKS_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);

        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
            window.clearInterval(interval);
        };
    }, [location.pathname, refreshKey]);

    useEffect(() => {
        if (!open) return undefined;

        const onPointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const overdue = data?.summary?.overdue || 0;
    const dueToday = data?.summary?.today || 0;
    const count = overdue + dueToday;
    const today = todayCalendarDate();
    const tasks = (data?.items || [])
        .filter((task) => task.dueDate && toCalendarDateInput(task.dueDate) <= today)
        .slice(0, 5);

    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return (
        <div className="task-alert" ref={containerRef}>
            <button
                type="button"
                className={`btn btn-sm position-relative ${count ? "btn-outline-danger" : "btn-outline-secondary"}`}
                aria-label={error ? "Task alerts unavailable" : `Task alerts: ${overdue} overdue, ${dueToday} due today`}
                aria-expanded={open}
                aria-controls="task-alert-panel"
                onClick={() => setOpen((value) => !value)}
            >
                <FaBell className="me-1" aria-hidden="true" />
                Tasks
                {count > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div id="task-alert-panel" className="task-alert-panel card" role="region" aria-label="Task alerts">
                    <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                            <strong>My task alerts</strong>
                            <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh task alerts">
                                <FaSyncAlt aria-hidden="true" />
                            </button>
                        </div>
                        {loading && !data ? (
                            <p className="small text-muted mb-0">Loading task alerts...</p>
                        ) : error ? (
                            <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p>
                        ) : (
                            <>
                                <p className="small mb-2">
                                    <span className="text-danger fw-semibold">{overdue} overdue</span>
                                    <span className="text-muted mx-2">·</span>
                                    <span className="fw-semibold">{dueToday} due today</span>
                                </p>
                                {count === 0 ? (
                                    <p className="small text-muted mb-2">No overdue or due-today tasks.</p>
                                ) : (
                                    <div className="list-group list-group-flush mb-2">
                                        {tasks.map((task) => (
                                            <Link
                                                key={`${task.bookingId}-${task._id}`}
                                                to={`/bookings?keyword=${encodeURIComponent(task.bookingCode)}`}
                                                onClick={() => setOpen(false)}
                                                className="list-group-item list-group-item-action px-0 py-2"
                                            >
                                                <span className="d-block fw-semibold small">{task.title}</span>
                                                <span className="d-block text-muted small">
                                                    {task.bookingCode} · {toCalendarDateInput(task.dueDate) < today ? "Overdue" : "Today"} · {formatCalendarDate(task.dueDate)}
                                                    {task.priority === "High" && " · High priority"}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        <Link to="/my-tasks" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>
                            View all in My Tasks
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskAlert;
