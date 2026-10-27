import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { buildWhatsAppUrl } from "../utils/whatsappFollowUp";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, todayCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const PostTripCareModal = ({ booking, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [care, setCare] = useState(null);
    const [draft, setDraft] = useState(null);
    const [action, setAction] = useState("contacted");
    const [channel, setChannel] = useState("WhatsApp");
    const [note, setNote] = useState("");
    const [rating, setRating] = useState("");
    const [recoveryAction, setRecoveryAction] = useState("recovery-plan");
    const [recoveryNote, setRecoveryNote] = useState("");
    const [recoveryChannel, setRecoveryChannel] = useState("Phone");
    const [recoveryDueDate, setRecoveryDueDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const dialogRef = useRef(null);
    const messageRef = useRef(null);
    const closeRef = useRef(onClose);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${booking._id}/post-trip-care`)
            .then(({ data }) => {
                if (!active) return;
                setCare(data);
                setAction(data.status === "Feedback received" ? "feedback" : data.status === "Declined" ? "declined" : data.status === "Contacted" ? "feedback" : "contacted");
                setNote(data.status === "Feedback received" ? data.feedbackNote : "");
                setRating(data.feedbackRating == null ? "" : String(data.feedbackRating));
                setChannel(data.lastContactChannel || "WhatsApp");
                setRecoveryAction(data.recovery?.status === "Resolved" ? "recovery-reopen" : "recovery-plan");
                setRecoveryDueDate(toCalendarDateInput(data.recovery?.nextFollowUpDate));
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load post-trip care."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [booking._id]);

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

    const draftChanged = Boolean(draft && (draft.number !== draft.originalNumber || draft.message !== draft.originalMessage));
    const close = () => {
        if (busy || (draftChanged && !window.confirm("Discard the edited message draft?"))) return;
        onClose();
    };
    closeRef.current = close;

    const prepare = async () => {
        if (busy) return;
        setBusy(true); setError(""); setStatus("");
        try {
            const { data } = await api.get(`/bookings/${booking._id}/post-trip-message`);
            setDraft({ ...data, originalNumber: data.number, originalMessage: data.message });
        } catch (err) {
            setError(err.response?.data?.message || "Could not prepare the message. Refresh the booking.");
        } finally { setBusy(false); }
    };
    const copy = async () => {
        if (!draft?.message.trim()) return;
        try {
            await navigator.clipboard.writeText(draft.message);
            setStatus("Message copied. Review the recipient and send it yourself.");
        } catch {
            messageRef.current?.focus(); messageRef.current?.select();
            setStatus("The message is selected. Press Ctrl+C or Command+C to copy it.");
        }
    };
    const save = async (event) => {
        event.preventDefault();
        if (busy || !care || !canUpdate) return;
        if (action === "contacted" && !window.confirm("Record that you actually contacted this guest? Preparing or opening a message alone does not count.")) return;
        if (action === "declined" && !window.confirm("Record that the guest declined further post-trip contact?")) return;
        setBusy(true); setError(""); setStatus("");
        try {
            await api.patch(`/bookings/${booking._id}/post-trip-care`, {
                action, expectedRevision: care.revision,
                channel: action === "contacted" ? channel : undefined,
                rating: action === "feedback" && rating ? Number(rating) : null,
                note,
            });
            onChanged();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || "Could not save the post-trip record. Reload and try again.");
        } finally { setBusy(false); }
    };
    const saveRecovery = async (event) => {
        event.preventDefault();
        if (busy || !canUpdate || !care?.recovery) return;
        if (recoveryAction === "recovery-contact" && !window.confirm("Record that you actually contacted this guest about their feedback?")) return;
        setBusy(true); setError(""); setStatus("");
        try {
            await api.patch(`/bookings/${booking._id}/post-trip-care`, {
                action: recoveryAction, expectedRevision: care.revision,
                note: recoveryNote, nextFollowUpDate: recoveryAction === "recovery-resolve" ? null : recoveryDueDate || null,
                channel: recoveryAction === "recovery-contact" ? recoveryChannel : undefined,
            });
            onChanged(); onClose();
        } catch (err) {
            setError(err.response?.data?.message || "Could not save recovery. Reload and try again.");
        } finally { setBusy(false); }
    };
    const messageUrl = draft ? buildWhatsAppUrl(draft.number, draft.message) : "";

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="post-trip-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div className="modal-content">
                <div className="modal-header"><h5 id="post-trip-title" className="modal-title">Post-trip care · {booking.bookingCode}</h5>
                    <button type="button" className="btn-close" aria-label="Close post-trip care" onClick={close} /></div>
                <div className="modal-body">
                    {loading && <p role="status">Loading the latest post-trip record...</p>}
                    {error && <div className="alert alert-danger" role="alert">{error}</div>}
                    {!loading && care && <>
                        <p className="mb-2"><strong>{booking.customerName}</strong> · {care.status}</p>
                        <p className="small text-muted">{care.contactCount} recorded {care.contactCount === 1 ? "contact" : "contacts"}{care.lastContactChannel ? ` · Last channel: ${care.lastContactChannel}` : ""}. The draft below is editable and opening WhatsApp does not mark a message as sent.</p>
                        {care.contactNote && <p className="small"><strong>Last contact note:</strong> {care.contactNote}</p>}
                        {care.feedbackNote && <p className="small"><strong>Feedback note:</strong> {care.feedbackNote}</p>}
                        {care.feedbackRating != null && <p className="small"><strong>Recorded rating:</strong> {care.feedbackRating} / 5</p>}
                        {care.recovery && <section className="border border-warning rounded p-3 mb-4" aria-labelledby="recovery-title">
                            <h6 id="recovery-title">Service recovery · {care.recovery.status}</h6>
                            <p className="small text-muted">Ratings of 1–3 need an explicit follow-up and resolution. Staff contact the guest themselves; recording a plan does not send a message.</p>
                            {care.recovery.nextFollowUpDate && <p className="small">Next follow-up: <strong>{formatCalendarDate(care.recovery.nextFollowUpDate)}</strong></p>}
                            {care.recovery.resolvedAt && <p className="small">Resolved {formatCalendarDate(care.recovery.resolvedAt)}</p>}
                            {care.recovery.events.length > 0 && <div className="mb-3"><strong className="small">Recovery history</strong>
                                <ul className="small mt-2 ps-3 mb-0">{care.recovery.events.map((entry, index) => <li key={`${entry.at}-${index}`} className="mb-2 text-break">
                                    <strong>{entry.action === "contact" ? `Contacted by ${entry.channel}` : entry.action === "plan" ? "Follow-up planned" : entry.action === "resolve" ? "Resolved" : "Reopened"}</strong>
                                    {` · ${new Date(entry.at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} · ${entry.byName || "Staff"}`}
                                    <div>{entry.note}</div>
                                    {entry.nextFollowUpDate && <div>Next follow-up: {formatCalendarDate(entry.nextFollowUpDate)}</div>}
                                </li>)}</ul>
                            </div>}
                            {canUpdate && <form onSubmit={saveRecovery}>
                                <label className="form-label" htmlFor="recovery-action">Recovery action</label>
                                <select id="recovery-action" className="form-select mb-3" value={recoveryAction} disabled={busy}
                                    onChange={(event) => { setRecoveryAction(event.target.value); setRecoveryNote(""); }}>
                                    {care.recovery.status === "Resolved" ? <option value="recovery-reopen">Reopen recovery</option> : <>
                                        <option value="recovery-plan">Plan follow-up</option>
                                        <option value="recovery-contact">Record actual guest contact</option>
                                        <option value="recovery-resolve">Record resolution</option>
                                    </>}
                                </select>
                                {recoveryAction === "recovery-contact" && <><label className="form-label" htmlFor="recovery-channel">Contact channel</label>
                                    <select id="recovery-channel" className="form-select mb-3" value={recoveryChannel} onChange={(event) => setRecoveryChannel(event.target.value)} disabled={busy}>
                                        {["Phone", "WhatsApp", "Email", "Other"].map((item) => <option key={item}>{item}</option>)}
                                    </select></>}
                                {recoveryAction !== "recovery-resolve" && <><label className="form-label" htmlFor="recovery-date">Next follow-up date{recoveryAction === "recovery-plan" ? " (required)" : " (blank clears reminder)"}</label>
                                    <input id="recovery-date" type="date" className="form-control mb-3" value={recoveryDueDate} min={todayCalendarDate()}
                                        onChange={(event) => setRecoveryDueDate(event.target.value)} required={recoveryAction === "recovery-plan"} disabled={busy} /></>}
                                <label className="form-label" htmlFor="recovery-note">Private {recoveryAction === "recovery-resolve" ? "resolution" : "follow-up"} note</label>
                                <textarea id="recovery-note" className="form-control" rows="3" maxLength={500} minLength={recoveryAction === "recovery-resolve" ? 10 : 5}
                                    value={recoveryNote} onChange={(event) => setRecoveryNote(event.target.value)} required disabled={busy}
                                    placeholder={recoveryAction === "recovery-resolve" ? "What was resolved and how?" : "What happened or what should be done next?"} />
                                <button type="submit" className="btn btn-outline-primary mt-3" disabled={busy || !recoveryNote.trim() || (recoveryAction === "recovery-plan" && !recoveryDueDate)}>
                                    {busy ? "Saving..." : "Save recovery action"}</button>
                            </form>}
                        </section>}
                        {canUpdate && !["Feedback received", "Declined"].includes(care.status) && <>
                            <button type="button" className="btn btn-sm btn-outline-primary mb-3" onClick={prepare} disabled={busy}>Prepare thank-you message</button>
                            {draft && <div className="border rounded p-3 mb-4">
                                <label className="form-label" htmlFor="post-trip-number">Guest WhatsApp number</label>
                                <input id="post-trip-number" className="form-control mb-3" value={draft.number} onChange={(event) => setDraft({ ...draft, number: event.target.value })} maxLength={32} />
                                <label className="form-label" htmlFor="post-trip-message">Editable message</label>
                                <textarea id="post-trip-message" ref={messageRef} className="form-control" rows="7" value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} maxLength={3000} />
                                <div className="d-flex flex-wrap gap-2 mt-3">
                                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copy} disabled={!draft.message.trim()}>Copy message</button>
                                    {messageUrl && <a className="btn btn-sm btn-success" href={messageUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
                                </div>
                                {!messageUrl && <p className="small text-muted mt-2 mb-0">Enter a valid international number and message to open WhatsApp. You can still copy the message.</p>}
                                {status && <p className="small text-success mt-2 mb-0" role="status">{status}</p>}
                            </div>}
                        </>}
                        {canUpdate && care.careWindowOpen && care.status !== "Declined" && <form onSubmit={save}>
                            <h6>Record an actual action</h6>
                            <label className="form-label" htmlFor="post-trip-action">Action</label>
                            <select id="post-trip-action" className="form-select mb-3" value={action} onChange={(event) => {
                                setAction(event.target.value); setNote(event.target.value === "feedback" ? care.feedbackNote : "");
                                setRating(event.target.value === "feedback" && care.feedbackRating != null ? String(care.feedbackRating) : "");
                            }} disabled={busy}>
                                {care.status !== "Feedback received" && <option value="contacted">Guest contacted</option>}
                                <option value="feedback">Feedback received</option>
                                {care.status !== "Feedback received" && <option value="declined">Guest declined contact</option>}
                            </select>
                            {action === "contacted" && <><label className="form-label" htmlFor="post-trip-channel">Contact channel</label>
                                <select id="post-trip-channel" className="form-select mb-3" value={channel} onChange={(event) => setChannel(event.target.value)} disabled={busy}>
                                    {["WhatsApp", "Email", "Phone", "Other"].map((item) => <option key={item}>{item}</option>)}
                                </select></>}
                            {action === "feedback" && <><label className="form-label" htmlFor="post-trip-rating">Guest rating, if provided</label>
                                <select id="post-trip-rating" className="form-select mb-3" value={rating} onChange={(event) => setRating(event.target.value)} disabled={busy || Boolean(care.recovery?.events.length)}>
                                    <option value="">Not given</option>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
                                </select>{care.recovery?.events.length > 0 && <p className="small text-muted">The rating is locked after a recovery action. Add corrections in the recovery history.</p>}</>}
                            <label className="form-label" htmlFor="post-trip-note">Private {action === "feedback" ? "feedback" : action === "declined" ? "outcome" : "contact"} note</label>
                            <textarea id="post-trip-note" className="form-control" rows="3" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} placeholder={action === "feedback" ? "What did the guest say? A note or rating is required." : "Optional internal note"} />
                            <button type="submit" className="btn btn-primary mt-3" disabled={busy || (action === "feedback" && !note.trim() && !rating)}>{busy ? "Saving..." : "Save post-trip record"}</button>
                        </form>}
                    </>}
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>Close</button></div>
            </div></div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default PostTripCareModal;
