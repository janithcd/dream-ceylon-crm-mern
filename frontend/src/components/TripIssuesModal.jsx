import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import { formatCalendarDate, todayCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const categories = ["Accommodation", "Transport", "Guide", "Itinerary", "Health & Safety", "Other"];
const initial = { title: "", category: "Accommodation", priority: "Normal", note: "", nextFollowUpDate: "", assignedTo: "__me__" };

const TripIssuesModal = ({ bookingId, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const { admin } = useAuth();
    const canUpdate = hasPermission("booking.update");
    const [record, setRecord] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [newIssue, setNewIssue] = useState(initial);
    const [selectedId, setSelectedId] = useState(null);
    const [action, setAction] = useState("updated");
    const [actionNote, setActionNote] = useState("");
    const [followUpDate, setFollowUpDate] = useState("");
    const [assignees, setAssignees] = useState([]);
    const [assigneeError, setAssigneeError] = useState("");
    const [assignId, setAssignId] = useState(null);
    const [assignTo, setAssignTo] = useState("");
    const dialogRef = useRef(null);
    const closeRef = useRef(onClose);
    const close = () => { if (!busy) onClose(); };
    closeRef.current = close;

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/trip-issues`)
            .then(({ data }) => { if (active) { setRecord(data); setError(""); } })
            .catch((err) => { if (active) { setRecord(null); setError(err.response?.data?.message || "Could not load trip issues."); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, reloadKey]);

    useEffect(() => {
        if (!canUpdate) return undefined;
        let active = true;
        api.get("/bookings/preparation-assignees")
            .then(({ data }) => { if (active) { setAssignees(data.admins || []); setAssigneeError(""); } })
            .catch(() => { if (active) setAssigneeError("Could not load staff choices. Reopen the issue window to try again."); });
        return () => { active = false; };
    }, [canUpdate]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea")]
                .filter((element) => !element.disabled && element.offsetParent !== null);
            if (!controls.length) return;
            if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog)) {
                event.preventDefault(); controls.at(-1).focus();
            } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
                event.preventDefault(); controls[0].focus();
            }
        };
        dialog?.addEventListener("keydown", handleKey);
        return () => {
            dialog?.removeEventListener("keydown", handleKey);
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const reload = () => { setSelectedId(null); setAssignId(null); setRecord(null); setLoading(true); setReloadKey((value) => value + 1); };
    const create = async (event) => {
        event.preventDefault();
        if (busy || !record?.canOpenIssue || !canUpdate) return;
        setBusy(true); setError("");
        try {
            await api.post(`/bookings/${bookingId}/trip-issues`, { ...newIssue,
                assignedTo: newIssue.assignedTo === "__me__" ? undefined : newIssue.assignedTo || null,
                nextFollowUpDate: newIssue.nextFollowUpDate || null });
            setNewIssue(initial); onChanged?.(); reload();
        } catch (err) { setError(err.response?.data?.message || "Could not open the issue. Refresh and try again."); }
        finally { setBusy(false); }
    };
    const saveAction = async (event) => {
        event.preventDefault();
        const issue = record?.issues.find((item) => item._id === selectedId);
        if (busy || !issue || !canUpdate) return;
        setBusy(true); setError("");
        try {
            await api.patch(`/bookings/${bookingId}/trip-issues/${selectedId}`, {
                action, note: actionNote, nextFollowUpDate: action === "resolved" ? null : followUpDate || null,
                expectedRevision: issue.revision,
            });
            setSelectedId(null); setActionNote(""); onChanged?.(); reload();
        } catch (err) { setError(err.response?.data?.message || "Could not update the issue. Refresh and try again."); }
        finally { setBusy(false); }
    };
    const choose = (issue) => {
        setAssignId(null); setSelectedId(issue._id); setAction(issue.status === "Resolved" ? "reopened" : "updated");
        setActionNote(""); setFollowUpDate(toCalendarDateInput(issue.nextFollowUpDate));
    };
    const chooseOwner = (issue) => {
        setSelectedId(null); setAssignId(issue._id);
        setAssignTo(issue.assignedTo || "");
    };
    const saveOwner = async (event) => {
        event.preventDefault();
        const issue = record?.issues.find((item) => item._id === assignId);
        if (!issue || busy || !canUpdate) return;
        setBusy(true); setError("");
        try {
            await api.patch(`/bookings/${bookingId}/trip-issues/${assignId}/assignee`, {
                assignedTo: assignTo || null, expectedRevision: issue.revision,
            });
            setAssignId(null); onChanged?.(); reload();
        } catch (err) { setError(err.response?.data?.message || "Could not assign the issue. Refresh and try again."); }
        finally { setBusy(false); }
    };

    return <>
        <div ref={dialogRef} className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="trip-issues-title" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div className="modal-content">
                <div className="modal-header"><h5 className="modal-title" id="trip-issues-title">Trip support{record?.bookingCode && ` · ${record.bookingCode}`}</h5>
                    <button type="button" className="btn-close" onClick={close} aria-label="Close trip support" disabled={busy} /></div>
                <div className="modal-body">
                    {loading && <p role="status">Loading trip issues...</p>}
                    {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={reload} disabled={busy}>Refresh</button></div>}
                    {assigneeError && <div className="alert alert-warning small" role="alert">{assigneeError}</div>}
                    {!loading && record && <>
                        <p className="small text-muted">{record.customerName || "Guest"} · {formatCalendarDate(record.travelStartDate)} – {formatCalendarDate(record.travelEndDate)} · {record.bookingStatus}</p>
                        <p className="alert alert-info small">Log operational problems and actions taken. A note records work in the CRM; it does not contact the guest or supplier. Resolve each issue explicitly, even if the booking later ends.</p>
                        {canUpdate && record.canOpenIssue && <form className="border rounded p-3 mb-4" onSubmit={create}>
                            <h6>Open an issue</h6>
                            <div className="row g-3">
                                <div className="col-md-6"><label className="form-label" htmlFor="issue-title">Short title</label>
                                    <input id="issue-title" className="form-control" minLength={5} maxLength={120} required value={newIssue.title}
                                        onChange={(event) => setNewIssue({ ...newIssue, title: event.target.value })} disabled={busy} /></div>
                                <div className="col-md-3"><label className="form-label" htmlFor="issue-category">Category</label>
                                    <select id="issue-category" className="form-select" value={newIssue.category} onChange={(event) => setNewIssue({ ...newIssue, category: event.target.value })} disabled={busy}>
                                        {categories.map((item) => <option key={item}>{item}</option>)}</select></div>
                                <div className="col-md-3"><label className="form-label" htmlFor="issue-priority">Priority</label>
                                    <select id="issue-priority" className="form-select" value={newIssue.priority} onChange={(event) => setNewIssue({ ...newIssue, priority: event.target.value })} disabled={busy}>
                                        <option>Normal</option><option>Urgent</option></select></div>
                                <div className="col-md-6"><label className="form-label" htmlFor="issue-follow-up">Next follow-up (optional)</label>
                                    <input id="issue-follow-up" type="date" className="form-control" min={todayCalendarDate()} value={newIssue.nextFollowUpDate}
                                        onChange={(event) => setNewIssue({ ...newIssue, nextFollowUpDate: event.target.value })} disabled={busy} /></div>
                                <div className="col-md-6"><label className="form-label" htmlFor="issue-owner">Issue owner</label>
                                    <select id="issue-owner" className="form-select" value={newIssue.assignedTo} onChange={(event) => setNewIssue({ ...newIssue, assignedTo: event.target.value })} disabled={busy}>
                                        <option value="__me__">Assign to me</option><option value="">Unassigned</option>
                                        {assignees.filter((person) => String(person._id) !== String(admin?.id)).map((person) => <option key={person._id} value={person._id}>{person.name} · {person.role}</option>)}
                                    </select></div>
                                <div className="col-12"><label className="form-label" htmlFor="issue-note">Private description</label>
                                    <textarea id="issue-note" className="form-control" rows="2" minLength={5} maxLength={500} required value={newIssue.note}
                                        onChange={(event) => setNewIssue({ ...newIssue, note: event.target.value })} disabled={busy} /></div>
                            </div>
                            <button type="submit" className="btn btn-primary mt-3" disabled={busy || record.issues.length >= 30}>Open issue</button>
                            {record.issues.length >= 30 && <p className="small text-muted mt-2 mb-0">This booking has reached the 30 issue limit.</p>}
                        </form>}
                        <h6>Issue history · {record.issues.filter((issue) => issue.status === "Open").length} open</h6>
                        {!record.issues.length && <p className="text-muted small">No issues recorded for this trip.</p>}
                        <div className="d-grid gap-3">{record.issues.map((issue) => <section className="border rounded p-3" key={issue._id}>
                            <div className="d-flex flex-wrap justify-content-between gap-2"><div><strong className="text-break">{issue.title}</strong>
                                <div className="small text-muted">{issue.category} · {issue.priority} priority · Opened {new Date(issue.openedAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</div></div>
                                <span className={`badge align-self-start ${issue.status === "Open" ? "text-bg-warning" : "text-bg-success"}`}>{issue.status}</span></div>
                            <p className="small mt-2 mb-1">Owner: <strong>{issue.assignedToName || "Unassigned"}</strong></p>
                            {issue.status === "Open" && <p className="small mt-2 mb-1">Next follow-up: <strong>{issue.nextFollowUpDate ? `${toCalendarDateInput(issue.nextFollowUpDate) < todayCalendarDate() ? "Overdue · " : ""}${formatCalendarDate(issue.nextFollowUpDate)}` : "Not set"}</strong></p>}
                            <ol className="small ps-3 my-2">{[...issue.events].reverse().map((entry, index) => <li className="mb-2 text-break" key={`${entry.at}-${index}`}>
                                <strong>{entry.action}</strong> · {new Date(entry.at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} · {entry.byName || "Staff"}
                                <div>{entry.note}</div>
                            </li>)}</ol>
                            {canUpdate && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => choose(issue)} disabled={busy}>
                                {issue.status === "Resolved" ? "Reopen issue" : "Update or resolve"}</button>}
                            {canUpdate && issue.status === "Open" && <button type="button" className="btn btn-sm btn-outline-secondary ms-2" onClick={() => chooseOwner(issue)} disabled={busy}>Change owner</button>}
                            {assignId === issue._id && canUpdate && <form className="border-top mt-3 pt-3" onSubmit={saveOwner}>
                                <label className="form-label" htmlFor="issue-assign">Assign issue to</label>
                                <select id="issue-assign" className="form-select" value={assignTo} onChange={(event) => setAssignTo(event.target.value)} disabled={busy}>
                                    <option value="">Unassigned</option>
                                    {issue.assignedTo && !assignees.some((person) => person._id === issue.assignedTo) && <option value={issue.assignedTo} disabled>{issue.assignedToName || "Current owner"} (no longer available)</option>}
                                    {assignees.map((person) => <option key={person._id} value={person._id}>{person.name} · {person.role}</option>)}
                                </select>
                                <div className="d-flex gap-2 mt-3"><button type="submit" className="btn btn-primary btn-sm" disabled={busy || assignTo === (issue.assignedTo || "")}>Save owner</button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAssignId(null)} disabled={busy}>Cancel</button></div>
                            </form>}
                            {selectedId === issue._id && canUpdate && <form className="border-top mt-3 pt-3" onSubmit={saveAction}>
                                <label className="form-label" htmlFor="issue-action">Action</label>
                                <select id="issue-action" className="form-select mb-3" value={action} onChange={(event) => setAction(event.target.value)} disabled={busy}>
                                    {issue.status === "Open" ? <><option value="updated">Record update</option><option value="resolved">Resolve issue</option></> : <option value="reopened">Reopen issue</option>}
                                </select>
                                {action !== "resolved" && <><label className="form-label" htmlFor="issue-next-date">Next follow-up (blank clears reminder)</label>
                                    <input id="issue-next-date" type="date" className="form-control mb-3" min={todayCalendarDate()} value={followUpDate}
                                        onChange={(event) => setFollowUpDate(event.target.value)} disabled={busy} /></>}
                                <label className="form-label" htmlFor="issue-action-note">Private {action === "resolved" ? "resolution" : "update"} note</label>
                                <textarea id="issue-action-note" className="form-control" minLength={action === "resolved" ? 10 : 5} maxLength={500} rows="2" required
                                    value={actionNote} onChange={(event) => setActionNote(event.target.value)} disabled={busy} />
                                <div className="d-flex gap-2 mt-3"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save action</button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedId(null)} disabled={busy}>Cancel</button></div>
                            </form>}
                        </section>)}</div>
                    </>}
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={reload} disabled={loading || busy}>Refresh</button>
                    <button type="button" className="btn btn-primary" onClick={close} disabled={busy}>Close</button></div>
            </div></div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default TripIssuesModal;
