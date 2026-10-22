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

const SupplierPaymentRegister = ({ onSelectBooking, onChanged, reloadKey }) => {
    const [filters, setFilters] = useState(initialFilters);
    const [applied, setApplied] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [register, setRegister] = useState(emptyRegister);
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [exportError, setExportError] = useState("");
    const [editor, setEditor] = useState(null);
    const [statementReference, setStatementReference] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState("");
    const [success, setSuccess] = useState("");

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
    }, [applied, page, reloadKey, refreshKey]);

    const exportCsv = async () => {
        try {
            setExporting(true);
            setExportError("");
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
            setExportError(message);
        } finally {
            setExporting(false);
        }
    };

    const selectStatus = (status) => {
        setFilters((current) => ({ ...current, status }));
        setApplied((current) => ({ ...current, status }));
        setPage(1);
        setEditor(null);
        setSuccess("");
    };

    const openEditor = (item) => {
        setEditor({ costId: item.costId, paymentId: item.paymentId, reconciled: !item.reconciledAt,
            bookingCode: item.bookingCode, amount: item.amount, currency: item.currency });
        setStatementReference("");
        setReason("");
        setActionError("");
        setSuccess("");
    };

    const saveReconciliation = async (event) => {
        event.preventDefault();
        if (!editor) return;
        try {
            setSaving(true);
            setActionError("");
            await api.patch(`/finance/costs/${editor.costId}/payments/${editor.paymentId}/reconciliation`,
                editor.reconciled ? { reconciled: true, statementReference } : { reconciled: false, reason });
            setSuccess(editor.reconciled ? "Payment matched to the bank statement." : "Payment reopened for matching.");
            setEditor(null);
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

    return (
        <div className="card border-0 shadow-sm mb-4">
            <div className="card-body">
                <h4 className="fw-bold mb-1">Supplier payment register</h4>
                <p className="text-muted small mb-3">Match recorded booking payments to a bank statement or cashbook by date and reference. Opening balances and manual paid total corrections are excluded.</p>
                <form className="row g-2 align-items-end mb-3" onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setApplied({ ...filters, reference: filters.reference.trim() });
                    setEditor(null);
                    setSuccess("");
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
                <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Reconciliation status">
                    {statuses.map(({ value, label }) => <button key={value} type="button"
                        className={`btn btn-sm ${applied.status === value ? "btn-primary" : "btn-outline-primary"}`}
                        aria-pressed={applied.status === value} onClick={() => selectStatus(value)}>{label}</button>)}
                </div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                    <span className="small text-muted">Showing {applied.status === "all" ? "all" : applied.status} payments dated {applied.from} through {applied.to} (Sri Lanka).</span>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => {
                            setEditor(null); setActionError(""); setSuccess(""); setRefreshKey((current) => current + 1);
                        }}>Refresh</button>
                        <PermissionGuard permission="report.export">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={exporting || loading || register.total === 0 || Boolean(error)}
                                onClick={() => void exportCsv()}>{exporting ? "Exporting..." : "Export matching CSV"}</button>
                        </PermissionGuard>
                    </div>
                </div>
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                {exportError && <div className="alert alert-danger" role="alert">{exportError}</div>}
                {actionError && <div className="alert alert-danger" role="alert">{actionError}</div>}
                {success && <div className="alert alert-success" role="status">{success}</div>}
                {!error && loading && <p className="text-muted mb-0">Loading payment register...</p>}
                {!error && !loading && register.total === 0 && <p className="text-muted mb-0">No recorded payments in this view.</p>}
                {!error && !loading && register.total > 0 && <>
                    <p className="small mb-2"><strong>Total recorded payments:</strong> {register.totalsByCurrency.map(({ currency, amount }) => money(amount, currency)).join(" · ")}</p>
                    <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                        <thead><tr><th>Date</th><th>Booking</th><th>Supplier / cost</th><th>Amount</th><th>Method / reference</th><th>Recorded by</th><th>Reconciliation</th></tr></thead>
                        <tbody>{register.items.map((item) => <tr key={item.paymentId}>
                            <td>{formatCalendarDate(item.paymentDate)}</td>
                            <td><button type="button" className="btn btn-link p-0" onClick={() => onSelectBooking(item.recordId)}>{item.bookingCode}</button>
                                <div className="small text-muted">{item.customerName}</div></td>
                            <td>{item.description}{item.note && <div className="small text-muted">{item.note}</div>}</td>
                            <td>{money(item.amount, item.currency)}</td>
                            <td>{item.method}{item.reference && <div className="small text-muted">{item.reference}</div>}</td>
                            <td>{item.recordedByName}</td>
                            <td>
                                <span className={item.reconciledAt ? "text-success fw-semibold" : "text-warning-emphasis fw-semibold"}>{item.reconciledAt ? "Matched" : "To match"}</span>
                                {item.reconciledAt && <div className="small text-muted">{item.statementReference}<br />{item.reconciledByName} · {localTime(item.reconciledAt)}</div>}
                                {(item.reconciliationHistory || []).length > 0 && <details className="small mt-1">
                                    <summary>History ({item.reconciliationHistory.length})</summary>
                                    <ul className="list-unstyled mb-1 mt-1">{item.reconciliationHistory.map((entry) =>
                                        <li key={entry._id} className="mb-1">{entry.action === "reconciled" ? `Matched: ${entry.statementReference}` : `Reopened: ${entry.reason}`}<br />
                                            <span className="text-muted">{entry.recordedByName} · {localTime(entry.recordedAt)}</span></li>)}</ul>
                                </details>}
                                <PermissionGuard permission="cost.manage">
                                    <button type="button" className="btn btn-sm btn-link p-0 mt-1 d-block" onClick={() => openEditor(item)}>
                                        {item.reconciledAt ? "Reopen match" : "Mark matched"}
                                    </button>
                                </PermissionGuard>
                            </td>
                        </tr>)}</tbody>
                    </table></div>
                    {editor && <PermissionGuard permission="cost.manage"><form className="border rounded p-3 mt-3" onSubmit={(event) => void saveReconciliation(event)}>
                        <h6 className="fw-semibold">{editor.reconciled ? "Match" : "Reopen"} {money(editor.amount, editor.currency)} · {editor.bookingCode}</h6>
                        {editor.reconciled ? <><label className="form-label" htmlFor="register-statement-reference">Statement or cashbook reference</label>
                            <input id="register-statement-reference" className="form-control mb-2" maxLength={100} required value={statementReference}
                                onChange={(event) => setStatementReference(event.target.value)} placeholder="Bank transaction ID or cashbook entry" />
                            <p className="small text-muted">Check the amount and currency against your record before marking it matched.</p></>
                            : <><label className="form-label" htmlFor="register-reopen-reason">Reason for reopening</label>
                                <textarea id="register-reopen-reason" className="form-control mb-2" minLength={3} maxLength={300} required value={reason}
                                    onChange={(event) => setReason(event.target.value)} placeholder="Explain the mismatch or correction" /></>}
                        <div className="d-flex gap-2"><button className="btn btn-sm btn-primary" type="submit" disabled={saving}>
                            {saving ? "Saving..." : editor.reconciled ? "Confirm match" : "Reopen payment"}</button>
                            <button className="btn btn-sm btn-outline-secondary" type="button" disabled={saving} onClick={() => setEditor(null)}>Cancel</button></div>
                    </form></PermissionGuard>}
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
