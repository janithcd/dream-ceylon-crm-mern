import { useEffect, useRef, useState } from "react";
import { FaCopy, FaEnvelope } from "react-icons/fa";
import api from "../api/axios";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";

const HotelSupplierEmailModal = ({ bookingId, stayId, onClose }) => {
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/hotel-stays/${stayId}/confirmation-draft`)
            .then(({ data }) => { if (active) setDraft(data); })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to prepare hotel confirmation request.");
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, stayId, reloadKey]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
            }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, textarea, a[href]")]
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
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const reload = () => {
        setDraft(null);
        setError("");
        setStatus("");
        setLoading(true);
        setReloadKey((value) => value + 1);
    };
    const edit = (field, value) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setStatus("");
        setError("");
    };
    const copy = async () => {
        if (!draft) return;
        try {
            await navigator.clipboard.writeText(`To: ${draft.recipient}\nSubject: ${draft.subject}\n\n${draft.body}`);
            setStatus("Email details copied. Review the recipient before sending from your email app.");
        } catch {
            bodyRef.current?.focus();
            bodyRef.current?.select();
            setStatus("The email body is selected. Press Ctrl+C or Command+C to copy it.");
        }
    };
    const mailto = draft ? buildSupplierMailtoUrl(draft) : "";

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="hotel-supplier-email-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title" id="hotel-supplier-email-title">Hotel confirmation request{draft?.bookingCode && ` · ${draft.bookingCode}`}</h5>
                        <button type="button" className="btn-close" aria-label="Close hotel email draft" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        {loading && <p className="text-muted" role="status">Loading the latest saved hotel request...</p>}
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {!loading && !draft && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                        {!loading && draft && <>
                            <p className="text-muted">Review the recipient, dates, rooms, and meal plan. Open your email app to send it yourself. Preparing this draft does not mark the supplier contacted or confirm the stay.</p>
                            <p><strong>Hotel:</strong> {draft.hotelName}</p>
                            {draft.missingDetails.length > 0 && <div className="alert alert-warning small">Missing from the saved stay: {draft.missingDetails.join(", ")}. Review those details before sending.</div>}
                            <label htmlFor="hotel-supplier-recipient" className="form-label fw-semibold">Supplier email</label>
                            <input id="hotel-supplier-recipient" type="email" className="form-control mb-3" value={draft.recipient} onChange={(event) => edit("recipient", event.target.value)} placeholder="reservations@hotel.com" maxLength={254} autoFocus />
                            <label htmlFor="hotel-supplier-subject" className="form-label fw-semibold">Subject</label>
                            <input id="hotel-supplier-subject" className="form-control mb-3" value={draft.subject} onChange={(event) => edit("subject", event.target.value)} maxLength={160} />
                            <label htmlFor="hotel-supplier-body" className="form-label fw-semibold">Message</label>
                            <textarea id="hotel-supplier-body" ref={bodyRef} className="form-control" rows="15" value={draft.body} onChange={(event) => edit("body", event.target.value)} maxLength={1800} />
                            {!mailto && <small className="text-muted d-block mt-2">Enter a valid supplier email, subject, and message to open your email app. You can still copy the draft.</small>}
                            <small className="text-muted d-block mt-2">Edits here apply only to this draft. Save a recurring address in the hotel's stay details.</small>
                            {status && <div className="alert alert-info mt-3 mb-0" role="status">{status}</div>}
                        </>}
                    </div>
                    <div className="modal-footer flex-wrap">
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        {draft && !loading && <>
                            <button type="button" className="btn btn-outline-secondary" onClick={copy} disabled={!draft.body.trim()}><FaCopy className="me-2" />Copy email details</button>
                            {mailto && <a className="btn btn-primary" href={mailto}><FaEnvelope className="me-2" />Open email app</a>}
                        </>}
                    </div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default HotelSupplierEmailModal;
