import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaHeart, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { RECOVERY_CHANGED_EVENT } from "../utils/recoveryEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const RecoveryAlert = () => {
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
            api.get("/bookings/post-trip-care/alerts")
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result); setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load recovery alerts.");
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
        window.addEventListener(RECOVERY_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(RECOVERY_CHANGED_EVENT, refresh);
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

    const { count = 0, overdue = 0, dueToday = 0, unscheduled = 0 } = data?.summary || {};
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return <div className="task-alert" ref={containerRef}>
        <button type="button" className={`btn btn-sm position-relative ${count ? "btn-outline-danger" : "btn-outline-secondary"}`}
            aria-label={error ? "Recovery alerts unavailable" : `Recovery alerts: ${count} needing attention, ${overdue} overdue, ${dueToday} due today, ${unscheduled} without a date`}
            aria-expanded={open} aria-controls="recovery-alert-panel" onClick={() => setOpen((value) => !value)}>
            <FaHeart className="me-1" aria-hidden="true" />Recovery
            {count > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{count > 99 ? "99+" : count}</span>}
        </button>
        {open && <div id="recovery-alert-panel" className="task-alert-panel card" role="region" aria-label="Recovery alerts">
            <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <strong>Guest recoveries needing attention</strong>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh recovery alerts"><FaSyncAlt aria-hidden="true" /></button>
                </div>
                {loading && !data ? <p className="small text-muted mb-0">Loading recovery alerts...</p> : error ?
                    <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p> : <>
                        <p className="small mb-2"><span className="text-danger fw-semibold">{overdue} overdue</span><span className="text-muted mx-2">·</span>
                            <span className="fw-semibold">{dueToday} due today</span><span className="text-muted mx-2">·</span>
                            <span className="fw-semibold">{unscheduled} without a date</span></p>
                        {count === 0 ? <p className="small text-muted mb-2">No open recoveries need attention today.</p> :
                            <div className="list-group list-group-flush mb-2">{(data?.items || []).map((item) =>
                                <Link key={item.bookingId} to={`/post-trip-care?filter=recovery&booking=${encodeURIComponent(item.bookingId)}`}
                                    className="list-group-item list-group-item-action px-0 py-2" onClick={() => setOpen(false)}>
                                    <span className="d-block fw-semibold small">{item.bookingCode}</span>
                                    <span className="d-block text-muted small">{item.overdue ? `Overdue · ${formatCalendarDate(item.followUpDate)}` :
                                        item.dueToday ? `Due today · ${formatCalendarDate(item.followUpDate)}` : "No follow-up date"}</span>
                                </Link>)}</div>}
                    </>}
                <Link to="/post-trip-care?filter=recovery" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>View open recoveries</Link>
            </div>
        </div>}
    </div>;
};

export default RecoveryAlert;
