import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaClipboardCheck, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { SUPPLIER_CONFIRMATIONS_CHANGED_EVENT } from "../utils/supplierEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const SupplierAlert = () => {
    const location = useLocation();
    const containerRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [deadlineData, setDeadlineData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deadlineLoading, setDeadlineLoading] = useState(true);
    const [error, setError] = useState("");
    const [deadlineError, setDeadlineError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let active = true;
        let latestRequest = 0;
        const refresh = () => {
            const request = ++latestRequest;
            api.get("/bookings/supplier-confirmations", { params: { dateFilter: "actionable", page: 1 } })
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load supplier alerts.");
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
        window.addEventListener(SUPPLIER_CONFIRMATIONS_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);

        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(SUPPLIER_CONFIRMATIONS_CHANGED_EVENT, refresh);
            window.clearInterval(interval);
        };
    }, [location.pathname, refreshKey]);

    useEffect(() => {
        let active = true;
        let latestRequest = 0;
        const refresh = () => {
            const request = ++latestRequest;
            api.get("/bookings/hotel-cancellation-deadlines", { params: { filter: "due7", page: 1 } })
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setDeadlineData(result);
                    setDeadlineError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setDeadlineData(null);
                    setDeadlineError(requestError.response?.data?.message || "Could not load hotel deadlines.");
                })
                .finally(() => { if (active && request === latestRequest) setDeadlineLoading(false); });
        };
        const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
        refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener(SUPPLIER_CONFIRMATIONS_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(SUPPLIER_CONFIRMATIONS_CHANGED_EVENT, refresh);
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
    const supplierCount = overdue + dueToday;
    const deadlineCount = (deadlineData?.summary?.overdue || 0) + (deadlineData?.summary?.dueSoon || 0);
    const count = supplierCount + deadlineCount;
    const today = todayCalendarDate();
    const requests = (data?.items || []).slice(0, 5);
    const deadlines = (deadlineData?.items || []).slice(0, 3);
    const refreshNow = () => {
        setLoading(true);
        setDeadlineLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return (
        <div className="task-alert" ref={containerRef}>
            <button
                type="button"
                className={`btn btn-sm position-relative ${count ? "btn-outline-danger" : "btn-outline-secondary"}`}
                aria-label={`Supplier alerts: ${supplierCount} replies due, ${deadlineCount} hotel cancellation deadlines due soon${error || deadlineError ? "; some alerts unavailable" : ""}`}
                aria-expanded={open}
                aria-controls="supplier-alert-panel"
                onClick={() => setOpen((value) => !value)}
            >
                <FaClipboardCheck className="me-1" aria-hidden="true" />
                Suppliers
                {count > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div id="supplier-alert-panel" className="task-alert-panel card" role="region" aria-label="Supplier alerts">
                    <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                            <strong>Supplier attention</strong>
                            <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading || deadlineLoading} aria-label="Refresh supplier alerts">
                                <FaSyncAlt aria-hidden="true" />
                            </button>
                        </div>
                        {loading && !data ? (
                            <p className="small text-muted mb-0">Loading supplier alerts...</p>
                        ) : error ? (
                            <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p>
                        ) : (
                            <>
                                <strong className="small">Replies due</strong>
                                <p className="small mb-2">
                                    <span className="text-danger fw-semibold">{overdue} overdue</span>
                                    <span className="text-muted mx-2">·</span>
                                    <span className="fw-semibold">{dueToday} due today</span>
                                </p>
                                {supplierCount === 0 ? (
                                    <p className="small text-muted mb-2">No supplier replies due now.</p>
                                ) : (
                                    <div className="list-group list-group-flush mb-2">
                                        {requests.map((request) => (
                                            <Link
                                                key={`${request.bookingId}-${request.type}-${request._id}`}
                                                to={`/bookings?keyword=${encodeURIComponent(request.bookingCode)}`}
                                                onClick={() => setOpen(false)}
                                                className="list-group-item list-group-item-action px-0 py-2"
                                            >
                                                <span className="d-block fw-semibold small">{request.title}</span>
                                                <span className="d-block text-muted small">
                                                    {request.bookingCode} · {request.type === "hotel" ? "Hotel" : "Transport"} · {toCalendarDateInput(request.followUpDate) < today ? "Overdue" : "Today"} · {formatCalendarDate(request.followUpDate)}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        <Link to="/supplier-confirmations?dateFilter=actionable" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>
                            View due supplier requests
                        </Link>
                        <hr className="my-3" />
                        <strong className="small">Hotel cancellation cutoffs</strong>
                        {deadlineLoading && !deadlineData ? <p className="small text-muted mb-0">Loading hotel deadlines...</p>
                            : deadlineError ? <p className="small text-danger mb-0" role="alert">{deadlineError} Try refreshing.</p>
                                : <>
                                    <p className="small mb-2"><span className="text-danger fw-semibold">{deadlineData?.summary?.overdue || 0} passed</span>
                                        <span className="text-muted mx-2">·</span><span className="fw-semibold">{deadlineData?.summary?.dueSoon || 0} next 7 days</span></p>
                                    {deadlineCount === 0 ? <p className="small text-muted mb-0">No hotel cutoffs due soon.</p>
                                        : <div className="list-group list-group-flush">{deadlines.map((item) => <Link
                                            key={`${item.bookingId}-${item._id}`} to="/hotel-cancellation-deadlines" onClick={() => setOpen(false)}
                                            className="list-group-item list-group-item-action px-0 py-2">
                                            <span className="d-block fw-semibold small">{item.hotelName}</span>
                                            <span className="d-block text-muted small">{item.bookingCode} · {formatCalendarDate(item.cancellationDeadline)}</span>
                                        </Link>)}</div>}
                                </>}
                        <Link to="/hotel-cancellation-deadlines" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>
                            View hotel deadlines
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierAlert;
