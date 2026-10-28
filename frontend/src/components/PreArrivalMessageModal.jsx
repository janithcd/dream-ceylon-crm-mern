import { useEffect, useRef, useState } from "react";
import { FaCopy, FaWhatsapp } from "react-icons/fa";
import api from "../api/axios";
import { buildWhatsAppUrl } from "../utils/whatsappFollowUp";

const PreArrivalMessageModal = ({ bookingId, onClose }) => {
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const dialogRef = useRef(null);
    const messageRef = useRef(null);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/pre-arrival-message`)
            .then(({ data }) => { if (active) setDraft(data); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to prepare the pre-arrival message."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, reloadKey]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, textarea")]
                .filter((element) => !element.disabled && element.offsetParent !== null);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first) return;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        dialog?.addEventListener("keydown", handleKey);
        return () => {
            dialog?.removeEventListener("keydown", handleKey);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [onClose]);

    const reload = () => {
        setDraft(null);
        setLoading(true);
        setError("");
        setStatus("");
        setReloadKey((value) => value + 1);
    };
    const edit = (field, value) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setError("");
        setStatus("");
    };
    const openWhatsApp = (event) => {
        event.preventDefault();
        if (!draft || loading) return;
        const url = buildWhatsAppUrl(draft.number, draft.message);
        if (!url) {
            setError("Enter a full international number with country code and a message.");
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };
    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(draft.message);
            setStatus("Message copied. You can paste it into your preferred chat.");
        } catch {
            messageRef.current?.focus();
            messageRef.current?.select();
            setStatus("Message selected. Press Ctrl+C or Command+C to copy it.");
        }
    };

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="pre-arrival-message-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <form className="modal-content" onSubmit={openWhatsApp}>
                    <div className="modal-header">
                        <h5 className="modal-title" id="pre-arrival-message-title">Pre-arrival message{draft?.bookingCode && ` · ${draft.bookingCode}`}</h5>
                        <button type="button" className="btn-close" aria-label="Close pre-arrival message" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        {loading && <p className="text-muted" role="status">Loading the latest booking details...</p>}
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {!loading && !draft && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                        {!loading && draft && <>
                            <p className="text-muted">Review all arrangements and the guest number before sharing. This opens WhatsApp for you to send; it does not record contact in the CRM.</p>
                            <p><strong>Guest:</strong> {draft.guestName}</p>
                            {draft.reviewItems.length > 0 && <div className="alert alert-warning small">
                                <strong>Check before sharing:</strong>
                                <ul className="mb-0 mt-2">{draft.reviewItems.map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>}
                            <label className="form-label fw-semibold" htmlFor="pre-arrival-number">Guest WhatsApp number</label>
                            <input id="pre-arrival-number" type="tel" className="form-control" autoFocus value={draft.number}
                                onChange={(event) => edit("number", event.target.value)} placeholder="+44 7700 900123" />
                            <small className="text-muted d-block mt-1 mb-3">Include the country code. Local numbers are not converted automatically.</small>
                            <label className="form-label fw-semibold" htmlFor="pre-arrival-message">Message</label>
                            <textarea ref={messageRef} id="pre-arrival-message" className="form-control" rows="12" value={draft.message}
                                onChange={(event) => edit("message", event.target.value)} />
                            <small className="text-muted d-block mt-2">Edits here apply only to this draft. Refresh to rebuild it from the latest saved booking.</small>
                            {status && <div className="alert alert-info mt-3 mb-0" role="status">{status}</div>}
                        </>}
                    </div>
                    <div className="modal-footer flex-wrap">
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        {draft && !loading && <>
                            <button type="button" className="btn btn-outline-secondary" onClick={reload}>Refresh draft</button>
                            <button type="button" className="btn btn-outline-secondary" onClick={copyMessage} disabled={!draft.message.trim()}><FaCopy className="me-2" />Copy message</button>
                            <button type="submit" className="btn btn-success" disabled={!draft.message.trim()}><FaWhatsapp className="me-2" />Open WhatsApp</button>
                        </>}
                    </div>
                </form>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default PreArrivalMessageModal;
