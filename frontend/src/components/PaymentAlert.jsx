import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaSyncAlt, FaWallet } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { PAYMENT_ATTENTION_CHANGED_EVENT } from "../utils/paymentEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const PaymentAlert = () => {
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
            api.get("/bookings/payment-attention")
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load payment alerts.");
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
        window.addEventListener(PAYMENT_ATTENTION_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(PAYMENT_ATTENTION_CHANGED_EVENT, refresh);
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

    const { total = 0, followUpsDue = 0, overdue = 0 } = data?.summary || {};
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };

    return (
        <div className="task-alert" ref={containerRef}>
            <button
                type="button"
                className={`btn btn-sm position-relative ${total ? "btn-outline-danger" : "btn-outline-secondary"}`}
                aria-label={error ? "Payment alerts unavailable" : `Payment alerts: ${total} bookings need attention, ${followUpsDue} follow-ups due, ${overdue} overdue payment dates`}
                aria-expanded={open}
                aria-controls="payment-alert-panel"
                onClick={() => setOpen((value) => !value)}
            >
                <FaWallet className="me-1" aria-hidden="true" />Payments
                {total > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{total > 99 ? "99+" : total}</span>}
            </button>

            {open && (
                <div id="payment-alert-panel" className="task-alert-panel card" role="region" aria-label="Payment alerts">
                    <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                            <strong>Payments needing attention</strong>
                            <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh payment alerts"><FaSyncAlt aria-hidden="true" /></button>
                        </div>
                        {loading && !data ? (
                            <p className="small text-muted mb-0">Loading payment alerts...</p>
                        ) : error ? (
                            <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p>
                        ) : (
                            <>
                                <p className="small mb-2"><span className="fw-semibold">{followUpsDue} follow-ups due</span><span className="text-muted mx-2">·</span><span className="text-danger fw-semibold">{overdue} overdue payment dates</span></p>
                                {total === 0 ? <p className="small text-muted mb-2">No payment follow-ups or overdue dates right now.</p> : (
                                    <div className="list-group list-group-flush mb-2">
                                        {(data?.items || []).map((item) => (
                                            <Link key={item._id} to={item.followUpDue ? "/outstanding-balances?contactFilter=due" : "/outstanding-balances?dueFilter=overdue"} onClick={() => setOpen(false)} className="list-group-item list-group-item-action px-0 py-2">
                                                <span className="d-block fw-semibold small">{item.bookingCode}</span>
                                                <span className="d-block text-muted small">
                                                    {item.followUpDue ? `Follow up ${formatCalendarDate(item.nextFollowUpDate)}` :
                                                        `${item.nextPaymentStage || "Payment"} due ${formatCalendarDate(item.nextPaymentDueDate)} · ${item.currency || "USD"} ${Number(item.nextPaymentAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                    {item.followUpDue && item.paymentOverdue && " · Payment overdue"}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        <Link to="/outstanding-balances" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>View outstanding balances</Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentAlert;
