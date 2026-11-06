import { useEffect, useState } from "react";
import api from "../api/axios";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const statuses = [
    { value: "needs-review", label: "Needs review" }, { value: "all", label: "All active" },
    { value: "Received", label: "Received" }, { value: "Disputed", label: "Disputed" },
    { value: "Approved", label: "Approved" }, { value: "voided", label: "Voided" },
];
const dueFilters = [
    { value: "all", label: "All invoice dates" }, { value: "overdue", label: "Overdue & unpaid" },
    { value: "due7", label: "Due within 7 days & unpaid" }, { value: "later", label: "Later & unpaid" },
    { value: "unscheduled", label: "No due date & unpaid" },
];
const empty = { items: [], total: 0, page: 1, limit: 25, pages: 0, summary: { needsReview: 0, overdue: 0, dueSoon: 0 } };
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const SupplierInvoiceRegister = ({ onOpenInvoice, reloadKey }) => {
    const [status, setStatus] = useState("needs-review");
    const [due, setDue] = useState("all");
    const [page, setPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);
    const [register, setRegister] = useState(empty);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setLoading(true); setError("");
        api.get("/finance/costs/invoice-register", { params: { status, due, page } })
            .then(({ data }) => {
                if (!active) return;
                if (page > Math.max(1, data.pages)) { setPage(Math.max(1, data.pages)); return; }
                setRegister(data);
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load supplier invoices."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [status, due, page, refreshKey, reloadKey]);
    const changeStatus = (value) => { setStatus(value); setPage(1); if (value === "voided") setDue("all"); };
    const changeDue = (value) => { setDue(value); setPage(1); };
    const today = todayCalendarDate();

    return <div className="card border-0 shadow-sm mb-4"><div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div><h4 className="fw-bold mb-1">Supplier invoice register</h4>
                <p className="small text-muted mb-2">Pro formas and invoices across bookings. Due reminders use the invoice date and only show when the linked booking cost has an unpaid balance.</p></div>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Supplier invoice attention">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => { changeStatus("needs-review"); changeDue("all"); }}>
                Needs review: {register.summary.needsReview}</button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { changeStatus("all"); changeDue("overdue"); }}>
                Overdue &amp; unpaid: {register.summary.overdue}</button>
            <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => { changeStatus("all"); changeDue("due7"); }}>
                Due within 7 days: {register.summary.overdue + register.summary.dueSoon}</button>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div><label className="form-label small mb-1" htmlFor="invoice-register-status">Review status</label>
                <select id="invoice-register-status" className="form-select form-select-sm" value={status} onChange={(e) => changeStatus(e.target.value)}>
                    {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="form-label small mb-1" htmlFor="invoice-register-due">Supplier invoice due</label>
                <select id="invoice-register-due" className="form-select form-select-sm" value={due} disabled={status === "voided"} onChange={(e) => changeDue(e.target.value)}>
                    {dueFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {!error && loading && <p className="text-muted mb-0">Loading invoice register...</p>}
        {!error && !loading && register.items.length === 0 && <p className="text-muted mb-0">No supplier invoices in this view.</p>}
        {!error && !loading && register.items.length > 0 && <>
            <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr><th>Booking</th><th>Supplier / reference</th><th>Review</th><th>Invoice amount</th><th>Invoice due</th><th>Booking cost balance</th><th>Action</th></tr></thead>
                <tbody>{register.items.map((item) => {
                    const outstanding = item.costRemaining > 0 && !item.voidedAt;
                    const overdue = outstanding && item.dueDate && toCalendarDateInput(item.dueDate) < today;
                    const mismatch = item.currency !== item.costCurrency || item.amount !== item.costAmount;
                    return <tr key={item._id}>
                        <td>{item.bookingCode}{item.bookingStatus === "Cancelled" && <div className="small text-warning-emphasis">Cancelled booking · verify obligation</div>}</td>
                        <td>{item.supplierName}<div className="small text-muted">{item.invoiceReference} · {item.costDescription}</div>
                            {mismatch && !item.voidedAt && <div className="small text-warning-emphasis">Different from booking cost</div>}</td>
                        <td><span className={`badge ${item.voidedAt ? "text-bg-secondary" : item.status === "Approved" ? "text-bg-success" : item.status === "Disputed" ? "text-bg-danger" : "text-bg-warning"}`}>
                            {item.voidedAt ? "Voided" : item.status}</span>{!item.filename && !item.voidedAt && <div className="small text-warning-emphasis">File missing</div>}</td>
                        <td>{money(item.amount, item.currency)}</td>
                        <td><span className={overdue ? "text-danger fw-semibold" : ""}>{item.dueDate ? formatCalendarDate(item.dueDate) : "Not stated"}
                            {overdue ? " · Overdue" : ""}</span></td>
                        <td>{money(item.costRemaining, item.costCurrency)}<div className="small text-muted">Cost due: {item.costPaymentDueDate ? formatCalendarDate(item.costPaymentDueDate) : "not set"}</div></td>
                        <td><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onOpenInvoice(item)}>Open invoice</button></td>
                    </tr>;
                })}</tbody>
            </table></div>
            <p className="small text-muted mt-2 mb-0">The balance belongs to the booking cost; payments are not allocated to individual invoices. Invoice dates do not update the payment schedule automatically.</p>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                <span className="text-muted small">Showing {(register.page - 1) * register.limit + 1}–{Math.min(register.page * register.limit, register.total)} of {register.total} invoices.</span>
                {register.pages > 1 && <div className="d-flex align-items-center gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                    <span className="small">Page {register.page} of {register.pages}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= register.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
            </div>
        </>}
    </div></div>;
};

export default SupplierInvoiceRegister;
