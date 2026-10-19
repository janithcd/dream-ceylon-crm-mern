import { useEffect, useState } from "react";
import { FaCar, FaEdit, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const statuses = ["Requested", "Confirmed", "Cancelled"];

const emptyForm = (booking) => ({
    route: "",
    startDate: toCalendarDateInput(booking.travelStartDate),
    endDate: toCalendarDateInput(booking.travelStartDate),
    pickupTime: "",
    pickupLocation: "",
    dropoffLocation: "",
    vehicleDescription: "",
    registration: "",
    chauffeurName: "",
    chauffeurPhone: "",
    status: "Requested",
    followUpDate: "",
    notes: "",
});

const BookingTransportModal = ({ booking, onClose, onChanged, focusItemId }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [assignments, setAssignments] = useState(booking.transportAssignments || []);
    const [conflicts, setConflicts] = useState([]);
    const [conflictCheckUnavailable, setConflictCheckUnavailable] = useState(false);
    const [form, setForm] = useState(() => emptyForm(booking));
    const [editingId, setEditingId] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${booking._id}/transport-assignments`)
            .then(({ data }) => {
                if (!active) return;
                setAssignments(data.assignments || []);
                setConflicts(data.conflicts || []);
                setConflictCheckUnavailable(Boolean(data.conflictCheckUnavailable));
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to load transport arrangements.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [booking._id]);

    useEffect(() => {
        if (!loading && focusItemId) document.getElementById(`transport-request-${focusItemId}`)?.scrollIntoView({ block: "nearest" });
    }, [loading, focusItemId]);

    const setResult = (data) => {
        setAssignments(data.assignments || []);
        setConflicts(data.conflicts || []);
        setConflictCheckUnavailable(Boolean(data.conflictCheckUnavailable));
        onChanged();
    };

    const resetForm = () => {
        setForm(emptyForm(booking));
        setEditingId("");
        setShowForm(false);
    };

    const editAssignment = (item) => {
        setError("");
        setSuccess("");
        setForm({
            route: item.route || "",
            startDate: toCalendarDateInput(item.startDate),
            endDate: toCalendarDateInput(item.endDate),
            pickupTime: item.pickupTime || "",
            pickupLocation: item.pickupLocation || "",
            dropoffLocation: item.dropoffLocation || "",
            vehicleDescription: item.vehicleDescription || "",
            registration: item.registration || "",
            chauffeurName: item.chauffeurName || "",
            chauffeurPhone: item.chauffeurPhone || "",
            status: item.status || "Requested",
            followUpDate: toCalendarDateInput(item.followUpDate),
            notes: item.notes || "",
        });
        setEditingId(item._id);
        setShowForm(true);
    };

    const saveAssignment = async (event) => {
        event.preventDefault();
        if (busy) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const url = `/bookings/${booking._id}/transport-assignments`;
            const response = editingId
                ? await api.put(`${url}/${editingId}`, form)
                : await api.post(url, form);
            setResult(response.data);
            setSuccess(editingId ? "Transport updated." : "Transport added.");
            resetForm();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save transport.");
        } finally {
            setBusy(false);
        }
    };

    const removeAssignment = async (item) => {
        if (busy || !window.confirm(`Remove ${item.route} from this booking?`)) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.delete(`/bookings/${booking._id}/transport-assignments/${item._id}`);
            setResult(response.data);
            if (editingId === item._id) resetForm();
            setSuccess("Transport removed.");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove transport.");
        } finally {
            setBusy(false);
        }
    };

    const updateField = (event) => setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
    const confirmedCount = assignments.filter((item) => item.status === "Confirmed").length;
    const requestedCount = assignments.filter((item) => item.status === "Requested").length;

    return (
        <>
            <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="booking-transport-title">
                <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 id="booking-transport-title" className="modal-title"><FaCar className="me-2" />Transport arrangements</h5>
                                <small className="text-muted">{booking.bookingCode} · {booking.customer?.fullName}</small>
                            </div>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                        </div>

                        <div className="modal-body">
                            <p className="text-muted small">Record each tour or transfer and its chauffeur. Registration overlap checks show possible scheduling conflicts for confirmed vehicles.</p>
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {success && <div className="alert alert-success" role="status">{success}</div>}
                            {conflictCheckUnavailable && <div className="alert alert-warning" role="alert">The vehicle overlap check is temporarily unavailable. Verify the schedule before dispatch.</div>}

                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                                <h6 className="fw-bold mb-0">{confirmedCount} confirmed · {requestedCount} requested</h6>
                                {canUpdate && !loading && !showForm && (
                                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || assignments.length >= 30} onClick={() => { resetForm(); setShowForm(true); }}>
                                        <FaPlus className="me-2" />Add transport
                                    </button>
                                )}
                            </div>

                            {loading ? <p className="text-muted" role="status">Loading transport...</p> : assignments.length === 0 ? (
                                <div className="border rounded-3 p-3 text-muted mb-3">No transport arrangements have been recorded.</div>
                            ) : (
                                <div className="row g-3 mb-4">
                                    {assignments.map((item) => {
                                        const overlaps = conflicts.find((conflict) => conflict.assignmentId === item._id)?.bookings || [];
                                        return (
                                            <div className="col-12 col-lg-6" key={item._id}>
                                                <div id={`transport-request-${item._id}`} className={`border rounded-4 p-3 h-100 ${focusItemId === item._id ? "border-primary" : ""}`}>
                                                    <div className="d-flex justify-content-between gap-2">
                                                        <h6 className="fw-bold mb-1">{item.route}</h6>
                                                        <span className={`badge align-self-start ${item.status === "Confirmed" ? "text-bg-success" : item.status === "Cancelled" ? "text-bg-secondary" : "text-bg-warning"}`}>{item.status}</span>
                                                    </div>
                                                    <div className="small mt-2">
                                                        <div><strong>Dates:</strong> {formatCalendarDate(item.startDate)} – {formatCalendarDate(item.endDate)}</div>
                                                        {item.status === "Requested" && <div><strong>Follow up:</strong> {item.followUpDate ? formatCalendarDate(item.followUpDate) : "Not scheduled"}</div>}
                                                        {item.pickupTime && <div><strong>Pickup time:</strong> {item.pickupTime}</div>}
                                                        {(item.pickupLocation || item.dropoffLocation) && <div><strong>Route details:</strong> {item.pickupLocation || "-"} → {item.dropoffLocation || "-"}</div>}
                                                        {item.vehicleDescription && <div><strong>Vehicle:</strong> {item.vehicleDescription}</div>}
                                                        {item.registration && <div><strong>Registration:</strong> {item.registration}</div>}
                                                        {item.chauffeurName && <div><strong>Chauffeur:</strong> {item.chauffeurName}</div>}
                                                        {item.chauffeurPhone && <div><strong>Phone:</strong> {item.chauffeurPhone}</div>}
                                                        {item.notes && <div className="text-muted mt-2">{item.notes}</div>}
                                                    </div>
                                                    {overlaps.length > 0 && (
                                                        <div className="alert alert-warning small mt-3 mb-0" role="status">
                                                            Possible vehicle overlap: {overlaps.map((match) => `${match.bookingCode} (${formatCalendarDate(match.startDate)} – ${formatCalendarDate(match.endDate)})`).join(", ")}. Check the schedule before dispatch.
                                                        </div>
                                                    )}
                                                    {canUpdate && (
                                                        <div className="d-flex gap-2 mt-3">
                                                            <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => editAssignment(item)}><FaEdit className="me-1" />Edit</button>
                                                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => removeAssignment(item)}><FaTrash className="me-1" />Remove</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {canUpdate && !loading && showForm && (
                                <form id="transport-form" onSubmit={saveAssignment}>
                                    <h6 className="fw-bold mb-3">{editingId ? "Edit transport" : "Add transport"}</h6>
                                    <div className="row g-3">
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-route">Tour or transfer *</label><input id="transport-route" name="route" className="form-control" value={form.route} onChange={updateField} maxLength={120} placeholder="e.g. Airport to Sigiriya / Round tour" required /></div>
                                        <div className="col-md-3"><label className="form-label" htmlFor="transport-start">Start date *</label><input id="transport-start" name="startDate" type="date" className="form-control" value={form.startDate} onChange={updateField} required /></div>
                                        <div className="col-md-3"><label className="form-label" htmlFor="transport-end">End date *</label><input id="transport-end" name="endDate" type="date" className="form-control" value={form.endDate} onChange={updateField} required /></div>
                                        <div className="col-md-4"><label className="form-label" htmlFor="transport-time">Pickup time</label><input id="transport-time" name="pickupTime" type="time" className="form-control" value={form.pickupTime} onChange={updateField} /></div>
                                        <div className="col-md-4"><label className="form-label" htmlFor="transport-pickup">Pickup</label><input id="transport-pickup" name="pickupLocation" className="form-control" value={form.pickupLocation} onChange={updateField} maxLength={120} /></div>
                                        <div className="col-md-4"><label className="form-label" htmlFor="transport-dropoff">Drop-off</label><input id="transport-dropoff" name="dropoffLocation" className="form-control" value={form.dropoffLocation} onChange={updateField} maxLength={120} /></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-vehicle">Vehicle description</label><input id="transport-vehicle" name="vehicleDescription" className="form-control" value={form.vehicleDescription} onChange={updateField} maxLength={100} placeholder="e.g. KDH Hiace flat roof" /></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-plate">Vehicle registration</label><input id="transport-plate" name="registration" className="form-control" value={form.registration} onChange={updateField} maxLength={24} placeholder="Used to check overlaps" /></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-chauffeur">Chauffeur name</label><input id="transport-chauffeur" name="chauffeurName" className="form-control" value={form.chauffeurName} onChange={updateField} maxLength={100} /></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-phone">Chauffeur phone</label><input id="transport-phone" name="chauffeurPhone" type="tel" className="form-control" value={form.chauffeurPhone} onChange={updateField} maxLength={32} /></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-status">Status</label><select id="transport-status" name="status" className="form-select" value={form.status} onChange={updateField}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
                                        <div className="col-md-6"><label className="form-label" htmlFor="transport-follow-up">Supplier follow-up date</label><input id="transport-follow-up" name="followUpDate" type="date" className="form-control" value={form.followUpDate} onChange={updateField} max={form.startDate || undefined} /><small className="text-muted">Optional. Follow up before transport starts.</small></div>
                                        <div className="col-12"><label className="form-label" htmlFor="transport-notes">Internal notes</label><textarea id="transport-notes" name="notes" rows="2" className="form-control" value={form.notes} onChange={updateField} maxLength={500} /></div>
                                    </div>
                                    <div className="d-flex justify-content-end gap-2 mt-3">
                                        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={resetForm}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : editingId ? "Save changes" : "Add transport"}</button>
                                    </div>
                                </form>
                            )}
                        </div>
                        <div className="modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" />
        </>
    );
};

export default BookingTransportModal;
