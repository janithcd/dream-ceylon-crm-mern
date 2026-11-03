import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import PermissionGuard from "./PermissionGuard";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const units = ["Room per night", "Person per night", "Day", "Trip", "Person", "Vehicle per day", "Other"];
const meals = ["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive", "Other"];
const currencies = ["USD", "LKR", "EUR", "GBP"];
const blank = (category) => ({ service: "", unit: category === "Hotel" ? "Room per night" : category === "Guide" ? "Day" : "Trip",
    mealPlan: category === "Hotel" ? "Bed & Breakfast" : "", occupancy: category === "Hotel" ? "2" : null,
    amount: "", currency: "LKR", validFrom: "", validTo: "", sourceReference: "", notes: "", status: "Active" });
const fromRate = (rate) => ({ service: rate.service, unit: rate.unit, mealPlan: rate.mealPlan || "",
    occupancy: rate.occupancy ?? null, amount: String(rate.amount), currency: rate.currency,
    validFrom: toCalendarDateInput(rate.validFrom), validTo: toCalendarDateInput(rate.validTo),
    sourceReference: rate.sourceReference, notes: rate.notes || "", status: rate.status });
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timingLabel = (rate) => {
    const today = todayCalendarDate();
    if (rate.status === "Inactive") return "Inactive";
    if (rate.validFrom.slice(0, 10) > today) return "Upcoming";
    if (rate.validTo.slice(0, 10) < today) return "Expired";
    return "Current";
};

