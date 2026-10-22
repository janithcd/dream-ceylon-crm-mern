import { useEffect, useRef, useState } from "react";
import { FaHistory } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const formatContactTime = (value) => value ? new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short",
}) : "-";

const SupplierContactModal = ({ bookingId, type, itemId, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [channel, setChannel] = useState("Email");
    const [note, setNote] = useState("");
    const [nextFollowUpDate, setNextFollowUpDate] = useState("");
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/supplier-contacts/${type}/${itemId}`)
            .then(({ data: result }) => { if (active) setData(result); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to load supplier contact history."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, type, itemId, reloadKey]);

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
            const controls = [...dialog.querySelectorAll("button, input, textarea, select, a[href]")]
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
        setLoading(true);
        setError("");
        setSuccess("");
        setData(null);
        setReloadKey((value) => value + 1);
    };
    const save = async (event) => {
        event.preventDefault();
        if (!data || saving) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await api.post(`/bookings/${bookingId}/supplier-contacts/${type}/${itemId}`, {
                channel, note, nextFollowUpDate: nextFollowUpDate || null,
            });
            setData(response.data);
            setNote("");
            setNextFollowUpDate("");
            setSuccess("Contact recorded. The supplier request still needs confirmation when they reply.");
            onChanged?.();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to log supplier contact. Refresh and try again.");
        } finally {
            setSaving(false);
        }
    };
    const canLog = hasPermission("booking.update") && data?.status === "Requested" &&
        ["Pending", "Confirmed", "In Progress"].includes(data.bookingStatus);
    const serviceDay = toCalendarDateInput(data?.serviceDate);
    const today = todayCalendarDate();

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="supplier-contact-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 id="supplier-contact-title" className="modal-title"><FaHistory className="me-2" aria-hidden="true" />Supplier contact · {data?.bookingCode || "Booking"}</h5>
                        <button type="button" className="btn-close" aria-label="Close supplier contact history" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        {loading && <p className="text-muted" role="status">Loading the latest supplier contacts...</p>}
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {!loading && !data && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                        {!loading && data && <>
                            <p className="fw-semibold mb-1">{data.title} <span className="badge text-bg-secondary ms-2">{data.status}</span></p>
                            <p className="small text-muted">{type === "hotel" ? "Check-in" : "Service date"}: {formatCalendarDate(data.serviceDate)} · Next follow-up: {formatCalendarDate(data.followUpDate)}</p>
                            {success && <div className="alert alert-success" role="status">{success}</div>}
                            {canLog && <form onSubmit={save} className="border rounded-3 p-3 mb-4">
                                <h6 className="mb-2">Log a contact you made</h6>
                                <p className="small text-muted">Record a call or message after it happens. This does not send an email or confirm the service.</p>
                                <div className="row g-3">
                                    <div className="col-sm-5">
                                        <label htmlFor="supplier-contact-channel" className="form-label">Channel</label>
                                        <select id="supplier-contact-channel" className="form-select" value={channel} onChange={(event) => setChannel(event.target.value)}>
                                            {["Email", "WhatsApp", "Phone", "Other"].map((item) => <option key={item}>{item}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-sm-7">
                                        <label htmlFor="supplier-contact-next" className="form-label">Next follow-up date</label>
                                        <input id="supplier-contact-next" className="form-control" type="date" min={today} max={serviceDay || undefined}
                                            value={nextFollowUpDate} onChange={(event) => setNextFollowUpDate(event.target.value)} />
                                    </div>
                                    <div className="col-12">
                                        <label htmlFor="supplier-contact-note" className="form-label">Private note (optional)</label>
                                        <textarea id="supplier-contact-note" className="form-control" rows="2" maxLength={300}
                                            value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Hotel will send the reference tomorrow" />
                                    </div>
                                </div>
                                <p className="small text-muted mt-2 mb-3">Leave the date blank to clear the current follow-up reminder. Follow-up dates must be on or before the service date in Sri Lanka.</p>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Log contact"}</button>
                            </form>}
                            {!canLog && <p className="small text-muted">Contact can be logged while this service is requested on an active booking. Past contacts remain visible.</p>}
                            <h6>Contact history</h6>
                            {data.contacts.length === 0 ? <p className="text-muted mb-0">No supplier contacts recorded yet.</p> : <div className="d-flex flex-column gap-2">
                                {data.contacts.map((entry) => <div key={entry.id} className="border rounded-3 p-3 small">
                                    <div className="d-flex justify-content-between flex-wrap gap-1"><strong>{entry.channel} · {entry.contactedBy}</strong><span className="text-muted">{formatContactTime(entry.contactedAt)} (Sri Lanka)</span></div>
                                    {entry.note && <p className="mb-1 mt-2" style={{ whiteSpace: "pre-wrap" }}>{entry.note}</p>}
                                    <div className="text-muted mt-1">Next follow-up: {formatCalendarDate(entry.nextFollowUpDate)}</div>
                                </div>)}
                            </div>}
                            <p className="small text-muted mt-3 mb-0">The latest 50 contacts are kept for each service. The booking history records contact events without private notes.</p>
                        </>}
                    </div>
                    <div className="modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button></div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default SupplierContactModal;
