import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaEdit, FaHistory, FaMoneyBillWave, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";
import SupplierPaymentRegister from "../components/SupplierPaymentRegister";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { notifySupplierPayablesChanged } from "../utils/supplierPayableEvents";

const categories = ["Hotel", "Transport", "Guide", "Activities", "Entrance Fees", "Payment Fees", "Other"];
const currencies = ["USD", "LKR", "EUR", "GBP"];
const scheduleFilters = [
    { value: "due7", label: "Due soon" },
    { value: "overdue", label: "Overdue" },
    { value: "later", label: "Later" },
    { value: "unscheduled", label: "No due date" },
    { value: "all", label: "All unpaid" },
];
const blankCost = (currency = "USD") => ({
    category: "Hotel", description: "", amount: "", currency, conversionRate: "1",
    paidAmount: "0", paymentDueDate: "", adjustmentNote: "",
});
const blankPayment = () => ({ amount: "", paymentDate: todayCalendarDate(), method: "Bank transfer", reference: "", note: "" });
const formatMoney = (amount, currency) => amount === null || amount === undefined
    ? "—"
    : `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatRecordedAt = (value) => new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short",
});

const CostProfit = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const type = searchParams.get("type") === "booking" ? "booking" : "quotation";
    const recordId = searchParams.get("id") || "";
    const [records, setRecords] = useState([]);
    const [searchInput, setSearchInput] = useState("");
    const [loadedOverview, setLoadedOverview] = useState({ key: "", data: null });
    const [form, setForm] = useState(blankCost());
    const [editingId, setEditingId] = useState("");
    const [paymentCostId, setPaymentCostId] = useState("");
    const paymentPanelRef = useRef(null);
    const [paymentForm, setPaymentForm] = useState(blankPayment);
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [listBusy, setListBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [payables, setPayables] = useState({ items: [], total: 0, limit: 25, page: 1, pages: 0, totalsByCurrency: [] });
    const [payablesFilter, setPayablesFilter] = useState("due7");
    const [payablesPage, setPayablesPage] = useState(1);
    const [payablesLoading, setPayablesLoading] = useState(false);
    const [payablesError, setPayablesError] = useState("");
    const overviewKey = `${type}/${recordId}`;
    const overview = loadedOverview.key === overviewKey ? loadedOverview.data : null;
    const busy = Boolean(recordId && !overview && !error);

    const loadRecords = useCallback(async (keyword = "") => {
        try {
            setListBusy(true);
            const result = await api.get(type === "quotation" ? "/quotations" : "/bookings", {
                params: { page: 1, limit: 100, ...(keyword ? { keyword } : {}) },
            });
            setRecords(result.data[type === "quotation" ? "quotations" : "bookings"] || []);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Could not load records.");
        } finally {
            setListBusy(false);
        }
    }, [type]);

    useEffect(() => {
        let cancelled = false;
        api.get(type === "quotation" ? "/quotations" : "/bookings", { params: { page: 1, limit: 100 } })
            .then(({ data }) => {
                if (!cancelled) setRecords(data[type === "quotation" ? "quotations" : "bookings"] || []);
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError.response?.data?.message || "Could not load records.");
            });
        return () => { cancelled = true; };
    }, [type]);

    useEffect(() => {
        if (!recordId) {
            return;
        }
        let cancelled = false;
        api.get(`/finance/costs/${type}/${recordId}`)
            .then(({ data }) => {
                if (!cancelled) {
                    setLoadedOverview({ key: `${type}/${recordId}`, data });
                    setForm(blankCost(data.record.currency));
                    setEditingId("");
                    setError("");
                }
            })
            .catch((requestError) => {
                if (!cancelled) {
                    setError(requestError.response?.data?.message || "Could not load cost details.");
                }
            });
        return () => { cancelled = true; };
    }, [type, recordId, reloadKey]);

    useEffect(() => {
        if (type !== "booking") return;
        let cancelled = false;
        setPayablesLoading(true);
        setPayablesError("");
        api.get("/finance/costs/schedule", { params: { filter: payablesFilter, page: payablesPage } })
            .then(({ data }) => {
                if (cancelled) return;
                if (payablesPage > Math.max(1, data.pages)) {
                    setPayablesPage(Math.max(1, data.pages));
                    return;
                }
                setPayables(data);
                setPayablesError("");
            })
            .catch((requestError) => {
                if (!cancelled) setPayablesError(requestError.response?.data?.message || "Could not load supplier payments.");
            })
            .finally(() => { if (!cancelled) setPayablesLoading(false); });
        return () => { cancelled = true; };
    }, [type, reloadKey, payablesFilter, payablesPage]);

    useEffect(() => {
        if (paymentCostId) paymentPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [paymentCostId]);

    const selectRecord = (nextType, nextId = "") => {
        setError("");
        setSuccess("");
        setEditingId("");
        setPaymentCostId("");
        if (nextType !== type) setRecords([]);
        setSearchInput("");
        setSearchParams(nextId ? { type: nextType, id: nextId } : { type: nextType });
    };

    const saveCost = async (event) => {
        event.preventDefault();
        if (!overview) return;
        try {
            setSaving(true);
            setError("");
            setSuccess("");
            if (editingId) {
                await api.put(`/finance/costs/${editingId}`, form);
            } else {
                await api.post(`/finance/costs/${type}/${recordId}`, form);
            }
            setSuccess(editingId ? "Cost updated." : "Cost added.");
            setEditingId("");
            setForm(blankCost(overview.record.currency));
            setReloadKey((value) => value + 1);
            if (type === "booking") notifySupplierPayablesChanged();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Could not save cost.");
        } finally {
            setSaving(false);
        }
    };

    const deleteCost = async (item) => {
        if (!window.confirm(`Delete the cost entry “${item.description}”?`)) return;
        try {
            setError("");
            await api.delete(`/finance/costs/${item._id}`);
            setSuccess("Cost deleted.");
            if (editingId === item._id) {
                setEditingId("");
                setForm(blankCost(overview.record.currency));
            }
            setReloadKey((value) => value + 1);
            if (type === "booking") notifySupplierPayablesChanged();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Could not delete cost.");
        }
    };

    const recordPayment = async (event) => {
        event.preventDefault();
        if (!paymentCostId) return;
        try {
            setPaymentSaving(true);
            setError("");
            setSuccess("");
            await api.post(`/finance/costs/${paymentCostId}/payments`, paymentForm);
            setSuccess("Supplier payment recorded.");
            setPaymentForm(blankPayment());
            setReloadKey((value) => value + 1);
            notifySupplierPayablesChanged();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Could not record supplier payment.");
        } finally {
            setPaymentSaving(false);
        }
    };

    const saleCurrency = overview?.record?.currency || "USD";
    const foreignCurrency = form.currency !== saleCurrency;
    const summary = overview?.summary;
    const today = todayCalendarDate();
    const paymentCost = type === "booking" ? overview?.items.find((item) => item._id === paymentCostId) : null;
    const editingCost = overview?.items.find((item) => item._id === editingId);
    const correctingPaidTotal = type === "booking" && editingCost && Number(form.paidAmount) !== (editingCost.paidAmount ?? 0);
    const openingPaidCents = paymentCost ? Math.round((paymentCost.paidAmount ?? 0) * 100) -
        (paymentCost.paymentHistory || []).reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0) : 0;
    const supplierBalances = type === "booking" && overview
        ? Object.entries(overview.items.reduce((totals, item) => {
            const remainingCents = Math.round((item.amount - (item.paidAmount ?? 0)) * 100);
            if (remainingCents > 0) totals[item.currency] = (totals[item.currency] || 0) + remainingCents;
            return totals;
        }, {})).sort(([a], [b]) => a.localeCompare(b))
        : [];

    return (
        <div>
            <div className="mb-4">
                <h2 className="fw-bold mb-1">Cost &amp; Profit</h2>
                <p className="text-muted mb-0">Private supplier costs for quotations and bookings. Client PDFs show selling prices only.</p>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}

            <div className="card border-0 shadow-sm mb-4">
                <div className="card-body">
                    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Record type">
                        <button type="button" className={`btn ${type === "quotation" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => selectRecord("quotation")}>Quotation estimates</button>
                        <button type="button" className={`btn ${type === "booking" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => selectRecord("booking")}>Booking actual costs</button>
                    </div>
                    <form className="row g-2 align-items-end" onSubmit={(event) => { event.preventDefault(); void loadRecords(searchInput.trim()); }}>
                        <div className="col-md-4">
                            <label className="form-label" htmlFor="cost-search">Find {type}</label>
                            <input id="cost-search" className="form-control" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Customer name or reference" />
                        </div>
                        <div className="col-md-auto">
                            <button className="btn btn-outline-secondary" disabled={listBusy} type="submit"><FaSearch className="me-2" />Search</button>
                        </div>
                        <div className="col-md-5">
                            <label className="form-label" htmlFor="cost-record">Select a {type}</label>
                            <select id="cost-record" className="form-select" value={recordId} onChange={(event) => selectRecord(type, event.target.value)}>
                                <option value="">Choose a {type}</option>
                                {recordId && !records.some((item) => item._id === recordId) && overview && (
                                    <option value={recordId}>{overview.record.reference} · {overview.record.customerName}</option>
                                )}
                                {records.map((item) => (
                                    <option key={item._id} value={item._id}>
                                        {type === "quotation" ? item.quotationNo : item.bookingCode} · {type === "quotation" ? item.clientName : item.customer?.fullName}
                                    </option>
                                ))}
                            </select>
                            <small className="text-muted">Shows the latest 100; search to find older records.</small>
                        </div>
                    </form>
                </div>
            </div>

            {type === "booking" && (
                <div className="card border-0 shadow-sm mb-4">
                    <div className="card-body">
                        <h4 className="fw-bold mb-1">Supplier payment schedule</h4>
                        <p className="text-muted small mb-3">Review unpaid booking costs by Sri Lanka due date. Due soon includes overdue payments, today, and the next six days; amounts stay in each supplier's currency.</p>
                        <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Supplier payment timing">
                            {scheduleFilters.map(({ value, label }) => <button key={value} type="button" className={`btn btn-sm ${payablesFilter === value ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={payablesFilter === value} onClick={() => { setPayablesFilter(value); setPayablesPage(1); }}>{label}</button>)}
                        </div>
                        {payablesFilter === "unscheduled" && <p className="small text-warning-emphasis">These costs have no supplier due date and will not appear in the header due alert. Open a booking to set a date.</p>}
                        {payablesError && <div className="alert alert-danger" role="alert">{payablesError}</div>}
                        {!payablesError && payablesLoading && <p className="text-muted mb-0">Loading supplier payments...</p>}
                        {!payablesError && !payablesLoading && payables.items.length === 0 &&
                            <p className="text-muted mb-0">No unpaid supplier costs in this view.</p>}
                        {!payablesError && !payablesLoading && payables.items.length > 0 &&
                            <><p className="small mb-2"><strong>Remaining in this view:</strong> {payables.totalsByCurrency.map(({ currency, remaining }) => formatMoney(remaining, currency)).join(" · ")}</p>
                            <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                                    <thead><tr><th>Booking</th><th>Supplier / cost</th><th>Remaining</th><th>Due</th></tr></thead>
                                    <tbody>{payables.items.map((item) => <tr key={item._id}>
                                        <td><button type="button" className="btn btn-link p-0" onClick={() => selectRecord("booking", item.recordId)}>{item.bookingCode}</button>
                                            <div className="small text-muted">{item.customerName}{item.bookingStatus === "Cancelled" ? " · Cancelled booking: verify supplier obligation" : ""}</div></td>
                                        <td>{item.description}</td>
                                        <td>{formatMoney(item.remaining, item.currency)}</td>
                                        <td><span className={item.paymentDueDate && toCalendarDateInput(item.paymentDueDate) < today ? "text-danger fw-semibold" : ""}>
                                            {item.paymentDueDate ? formatCalendarDate(item.paymentDueDate) : "Not set"}{item.paymentDueDate && toCalendarDateInput(item.paymentDueDate) < today ? " · Overdue" : ""}
                                        </span></td>
                                    </tr>)}</tbody>
                                </table></div>
                            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                                <span className="text-muted small">Showing {(payables.page - 1) * payables.limit + 1}–{Math.min(payables.page * payables.limit, payables.total)} of {payables.total} unpaid costs.</span>
                                {payables.pages > 1 && <div className="d-flex align-items-center gap-2">
                                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={payablesPage <= 1} onClick={() => setPayablesPage((page) => page - 1)}>Previous</button>
                                    <span className="small">Page {payables.page} of {payables.pages}</span>
                                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={payablesPage >= payables.pages} onClick={() => setPayablesPage((page) => page + 1)}>Next</button>
                                </div>}
                            </div></>}
                    </div>
                </div>
            )}

            {type === "booking" && <SupplierPaymentRegister onSelectBooking={(id) => selectRecord("booking", id)}
                onChanged={() => setReloadKey((value) => value + 1)} reloadKey={reloadKey} />}

            {busy && <p className="text-muted">Loading cost details...</p>}
            {!busy && overview && (
                <>
                    <div className="card border-0 shadow-sm mb-4">
                        <div className="card-body">
                            <h4 className="fw-bold mb-1">{overview.record.reference} · {overview.record.customerName}</h4>
                            <p className="text-muted mb-3">{overview.record.title || ""}</p>
                            <div className="row g-3">
                                <div className="col-md-3"><div className="stat-card h-100"><small className="text-muted">Client selling price</small><h5 className="mt-2 mb-0">{formatMoney(summary.saleAmount, saleCurrency)}</h5></div></div>
                                <div className="col-md-3"><div className="stat-card h-100"><small className="text-muted">{type === "quotation" ? "Estimated costs" : "Recorded actual costs"}</small><h5 className="mt-2 mb-0">{formatMoney(summary.costTotal, saleCurrency)}</h5></div></div>
                                <div className="col-md-3"><div className="stat-card h-100"><small className="text-muted">{type === "quotation" ? "Estimated profit" : "Booked profit"}</small><h5 className="mt-2 mb-0">{formatMoney(summary.profit, saleCurrency)}</h5></div></div>
                                <div className="col-md-3"><div className="stat-card h-100"><small className="text-muted">Margin on selling price</small><h5 className="mt-2 mb-0">{summary.marginPercent === null ? "—" : `${summary.marginPercent.toFixed(2)}%`}</h5></div></div>
                            </div>
                            {type === "booking" && <p className="mt-3 mb-0">
                                <strong>Unpaid supplier balances:</strong> {supplierBalances.length
                                    ? supplierBalances.map(([currency, cents]) => formatMoney(cents / 100, currency)).join(" · ")
                                    : "None recorded"}. These are not converted into the booking currency.
                            </p>}
                            {summary.entriesCount === 0 && <p className="text-muted mt-3 mb-0">Add supplier costs to calculate profit. Empty costs are not treated as zero.</p>}
                            {summary.currencyMismatch > 0 && <div className="alert alert-warning mt-3 mb-0">The selling currency changed after {summary.currencyMismatch} cost entry or entries were saved. Edit those entries with a new exchange rate before using the profit figures.</div>}
                            {type === "booking" && <small className="text-muted d-block mt-3">Booked profit uses the full booking price, not cash collected. Update actual costs as supplier bills arrive.</small>}
                            {overview.linkedEstimate && (
                                <div className="alert alert-info mt-3 mb-0">
                                    Original <Link to={`/cost-profit?type=quotation&id=${overview.linkedEstimate.quotationId}`}>quotation {overview.linkedEstimate.reference}</Link> estimated supplier cost: {formatMoney(overview.linkedEstimate.estimatedCost, overview.linkedEstimate.currency)}.
                                    {overview.linkedEstimate.comparable && <> Actual cost difference: {formatMoney(overview.linkedEstimate.costDifference, saleCurrency)} (positive means higher cost).</>}
                                </div>
                            )}
                        </div>
                    </div>

                    <PermissionGuard permission="cost.manage">
                        <div className="card border-0 shadow-sm mb-4">
                            <div className="card-body">
                                <h5 className="fw-bold mb-3">{editingId ? "Edit supplier cost" : `Add ${type === "quotation" ? "estimated" : "actual"} supplier cost`}</h5>
                                <form className="row g-3" onSubmit={saveCost}>
                                    <div className="col-md-3">
                                        <label className="form-label" htmlFor="cost-category">Category</label>
                                        <select id="cost-category" className="form-select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                                            {categories.map((category) => <option key={category}>{category}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-5">
                                        <label className="form-label" htmlFor="cost-description">Supplier / description</label>
                                        <input id="cost-description" className="form-control" required maxLength={200} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="e.g. Hotel room, 2 nights" />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label" htmlFor="cost-amount">Supplier amount</label>
                                        <input id="cost-amount" className="form-control" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label" htmlFor="cost-currency">Currency</label>
                                        <select id="cost-currency" className="form-select" value={form.currency}
                                            disabled={Boolean(editingCost && ((editingCost.paidAmount ?? 0) > 0 || editingCost.paymentHistory?.length))}
                                            onChange={(event) => {
                                                const currency = event.target.value;
                                                setForm({ ...form, currency, conversionRate: currency === saleCurrency ? "1" : "" });
                                            }}>
                                            {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                                        </select>
                                        {editingCost && ((editingCost.paidAmount ?? 0) > 0 || editingCost.paymentHistory?.length) &&
                                            <small className="text-muted">Costs with supplier payments keep their original currency.</small>}
                                    </div>
                                    {foreignCurrency && <div className="col-md-5">
                                        <label className="form-label" htmlFor="cost-rate">1 {form.currency} equals how many {saleCurrency}?</label>
                                        <input id="cost-rate" className="form-control" type="number" min="0.000001" max="1000000" step="0.000001" required value={form.conversionRate} onChange={(event) => setForm({ ...form, conversionRate: event.target.value })} placeholder="Enter your agreed conversion rate" />
                                        <small className="text-muted">Saved with this entry; existing costs are not recalculated automatically.</small>
                                    </div>}
                                    {type === "booking" && <>
                                        {editingId && <div className="col-md-3">
                                            <label className="form-label" htmlFor="cost-paid">Correct paid total ({form.currency})</label>
                                            <input id="cost-paid" className="form-control" type="number" min="0" max={form.amount || undefined} step="0.01" required
                                                value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: event.target.value })} />
                                        </div>}
                                        <div className="col-md-3">
                                            <label className="form-label" htmlFor="cost-due">Supplier payment due</label>
                                            <input id="cost-due" className="form-control" type="date" value={form.paymentDueDate}
                                                onChange={(event) => setForm({ ...form, paymentDueDate: event.target.value })} />
                                        </div>
                                        {correctingPaidTotal && <div className="col-md-6">
                                            <label className="form-label" htmlFor="cost-adjustment-note">Reason for correction</label>
                                            <input id="cost-adjustment-note" className="form-control" maxLength={300} value={form.adjustmentNote}
                                                onChange={(event) => setForm({ ...form, adjustmentNote: event.target.value })} placeholder="e.g. Corrected bank reconciliation" />
                                        </div>}
                                        <div className="col-12"><small className="text-muted">After adding the cost, use Payments below to record each deposit. Correct paid total only to fix an earlier entry; the change remains in its history.</small></div>
                                    </>}
                                    <div className="col-12 d-flex gap-2">
                                        <button type="submit" className="btn btn-primary" disabled={saving}><FaPlus className="me-2" />{saving ? "Saving..." : editingId ? "Save changes" : "Add cost"}</button>
                                        {editingId && <button type="button" className="btn btn-outline-secondary" onClick={() => { setEditingId(""); setForm(blankCost(saleCurrency)); }}>Cancel edit</button>}
                                    </div>
                                </form>
                            </div>
                        </div>
                    </PermissionGuard>

                    <div className="card border-0 shadow-sm">
                        <div className="card-body">
                            <h5 className="fw-bold mb-3">Supplier cost entries</h5>
                            {overview.items.length === 0 ? <p className="text-muted mb-0">No costs recorded yet.</p> : (
                                <div className="table-responsive"><table className="table align-middle">
                                    <thead><tr><th>Category</th><th>Description</th><th>Supplier amount</th>{type === "booking" && <><th>Paid / remaining</th><th>Payment due</th></>}<th>Rate to {saleCurrency}</th><th>In {saleCurrency}</th><th className="text-end">Actions</th></tr></thead>
                                    <tbody>{overview.items.map((item) => <tr key={item._id}>
                                        <td>{item.category}</td><td>{item.description}</td>
                                        <td>{formatMoney(item.amount, item.currency)}</td>
                                        {type === "booking" && <>
                                            <td>{formatMoney(item.paidAmount ?? 0, item.currency)} paid
                                                <div className="small text-muted">{formatMoney(Math.max(0, Math.round((item.amount - (item.paidAmount ?? 0)) * 100) / 100), item.currency)} remaining</div></td>
                                            <td>{item.paymentDueDate ? formatCalendarDate(item.paymentDueDate) : "Not set"}
                                                {(item.paidAmount ?? 0) < item.amount && item.paymentDueDate && toCalendarDateInput(item.paymentDueDate) < today &&
                                                    <span className="badge text-bg-danger ms-1">Overdue</span>}</td>
                                        </>}
                                        <td>{item.targetCurrency === saleCurrency ? item.conversionRate : `Old target: ${item.targetCurrency}`}</td>
                                        <td>{item.targetCurrency === saleCurrency ? formatMoney(Math.round(item.amount * item.conversionRate * 100) / 100, saleCurrency) : "Revalue required"}</td>
                                        <td className="text-end"><div className="d-flex justify-content-end gap-2">
                                            {type === "booking" && <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Payments for ${item.description}`} aria-expanded={paymentCostId === item._id} aria-controls="supplier-payment-history" onClick={() => { setPaymentCostId(paymentCostId === item._id ? "" : item._id); setPaymentForm(blankPayment()); }}><FaHistory className="me-1" />Payments</button>}
                                            <PermissionGuard permission="cost.manage"><div className="d-flex justify-content-end gap-2">
                                            <button type="button" className="btn btn-sm btn-outline-primary" title="Edit cost" aria-label={`Edit ${item.description}`} onClick={() => { setEditingId(item._id); setForm({ category: item.category, description: item.description, amount: String(item.amount), currency: item.currency, conversionRate: String(item.conversionRate), paidAmount: String(item.paidAmount ?? 0), paymentDueDate: toCalendarDateInput(item.paymentDueDate), adjustmentNote: "" }); document.getElementById("cost-description")?.focus(); }}><FaEdit /></button>
                                            <button type="button" className="btn btn-sm btn-outline-danger" title={(item.paidAmount ?? 0) > 0 || item.paymentHistory?.length ? "Costs with recorded supplier payments cannot be deleted" : "Delete cost"} aria-label={`Delete ${item.description}`} disabled={(item.paidAmount ?? 0) > 0 || Boolean(item.paymentHistory?.length)} onClick={() => void deleteCost(item)}><FaTrash /></button>
                                            </div></PermissionGuard>
                                        </div></td>
                                    </tr>)}</tbody>
                                </table></div>
                            )}
                            {paymentCost && <div id="supplier-payment-history" ref={paymentPanelRef} className="border rounded p-3 mt-3" role="region" aria-label={`Payments for ${paymentCost.description}`}>
                                <div className="d-flex justify-content-between align-items-start gap-2">
                                    <div>
                                        <h6 className="fw-bold mb-1">Payments · {paymentCost.description}</h6>
                                        <p className="text-muted small mb-3">{formatMoney(paymentCost.paidAmount ?? 0, paymentCost.currency)} paid · {formatMoney(Math.max(0, Math.round((paymentCost.amount - (paymentCost.paidAmount ?? 0)) * 100) / 100), paymentCost.currency)} remaining</p>
                                    </div>
                                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPaymentCostId("")}>Close</button>
                                </div>
                                <PermissionGuard permission="cost.manage">
                                    {(paymentCost.paidAmount ?? 0) < paymentCost.amount && <form className="row g-3 mb-4" onSubmit={recordPayment}>
                                        <div className="col-md-2"><label className="form-label" htmlFor="supplier-payment-amount">Amount ({paymentCost.currency})</label>
                                            <input id="supplier-payment-amount" className="form-control" type="number" min="0.01" max={Math.round((paymentCost.amount - (paymentCost.paidAmount ?? 0)) * 100) / 100} step="0.01" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></div>
                                        <div className="col-md-2"><label className="form-label" htmlFor="supplier-payment-date">Date paid</label>
                                            <input id="supplier-payment-date" className="form-control" type="date" max={today} required value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} /></div>
                                        <div className="col-md-2"><label className="form-label" htmlFor="supplier-payment-method">Method</label>
                                            <select id="supplier-payment-method" className="form-select" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                                                {["Bank transfer", "Cash", "Card", "Other"].map((method) => <option key={method}>{method}</option>)}
                                            </select></div>
                                        <div className="col-md-3"><label className="form-label" htmlFor="supplier-payment-reference">Reference (optional)</label>
                                            <input id="supplier-payment-reference" className="form-control" maxLength={100} value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="Bank transfer reference" /></div>
                                        <div className="col-md-3"><label className="form-label" htmlFor="supplier-payment-note">Note (optional)</label>
                                            <input id="supplier-payment-note" className="form-control" maxLength={300} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></div>
                                        <div className="col-12"><button type="submit" className="btn btn-primary btn-sm" disabled={paymentSaving}><FaMoneyBillWave className="me-2" />{paymentSaving ? "Recording..." : "Record payment"}</button></div>
                                    </form>}
                                </PermissionGuard>
                                <h6 className="fw-semibold">Payment history</h6>
                                {openingPaidCents > 0 && <p className="small text-muted mb-2">Previously recorded paid total: {formatMoney(openingPaidCents / 100, paymentCost.currency)}. Individual deposits before this history were not recorded.</p>}
                                {(paymentCost.paymentHistory || []).length === 0 ? <p className="text-muted small mb-0">No individual payment changes recorded yet.</p> :
                                    <div className="list-group list-group-flush">{paymentCost.paymentHistory.slice().reverse().map((entry) =>
                                        <div className="list-group-item px-0" key={entry._id}>
                                            <div className="d-flex justify-content-between gap-2"><strong className="small">{entry.kind === "payment" ? "Payment" : "Paid total correction"} · {formatMoney(entry.amount, paymentCost.currency)}</strong><span className="small text-muted">{formatRecordedAt(entry.recordedAt)}</span></div>
                                            <div className="small text-muted">{entry.kind === "payment" ? `${formatCalendarDate(entry.paymentDate)} · ${entry.method}` : "Manual correction"} · {entry.recordedByName} · Total after: {formatMoney(entry.paidAmountAfter, paymentCost.currency)}</div>
                                            {entry.reference && <div className="small">Reference: {entry.reference}</div>}
                                            {entry.note && <div className="small">{entry.note}</div>}
                                            {entry.kind === "payment" && <div className="small">Bank match: {entry.reconciledAt
                                                ? `Matched to ${entry.statementReference} by ${entry.reconciledByName} at ${formatRecordedAt(entry.reconciledAt)}` : "To match"}</div>}
                                            {(entry.reconciliationHistory || []).length > 0 && <details className="small"><summary>Match history ({entry.reconciliationHistory.length})</summary>
                                                <ul className="list-unstyled mt-1 mb-0">{entry.reconciliationHistory.map((change) => <li key={change._id}>
                                                    {change.action === "reconciled" ? `Matched to ${change.statementReference}` : `Reopened: ${change.reason}`} · {change.recordedByName} · {formatRecordedAt(change.recordedAt)}
                                                </li>)}</ul></details>}
                                        </div>)}</div>}
                            </div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CostProfit;
