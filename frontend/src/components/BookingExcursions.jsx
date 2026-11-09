import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";

import { ACTIVITY_TYPES } from "../utils/excursionOptions";
const transitions = { Planned: ["Requested", "Cancelled"], Requested: ["Confirmed", "Cancellation requested"],
    Confirmed: ["Completed", "Cancellation requested"], "Cancellation requested": ["Cancelled"], Cancelled: ["Planned"], Completed: [] };
const labels = { Requested: "Record request sent", Confirmed: "Record supplier confirmation", Completed: "Mark completed",
    "Cancellation requested": "Record cancellation request", Cancelled: "Mark cancelled", Planned: "Reopen activity" };
const emptyForm = (booking) => ({ title: "", type: "Safari", date: toCalendarDateInput(booking.travelStartDate), startTime: "",
    participants: booking.numberOfTravelers, supplierName: "", supplierEmail: "", supplierPhone: "", meetingPoint: "",
    followUpDate: "", guestInstructions: "", internalNotes: "" });
const errorMessage = (err) => err.response?.data?.message || "Could not complete the action. Please try again.";

export default function BookingExcursions({ bookingId, onChanged, focusItemId = "" }) {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission("booking.update");
    const [data, setData] = useState(null);
    const [reload, setReload] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [stale, setStale] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [form, setForm] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [action, setAction] = useState(null);
    const [draft, setDraft] = useState(null);
    const [supplierSearch, setSupplierSearch] = useState("");
    const [suppliers, setSuppliers] = useState([]);
    const [supplierBusy, setSupplierBusy] = useState(false);
    const [supplierError, setSupplierError] = useState("");
    const panelRef = useRef(null);
    const focusedActivityRef = useRef(null);
    useEffect(() => {
        if (!loading && focusItemId) {
            focusedActivityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            focusedActivityRef.current?.focus({ preventScroll: true });
        }
    }, [focusItemId, loading]);
    const panel = form ? "form" : action ? "action" : draft ? "draft" : "";
    const actionId = action?.id;
    useEffect(() => { panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [panel, editingId, actionId]);
    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/excursions`).then(({ data: result }) => {
            if (active) { setData(result); setStale(false); setError(""); }
        }).catch((err) => { if (active) { setError(errorMessage(err)); setData(null); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, reload]);
    const refresh = () => { setLoading(true); setForm(null); setAction(null); setDraft(null); setNotice(""); setReload((n) => n + 1); };
    const mutate = async (method, path, body) => {
        setBusy(true); setError(""); setNotice("");
        try {
            const { data: result } = await api[method](`/bookings/${bookingId}/excursions${path}`, { ...body, expectedVersion: data.version });
            setData(result); setForm(null); setAction(null); setDraft(null); setNotice("Activity saved."); onChanged();
        } catch (err) { setError(errorMessage(err)); if (err.response?.status === 409) setStale(true); }
        finally { setBusy(false); }
    };
    const edit = (item) => {
        setEditingId(item?._id || null); setAction(null); setDraft(null); setError(""); setNotice("");
        setForm(item ? { ...item, date: toCalendarDateInput(item.date), followUpDate: toCalendarDateInput(item.followUpDate) } : emptyForm(data.booking));
        setSuppliers([]); setSupplierSearch(""); setSupplierError("");
    };
    const findSuppliers = async () => {
        setSupplierBusy(true); setSupplierError(""); setSuppliers([]);
        try { const { data: result } = await api.get("/suppliers", { params: { keyword: supplierSearch, status: "Active", limit: 20 } }); setSuppliers(result.items); if (!result.items.length) setSupplierError("No active suppliers match this search. Enter the supplier details below or try another name."); }
        catch (err) { setSupplierError(errorMessage(err)); }
        finally { setSupplierBusy(false); }
    };
    const openDraft = async (item, audience) => {
        setBusy(true); setError(""); setDraft(null); setForm(null); setAction(null); setNotice("");
        try { const { data: result } = await api.get(`/bookings/${bookingId}/excursions/${item._id}/message`, { params: { audience } }); setDraft({ ...result, audience }); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    };
    const copyDraft = async () => {
        try { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); setNotice("Draft copied. Send it through your email or messaging app."); }
        catch { setError("Clipboard unavailable. Select and copy the draft text below."); }
    };
    const field = (name, label, options = {}) => <div className={options.wide ? "col-12" : "col-md-6"} key={name}>
        <label className="form-label" htmlFor={`activity-${name}`}>{label}</label>
        <input id={`activity-${name}`} className="form-control" type={options.type || "text"} value={form[name] ?? ""}
            required={options.required} maxLength={options.maxLength} min={options.min} max={options.max}
            onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
    </div>;
    if (loading) return <p role="status">Loading booking activities…</p>;
    if (!data) return <div className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-danger" onClick={refresh}>Retry</button></div>;
    const closed = ["Cancelled", "Completed"].includes(data.booking.bookingStatus);
    const disabled = busy || stale;
    return <section className="card border-0 shadow-sm"><div className="card-body">
        <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
            <div><h4>{data.booking.bookingCode} · Activities</h4><div className="small text-muted">{formatCalendarDate(data.booking.travelStartDate)} – {formatCalendarDate(data.booking.travelEndDate)} · {data.booking.numberOfTravelers} travelers · {data.booking.bookingStatus}</div></div>
            <div className="d-flex gap-2 align-items-start"><button className="btn btn-outline-secondary" onClick={refresh} disabled={busy}>Reload</button>
                {canEdit && !closed && <button className="btn btn-primary" onClick={() => edit(null)} disabled={disabled}>Add activity</button>}</div>
        </div>
        {error && <div role="alert" className="alert alert-danger">{error}{stale && " Reload this booking before making further changes."}</div>}
        {notice && <div role="status" className="alert alert-success">{notice}</div>}
        {closed && <p className="alert alert-warning">This booking is closed. Review outstanding supplier cancellations; closing a booking does not cancel reservations. On completed bookings you can also mark confirmed activities as completed.</p>}
        {!data.items.length && <p className="text-muted">No activities yet. Add a safari, guide, train reservation, or another excursion for this trip.</p>}
        {focusItemId && !data.items.some((item) => item._id === focusItemId) && <p className="alert alert-warning" role="status">The linked activity was not found on this booking. Review the current records below.</p>}
        <div className="d-grid gap-3">
            {data.items.map((item) => <article className={`border rounded p-3 ${item._id === focusItemId ? "border-primary border-2" : ""}`} key={item._id}
                ref={item._id === focusItemId ? focusedActivityRef : null} tabIndex={item._id === focusItemId ? -1 : undefined}
                aria-label={`Activity: ${item.title}`}>
                <div className="d-flex flex-wrap justify-content-between gap-2"><div><strong>{item.title}</strong> <span className={`badge ${item.status === "Confirmed" ? "text-bg-success" : item.status === "Cancellation requested" ? "text-bg-danger" : "text-bg-secondary"}`}>{item.status}</span>
                    <div>{formatCalendarDate(item.date)} · {item.startTime || "Time needed"} (Sri Lanka) · {item.participants} participants · {item.type}</div>
                    <div className="small">{item.supplierName || "Supplier needed"}{item.supplierPhone && ` · ${item.supplierPhone}`}{item.supplierEmail && ` · ${item.supplierEmail}`}</div>
                    <div className="small">Meeting point: {item.meetingPoint || "Not arranged"}{item.confirmationReference && ` · Reference: ${item.confirmationReference}`}</div>
                    {item.followUpDate && <div className={`small ${toCalendarDateInput(item.followUpDate) <= todayCalendarDate() ? "text-danger" : "text-muted"}`}>Follow up: {formatCalendarDate(item.followUpDate)}</div>}
                    {item.guestInstructions && <p className="small mt-2 mb-0">Guest instructions: {item.guestInstructions}</p>}
                    {item.internalNotes && <p className="small text-muted mb-0">Internal: {item.internalNotes}</p>}
                </div></div>
                {canEdit && <div className="d-flex flex-wrap gap-2 mt-3">
                    {!closed && !["Completed", "Cancellation requested"].includes(item.status) && <button className="btn btn-sm btn-outline-primary" disabled={disabled} onClick={() => edit(item)}>Edit details</button>}
                    {(transitions[item.status] || []).filter((status) => !closed || ["Cancellation requested", "Cancelled"].includes(status) || (data.booking.bookingStatus === "Completed" && status === "Completed")).map((status) =>
                        <button key={status} className="btn btn-sm btn-outline-secondary" disabled={disabled || (status === "Completed" && toCalendarDateInput(item.date) > todayCalendarDate())}
                            onClick={() => { setForm(null); setDraft(null); setAction({ id: item._id, title: item.title, from: item.status, status, note: "", confirmationReference: "", confirmed: false }); }}>{labels[status]}</button>)}
                    {item.supplierName && !["Completed", "Cancelled"].includes(item.status) && (!closed || item.status === "Cancellation requested") &&
                        <button className="btn btn-sm btn-outline-primary" disabled={disabled} onClick={() => openDraft(item, "supplier")}>{item.status === "Cancellation requested" ? "Cancellation draft" : "Supplier request draft"}</button>}
                    {!closed && item.status === "Confirmed" && <button className="btn btn-sm btn-outline-primary" disabled={disabled} onClick={() => openDraft(item, "guest")}>Guest instructions draft</button>}
                    {item.supplierName && ["Requested", "Confirmed"].includes(item.status) && <button className="btn btn-sm btn-outline-secondary" disabled={disabled} onClick={() => openDraft(item, "cancellation")}>Cancellation draft</button>}
                </div>}
                <details className="mt-2 small"><summary>History ({item.history.length} most recent events)</summary>
                    <ol className="mb-0 mt-2">{[...item.history].reverse().map((entry, index) => <li key={index}>{formatCalendarDate(entry.at)} · {entry.byName} · {entry.action}: {entry.fromStatus && `${entry.fromStatus} → `}{entry.toStatus}{entry.note && ` · ${entry.note}`}</li>)}</ol>
                </details>
            </article>)}
        </div>
        {form && <form ref={panelRef} className="border rounded p-3 mt-3" onSubmit={(e) => { e.preventDefault(); mutate(editingId ? "put" : "post", editingId ? `/${editingId}` : "", form); }}>
            <h5>{editingId ? "Edit activity" : "New activity"}</h5>
            <p className="small text-muted">Changing a confirmed activity’s name, type, date, time, participants, supplier or meeting point requires supplier reconfirmation. Costs and payments are recorded separately in Cost &amp; Profit.</p>
            <fieldset disabled={disabled}><div className="row g-3">
                {field("title", "Activity name", { required: true, maxLength: 120 })}
                <div className="col-md-6"><label className="form-label" htmlFor="activity-type">Type</label><select id="activity-type" className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
                {field("date", "Activity date", { type: "date", required: true, min: toCalendarDateInput(data.booking.travelStartDate), max: toCalendarDateInput(data.booking.travelEndDate) })}
                {field("startTime", "Start time (Sri Lanka)", { type: "time" })}
                {field("participants", "Participants", { type: "number", required: true, min: 1, max: data.booking.numberOfTravelers })}
                {field("followUpDate", "Follow-up date", { type: "date", max: form.date })}
                {hasPermission("supplier.view") && <div className="col-12 bg-light rounded p-3"><label htmlFor="activity-supplier-search" className="form-label">Copy contact details from supplier directory (optional)</label>
                    <div className="input-group"><input id="activity-supplier-search" className="form-control" value={supplierSearch} maxLength={100} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Search supplier name" />
                        <button type="button" className="btn btn-outline-secondary" disabled={supplierBusy} onClick={findSuppliers}>{supplierBusy ? "Searching…" : "Find suppliers"}</button></div>
                    {supplierError && <p role="alert" className="text-danger">{supplierError}</p>}
                    {!!suppliers.length && <select className="form-select mt-2" aria-label="Copy supplier contact" value="" onChange={(e) => { const supplier = suppliers.find((s) => s._id === e.target.value); if (supplier) setForm({ ...form, supplierName: supplier.name, supplierEmail: supplier.email || "", supplierPhone: supplier.phone || "" }); }}><option value="">Choose a supplier to copy</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name} · {s.category}</option>)}</select>}
                </div>}
                {field("supplierName", "Supplier / operator", { maxLength: 160 })}
                {field("supplierEmail", "Supplier email", { type: "email", maxLength: 254 })}
                {field("supplierPhone", "Supplier phone", { type: "tel", maxLength: 30 })}
                {field("meetingPoint", "Meeting point", { maxLength: 200 })}
                {field("guestInstructions", "Guest instructions (included in guest draft)", { wide: true, maxLength: 500 })}
                {field("internalNotes", "Internal notes (staff only)", { wide: true, maxLength: 500 })}
            </div><div className="d-flex gap-2 mt-3"><button className="btn btn-primary" type="submit">{busy ? "Saving…" : "Save activity"}</button><button className="btn btn-outline-secondary" type="button" onClick={() => setForm(null)}>Close editor</button></div></fieldset>
        </form>}
        {action && <form ref={panelRef} className="border rounded p-3 mt-3" onSubmit={(e) => { e.preventDefault(); mutate("patch", `/${action.id}/status`, action); }}>
            <h5>{labels[action.status]} · {action.title}</h5>
            <p>{action.from} → {action.status}</p>
            <fieldset disabled={disabled}>
                {action.status === "Confirmed" && <label className="form-label d-block">Supplier confirmation reference<input className="form-control" required maxLength={100} value={action.confirmationReference} onChange={(e) => setAction({ ...action, confirmationReference: e.target.value })} /></label>}
                <label className="form-label d-block">{["Cancelled", "Cancellation requested", "Planned"].includes(action.status) ? "Reason / supplier cancellation acknowledgement (required)" : "Action note (optional)"}<input className="form-control" maxLength={300} minLength={["Cancelled", "Cancellation requested", "Planned"].includes(action.status) ? 3 : undefined} required={["Cancelled", "Cancellation requested", "Planned"].includes(action.status)} value={action.note} onChange={(e) => setAction({ ...action, note: e.target.value })} /></label>
                <label className="form-check my-3"><input className="form-check-input" type="checkbox" required checked={action.confirmed} onChange={(e) => setAction({ ...action, confirmed: e.target.checked })} /><span className="form-check-label">I confirm this action has happened. {action.status === "Requested" ? "The request has been sent to the supplier." : action.status === "Cancellation requested" ? "The cancellation request has been sent to the supplier." : action.status === "Cancelled" && action.from !== "Planned" ? "The supplier has acknowledged cancellation; any charges are recorded separately." : ""}</span></label>
                <div className="d-flex gap-2"><button type="submit" className="btn btn-primary">Save status</button><button type="button" className="btn btn-outline-secondary" onClick={() => setAction(null)}>Close</button></div>
            </fieldset>
        </form>}
        {draft && <div ref={panelRef} className="border rounded p-3 mt-3"><h5>{draft.audience === "guest" ? "Guest instructions" : "Supplier message"} · Review draft</h5>
            <p className="small text-muted">Review the recipient and content before sending. Opening or copying a draft does not send it or change the reservation status.</p>
            <label className="form-label d-block">To<input type="email" className="form-control" maxLength={254} value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} /></label>
            <label className="form-label d-block">Subject<input className="form-control" maxLength={160} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label className="form-label d-block">Message<textarea className="form-control" rows={12} maxLength={1800} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <div className="d-flex flex-wrap gap-2"><button className="btn btn-primary" onClick={copyDraft}>Copy draft</button>{buildSupplierMailtoUrl(draft) && <a className="btn btn-outline-primary" href={buildSupplierMailtoUrl(draft)}>Open email app</a>}<button className="btn btn-outline-secondary" onClick={() => setDraft(null)}>Close draft</button></div>
        </div>}
    </div></section>;
}
