import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, todayCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const MAX_BYTES = 5 * 1024 * 1024;
const kindName = (kind) => kind === "supplier-receipt" ? "Supplier receipt" : "Bank proof";
const time = (value) => new Date(value).toLocaleString("en-US", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" });
const blankAcknowledgement = () => ({ acknowledgedDate: todayCalendarDate(), channel: "Email", contactName: "", reference: "", note: "", confirmed: false });

const SupplierPaymentEvidenceModal = ({ costId, paymentId, onClose, onSaved }) => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission("cost.manage");
    const endpoint = `/finance/costs/${costId}/payments/${paymentId}`;
    const [files, setFiles] = useState(null);
    const [ack, setAck] = useState(null);
    const [historyPage, setHistoryPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [file, setFile] = useState(null);
    const [kind, setKind] = useState("bank-proof");
    const [withdrawId, setWithdrawId] = useState("");
    const [withdrawReason, setWithdrawReason] = useState("");
    const [reopening, setReopening] = useState(false);
    const [reopenReason, setReopenReason] = useState("");
    const [form, setForm] = useState(blankAcknowledgement);
    const dialogRef = useRef(null), fileRef = useRef(null), closeRef = useRef(onClose), busyRef = useRef(false);
    const activeRef = useRef(true);

    useEffect(() => { closeRef.current = onClose; }, [onClose]);
    const fetchRecords = useCallback(async () => {
        const [documents, acknowledgement] = await Promise.all([
            api.get(`${endpoint}/attachments`, { params: { historyPage } }), api.get(`${endpoint}/acknowledgement`),
        ]);
        return { files: documents.data, ack: acknowledgement.data };
    }, [endpoint, historyPage]);
    useEffect(() => {
        let active = true;
        fetchRecords().then((result) => { if (active) { setFiles(result.files); setAck(result.ack); setError(""); } })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load the payment records."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [fetchRecords]);
    useEffect(() => {
        activeRef.current = true;
        const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const keydown = (event) => {
            if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input, select, textarea, summary")]
                .filter((el) => !el.matches(":disabled") && el.offsetParent !== null);
            const first = controls[0], last = controls.at(-1);
            if (!first) { event.preventDefault(); dialog.focus(); return; }
            if (event.shiftKey && first && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && last && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        dialog?.addEventListener("keydown", keydown);
        return () => {
            activeRef.current = false;
            document.body.style.overflow = previousOverflow;
            dialog?.removeEventListener("keydown", keydown);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const refresh = async () => {
        setLoading(true); setError(""); setStatus("");
        try { const result = await fetchRecords(); if (activeRef.current) { setFiles(result.files); setAck(result.ack); } }
        catch (err) { if (activeRef.current) setError(err.response?.data?.message || "Could not reload the payment records."); }
        finally { if (activeRef.current) setLoading(false); }
    };
    const runAction = async (action, message) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError(""); setStatus("");
        try {
            await action();
            onSaved();
            setStatus(message);
            const result = await fetchRecords(); setFiles(result.files); setAck(result.ack);
        } catch (err) { setError(err.response?.data?.message || "Could not complete this action. Reload the records to check the latest state."); }
        finally { setBusy(false); busyRef.current = false; }
    };
    const upload = (event) => {
        event.preventDefault();
        if (!file || !file.size || file.size > MAX_BYTES) { setError("Choose a non-empty PDF, PNG or JPEG of at most 5 MB."); return; }
        const fallbackType = /\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "";
        const contentType = file.type || fallbackType;
        if (!["application/pdf", "image/png", "image/jpeg"].includes(contentType)) { setError("Choose a PDF, PNG or JPEG file."); return; }
        void runAction(async () => {
            await api.post(`${endpoint}/attachments`, file, { params: { kind }, headers: {
                "Content-Type": contentType, "X-File-Name": encodeURIComponent(file.name),
            }, transformRequest: [(value) => value] });
            setFile(null); if (fileRef.current) fileRef.current.value = "";
        }, "Attachment saved. Download and attach it yourself when emailing the supplier.");
    };
    const download = async (item) => {
        if (busyRef.current) return;
        setBusy(true); busyRef.current = true; setError("");
        try {
            const { data } = await api.get(`${endpoint}/attachments/${item._id}`, { responseType: "blob" });
            const url = URL.createObjectURL(data), link = document.createElement("a");
            link.href = url; link.download = item.filename; document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            let message = err.response?.data?.message;
            if (err.response?.data instanceof Blob) { try { message = JSON.parse(await err.response.data.text()).message; } catch { /* Fallback below. */ } }
            setError(message || "Could not download the attachment.");
        } finally { setBusy(false); busyRef.current = false; }
    };
    const edit = (field, value) => setForm((current) => ({ ...current, [field]: value, ...(field !== "confirmed" ? { confirmed: false } : {}) }));
    const changeHistoryPage = (delta) => { setLoading(true); setHistoryPage((page) => page + delta); };
    const blocked = loading || busy;

    return <>
        <div className="modal fade show d-block" ref={dialogRef} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="payment-evidence-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div className="modal-content">
                <div className="modal-header"><h5 className="modal-title" id="payment-evidence-title">Receipts &amp; supplier acknowledgement{ack?.bookingCode && ` · ${ack.bookingCode}`}</h5>
                    <button type="button" className="btn-close" aria-label="Close payment records" disabled={busy} onClick={onClose} /></div>
                <div className="modal-body">
                    {error && <div className="alert alert-danger" role="alert">{error}</div>}
                    {status && <div className="alert alert-success" role="status">{status}</div>}
                    <button type="button" className="btn btn-sm btn-outline-secondary mb-3" disabled={blocked} onClick={() => void refresh()}>Reload records</button>
                    {loading && <p role="status" className="text-muted">Loading payment records...</p>}
                    {files && ack && <>
                        <section aria-labelledby="payment-files-heading">
                            <h6 id="payment-files-heading" className="fw-bold">Payment attachments</h6>
                            <p className="small text-muted">PDF, PNG or JPEG, up to 5 MB each. Keep up to five active files. Download files to attach to your business email; uploading does not send them.</p>
                            <ul className="list-group mb-3">{files.active.map((item) => <li className="list-group-item" key={item._id}>
                                <div className="fw-semibold text-break">{item.filename}</div>
                                <div className="small text-muted">{kindName(item.kind)} · {Math.ceil(item.size / 1024)} KB · {item.uploadedByName} · {time(item.uploadedAt)}</div>
                                <div className="d-flex gap-2 mt-2"><button type="button" className="btn btn-sm btn-outline-primary" disabled={blocked} onClick={() => void download(item)}>Download</button>
                                    {canManage && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked} onClick={() => { setWithdrawId(item._id); setWithdrawReason(""); }}>Withdraw incorrect file</button>}</div>
                            </li>)}</ul>
                            {files.active.length === 0 && <p className="small text-muted">No payment attachments saved.</p>}
                            {canManage && files.active.length < 5 && <form onSubmit={upload} className="border rounded p-3 mb-3">
                                <fieldset disabled={blocked}>
                                    <label className="form-label" htmlFor="payment-file-kind">Document type</label>
                                    <select id="payment-file-kind" className="form-select mb-2" value={kind} onChange={(e) => setKind(e.target.value)}><option value="bank-proof">Bank transfer proof</option><option value="supplier-receipt">Supplier receipt</option></select>
                                    <label className="form-label" htmlFor="payment-file">File</label>
                                    <input ref={fileRef} id="payment-file" type="file" className="form-control mb-2" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
                                    <button className="btn btn-primary btn-sm" type="submit" disabled={!file}>Upload attachment</button>
                                </fieldset>
                            </form>}
                            {canManage && withdrawId && <form className="border rounded p-3 mb-3" onSubmit={(e) => { e.preventDefault(); void runAction(async () => {
                                await api.patch(`${endpoint}/attachments/${withdrawId}/withdraw`, { reason: withdrawReason }); setWithdrawId("");
                            }, "Attachment withdrawn. Its upload and withdrawal details remain in history."); }}>
                                <label className="form-label" htmlFor="payment-file-reason">Reason for withdrawing {files.active.find((item) => item._id === withdrawId)?.filename}</label>
                                <input id="payment-file-reason" className="form-control mb-2" minLength={3} maxLength={300} required disabled={blocked} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                                <div className="d-flex gap-2"><button className="btn btn-sm btn-outline-danger" type="submit" disabled={blocked}>Withdraw file</button><button className="btn btn-sm btn-outline-secondary" type="button" disabled={blocked} onClick={() => setWithdrawId("")}>Cancel</button></div>
                            </form>}
                            {files.total > 0 && <details className="small mb-3"><summary>Withdrawn attachment history ({files.total})</summary>
                                <ul className="mt-2">{files.history.map((item) => <li key={item._id} className="mb-2 text-break">{item.filename} · {kindName(item.kind)}<br />
                                    Uploaded by {item.uploadedByName} · {time(item.uploadedAt)}<br />Withdrawn by {item.withdrawnByName} · {time(item.withdrawnAt)}<br />Reason: {item.withdrawalReason}</li>)}</ul>
                                {files.pages > 1 && <div className="d-flex gap-2 align-items-center"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked || historyPage <= 1} onClick={() => changeHistoryPage(-1)}>Previous</button><span>Page {files.page} of {files.pages}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked || historyPage >= files.pages} onClick={() => changeHistoryPage(1)}>Next</button></div>}
                            </details>}
                        </section>
                        <section className="border-top pt-3" aria-labelledby="payment-ack-heading">
                            <h6 id="payment-ack-heading" className="fw-bold">Supplier acknowledgement</h6>
                            <p className="small text-muted">Record the supplier's actual confirmation of this payment. This record is separate from bank matching and does not change the paid balance.</p>
                            {ack.current ? <div className="alert alert-success">
                                <strong>Acknowledged · {formatCalendarDate(ack.current.acknowledgedDate)}</strong><br />
                                {ack.current.contactName} · {ack.current.channel}
                                {ack.current.reference && <div>Receipt / reference: {ack.current.reference}</div>}
                                {ack.current.note && <div className="small">Internal note: {ack.current.note}</div>}
                                <div className="small">Recorded by {ack.current.recordedByName} · {time(ack.current.recordedAt)}</div>
                            </div> : <p className="text-warning-emphasis fw-semibold">Awaiting acknowledgement</p>}
                            {canManage && !ack.current && <form onSubmit={(e) => { e.preventDefault(); void runAction(async () => {
                                await api.patch(`${endpoint}/acknowledgement`, { ...form, action: "acknowledge", expectedVersion: ack.version }); setForm(blankAcknowledgement());
                            }, "Supplier acknowledgement recorded."); }}>
                                <fieldset disabled={blocked}><div className="row g-3">
                                    <div className="col-sm-6"><label htmlFor="payment-ack-date" className="form-label">Date acknowledged</label><input id="payment-ack-date" type="date" className="form-control" min={toCalendarDateInput(ack.paymentDate)} max={todayCalendarDate()} required value={form.acknowledgedDate} onChange={(e) => edit("acknowledgedDate", e.target.value)} /></div>
                                    <div className="col-sm-6"><label htmlFor="payment-ack-channel" className="form-label">Confirmation channel</label><select id="payment-ack-channel" className="form-select" value={form.channel} onChange={(e) => edit("channel", e.target.value)}>{["Email", "WhatsApp", "Phone", "Other"].map((value) => <option key={value}>{value}</option>)}</select></div>
                                    <div className="col-sm-6"><label htmlFor="payment-ack-contact" className="form-label">Supplier contact name</label><input id="payment-ack-contact" className="form-control" maxLength={100} required value={form.contactName} onChange={(e) => edit("contactName", e.target.value)} /></div>
                                    <div className="col-sm-6"><label htmlFor="payment-ack-reference" className="form-label">Receipt / reference (optional)</label><input id="payment-ack-reference" className="form-control" maxLength={100} value={form.reference} onChange={(e) => edit("reference", e.target.value)} /></div>
                                    <div className="col-12"><label htmlFor="payment-ack-note" className="form-label">Internal note (optional)</label><input id="payment-ack-note" className="form-control" maxLength={500} value={form.note} onChange={(e) => edit("note", e.target.value)} /></div>
                                    <div className="col-12"><div className="form-check"><input id="payment-ack-confirm" className="form-check-input" type="checkbox" required checked={form.confirmed} onChange={(e) => edit("confirmed", e.target.checked)} /><label className="form-check-label" htmlFor="payment-ack-confirm">The supplier has actually acknowledged this payment.</label></div></div>
                                    <div className="col-12"><button type="submit" className="btn btn-primary btn-sm" disabled={!form.confirmed}>Record acknowledgement</button></div>
                                </div></fieldset>
                            </form>}
                            {canManage && ack.current && !reopening && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked} onClick={() => { setReopening(true); setReopenReason(""); }}>Reopen acknowledgement</button>}
                            {canManage && ack.current && reopening && <form onSubmit={(e) => { e.preventDefault(); void runAction(async () => {
                                await api.patch(`${endpoint}/acknowledgement`, { action: "reopen", reason: reopenReason, expectedVersion: ack.version }); setReopening(false);
                            }, "Acknowledgement reopened. The previous confirmation remains in history."); }}>
                                <label htmlFor="payment-ack-reason" className="form-label">Reason for reopening</label><input id="payment-ack-reason" className="form-control mb-2" required minLength={3} maxLength={300} disabled={blocked} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                                <div className="d-flex gap-2"><button type="submit" className="btn btn-sm btn-outline-danger" disabled={blocked}>Confirm reopen</button><button type="button" className="btn btn-sm btn-outline-secondary" disabled={blocked} onClick={() => setReopening(false)}>Cancel</button></div>
                            </form>}
                            {ack.history.length > 0 && <details className="small mt-3"><summary>Acknowledgement history ({ack.history.length})</summary><ul className="mt-2">{ack.history.slice().reverse().map((event) => <li key={event._id} className="mb-2">
                                <strong>{event.action === "acknowledged" ? "Acknowledged" : "Reopened"}</strong> · {event.recordedByName} · {time(event.recordedAt)}<br />
                                Supplier: {event.acknowledgement.contactName} · {event.acknowledgement.channel} · {formatCalendarDate(event.acknowledgement.acknowledgedDate)}
                                {event.acknowledgement.reference && <div>Receipt / reference: {event.acknowledgement.reference}</div>}
                                {event.acknowledgement.note && <div>Internal note: {event.acknowledgement.note}</div>}
                                {event.reason && <div>Reason: {event.reason}</div>}
                            </li>)}</ul></details>}
                        </section>
                    </>}
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Close</button></div>
            </div></div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default SupplierPaymentEvidenceModal;
