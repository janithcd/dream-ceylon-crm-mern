import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";

const categories = ["Hotel", "Transport", "Guide", "Activities", "Entrance Fees", "Payment Fees", "Other"];
const currencies = ["USD", "LKR", "EUR", "GBP"];
const blankCost = (currency = "USD") => ({
    category: "Hotel", description: "", amount: "", currency, conversionRate: "1",
});
const formatMoney = (amount, currency) => amount === null || amount === undefined
    ? "—"
    : `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CostProfit = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const type = searchParams.get("type") === "booking" ? "booking" : "quotation";
    const recordId = searchParams.get("id") || "";
    const [records, setRecords] = useState([]);
    const [searchInput, setSearchInput] = useState("");
    const [loadedOverview, setLoadedOverview] = useState({ key: "", data: null });
    const [form, setForm] = useState(blankCost());
    const [editingId, setEditingId] = useState("");
    const [listBusy, setListBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
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

    const selectRecord = (nextType, nextId = "") => {
        setError("");
        setSuccess("");
        setEditingId("");
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
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Could not delete cost.");
        }
    };

    const saleCurrency = overview?.record?.currency || "USD";
    const foreignCurrency = form.currency !== saleCurrency;
    const summary = overview?.summary;

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
                                        <select id="cost-currency" className="form-select" value={form.currency} onChange={(event) => {
                                            const currency = event.target.value;
                                            setForm({ ...form, currency, conversionRate: currency === saleCurrency ? "1" : "" });
                                        }}>
                                            {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                                        </select>
                                    </div>
                                    {foreignCurrency && <div className="col-md-5">
                                        <label className="form-label" htmlFor="cost-rate">1 {form.currency} equals how many {saleCurrency}?</label>
                                        <input id="cost-rate" className="form-control" type="number" min="0.000001" max="1000000" step="0.000001" required value={form.conversionRate} onChange={(event) => setForm({ ...form, conversionRate: event.target.value })} placeholder="Enter your agreed conversion rate" />
                                        <small className="text-muted">Saved with this entry; existing costs are not recalculated automatically.</small>
                                    </div>}
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
                                    <thead><tr><th>Category</th><th>Description</th><th>Supplier amount</th><th>Rate to {saleCurrency}</th><th>In {saleCurrency}</th><th className="text-end">Actions</th></tr></thead>
                                    <tbody>{overview.items.map((item) => <tr key={item._id}>
                                        <td>{item.category}</td><td>{item.description}</td>
                                        <td>{formatMoney(item.amount, item.currency)}</td>
                                        <td>{item.targetCurrency === saleCurrency ? item.conversionRate : `Old target: ${item.targetCurrency}`}</td>
                                        <td>{item.targetCurrency === saleCurrency ? formatMoney(Math.round(item.amount * item.conversionRate * 100) / 100, saleCurrency) : "Revalue required"}</td>
                                        <td className="text-end"><PermissionGuard permission="cost.manage"><div className="d-flex justify-content-end gap-2">
                                            <button type="button" className="btn btn-sm btn-outline-primary" title="Edit cost" onClick={() => { setEditingId(item._id); setForm({ category: item.category, description: item.description, amount: String(item.amount), currency: item.currency, conversionRate: String(item.conversionRate) }); document.getElementById("cost-description")?.focus(); }}><FaEdit /></button>
                                            <button type="button" className="btn btn-sm btn-outline-danger" title="Delete cost" onClick={() => void deleteCost(item)}><FaTrash /></button>
                                        </div></PermissionGuard></td>
                                    </tr>)}</tbody>
                                </table></div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CostProfit;
