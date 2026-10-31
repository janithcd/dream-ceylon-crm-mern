import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate } from "../utils/calendarDate";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";

const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formFrom = (data) => ({
    supplierName: data.current?.supplierName || "", supplierEmail: data.current?.supplierEmail || "",
    invoiceReference: data.current?.invoiceReference || "", guestReference: data.current?.guestReference || "",
    transferAmount: data.current?.transferAmount ?? "", transferCurrency: data.current?.transferCurrency || data.payment.currency,
    transferReference: data.current?.transferReference ?? data.payment.reference ?? "", changeReason: "", confirmed: false,
});

const SupplierPaymentVoucherModal = ({ costId, paymentId, onClose, onSaved }) => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission("cost.manage");
    const [data, setData] = useState(null);
    const [form, setForm] = useState(null);
    const [draft, setDraft] = useState(null);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    const closeRef = useRef(onClose);
    const savingRef = useRef(false);
    const endpoint = `/finance/costs/${costId}/payments/${paymentId}/remittance`;

    useEffect(() => { closeRef.current = onClose; }, [onClose]);
    useEffect(() => {
        let active = true;
        api.get(endpoint).then(({ data: result }) => {
            if (!active) return;
            setData(result);
            setForm(formFrom(result));
            setDraft(result.draft);
            setEditing(!result.current);
        }).catch((err) => {
            if (active) setError(err.response?.data?.message || "Could not load this payment voucher.");
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [endpoint, reloadKey]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape" && !savingRef.current) {
                event.preventDefault();
                closeRef.current();
            }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, select, textarea, a[href], summary")]
                .filter((element) => !element.matches(":disabled") && element.offsetParent !== null);
            const first = controls[0], last = controls.at(-1);
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
        setLoading(true); setData(null); setForm(null); setDraft(null);
        setError(""); setStatus(""); setReloadKey((value) => value + 1);
    };
    const edit = (field, value) => {
        setForm((current) => ({ ...current, [field]: value, ...(field !== "confirmed" ? { confirmed: false } : {}) }));
        setError(""); setStatus("");
    };
    const save = async (event) => {
        event.preventDefault();
        savingRef.current = true;
        setSaving(true); setError(""); setStatus("");
        try {
            const { data: result } = await api.put(endpoint, { ...form, expectedVersion: data.version });
            setData(result); setForm(formFrom(result)); setDraft(result.draft); setEditing(false);
            setStatus("Voucher saved. Download the PDF and attach it with the bank confirmation when sending your email.");
            onSaved();
        } catch (err) {
            setError(err.response?.data?.message || "Could not save the payment voucher.");
        } finally { setSaving(false); savingRef.current = false; }
    };
    const download = async () => {
        setDownloading(true); setError("");
        try {
            const response = await api.post(`${endpoint}/pdf`, { revision: data.current.revision }, { responseType: "blob" });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement("a");
            link.href = url; link.download = `${data.voucherNumber}-r${data.current.revision}.pdf`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus("PDF downloaded. Attach it and your bank confirmation to the email; files are not attached automatically.");
        } catch (err) {
            let message = err.response?.data?.message;
            if (err.response?.data instanceof Blob) {
                try { message = JSON.parse(await err.response.data.text()).message; } catch { /* Use fallback. */ }
            }
            setError(message || "Could not download the payment voucher.");
        } finally { setDownloading(false); }
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(`To: ${draft.recipient}\nSubject: ${draft.subject}\n\n${draft.body}`);
            setStatus("Email copied. Paste it into Zoho Mail, check the recipient, and attach the bank confirmation and voucher.");
        } catch {
            bodyRef.current?.focus(); bodyRef.current?.select();
            setStatus("Email body selected. Press Ctrl+C or Command+C to copy it.");
        }
    };
    const shareReady = Boolean(data?.current) && !editing && !loading;
    const mailto = shareReady && draft ? buildSupplierMailtoUrl(draft) : "";
    const editDraft = (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setStatus(""); };

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="supplier-voucher-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div className="modal-content">
                <div className="modal-header">
                    <h5 id="supplier-voucher-title" className="modal-title">Supplier payment voucher</h5>
                    <button type="button" className="btn-close" aria-label="Close payment voucher" disabled={saving} onClick={onClose} />
                </div>
                <div className="modal-body">
                    {loading && <p className="text-muted" role="status">Loading payment details...</p>}
                    {error && <div className="alert alert-danger" role="alert">{error}</div>}
                    {!loading && <button type="button" className="btn btn-sm btn-outline-secondary mb-3" disabled={saving || downloading} onClick={reload}>Reload saved details</button>}
                    {!loading && data && form && <>
                        <p className="mb-1"><strong>{data.bookingCode}</strong> · {data.costDescription}</p>
                        <p className="small text-muted">Recorded payment: {money(data.payment.amount, data.payment.currency)} · {formatCalendarDate(data.payment.paymentDate)} · {data.payment.method}</p>
                        <p className="small">Create remittance advice for this payment. Enter the amount actually sent to the supplier, excluding bank charges. For a different currency, use the agreed amount from the bank confirmation.</p>
                        {data.current && <p className="small text-break"><strong>{data.voucherNumber}</strong> · Revision {data.current.revision} · {formatCalendarDate(data.current.issuedAt)}</p>}
                        <form onSubmit={save}>
                            <fieldset disabled={saving || !editing || !canManage}>
                                <div className="row g-3">
                                    <div className="col-md-6"><label className="form-label" htmlFor="voucher-supplier">Supplier / hotel name</label>
                                        <input id="voucher-supplier" className="form-control" maxLength={160} required value={form.supplierName} onChange={(e) => edit("supplierName", e.target.value)} /></div>
                                    <div className="col-md-6"><label className="form-label" htmlFor="voucher-email">Supplier email (optional)</label>
                                        <input id="voucher-email" className="form-control" type="email" maxLength={254} value={form.supplierEmail} onChange={(e) => edit("supplierEmail", e.target.value)} /></div>
                                    <div className="col-md-6"><label className="form-label" htmlFor="voucher-invoice">Invoice / pro forma reference</label>
                                        <input id="voucher-invoice" className="form-control" maxLength={80} required value={form.invoiceReference} onChange={(e) => edit("invoiceReference", e.target.value)} /></div>
                                    <div className="col-md-6"><label className="form-label" htmlFor="voucher-guest">Guest / reservation reference (optional)</label>
                                        <input id="voucher-guest" className="form-control" maxLength={200} value={form.guestReference} onChange={(e) => edit("guestReference", e.target.value)} placeholder="Guest name, stay dates or hotel reference" /></div>
                                    <div className="col-md-4"><label className="form-label" htmlFor="voucher-amount">Actual amount sent</label>
                                        <input id="voucher-amount" className="form-control" type="number" min="0.01" max="1000000000" step="0.01" required value={form.transferAmount} onChange={(e) => edit("transferAmount", e.target.value)} /></div>
                                    <div className="col-md-3"><label className="form-label" htmlFor="voucher-currency">Currency sent</label>
                                        <select id="voucher-currency" className="form-select" value={form.transferCurrency} onChange={(e) => edit("transferCurrency", e.target.value)}>
                                            {["USD", "LKR", "EUR", "GBP"].map((currency) => <option key={currency}>{currency}</option>)}
                                        </select></div>
                                    <div className="col-md-5"><label className="form-label" htmlFor="voucher-reference">Transaction reference</label>
                                        <input id="voucher-reference" className="form-control" maxLength={100} required={["Bank transfer", "Card"].includes(data.payment.method)} value={form.transferReference} onChange={(e) => edit("transferReference", e.target.value)} /></div>
                                    {editing && data.current && <div className="col-12"><label className="form-label" htmlFor="voucher-reason">Reason for correction (internal)</label>
                                        <input id="voucher-reason" className="form-control" minLength={3} maxLength={300} required value={form.changeReason} onChange={(e) => edit("changeReason", e.target.value)} />
                                        <small className="text-muted">Saving creates a new revision and retains the previous details.</small></div>}
                                    {editing && canManage && <div className="col-12"><div className="form-check">
                                        <input id="voucher-confirm" type="checkbox" className="form-check-input" required checked={form.confirmed} onChange={(e) => edit("confirmed", e.target.checked)} />
                                        <label htmlFor="voucher-confirm" className="form-check-label">I checked the supplier, invoice and actual transfer details against the payment confirmation.</label>
                                    </div></div>}
                                </div>
                            </fieldset>
                            {editing && canManage && <div className="d-flex gap-2 mt-3">
                                <button type="submit" className="btn btn-primary" disabled={saving || !form.confirmed}>{saving ? "Saving..." : data.current ? "Save corrected voucher" : "Save payment voucher"}</button>
                                {data.current && <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => { setEditing(false); setForm(formFrom(data)); setError(""); }}>Cancel correction</button>}
                            </div>}
                        </form>
                        {shareReady && canManage && <button type="button" className="btn btn-sm btn-outline-secondary mt-3" disabled={downloading} onClick={() => { setEditing(true); setForm(formFrom(data)); setStatus(""); }}>Correct voucher details</button>}
                        {!data.current && !canManage && <p className="text-muted mt-3">A staff member with permission to manage costs must save the voucher details first.</p>}
                        {data.history.length > 0 && <details className="mt-3 small"><summary>Voucher revision history ({data.history.length})</summary>
                            <ul className="list-unstyled mt-2">{data.history.slice().reverse().map((revision) => <li className="border-bottom py-2" key={revision.revision}>
                                <strong>Revision {revision.revision}</strong> · {revision.recordedByName} · {formatCalendarDate(revision.issuedAt)}
                                <div>{revision.supplierName} · {revision.invoiceReference} · {money(revision.transferAmount, revision.transferCurrency)}</div>
                                <div>{revision.supplierEmail} {revision.guestReference && `· ${revision.guestReference}`}</div>
                                {revision.transferReference && <div>Transaction reference: {revision.transferReference}</div>}
                                {revision.changeReason && <div>Reason: {revision.changeReason}</div>}
                            </li>)}</ul>
                        </details>}
                        {shareReady && draft && <section className="border-top mt-4 pt-3" aria-labelledby="voucher-email-heading">
                            <h6 id="voucher-email-heading" className="fw-bold">Email to supplier</h6>
                            <p className="small text-muted">Review this draft, then send it from your business email or paste it into Zoho Mail. Attach the bank confirmation and downloaded voucher yourself. The CRM does not send this email or track delivery.</p>
                            <label className="form-label" htmlFor="voucher-draft-to">To</label>
                            <input id="voucher-draft-to" className="form-control mb-3" type="email" maxLength={254} value={draft.recipient} onChange={(e) => editDraft("recipient", e.target.value)} />
                            <label className="form-label" htmlFor="voucher-draft-subject">Subject</label>
                            <input id="voucher-draft-subject" className="form-control mb-3" maxLength={160} value={draft.subject} onChange={(e) => editDraft("subject", e.target.value)} />
                            <label className="form-label" htmlFor="voucher-draft-body">Message</label>
                            <textarea id="voucher-draft-body" ref={bodyRef} className="form-control" rows={12} maxLength={1800} value={draft.body} onChange={(e) => editDraft("body", e.target.value)} />
                            <small className="text-muted d-block mt-2">Email edits apply to this draft only. Use Correct voucher details to update the saved PDF.</small>
                            {!mailto && <small className="text-muted d-block mt-2">Enter one valid recipient, subject and message to open your email app. You can still copy the draft.</small>}
                        </section>}
                    </>}
                    {status && <div className="alert alert-info mt-3 mb-0" role="status">{status}</div>}
                </div>
                <div className="modal-footer flex-wrap">
                    <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={onClose}>Close</button>
                    {shareReady && <>
                        {hasPermission("pdf.generate") && <button type="button" className="btn btn-primary" disabled={downloading} onClick={download}>{downloading ? "Preparing PDF..." : "Download voucher PDF"}</button>}
                        <button type="button" className="btn btn-outline-primary" onClick={copy} disabled={!draft?.body.trim()}>Copy email</button>
                        {mailto && <a className="btn btn-outline-primary" href={mailto}>Open email app</a>}
                    </>}
                </div>
            </div></div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default SupplierPaymentVoucherModal;
