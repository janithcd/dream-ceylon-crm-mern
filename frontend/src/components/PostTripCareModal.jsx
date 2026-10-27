import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { buildWhatsAppUrl } from "../utils/whatsappFollowUp";
import { usePermissions } from "../context/PermissionContext";

const PostTripCareModal = ({ booking, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [care, setCare] = useState(null);
    const [draft, setDraft] = useState(null);
    const [action, setAction] = useState("contacted");
    const [channel, setChannel] = useState("WhatsApp");
    const [note, setNote] = useState("");
    const [rating, setRating] = useState("");
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
                        {canUpdate && care.status !== "Declined" && <form onSubmit={save}>
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
                                <select id="post-trip-rating" className="form-select mb-3" value={rating} onChange={(event) => setRating(event.target.value)} disabled={busy}>
                                    <option value="">Not given</option>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
                                </select></>}
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
