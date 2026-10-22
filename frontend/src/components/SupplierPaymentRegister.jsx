import { useEffect, useState } from "react";
import api from "../api/axios";
import PermissionGuard from "./PermissionGuard";
import { formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

const today = todayCalendarDate();
const initialFilters = { from: `${today.slice(0, 7)}-01`, to: today, reference: "" };
const emptyRegister = { items: [], total: 0, page: 1, limit: 25, pages: 0, totalsByCurrency: [] };
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const SupplierPaymentRegister = ({ onSelectBooking, reloadKey }) => {
    const [filters, setFilters] = useState(initialFilters);
    const [applied, setApplied] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [register, setRegister] = useState(emptyRegister);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        api.get("/finance/costs/payment-register", { params: { ...applied, page } })
            .then(({ data }) => {
                if (cancelled) return;
                if (page > Math.max(1, data.pages)) {
                    setPage(Math.max(1, data.pages));
                    return;
                }
                setRegister(data);
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError.response?.data?.message || "Could not load supplier payments.");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [applied, page, reloadKey]);

    const exportCsv = async () => {
        try {
            setExporting(true);
            setError("");
            const { data } = await api.get("/finance/costs/payment-register/export", {
                params: applied, responseType: "blob",
            });
            const url = window.URL.createObjectURL(data);
            const link = document.createElement("a");
            link.href = url;
            link.download = `supplier-payments-${applied.from}-to-${applied.to}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
        } catch (requestError) {
            let message = "Could not export supplier payments.";
            if (requestError.response?.data instanceof Blob) {
                try { message = JSON.parse(await requestError.response.data.text()).message || message; } catch { /* Use fallback. */ }
            }
            setError(message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="card border-0 shadow-sm mb-4">
            <div className="card-body">
                <h4 className="fw-bold mb-1">Supplier payment register</h4>
                <p className="text-muted small mb-3">Match recorded booking payments to bank transfers by payment date and reference. Opening balances and manual paid total corrections are excluded.</p>
                <form className="row g-2 align-items-end mb-3" onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setApplied({ ...filters, reference: filters.reference.trim() });
                }}>
                    <div className="col-sm-6 col-lg-3">
                        <label className="form-label" htmlFor="register-from">From</label>
                        <input id="register-from" className="form-control" type="date" required value={filters.from}
                            onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
                    </div>
                    <div className="col-sm-6 col-lg-3">
                        <label className="form-label" htmlFor="register-to">To</label>
                        <input id="register-to" className="form-control" type="date" required value={filters.to}
                            onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
                    </div>
                    <div className="col-sm-6 col-lg-4">
                        <label className="form-label" htmlFor="register-reference">Payment reference contains</label>
                        <input id="register-reference" className="form-control" maxLength={100} value={filters.reference}
                            onChange={(event) => setFilters({ ...filters, reference: event.target.value })} placeholder="Bank transaction reference" />
                    </div>
                    <div className="col-sm-6 col-lg-2"><button className="btn btn-outline-primary w-100" type="submit">Apply</button></div>
                </form>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                    <span className="small text-muted">Showing payments dated {applied.from} through {applied.to} (Sri Lanka).</span>
                    <PermissionGuard permission="report.export">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={exporting || loading || register.total === 0 || Boolean(error)}
                            onClick={() => void exportCsv()}>{exporting ? "Exporting..." : "Export matching CSV"}</button>
                    </PermissionGuard>
                </div>
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                {!error && loading && <p className="text-muted mb-0">Loading payment register...</p>}
                {!error && !loading && register.total === 0 && <p className="text-muted mb-0">No recorded payments in this view.</p>}
                {!error && !loading && register.total > 0 && <>
                    <p className="small mb-2"><strong>Total recorded payments:</strong> {register.totalsByCurrency.map(({ currency, amount }) => money(amount, currency)).join(" · ")}</p>
                    <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                        <thead><tr><th>Date</th><th>Booking</th><th>Supplier / cost</th><th>Amount</th><th>Method / reference</th><th>Recorded by</th></tr></thead>
                        <tbody>{register.items.map((item) => <tr key={item.paymentId}>
                            <td>{formatCalendarDate(item.paymentDate)}</td>
                            <td><button type="button" className="btn btn-link p-0" onClick={() => onSelectBooking(item.recordId)}>{item.bookingCode}</button>
                                <div className="small text-muted">{item.customerName}</div></td>
                            <td>{item.description}{item.note && <div className="small text-muted">{item.note}</div>}</td>
                            <td>{money(item.amount, item.currency)}</td>
                            <td>{item.method}{item.reference && <div className="small text-muted">{item.reference}</div>}</td>
                            <td>{item.recordedByName}</td>
                        </tr>)}</tbody>
                    </table></div>
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                        <span className="text-muted small">Showing {(register.page - 1) * register.limit + 1}–{Math.min(register.page * register.limit, register.total)} of {register.total} payments.</span>
                        {register.pages > 1 && <div className="d-flex align-items-center gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                            <span className="small">Page {register.page} of {register.pages}</span>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= register.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
                        </div>}
                    </div>
                </>}
            </div>
        </div>
    );
};

export default SupplierPaymentRegister;
