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
                    setError(requestError.response?.data?.message || "Could not load guest care alerts.");
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
    const contactCount = data?.contact?.count || 0;
    const total = count + contactCount;
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return <div className="task-alert" ref={containerRef}>
        <button type="button" className={`btn btn-sm position-relative ${total ? "btn-outline-danger" : "btn-outline-secondary"}`}
            aria-label={error ? "Guest care alerts unavailable" : `Guest care alerts: ${contactCount} guests to contact, ${count} recoveries needing attention, ${overdue} overdue, ${dueToday} due today, ${unscheduled} without a date`}
            aria-expanded={open} aria-controls="recovery-alert-panel" onClick={() => setOpen((value) => !value)}>
            <FaHeart className="me-1" aria-hidden="true" />Guest care
            {total > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{total > 99 ? "99+" : total}</span>}
        </button>
        {open && <div id="recovery-alert-panel" className="task-alert-panel card" role="region" aria-label="Guest care alerts">
            <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <strong>Guest care needing attention</strong>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh guest care alerts"><FaSyncAlt aria-hidden="true" /></button>
                </div>
                {loading && !data ? <p className="small text-muted mb-0">Loading guest care alerts...</p> : error ?
                    <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p> : <>
                        {contactCount > 0 && <>
                            <p className="small fw-semibold mb-2">{contactCount} completed {contactCount === 1 ? "trip" : "trips"} awaiting guest contact</p>
                            <div className="list-group list-group-flush mb-2">{(data?.contact?.items || []).map((item) =>
                                <Link key={item.bookingId} to={`/post-trip-care?filter=due&booking=${encodeURIComponent(item.bookingId)}`}
                                    className="list-group-item list-group-item-action px-0 py-2" onClick={() => setOpen(false)}>
                                    <span className="d-block fw-semibold small">{item.bookingCode}</span>
                                    <span className="d-block text-muted small">Trip ended {formatCalendarDate(item.travelEndDate)}</span>
                                </Link>)}</div>
                        </>}
                        {count > 0 && <p className="small fw-semibold mb-1">{count} {count === 1 ? "recovery" : "recoveries"} needing attention</p>}
                        {count > 0 && <p className="small mb-2"><span className="text-danger fw-semibold">{overdue} overdue</span><span className="text-muted mx-2">·</span>
                            <span className="fw-semibold">{dueToday} due today</span><span className="text-muted mx-2">·</span>
                            <span className="fw-semibold">{unscheduled} without a date</span></p>}
                        {total === 0 && <p className="small text-muted mb-2">No guest care follow-ups need attention today.</p>}
                        {count > 0 && <div className="list-group list-group-flush mb-2">{(data?.items || []).map((item) =>
                                <Link key={item.bookingId} to={`/post-trip-care?filter=recovery&booking=${encodeURIComponent(item.bookingId)}`}
                                    className="list-group-item list-group-item-action px-0 py-2" onClick={() => setOpen(false)}>
                                    <span className="d-block fw-semibold small">{item.bookingCode}</span>
                                    <span className="d-block text-muted small">{item.overdue ? `Overdue · ${formatCalendarDate(item.followUpDate)}` :
                                        item.dueToday ? `Due today · ${formatCalendarDate(item.followUpDate)}` : "No follow-up date"}</span>
                                </Link>)}</div>}
                    </>}
                <div className="d-grid gap-2 mt-2">
                    <Link to="/post-trip-care?filter=due" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(false)}>View guests to contact</Link>
                    <Link to="/post-trip-care?filter=recovery" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(false)}>View open recoveries</Link>
                </div>
            </div>
        </div>}
    </div>;
};

export default RecoveryAlert;
