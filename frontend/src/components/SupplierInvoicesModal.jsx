import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

const MAX_BYTES = 5 * 1024 * 1024;
const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blank = () => ({ supplierName: "", invoiceReference: "", invoiceDate: todayCalendarDate(), dueDate: "", amount: "", currency: "USD" });
const fileType = (file) => file?.type || (/\.pdf$/i.test(file?.name) ? "application/pdf" : /\.png$/i.test(file?.name) ? "image/png" : /\.jpe?g$/i.test(file?.name) ? "image/jpeg" : "");

const SupplierInvoicesModal = ({ costId, onClose, onSaved }) => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission("cost.manage");
    const endpoint = `/finance/costs/${costId}/invoices`;
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const [attachId, setAttachId] = useState("");
    const [attachFile, setAttachFile] = useState(null);
    const [approvalId, setApprovalId] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [confirmedDifference, setConfirmedDifference] = useState(false);
    const [disputeId, setDisputeId] = useState("");
    const [disputeNote, setDisputeNote] = useState("");
    const [voidId, setVoidId] = useState("");
    const [voidReason, setVoidReason] = useState("");
    const dialogRef = useRef(null), fileRef = useRef(null), closeRef = useRef(onClose), busyRef = useRef(false);
    useEffect(() => { closeRef.current = onClose; }, [onClose]);

    const reload = useCallback(async () => {
        const { data: result } = await api.get(endpoint, { params: { page } });
        setData(result);
        setForm((current) => current.supplierName || current.amount ? current : { ...current, currency: result.cost.currency });
    }, [endpoint, page]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        api.get(endpoint, { params: { page } }).then(({ data: result }) => {
            if (!active) return;
            setData(result);
            setForm((current) => current.supplierName || current.amount ? current : { ...current, currency: result.cost.currency });
        }).catch((err) => { if (active) setError(err.response?.data?.message || "Could not load supplier invoices."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [endpoint, page]);
    useEffect(() => {
        const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current; dialog?.focus();
        const keydown = (event) => {
            if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, select, textarea, summary")]
                .filter((el) => !el.matches(":disabled") && el.offsetParent !== null);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        dialog?.addEventListener("keydown", keydown);
        return () => { dialog?.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus(); };
    }, []);

    const showError = async (err, fallback) => {
        let message = err.response?.data?.message || err.message;
        if (err.response?.data instanceof Blob) { try { message = JSON.parse(await err.response.data.text()).message; } catch { /* Use fallback. */ } }
        setError(message || fallback);
    };
    const uploadFile = (invoice, selected) => {
        if (!selected || !selected.size || selected.size > MAX_BYTES || !["application/pdf", "image/png", "image/jpeg"].includes(fileType(selected))) {
            throw new Error("Choose a non-empty PDF, PNG or JPEG of at most 5 MB.");
        }
        return api.post(`${endpoint}/${invoice._id}/file`, selected, { params: { expectedVersion: invoice.__v },
            headers: { "Content-Type": fileType(selected), "X-File-Name": encodeURIComponent(selected.name) },
            transformRequest: [(value) => value] });
    };
    const run = async (action, success, changed = true) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError(""); setStatus("");
        try { await action(); await reload(); if (changed) onSaved(); setStatus(success); }
        catch (err) { await showError(err, "Could not update the invoice. Reload and review it."); try { await reload(); } catch { /* Keep the original error. */ } }
        finally { setBusy(false); busyRef.current = false; }
    };
    const save = (event) => {
        event.preventDefault();
        void run(async () => {
            if (!file || !file.size || file.size > MAX_BYTES || !["application/pdf", "image/png", "image/jpeg"].includes(fileType(file))) {
                throw new Error("Choose a non-empty PDF, PNG or JPEG of at most 5 MB.");
            }
            const { data: created } = await api.post(endpoint, form);
            try { await uploadFile(created.invoice, file); }
            catch (err) { throw new Error(`Invoice details were saved, but the file was not attached. Select Attach file on that invoice. ${err.response?.data?.message || ""}`); }
            setForm({ ...blank(), currency: data.cost.currency }); setFile(null);
            if (fileRef.current) fileRef.current.value = "";
        }, "Invoice and file saved. Review the document before approving it.");
    };
    const download = (invoice) => void run(async () => {
        const { data: bytes } = await api.get(`${endpoint}/${invoice._id}/file`, { responseType: "blob" });
        const url = URL.createObjectURL(bytes), link = document.createElement("a");
        link.href = url; link.download = invoice.filename; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Invoice file downloaded.", false);
    const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));
    const blocked = loading || busy;

    return <><div className="modal fade show d-block" ref={dialogRef} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="supplier-invoice-title">
        <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable"><div className="modal-content">
            <div className="modal-header"><h5 id="supplier-invoice-title" className="modal-title">Supplier invoices · {data?.cost.description || "Booking cost"}</h5>
                <button type="button" className="btn-close" aria-label="Close supplier invoices" disabled={busy} onClick={onClose} /></div>
            <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                {status && <div className="alert alert-success" role="status">{status}</div>}
                <button type="button" className="btn btn-sm btn-outline-secondary mb-3" disabled={blocked} onClick={() => void run(async () => {}, "Invoice list refreshed.", false)}>Reload invoices</button>
                {loading && <p className="text-muted">Loading supplier invoices...</p>}
                {data && <>
                    <p className="small text-muted">Booking cost: {money(data.cost.amount, data.cost.currency)} · {money(data.cost.paidAmount, data.cost.currency)} paid · Payment due: {data.cost.paymentDueDate ? formatCalendarDate(data.cost.paymentDueDate) : "not set"}. Invoice dates do not update the booking cost or record a payment; update the cost's due date separately if needed.</p>
                    {canManage && <form className="border rounded p-3 mb-4" onSubmit={save}><fieldset disabled={blocked}>
                        <h6 className="fw-bold">Add supplier pro forma / invoice</h6>
                        <div className="row g-2">
                            <div className="col-md-5"><label className="form-label" htmlFor="invoice-supplier">Supplier name</label><input id="invoice-supplier" className="form-control" required minLength={2} maxLength={160} value={form.supplierName} onChange={(e) => change("supplierName", e.target.value)} /></div>
                            <div className="col-md-3"><label className="form-label" htmlFor="invoice-ref">Invoice reference</label><input id="invoice-ref" className="form-control" required maxLength={100} value={form.invoiceReference} onChange={(e) => change("invoiceReference", e.target.value)} /></div>
                            <div className="col-md-2"><label className="form-label" htmlFor="invoice-date">Invoice date</label><input id="invoice-date" type="date" className="form-control" required value={form.invoiceDate} onChange={(e) => change("invoiceDate", e.target.value)} /></div>
                            <div className="col-md-2"><label className="form-label" htmlFor="invoice-due">Due date if stated</label><input id="invoice-due" type="date" min={form.invoiceDate} className="form-control" value={form.dueDate} onChange={(e) => change("dueDate", e.target.value)} /></div>
                            <div className="col-md-3"><label className="form-label" htmlFor="invoice-amount">Invoice amount</label><input id="invoice-amount" type="number" step="0.01" min="0.01" className="form-control" required value={form.amount} onChange={(e) => change("amount", e.target.value)} /></div>
                            <div className="col-md-2"><label className="form-label" htmlFor="invoice-currency">Currency</label><select id="invoice-currency" className="form-select" value={form.currency} onChange={(e) => change("currency", e.target.value)}>{["USD", "LKR", "EUR", "GBP"].map((currency) => <option key={currency}>{currency}</option>)}</select></div>
                            <div className="col-md-5"><label className="form-label" htmlFor="invoice-file">Invoice file</label><input id="invoice-file" ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="form-control" required onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
                            <div className="col-md-2 d-flex align-items-end"><button type="submit" className="btn btn-primary w-100" disabled={!file}>Save invoice</button></div>
                        </div><p className="small text-muted mb-0 mt-2">Private PDF, PNG or JPEG, up to 5 MB. Incorrect invoices can be voided, with their history retained. Uploading does not send an email.</p>
                    </fieldset></form>}
                    <h6 className="fw-bold">Recorded invoices</h6>
                    {data.items.length === 0 && <p className="text-muted small">No supplier invoice recorded for this cost.</p>}
                    {data.items.map((invoice) => {
                        const differs = invoice.amount !== data.cost.amount || invoice.currency !== data.cost.currency;
                        return <div className="border rounded p-3 mb-3" key={invoice._id}>
                            <div className="d-flex justify-content-between gap-2 flex-wrap"><strong>{invoice.supplierName} · {invoice.invoiceReference}</strong>
                                <span className={`badge ${invoice.voidedAt ? "text-bg-secondary" : invoice.status === "Approved" ? "text-bg-success" : invoice.status === "Disputed" ? "text-bg-danger" : "text-bg-warning"}`}>{invoice.voidedAt ? "Voided" : invoice.status}</span></div>
                            <div className="small mt-1">{money(invoice.amount, invoice.currency)} · Invoice date {formatCalendarDate(invoice.invoiceDate)} · Supplier due {invoice.dueDate ? formatCalendarDate(invoice.dueDate) : "not stated"}</div>
                            {differs && !invoice.voidedAt && <div className="small text-warning-emphasis">Amount or currency differs from this booking cost. Review the agreed supplier charge before approval or payment.</div>}
                            <div className="small text-muted">{invoice.filename ? `${invoice.filename} · ${Math.ceil(invoice.size / 1024)} KB` : "Document not yet attached"} · Recorded by {invoice.createdByName}</div>
                            {invoice.voidedAt ? <div className="small text-muted">Voided by {invoice.voidedByName} · {invoice.voidReason}</div> : <div className="d-flex gap-2 flex-wrap mt-2">
                                {invoice.filename && <button type="button" className="btn btn-sm btn-outline-primary" disabled={blocked} onClick={() => download(invoice)}>Download</button>}
                                {canManage && !invoice.filename && <button type="button" className="btn btn-sm btn-outline-primary" disabled={blocked} onClick={() => { setAttachId(invoice._id); setAttachFile(null); }}>Attach file</button>}
                                {canManage && invoice.filename && invoice.status !== "Approved" && <button type="button" className="btn btn-sm btn-outline-success" disabled={blocked} onClick={() => { setApprovalId(invoice._id); setConfirmed(false); setConfirmedDifference(false); setDisputeId(""); }}>Review &amp; approve</button>}
                                {canManage && invoice.filename && invoice.status !== "Disputed" && <button type="button" className="btn btn-sm btn-outline-warning" disabled={blocked} onClick={() => { setDisputeId(invoice._id); setDisputeNote(""); setApprovalId(""); }}>Dispute</button>}
                                {canManage && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked} onClick={() => { setVoidId(invoice._id); setVoidReason(""); }}>Void incorrect invoice</button>}
                            </div>}
                            {canManage && !invoice.voidedAt && attachId === invoice._id && !invoice.filename && <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await uploadFile(invoice, attachFile); setAttachId(""); setAttachFile(null); }, "Invoice file attached."); }}>
                                <label className="form-label" htmlFor="invoice-retry-file">Choose the invoice file</label><input id="invoice-retry-file" type="file" className="form-control mb-2" accept=".pdf,.png,.jpg,.jpeg" required disabled={blocked} onChange={(e) => setAttachFile(e.target.files?.[0] || null)} />
                                <button className="btn btn-sm btn-primary" disabled={blocked || !attachFile}>Attach file</button></form>}
                            {canManage && !invoice.voidedAt && approvalId === invoice._id && <form className="mt-3 border-top pt-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.patch(`${endpoint}/${invoice._id}/review`, { status: "Approved", expectedVersion: invoice.__v, confirmed, confirmedDifference }); setApprovalId(""); }, "Invoice approved after review."); }}>
                                <div className="form-check"><input id="invoice-approve-check" type="checkbox" required className="form-check-input" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><label className="form-check-label" htmlFor="invoice-approve-check">I checked the supplier, document, reference, dates, amount and currency.</label></div>
                                {differs && <div className="form-check"><input id="invoice-difference-check" type="checkbox" required className="form-check-input" checked={confirmedDifference} onChange={(e) => setConfirmedDifference(e.target.checked)} /><label className="form-check-label" htmlFor="invoice-difference-check">I reviewed why the invoice differs from the booking cost.</label></div>}
                                <button className="btn btn-sm btn-success mt-2" disabled={blocked || !confirmed || (differs && !confirmedDifference)}>Approve invoice</button></form>}
                            {canManage && !invoice.voidedAt && disputeId === invoice._id && <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.patch(`${endpoint}/${invoice._id}/review`, { status: "Disputed", expectedVersion: invoice.__v, note: disputeNote }); setDisputeId(""); }, "Invoice marked disputed."); }}>
                                <label className="form-label" htmlFor="invoice-dispute-note">Dispute reason</label><input id="invoice-dispute-note" className="form-control mb-2" minLength={3} maxLength={300} required disabled={blocked} value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} /><button className="btn btn-sm btn-outline-warning" disabled={blocked}>Mark disputed</button></form>}
                            {canManage && !invoice.voidedAt && voidId === invoice._id && <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.patch(`${endpoint}/${invoice._id}/void`, { expectedVersion: invoice.__v, reason: voidReason }); setVoidId(""); }, "Invoice voided; its history remains."); }}>
                                <label className="form-label" htmlFor="invoice-void-reason">Reason for voiding</label><input id="invoice-void-reason" className="form-control mb-2" minLength={3} maxLength={300} required disabled={blocked} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} /><button className="btn btn-sm btn-outline-danger" disabled={blocked}>Void invoice</button></form>}
                            {invoice.reviewHistory?.length > 0 && <details className="small mt-2"><summary>Review history ({invoice.reviewHistory.length})</summary><ul className="mt-2 mb-0">{invoice.reviewHistory.map((event, index) => <li key={index}>{event.status} by {event.reviewedByName} · {formatCalendarDate(event.reviewedAt)}{event.note ? ` · ${event.note}` : ""}</li>)}</ul></details>}
                        </div>;
                    })}
                    {data.pages > 1 && <div className="d-flex gap-2 align-items-center"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked || page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {data.page} of {data.pages}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked || page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
                </>}
            </div><div className="modal-footer"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Close</button></div>
        </div></div>
    </div><div className="modal-backdrop fade show" /></>;
};

export default SupplierInvoicesModal;
