import { useEffect, useRef, useState } from "react";
import { FaAddressBook, FaPlus } from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";
import SupplierRatesPanel from "../components/SupplierRatesPanel";

const categories = ["Hotel", "Guide", "Safari jeep", "Transport", "Activity", "Other"];
const blank = () => ({ category: "Hotel", name: "", location: "", contactName: "", email: "", phone: "",
    whatsapp: "", terms: "", notes: "", status: "Active" });
const editFields = (supplier) => Object.fromEntries(Object.keys(blank()).map((key) => [key, supplier[key] ?? ""]));

const Suppliers = () => {
    const [items, setItems] = useState([]);
    const [filters, setFilters] = useState({ keyword: "", category: "", status: "Active" });
    const [applied, setApplied] = useState(filters);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(0);
    const [total, setTotal] = useState(0);
    const [form, setForm] = useState(blank);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [formError, setFormError] = useState("");
    const [success, setSuccess] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [rateSupplier, setRateSupplier] = useState(null);
    const formRef = useRef(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        api.get("/suppliers", { params: { ...applied, page, limit: 20 } })
            .then(({ data }) => {
                if (!active) return;
                if (page > Math.max(1, data.pages)) { setPage(Math.max(1, data.pages)); return; }
                setItems(data.items);
                setPages(data.pages);
                setTotal(data.total);
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load suppliers."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [applied, page, refreshKey]);

    const open = (supplier = null) => {
        setForm(supplier ? editFields(supplier) : blank());
        setEditing(supplier ? { id: supplier._id, version: supplier.__v } : null);
        setFormError(""); setSuccess(""); setShowForm(true);
        requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    const save = async (event) => {
        event.preventDefault();
        setSaving(true); setFormError(""); setSuccess("");
        try {
            if (editing) await api.put(`/suppliers/${editing.id}`, { ...form, expectedVersion: editing.version });
            else await api.post("/suppliers", form);
            setSuccess(editing ? "Supplier updated." : "Supplier added.");
            setShowForm(false); setEditing(null); setRefreshKey((value) => value + 1);
        } catch (err) {
            setFormError(err.response?.data?.message || "Could not save supplier.");
            if (err.response?.status === 409) setRefreshKey((value) => value + 1);
        } finally { setSaving(false); }
    };
    const toggleStatus = async (supplier) => {
        const next = supplier.status === "Active" ? "Inactive" : "Active";
        if (next === "Inactive" && !window.confirm(`Deactivate ${supplier.name}? Existing booking stays will keep their saved details.`)) return;
        setSaving(true); setError(""); setSuccess("");
        try {
            await api.put(`/suppliers/${supplier._id}`, { ...editFields(supplier), status: next, expectedVersion: supplier.__v });
            setSuccess(`${supplier.name} ${next === "Inactive" ? "deactivated" : "reactivated"}.`);
            setRefreshKey((value) => value + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Could not change supplier status.");
            setRefreshKey((value) => value + 1);
        } finally { setSaving(false); }
    };

    return <div>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
            <div><h2 className="fw-bold mb-1"><FaAddressBook className="me-2 text-primary" />Supplier Directory</h2>
                <p className="text-muted mb-0">Hotels, guides, safari jeep providers and other partners. Contacts and terms are internal.</p></div>
            <PermissionGuard permission="supplier.manage"><button type="button" className="btn btn-primary" onClick={() => open()}><FaPlus className="me-2" />Add supplier</button></PermissionGuard>
        </div>
        {success && <div className="alert alert-success" role="status">{success}</div>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {showForm && <PermissionGuard permission="supplier.manage"><div className="card border-0 shadow-sm mb-4" ref={formRef}>
            <div className="card-body"><h4 className="fw-bold mb-3">{editing ? "Edit supplier" : "Add supplier"}</h4>
                <form onSubmit={save} className="row g-3">
                    <div className="col-md-4"><label className="form-label" htmlFor="supplier-category">Category</label>
                        <select id="supplier-category" className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
                    <div className="col-md-5"><label className="form-label" htmlFor="supplier-name">Supplier / company name</label>
                        <input id="supplier-name" className="form-control" required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laluna Resort" /></div>
                    <div className="col-md-3"><label className="form-label" htmlFor="supplier-location">Location / service area</label>
                        <input id="supplier-location" className="form-control" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bentota" /></div>
                    <div className="col-md-4"><label className="form-label" htmlFor="supplier-contact">Contact person</label>
                        <input id="supplier-contact" className="form-control" maxLength={120} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
                    <div className="col-md-4"><label className="form-label" htmlFor="supplier-email">Business email</label>
                        <input id="supplier-email" type="email" className="form-control" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div className="col-md-4"><label className="form-label" htmlFor="supplier-phone">Phone</label>
                        <input id="supplier-phone" type="tel" className="form-control" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                    <div className="col-md-4"><label className="form-label" htmlFor="supplier-whatsapp">WhatsApp</label>
                        <input id="supplier-whatsapp" type="tel" className="form-control" maxLength={30} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                    <div className="col-md-3"><label className="form-label" htmlFor="supplier-status">Status</label>
                        <select id="supplier-status" className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>Inactive</option></select></div>
                    <div className="col-12"><label className="form-label" htmlFor="supplier-terms">Payment / booking terms (internal)</label>
                        <textarea id="supplier-terms" className="form-control" rows={2} maxLength={500} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="e.g. Pro forma required, 50% advance before arrival" /></div>
                    <div className="col-12"><label className="form-label" htmlFor="supplier-notes">Internal notes</label>
                        <textarea id="supplier-notes" className="form-control" rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                    {formError && <div className="col-12"><div className="alert alert-danger mb-0" role="alert">{formError}</div></div>}
                    <div className="col-12 d-flex gap-2"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save supplier" : "Add supplier"}</button>
                        <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button></div>
                </form>
            </div></div></PermissionGuard>}
        <div className="card border-0 shadow-sm"><div className="card-body">
            <form className="row g-2 align-items-end mb-3" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied({ ...filters, keyword: filters.keyword.trim() }); }}>
                <div className="col-md-5"><label className="form-label" htmlFor="supplier-search">Search name, location or contact</label>
                    <input id="supplier-search" className="form-control" maxLength={100} value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} /></div>
                <div className="col-md-3"><label className="form-label" htmlFor="supplier-filter-category">Category</label>
                    <select id="supplier-filter-category" className="form-select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div className="col-md-2"><label className="form-label" htmlFor="supplier-filter-status">Status</label>
                    <select id="supplier-filter-status" className="form-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option>Active</option><option>Inactive</option><option>All</option></select></div>
                <div className="col-md-2"><button type="submit" className="btn btn-outline-primary w-100">Search</button></div>
            </form>
            {loading ? <p role="status">Loading suppliers...</p> : !error && !items.length ? <p className="text-muted mb-0">No suppliers found. Add a supplier or change the filters.</p> : !error && <>
                <p className="small text-muted">{total} supplier{total === 1 ? "" : "s"} in this view.</p>
                <div className="table-responsive"><table className="table table-hover align-middle"><thead><tr><th>Supplier</th><th>Contact</th><th>Terms / notes</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{items.map((item) =>
                    <tr key={item._id}><td><strong>{item.name}</strong><div className="small text-muted">{item.category}{item.location ? ` · ${item.location}` : ""}</div></td>
                        <td>{item.contactName && <div>{item.contactName}</div>}{item.email && <div><a href={`mailto:${item.email}`}>{item.email}</a></div>}
                            {item.phone && <div>Phone: <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>{item.phone}</a></div>}
                            {item.whatsapp && <div>WhatsApp: {item.whatsapp}</div>}
                            {!item.email && !item.phone && !item.whatsapp && <span className="text-muted">No contact details</span>}</td>
                        <td className="small" style={{ whiteSpace: "pre-wrap", maxWidth: 350 }}>{item.terms && <div>{item.terms}</div>}{item.notes && <div className="text-muted">{item.notes}</div>}</td>
                        <td>{item.status}</td><td><div className="d-flex gap-2 justify-content-end"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setRateSupplier(item)}>Rates</button><PermissionGuard permission="supplier.manage"><div className="d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => open(item)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={() => toggleStatus(item)}>{item.status === "Active" ? "Deactivate" : "Reactivate"}</button>
                        </div></PermissionGuard></div></td></tr>)}</tbody></table></div>
                {pages > 1 && <div className="d-flex align-items-center gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                    <span>Page {page} of {pages}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
            </>}
        </div></div>
        {rateSupplier && <SupplierRatesPanel key={rateSupplier._id} supplier={rateSupplier} onClose={() => setRateSupplier(null)} />}
    </div>;
};

export default Suppliers;
