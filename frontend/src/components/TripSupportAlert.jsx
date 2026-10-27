import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaLifeRing, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { TRIP_SUPPORT_CHANGED_EVENT } from "../utils/tripSupportEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const TripSupportAlert = () => {
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
            api.get("/bookings/trip-support/alerts")
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load trip issue alerts.");
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
        window.addEventListener(TRIP_SUPPORT_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(TRIP_SUPPORT_CHANGED_EVENT, refresh);
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

    const { count = 0, urgent = 0, overdue = 0, unassigned = 0 } = data?.summary || {};
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return <div className="task-alert" ref={containerRef}>
        <button type="button" className={`btn btn-sm position-relative ${count ? "btn-outline-danger" : "btn-outline-secondary"}`}
            aria-label={error ? "Trip issue alerts unavailable" : `Trip issue alerts: ${count} needing attention, ${urgent} urgent, ${overdue} overdue, ${unassigned} unassigned`}
            aria-expanded={open} aria-controls="trip-support-alert-panel" onClick={() => setOpen((value) => !value)}>
            <FaLifeRing className="me-1" aria-hidden="true" />Trip issues
            {count > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{count > 99 ? "99+" : count}</span>}
        </button>
        {open && <div id="trip-support-alert-panel" className="task-alert-panel card" role="region" aria-label="Trip issue alerts">
            <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <strong>Trip issues needing attention</strong>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh trip issue alerts"><FaSyncAlt aria-hidden="true" /></button>
                </div>
                {loading && !data ? <p className="small text-muted mb-0">Loading trip issue alerts...</p> : error ?
                    <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p> : <>
                        <p className="small mb-2"><span className="text-danger fw-semibold">{urgent} urgent</span><span className="text-muted mx-2">·</span>
                            <span className="text-danger fw-semibold">{overdue} overdue</span><span className="text-muted mx-2">·</span>
                            <span className="fw-semibold">{unassigned} unassigned</span></p>
                        {count === 0 ? <p className="small text-muted mb-2">No urgent, overdue, or unassigned open issues.</p> :
                            <div className="list-group list-group-flush mb-2">{(data?.items || []).map((item) =>
                                <Link key={item.bookingId} to={`/trip-support?booking=${encodeURIComponent(item.bookingId)}`}
                                    className="list-group-item list-group-item-action px-0 py-2" onClick={() => setOpen(false)}>
                                    <span className="d-block fw-semibold small">{item.bookingCode} · {item.count} {item.count === 1 ? "issue" : "issues"}</span>
                                    <span className="d-block text-muted small">{[
                                        item.urgent > 0 && `${item.urgent} urgent`, item.overdue > 0 && `${item.overdue} overdue`,
                                        item.unassigned > 0 && `${item.unassigned} unassigned`,
                                    ].filter(Boolean).join(" · ")}</span>
                                </Link>)}</div>}
                    </>}
                <Link to="/trip-support" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>View all in Trip Support</Link>
            </div>
        </div>}
    </div>;
};

export default TripSupportAlert;