const SupplierRatesPanel = ({ supplier, onClose }) => {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("Active");
    const [timing, setTiming] = useState("All");
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(0);
    const [total, setTotal] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(() => blank(supplier.category));
    const [editing, setEditing] = useState(null);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const panelRef = useRef(null);

    useEffect(() => { panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, []);
    useEffect(() => {
        let active = true;
        setLoading(true); setError("");
        api.get(`/suppliers/${supplier._id}/rates`, { params: { status, timing, page, limit: 20 } })
            .then(({ data }) => {
                if (!active) return;
                if (page > Math.max(1, data.pages)) { setPage(Math.max(1, data.pages)); return; }
                setItems(data.items); setTotal(data.total); setPages(data.pages);
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load supplier rates."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [supplier._id, status, timing, page, refreshKey]);

    const open = (rate = null) => {
        setEditing(rate ? { id: rate._id, version: rate.__v } : null);
        setForm(rate ? fromRate(rate) : blank(supplier.category));
        setFormError(""); setSuccess(""); setShowForm(true);
    };
    const save = async (event) => {
        event.preventDefault();
        setSaving(true); setFormError(""); setSuccess("");
        try {
            if (editing) await api.put(`/suppliers/${supplier._id}/rates/${editing.id}`, { ...form, expectedVersion: editing.version });
            else await api.post(`/suppliers/${supplier._id}/rates`, form);
            setSuccess(editing ? "Rate revised. The previous version is in its history." : "Rate added.");
            setShowForm(false); setEditing(null); setRefreshKey((value) => value + 1);
        } catch (err) {
            setFormError(err.response?.data?.message || "Could not save supplier rate.");
            if (err.response?.status === 409) setRefreshKey((value) => value + 1);
        } finally { setSaving(false); }
    };
    const toggleStatus = async (rate) => {
        const next = rate.status === "Active" ? "Inactive" : "Active";
        if (next === "Inactive" && !window.confirm(`Deactivate this ${rate.service} rate? Saved bookings and costs are unaffected.`)) return;
        setSaving(true); setError(""); setSuccess("");
        try {
            await api.put(`/suppliers/${supplier._id}/rates/${rate._id}`, { ...fromRate(rate), status: next, expectedVersion: rate.__v });
            setSuccess(`Rate ${next === "Active" ? "reactivated" : "deactivated"}.`);
            setRefreshKey((value) => value + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Could not change rate status.");
            setRefreshKey((value) => value + 1);
        } finally { setSaving(false); }
    };

    return <section ref={panelRef} className="card border-primary shadow-sm mb-4" aria-label={`Rates for ${supplier.name}`}>
        <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-3">
                <div><h4 className="fw-bold mb-1">Rates · {supplier.name}</h4>
                    <p className="small text-muted mb-0">Private supplier quotes. Verify the dates, inclusions and source before pricing a trip. Saving a rate does not change a quotation or booking cost.</p></div>
                <div className="d-flex gap-2"><PermissionGuard permission="supplier.manage"><button type="button" className="btn btn-primary btn-sm" onClick={() => open()}>Add rate</button></PermissionGuard>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Close</button></div>
            </div>
            {success && <div className="alert alert-success" role="status">{success}</div>}
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {showForm && <PermissionGuard permission="supplier.manage"><form className="border rounded p-3 mb-3" onSubmit={save}>
                <h5 className="fw-semibold">{editing ? "Revise rate" : "New rate"}</h5>
                <div className="row g-3">
                    <div className="col-md-4"><label htmlFor="rate-service" className="form-label">{supplier.category === "Hotel" ? "Room / package type" : "Service"}</label>
                        <input id="rate-service" className="form-control" required minLength={2} maxLength={160} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder={supplier.category === "Hotel" ? "Superior sea view" : "Full-day service"} /></div>
                    <div className="col-md-3"><label htmlFor="rate-unit" className="form-label">Rate unit</label><select id="rate-unit" className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
                    <div className="col-md-3"><label htmlFor="rate-amount" className="form-label">Supplier rate</label><input id="rate-amount" className="form-control" type="number" min="0.01" max="1000000000" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                    <div className="col-md-2"><label htmlFor="rate-currency" className="form-label">Currency</label><select id="rate-currency" className="form-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></div>
                    {supplier.category === "Hotel" && <><div className="col-md-4"><label htmlFor="rate-meal" className="form-label">Meal plan</label><select id="rate-meal" className="form-select" value={form.mealPlan} onChange={(e) => setForm({ ...form, mealPlan: e.target.value })}>{meals.map((meal) => <option key={meal}>{meal}</option>)}</select></div>
                        <div className="col-md-2"><label htmlFor="rate-occupancy" className="form-label">Guests per room</label><input id="rate-occupancy" type="number" className="form-control" min="1" max="10" step="1" required value={form.occupancy} onChange={(e) => setForm({ ...form, occupancy: e.target.value })} /></div></>}
                    <div className="col-md-3"><label htmlFor="rate-from" className="form-label">Valid from</label><input id="rate-from" type="date" className="form-control" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
                    <div className="col-md-3"><label htmlFor="rate-to" className="form-label">Valid to</label><input id="rate-to" type="date" className="form-control" min={form.validFrom || undefined} required value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
                    <div className="col-md-8"><label htmlFor="rate-source" className="form-label">Supplier email / rate-sheet reference</label><input id="rate-source" className="form-control" required minLength={3} maxLength={160} value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} placeholder="e.g. Rate sheet emailed 2026-11-03" /></div>
                    <div className="col-md-4"><label htmlFor="rate-status" className="form-label">Status</label><select id="rate-status" className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>Inactive</option></select></div>
                    <div className="col-12"><label htmlFor="rate-notes" className="form-label">Inclusions / conditions (internal)</label><textarea id="rate-notes" className="form-control" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Taxes, child policy, minimum nights, exclusions" /></div>
                    {formError && <div className="col-12"><div className="alert alert-danger mb-0" role="alert">{formError}</div></div>}
                    <div className="col-12 d-flex gap-2"><button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving..." : editing ? "Save revision" : "Add rate"}</button>
                        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button></div>
                </div>
            </form></PermissionGuard>}
            <div className="d-flex flex-wrap gap-2 mb-3">
                <div><label htmlFor="rate-filter-status" className="form-label small">Status</label><select id="rate-filter-status" className="form-select form-select-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option>Active</option><option>Inactive</option><option>All</option></select></div>
                <div><label htmlFor="rate-filter-timing" className="form-label small">Validity</label><select id="rate-filter-timing" className="form-select form-select-sm" value={timing} onChange={(e) => { setTiming(e.target.value); setPage(1); }}><option>All</option><option>Current</option><option>Upcoming</option><option>Expired</option></select></div>
            </div>
            {loading ? <p role="status">Loading rates...</p> : !error && !items.length ? <p className="text-muted mb-0">No rates in this view.</p> : !error && <>
                <p className="small text-muted">{total} rate{total === 1 ? "" : "s"} in this view.</p>
                <div className="table-responsive"><table className="table table-hover align-middle"><thead><tr><th>Service</th><th>Rate</th><th>Valid dates</th><th>Source / conditions</th><th className="text-end">Actions</th></tr></thead><tbody>{items.map((rate) => <tr key={rate._id}>
                    <td><strong>{rate.service}</strong><div className="small text-muted">{rate.unit}{supplier.category === "Hotel" && ` · ${rate.mealPlan} · ${rate.occupancy} guest${rate.occupancy === 1 ? "" : "s"}`}</div></td>
                    <td>{money(rate.amount, rate.currency)}</td>
                    <td>{formatCalendarDate(rate.validFrom)} – {formatCalendarDate(rate.validTo)}<div className="small text-muted">{timingLabel(rate)} · revision {rate.revision}</div></td>
                    <td className="small" style={{ whiteSpace: "pre-wrap", maxWidth: 360 }}><div>{rate.sourceReference}</div>{rate.notes && <div className="text-muted">{rate.notes}</div>}
                        {rate.history?.length > 0 && <details className="mt-1"><summary>Previous versions ({rate.history.length})</summary><ul className="list-unstyled mt-2 mb-0">{rate.history.slice().reverse().map((old) => <li key={old.revision} className="border-top py-1">
                            r{old.revision}: {money(old.amount, old.currency)} / {old.unit} · {formatCalendarDate(old.validFrom)} – {formatCalendarDate(old.validTo)}<br />
                            {old.service}{old.mealPlan ? ` · ${old.mealPlan}` : ""} · {old.sourceReference} · {old.changedByName}
                        </li>)}</ul></details>}</td>
                    <td className="text-end"><PermissionGuard permission="supplier.manage"><div className="d-flex gap-2 justify-content-end"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => open(rate)}>Revise</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={() => toggleStatus(rate)}>{rate.status === "Active" ? "Deactivate" : "Reactivate"}</button></div></PermissionGuard></td>
                </tr>)}</tbody></table></div>
                {pages > 1 && <div className="d-flex gap-2 align-items-center"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
            </>}
        </div>
    </section>;
};

export default SupplierRatesPanel;
