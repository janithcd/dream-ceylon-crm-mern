import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaCoins, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { SUPPLIER_PAYABLES_CHANGED_EVENT } from "../utils/supplierPayableEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;
const formatMoney = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const SupplierPayableAlert = () => {
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
            api.get("/finance/costs/payables")
                .then(({ data: result }) => {
                    if (!active || request !== latestRequest) return;
                    setData(result);
                    setError("");
                })
                .catch((requestError) => {
                    if (!active || request !== latestRequest) return;
                    setData(null);
                    setError(requestError.response?.data?.message || "Could not load supplier dues.");
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
        window.addEventListener(SUPPLIER_PAYABLES_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(SUPPLIER_PAYABLES_CHANGED_EVENT, refresh);
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

    const { total = 0, overdue = 0, upcoming = 0 } = data?.summary || {};
    const refreshNow = () => {
        setLoading(true);
        setRefreshKey((key) => key + 1);
    };
    const today = todayCalendarDate();

    return (
        <div className="task-alert" ref={containerRef}>
            <button
                type="button"
                className={`btn btn-sm position-relative ${overdue ? "btn-outline-danger" : total ? "btn-outline-warning" : "btn-outline-secondary"}`}
                aria-label={error ? "Supplier dues unavailable" : `Supplier dues: ${total} payments, ${overdue} overdue, ${upcoming} due today or within six days`}
                aria-expanded={open}
                aria-controls="supplier-payable-alert-panel"
                onClick={() => setOpen((value) => !value)}
            >
                <FaCoins className="me-1" aria-hidden="true" />Supplier dues
                {total > 0 && <span className={`position-absolute top-0 start-100 translate-middle badge rounded-pill ${overdue ? "text-bg-danger" : "text-bg-warning"}`}>{total > 99 ? "99+" : total}</span>}
            </button>

            {open && (
                <div id="supplier-payable-alert-panel" className="task-alert-panel card" role="region" aria-label="Supplier dues">
                    <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                            <strong>Supplier payments due</strong>
                            <button type="button" className="btn btn-sm btn-link p-0" onClick={refreshNow} disabled={loading} aria-label="Refresh supplier dues"><FaSyncAlt aria-hidden="true" /></button>
                        </div>
                        {loading && !data ? (
                            <p className="small text-muted mb-0">Loading supplier dues...</p>
                        ) : error ? (
                            <p className="small text-danger mb-0" role="alert">{error} Try refreshing.</p>
                        ) : (
                            <>
                                <p className="small mb-2"><span className="text-danger fw-semibold">{overdue} overdue</span><span className="text-muted mx-2">·</span><span className="fw-semibold">{upcoming} due within seven days</span></p>
                                {total === 0 ? <p className="small text-muted mb-2">No supplier payments due in the next seven days.</p> : (
                                    <div className="list-group list-group-flush mb-2">
                                        {(data?.items || []).slice(0, 5).map((item) => (
                                            <Link key={item._id} to={`/cost-profit?type=booking&id=${encodeURIComponent(item.recordId)}`} onClick={() => setOpen(false)} className="list-group-item list-group-item-action px-0 py-2">
                                                <span className="d-block fw-semibold small">{item.bookingCode} · {item.description}</span>
                                                <span className="d-block text-muted small">{toCalendarDateInput(item.paymentDueDate) < today ? "Overdue" : "Due"} {formatCalendarDate(item.paymentDueDate)} · {formatMoney(item.remaining, item.currency)} remaining</span>
                                            </Link>
                                        ))}
                                        {total > 5 && <p className="small text-muted mt-2 mb-0">Showing the first five of {total} due payments.</p>}
                                    </div>
                                )}
                            </>
                        )}
                        <Link to="/cost-profit?type=booking" className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => setOpen(false)}>View supplier payments</Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierPayableAlert;
