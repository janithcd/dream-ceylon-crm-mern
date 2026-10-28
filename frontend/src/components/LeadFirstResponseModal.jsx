import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { buildLeadFirstResponse } from "../utils/leadFirstResponse";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";
import { buildWhatsAppUrl } from "../utils/whatsappFollowUp";

const LeadFirstResponseModal = ({ inquiryId, canContact, onClose }) => {
    const [inquiry, setInquiry] = useState(null);
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const dialogRef = useRef(null);
    const messageRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => {
        let active = true;
        api.get(`/inquiries/${inquiryId}`)
            .then(({ data }) => {
                if (!active) return;
                setInquiry(data);
                setDraft(data.status === "New" && canContact ? buildLeadFirstResponse(data) : null);
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load the latest inquiry."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [inquiryId, canContact, reloadKey]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, textarea, a[href]")]
                .filter((element) => !element.disabled && element.offsetParent !== null);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first) return;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
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
        setInquiry(null); setDraft(null); setError(""); setStatus(""); setLoading(true);
        setReloadKey((value) => value + 1);
    };
    const edit = (field, value) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setStatus("");
    };
    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(draft.message);
            setStatus("Message copied. Send it from your preferred chat, then record contact in the queue.");
        } catch {
            messageRef.current?.focus(); messageRef.current?.select();
            setStatus("Message selected. Press Ctrl+C or Command+C to copy it.");
        }
    };
    const copyEmailDetails = async () => {
        try {
            await navigator.clipboard.writeText(`To: ${draft.email}\nSubject: ${draft.subject}\n\n${draft.message}`);
            setStatus("Email details copied. Review the recipient in your email app before sending, then record contact in the queue.");
        } catch {
            messageRef.current?.focus(); messageRef.current?.select();
            setStatus("Message selected. Press Ctrl+C or Command+C to copy it; enter the recipient and subject separately.");
        }
    };
    const whatsappUrl = draft ? buildWhatsAppUrl(draft.number, draft.message) : "";
    const mailtoUrl = draft ? buildSupplierMailtoUrl({ recipient: draft.email, subject: draft.subject, body: draft.message }) : "";

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="lead-response-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title" id="lead-response-title">Review request{inquiry?.fullName ? ` · ${inquiry.fullName}` : ""}</h5>
                        <button type="button" className="btn-close" aria-label="Close lead request" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        {loading && <p role="status">Loading the latest inquiry...</p>}
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {!loading && !inquiry && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                        {!loading && inquiry && <>
                            <dl className="row mb-3">
                                <dt className="col-sm-3">Guest request</dt><dd className="col-sm-9 text-break" style={{ whiteSpace: "pre-wrap" }}>{inquiry.message}</dd>
                                <dt className="col-sm-3">Travel date</dt><dd className="col-sm-9">{inquiry.travelDate ? formatCalendarDate(inquiry.travelDate) : "Not supplied"}</dd>
                                <dt className="col-sm-3">Travelers</dt><dd className="col-sm-9">{inquiry.numberOfTravelers || "Not supplied"}</dd>
                                <dt className="col-sm-3">Package interest</dt><dd className="col-sm-9">{inquiry.interestedPackage?.title || "Not specified"}</dd>
                            </dl>
                            {inquiry.status !== "New" && <div className="alert alert-warning">This inquiry is now {inquiry.status}. Refresh the New Lead Queue before taking action.</div>}
                            {draft && <>
                                <p className="small text-muted">Review and edit this suggested reply and the recipient. Opening an app or copying text does not send a message or record contact. After sending, close this window and record the actual channel in the queue.</p>
                                <div className="row g-3 mb-3">
                                    <div className="col-md-6"><label className="form-label" htmlFor="lead-response-number">WhatsApp number</label>
                                        <input id="lead-response-number" type="tel" className="form-control" value={draft.number} onChange={(event) => edit("number", event.target.value)} maxLength={40} />
                                        <small className="text-muted">Include country code; local numbers are not converted.</small></div>
                                    <div className="col-md-6"><label className="form-label" htmlFor="lead-response-email">Email address</label>
                                        <input id="lead-response-email" type="email" className="form-control" value={draft.email} onChange={(event) => edit("email", event.target.value)} maxLength={254} /></div>
                                </div>
                                <label className="form-label" htmlFor="lead-response-subject">Email subject</label>
                                <input id="lead-response-subject" className="form-control mb-3" value={draft.subject} onChange={(event) => edit("subject", event.target.value)} maxLength={160} />
                                <label className="form-label" htmlFor="lead-response-message">Suggested message</label>
                                <textarea ref={messageRef} id="lead-response-message" className="form-control" rows="8" value={draft.message} onChange={(event) => edit("message", event.target.value)} maxLength={1800} />
                                {!whatsappUrl && <small className="d-block text-muted mt-2">A full international number and message are needed to open WhatsApp.</small>}
                                {!mailtoUrl && <small className="d-block text-muted mt-2">A valid email, subject, and message are needed to open your email app.</small>}
                                {status && <div className="alert alert-info mt-3 mb-0" role="status">{status}</div>}
                            </>}
                        </>}
                    </div>
                    <div className="modal-footer flex-wrap">
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        {draft && <>
                            <button type="button" className="btn btn-outline-secondary" onClick={copyMessage} disabled={!draft.message.trim()}>Copy message</button>
                            <button type="button" className="btn btn-outline-secondary" onClick={copyEmailDetails} disabled={!draft.email.trim() || !draft.subject.trim() || !draft.message.trim()}>Copy email details</button>
                            {mailtoUrl && <a className="btn btn-outline-primary" href={mailtoUrl}>Open email app</a>}
                            {whatsappUrl && <a className="btn btn-success" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
                        </>}
                    </div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default LeadFirstResponseModal;
