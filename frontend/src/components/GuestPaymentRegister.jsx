import { useEffect, useState } from "react";
import api from "../api/axios";
import PermissionGuard from "./PermissionGuard";
import { formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

const today = todayCalendarDate();
const initialFilters = { from: `${today.slice(0, 7)}-01`, to: today, reference: "", status: "all" };
const emptyRegister = { items: [], total: 0, page: 1, limit: 25, pages: 0, totalsByCurrency: [] };
const statuses = [{ value: "all", label: "All" }, { value: "unreconciled", label: "To match" }, { value: "reconciled", label: "Matched" }];
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
const localTime = (value) => new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short",
});

const GuestPaymentRegister = ({ onChanged, reloadKey }) => {
    const [filters, setFilters] = useState(initialFilters);
    const [applied, setApplied] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [register, setRegister] = useState(emptyRegister);
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [actionError, setActionError] = useState("");
    const [success, setSuccess] = useState("");
    const [editor, setEditor] = useState(null);
    const [correction, setCorrection] = useState(null);
    const [statementReference, setStatementReference] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        api.get("/booking-payments/register", { params: { ...applied, page } })
            .then(({ data }) => {
                if (cancelled) return;
                if (page > Math.max(1, data.pages)) {
                    setPage(Math.max(1, data.pages));
                    return;
                }
                setRegister(data);
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError.response?.data?.message || "Could not load guest payments.");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [applied, page, reloadKey, refreshKey]);

    const selectStatus = (status) => {
        setFilters((current) => ({ ...current, status }));
        setApplied((current) => ({ ...current, status }));
        setPage(1);
        setEditor(null);
        setCorrection(null);
        setSuccess("");
    };

    const openEditor = (item) => {
        setCorrection(null);
        setEditor({ id: item._id, reconciled: !item.reconciledAt, paymentNo: item.paymentNo,
            amount: item.amount, currency: item.currency, status: item.status });
        setStatementReference("");
        setReason("");
        setActionError("");
        setSuccess("");
    };

    const openCorrection = (item) => {
        setEditor(null);
        setCorrection({ id: item._id, paymentNo: item.paymentNo, amount: "",
            originalAmount: item.amount, fromCurrency: item.currency, bookingCurrency: item.booking.currency, reason: "" });
        setActionError("");
        setSuccess("");
    };

    const saveCorrection = async (event) => {
        event.preventDefault();
        if (!correction) return;
        try {
            setSaving(true);
            setActionError("");
            await api.put(`/booking-payments/${correction.id}`, {
                currency: correction.bookingCurrency, amount: Number(correction.amount),
                correctionReason: correction.reason,
            });
            setSuccess("Payment corrected in the booking currency. Review the updated guest balance.");
            setCorrection(null);
            setRefreshKey((current) => current + 1);
            onChanged();
        } catch (requestError) {
            setActionError(requestError.response?.data?.message || "Could not correct this payment. Refresh and try again.");
            if (requestError.response?.status === 409) {
                setCorrection(null);
                setRefreshKey((current) => current + 1);
            }
        } finally {
            setSaving(false);
        }
    };

    const saveReconciliation = async (event) => {
        event.preventDefault();
        if (!editor) return;
        try {
            setSaving(true);
            setActionError("");
            await api.patch(`/booking-payments/${editor.id}/reconciliation`,
                editor.reconciled ? { reconciled: true, statementReference } : { reconciled: false, reason });
            setSuccess(editor.reconciled ? "Payment matched to the statement." : "Payment reopened for matching.");
            setEditor(null);
            setRefreshKey((current) => current + 1);
            onChanged();
        } catch (requestError) {
            setActionError(requestError.response?.data?.message || "Could not update this payment. Refresh and try again.");
            if (requestError.response?.status === 409) {
                setEditor(null);
                setRefreshKey((current) => current + 1);
            }
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = async () => {
        try {
            setExporting(true);
            setActionError("");
            const { data } = await api.get("/booking-payments/register/export", {
                params: applied, responseType: "blob",
            });
            const url = window.URL.createObjectURL(data);
            const link = document.createElement("a");
            link.href = url;
            link.download = `guest-payments-${applied.from}-to-${applied.to}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
        } catch (requestError) {
            let message = "Could not export guest payments.";
            if (requestError.response?.data instanceof Blob) {
                try { message = JSON.parse(await requestError.response.data.text()).message || message; } catch { /* Use fallback. */ }
            }
            setActionError(message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
                <h4 className="fw-bold mb-1">Guest payment matching</h4>
                <p className="text-muted small mb-3">Compare recorded receipts and refunds with your bank statement or cashbook. Matching verifies a record; it does not change the guest balance. Cancelled records are excluded.</p>
                <form className="row g-2 align-items-end mb-3" onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setApplied({ ...filters, reference: filters.reference.trim() });
                    setEditor(null);
                    setCorrection(null);
                    setSuccess("");
                }}>
                    <div className="col-sm-6 col-lg-3">
                        <label className="form-label" htmlFor="guest-register-from">From</label>
                        <input id="guest-register-from" className="form-control" type="date" required value={filters.from}
                            onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
                    </div>
                    <div className="col-sm-6 col-lg-3">
                        <label className="form-label" htmlFor="guest-register-to">To</label>
                        <input id="guest-register-to" className="form-control" type="date" required value={filters.to}
                            onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
                    </div>
                    <div className="col-sm-6 col-lg-4">
                        <label className="form-label" htmlFor="guest-register-reference">Payment or statement reference</label>
                        <input id="guest-register-reference" className="form-control" maxLength={100} value={filters.reference}
                            onChange={(event) => setFilters({ ...filters, reference: event.target.value })} placeholder="Bank transaction or payment number" />
                    </div>
                    <div className="col-sm-6 col-lg-2"><button className="btn btn-outline-primary w-100" type="submit">Apply</button></div>
                </form>
                <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Guest payment matching status">
                    {statuses.map(({ value, label }) => <button key={value} type="button"
                        className={`btn btn-sm ${applied.status === value ? "btn-primary" : "btn-outline-primary"}`}
                        aria-pressed={applied.status === value} onClick={() => selectStatus(value)}>{label}</button>)}
                </div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                    <span className="small text-muted">Payment dates {applied.from} through {applied.to} (Sri Lanka). Up to 366 days per search.</span>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => {
                            setEditor(null); setCorrection(null); setActionError(""); setRefreshKey((current) => current + 1);
                        }}>Refresh</button>
                        <PermissionGuard permission="report.export">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={exporting || loading || register.total === 0 || Boolean(error)}
                                onClick={() => void exportCsv()}>{exporting ? "Exporting..." : "Export matching CSV"}</button>
                        </PermissionGuard>
                    </div>
                </div>
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}
                {success && <div className="alert alert-success" role="status">{success}</div>}
                {!error && loading && <p className="text-muted mb-0">Loading payment register...</p>}
                {!error && !loading && register.total === 0 && <p className="text-muted mb-0">No receipts or refunds in this view.</p>}
                {!error && !loading && register.total > 0 && <>
                    <p className="small mb-2"><strong>Filtered totals:</strong> {register.totalsByCurrency.map(({ currency, received, refunded, net }) =>
                        `${currency}: received ${money(received, currency)}, refunded ${money(refunded, currency)}, net ${money(net, currency)}`).join(" · ")}</p>
                    <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                        <thead><tr><th>Date</th><th>Payment / booking</th><th>Guest</th><th>Amount</th><th>Method / reference</th><th>Matching</th></tr></thead>
                        <tbody>{register.items.map((item) => <tr key={item._id}>
                            <td>{formatCalendarDate(item.paymentDate)}</td>
                            <td><strong>{item.paymentNo}</strong><div className="small text-muted">{item.booking?.bookingCode || "Booking removed"}</div></td>
                            <td>{item.booking?.customer?.fullName || "—"}</td>
                            <td>{item.status === "Refunded" ? "Refund " : "Received "}{money(item.amount, item.currency)}
                                {item.booking?.currency !== item.currency &&
                                    <div className="small text-danger">Booking currency {item.booking?.currency || "unknown"}. Correct the amount and currency before matching.</div>}</td>
                            <td>{item.paymentMethod}{item.referenceNumber && <div className="small text-muted">{item.referenceNumber}</div>}</td>
                            <td>
                                <span className={item.reconciledAt ? "text-success fw-semibold" : "text-warning-emphasis fw-semibold"}>{item.reconciledAt ? "Matched" : "To match"}</span>
                                {item.reconciledAt && <div className="small text-muted">{item.statementReference}<br />{item.reconciledByName} · {localTime(item.reconciledAt)}</div>}
                                {(item.reconciliationHistory || []).length > 0 && <details className="small mt-1">
                                    <summary>History ({item.reconciliationHistory.length})</summary>
                                    <ul className="list-unstyled mb-1 mt-1">{item.reconciliationHistory.map((entry) =>
                                        <li key={entry._id} className="mb-1">{entry.action === "reconciled" ? `Matched: ${entry.statementReference}` : `Reopened: ${entry.reason}`}<br />
                                            <span className="text-muted">{entry.recordedByName} · {localTime(entry.recordedAt)} · {money(entry.amount, entry.currency)}</span></li>)}</ul>
                                </details>}
                                <PermissionGuard permission="payment.reconcile">
                                    <button type="button" className="btn btn-sm btn-link p-0 mt-1 d-block"
                                        disabled={!item.reconciledAt && item.booking?.currency !== item.currency} onClick={() => openEditor(item)}>
                                        {item.reconciledAt ? "Reopen match" : "Mark matched"}
                                    </button>
                                </PermissionGuard>
                                {!item.reconciledAt && item.booking?.currency !== item.currency && item.booking?.currency &&
                                    <PermissionGuard all={item.status === "Refunded" ? ["payment.update", "payment.refund"] : ["payment.update"]}>
                                        <button type="button" className="btn btn-sm btn-link p-0 mt-1 d-block" onClick={() => openCorrection(item)}>Correct currency</button>
                                    </PermissionGuard>}
                            </td>
                        </tr>)}</tbody>
                    </table></div>
                    {editor && <PermissionGuard permission="payment.reconcile"><form className="border rounded p-3 mt-3" onSubmit={(event) => void saveReconciliation(event)}>
                        <h6 className="fw-semibold">{editor.reconciled ? "Match" : "Reopen"} {editor.paymentNo} · {editor.status} {money(editor.amount, editor.currency)}</h6>
                        {editor.reconciled ? <><label className="form-label" htmlFor="guest-register-statement-reference">Statement or cashbook reference</label>
                            <input id="guest-register-statement-reference" className="form-control mb-2" maxLength={100} required value={statementReference}
                                onChange={(event) => setStatementReference(event.target.value)} placeholder="Bank transaction ID or cashbook entry" />
                            <p className="small text-muted">Check the amount, currency, direction, and payment date before confirming.</p></>
                            : <><label className="form-label" htmlFor="guest-register-reopen-reason">Reason for reopening</label>
                                <textarea id="guest-register-reopen-reason" className="form-control mb-2" minLength={3} maxLength={300} required value={reason}
                                    onChange={(event) => setReason(event.target.value)} placeholder="Explain the mismatch or correction" /></>}
                        <div className="d-flex gap-2"><button className="btn btn-sm btn-primary" type="submit" disabled={saving}>
                            {saving ? "Saving..." : editor.reconciled ? "Confirm match" : "Reopen payment"}</button>
                            <button className="btn btn-sm btn-outline-secondary" type="button" disabled={saving} onClick={() => setEditor(null)}>Cancel</button></div>
                    </form></PermissionGuard>}
                    {correction && <PermissionGuard permission="payment.update"><form className="border rounded p-3 mt-3" onSubmit={(event) => void saveCorrection(event)}>
                        <h6 className="fw-semibold">Correct {correction.paymentNo}</h6>
                        <p className="small text-muted">Recorded as {money(correction.originalAmount, correction.fromCurrency)}. Enter its verified equivalent in {correction.bookingCurrency}. This changes the guest paid balance; compare the original bank transaction and agreed rate first.</p>
                        <label className="form-label" htmlFor="guest-correction-amount">Amount in {correction.bookingCurrency}</label>
                        <input id="guest-correction-amount" className="form-control mb-2" type="number" step="0.01" min="0.01" required value={correction.amount}
                            onChange={(event) => setCorrection({ ...correction, amount: event.target.value })} />
                        <label className="form-label" htmlFor="guest-correction-reason">Correction reason</label>
                        <textarea id="guest-correction-reason" className="form-control mb-2" minLength={3} maxLength={300} required value={correction.reason}
                            onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} placeholder="Original amount, currency, and agreed conversion rate" />
                        <div className="d-flex gap-2"><button className="btn btn-sm btn-primary" type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Save correction"}</button>
                            <button className="btn btn-sm btn-outline-secondary" type="button" disabled={saving} onClick={() => setCorrection(null)}>Cancel</button></div>
                    </form></PermissionGuard>}
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                        <span className="text-muted small">Showing {(register.page - 1) * register.limit + 1}–{Math.min(register.page * register.limit, register.total)} of {register.total} payments.</span>
                        {register.pages > 1 && <div className="d-flex align-items-center gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => { setEditor(null); setCorrection(null); setPage((current) => current - 1); }}>Previous</button>
                            <span className="small">Page {register.page} of {register.pages}</span>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= register.pages} onClick={() => { setEditor(null); setCorrection(null); setPage((current) => current + 1); }}>Next</button>
                        </div>}
                    </div>
                </>}
            </div>
        </div>
    );
};

export default GuestPaymentRegister;
