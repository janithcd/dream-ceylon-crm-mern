import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaEnvelopeOpenText, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { LEADS_CHANGED_EVENT } from "../utils/leadEvents";

const REFRESH_INTERVAL = 60 * 1000;

const LeadAlert = () => {
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
            api.get("/inquiries/attention")
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load lead alerts.");
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
        window.addEventListener(LEADS_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(LEADS_CHANGED_EVENT, refresh);
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

    const { total = 0, unassigned = 0, mine = 0, waiting24h = 0 } = data?.summary || {};
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return (
        <div className="task-alert" ref={containerRef}>
            <button type="button"
                className={`btn btn-sm position-relative ${waiting24h ? "btn-outline-danger" : total ? "btn-outline-primary" : "btn-outline-secondary"}`}
                aria-label={error ? "Lead alerts unavailable" : `Lead alerts: ${total} new for you or unassigned, ${waiting24h} waiting at least 24 hours`}
                aria-expanded={open} aria-controls="lead-alert-panel" onClick={() => setOpen((value) => !value)}>
                <FaEnvelopeOpenText className="me-1" aria-hidden="true" />Leads
                {total > 0 && <span className={`position-absolute top-0 start-100 translate-middle badge rounded-pill ${waiting24h ? "text-bg-danger" : "text-bg-primary"}`}>
                    {total > 99 ? "99+" : total}
                </span>}
            </button>

            {open && <div id="lead-alert-panel" className="task-alert-panel card" role="region" aria-label="Lead alerts">
                <div className="card-body p-3">
                    <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                        <strong>New leads needing contact</strong>
                        <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh lead alerts"><FaSyncAlt aria-hidden="true" /></button>
                    </div>
                    {loading && !data ? <p className="small text-muted mb-0">Loading lead alerts...</p> : error ? (
                        <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p>
                    ) : <>
                        <p className="small mb-2">
                            <span className="fw-semibold">{unassigned} unassigned</span>
                            <span className="text-muted mx-2">·</span><span className="fw-semibold">{mine} mine</span>
                            <span className="text-muted mx-2">·</span><span className="text-danger fw-semibold">{waiting24h} waiting 24h+</span>
                        </p>
                        {total === 0 ? <p className="small text-muted mb-2">No new leads waiting for you.</p> : (
                            <div className="list-group list-group-flush mb-2">
                                {(data?.items || []).map((item) => (
                                    <Link key={item._id} to={`/inquiries?keyword=${encodeURIComponent(item.email)}`}
                                        className="list-group-item list-group-item-action px-0 py-2" onClick={() => setOpen(false)}>
                                        <span className="d-block fw-semibold small">{item.fullName}</span>
                                        <span className="d-block text-muted small">
                                            {item.assignedTo ? "Mine" : "Unassigned"} · Received {formatCalendarDate(item.createdAt)}
                                            {item.priority === "High" && " · High priority"}
                                            {item.waiting24h && <span className="text-danger fw-semibold"> · Waiting 24h+</span>}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>}
                    <Link to="/lead-triage" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>Open New Lead Queue</Link>
                </div>
            </div>}
        </div>
    );
};

export default LeadAlert;
