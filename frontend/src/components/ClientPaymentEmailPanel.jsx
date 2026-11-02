import { useEffect, useState } from "react";
import api from "../api/axios";

const formatCents = (value, currency) => `${currency} ${(value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const ClientPaymentEmailPanel = ({ payment, onClose, onSent, canSend }) => {
    const [chargedAmount, setChargedAmount] = useState("");
    const [preview, setPreview] = useState(null);
    const [confirmed, setConfirmed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const loadPreview = async (amount = "") => {
        setLoading(true);
        setConfirmed(false);
        setPreview(null);
        setError("");
        try {
            const response = await api.post(`/booking-pdf/payment-email/${payment._id}/preview`, {
                chargedAmount: payment.paymentMethod === "PayHere" ? amount : undefined,
            });
            setPreview(response.data);
        } catch (err) {
            setError(err.response?.data?.message || "Could not prepare the email preview.");
        } finally { setLoading(false); }
    };

    useEffect(() => {
        let active = true;
        api.post(`/booking-pdf/payment-email/${payment._id}/preview`, {
            chargedAmount: payment.paymentMethod === "PayHere" ? "" : undefined,
        }).then(({ data }) => { if (active) setPreview(data); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not prepare the email preview."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [payment._id, payment.paymentMethod]);

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(`Subject: ${preview.subject}\nTo: ${preview.to}\n\n${preview.textbody}`);
            setCopied(true);
        } catch { setError("Could not copy the email. Select the text below and copy it manually."); }
    };

    const sendEmail = async () => {
        setSending(true);
        setError("");
        try {
            const response = await api.post(`/booking-pdf/payment-email/${payment._id}/send`, {
                chargedAmount: payment.paymentMethod === "PayHere" ? chargedAmount : undefined,
                fingerprint: preview.fingerprint, confirmRecipient: confirmed,
            });
            onSent(`Zoho accepted the receipt and statement email to ${response.data.to}. Check Zoho for final delivery.`);
        } catch (err) {
            const message = err.response?.data?.message || "Email delivery could not be confirmed. Check Zoho before retrying.";
            // Recheck status; an uncertain provider response must not be sent again by accident.
            await loadPreview(chargedAmount);
            setError(message);
        } finally { setSending(false); }
    };

    const blocked = preview?.deliveryStatus && preview.deliveryStatus !== "Rejected";
    return <div className="card border-primary-subtle bg-light mb-4" aria-label="Client payment email review">
        <div className="card-body">
            <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <h5 className="mb-1">Review payment email</h5>
                    <p className="text-muted small mb-3">Payment {payment.paymentNo}. The receipt and current guest payment statement will be generated at send time.</p>
                </div>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={sending}>Close</button>
            </div>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {loading && <p role="status">Checking booking and payment history...</p>}
            {payment.paymentMethod === "PayHere" && <div className="mb-3">
                <label className="form-label" htmlFor="verified-card-charge">Verified PayHere total charged ({payment.currency})</label>
                <input id="verified-card-charge" type="text" inputMode="decimal" className="form-control"
                    placeholder="For example, 682.89" value={chargedAmount} onChange={(event) => {
                        setChargedAmount(event.target.value); setPreview(null); setConfirmed(false); setCopied(false);
                    }} maxLength={13} disabled={loading || sending} />
                <div className="form-text">Use the actual PayHere transaction total, including any processing fee. The CRM will show the fee separately from the booking payment.</div>
                <button type="button" className="btn btn-sm btn-outline-primary mt-2"
                    onClick={() => loadPreview(chargedAmount)} disabled={loading || sending || !chargedAmount}>Update preview</button>
            </div>}
            {preview && <>
                <p className="mb-2"><strong>To:</strong> {preview.to}</p>
                {preview.from && <p className="mb-2"><strong>From:</strong> {preview.from}</p>}
                {preview.deliveryStatus && <div className="alert alert-warning">
                    Previous email status: <strong>{preview.deliveryStatus}</strong>. {preview.deliveryStatus === "Rejected"
                        ? "Correct the sender setup, then preview again before retrying."
                        : "Check the activity log and Zoho; sending again is blocked for this payment."}
                </div>}
                {preview.ready && <>
                    <p className="mb-1"><strong>Tour payment:</strong> {formatCents(preview.amountCents, preview.currency)}</p>
                    <p className="mb-1"><strong>Card charge:</strong> {formatCents(preview.chargeCents, preview.currency)}</p>
                    <p className="mb-2"><strong>Processing fee:</strong> {formatCents(preview.feeCents, preview.currency)} · <strong>Remaining:</strong> {formatCents(preview.balanceCents, preview.currency)}</p>
                    <p className="mb-1"><strong>Attachments:</strong></p>
                    <ul className="small">{preview.attachments.map((name) => <li key={name}>{name}</li>)}</ul>
                    <p className="mb-1"><strong>Subject:</strong> {preview.subject}</p>
                    <div className="border bg-white p-3 rounded mb-3" style={{ whiteSpace: "pre-wrap" }}>{preview.textbody}</div>
                    <button type="button" className="btn btn-outline-secondary btn-sm me-2" onClick={copyEmail}>
                        {copied ? "Copied" : "Copy email for Zoho Mail"}
                    </button>
                    {!preview.senderConfigured && <p className="small text-muted mt-2 mb-0">
                        Automatic sending needs a configured Zoho CPaaS sender. For now, download both PDFs from this payment panel and attach them in Zoho Mail.
                    </p>}
                    {canSend && preview.senderConfigured && !blocked && <div className="mt-3">
                        <label className="d-flex gap-2 align-items-start mb-2">
                            <input type="checkbox" className="form-check-input mt-1" checked={confirmed}
                                onChange={(event) => setConfirmed(event.target.checked)} />
                            <span>I verified the saved guest email, payment details, PayHere charge if applicable, and both documents.</span>
                        </label>
                        <button type="button" className="btn btn-success" onClick={sendEmail}
                            disabled={!confirmed || sending || loading}>
                            {sending ? "Sending..." : "Send receipt and statement"}
                        </button>
                    </div>}
                </>}
                {!preview.ready && <p className="text-muted mb-0">{preview.message}</p>}
            </>}
        </div>
    </div>;
};

export default ClientPaymentEmailPanel;
