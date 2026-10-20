import { useEffect, useState } from "react";
import { FaEdit, FaFilePdf, FaMapMarkedAlt, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const blankDay = (date = "") => ({ date, title: "", plan: "", overnightLocation: "" });

const BookingItineraryModal = ({ booking, onClose, onChanged, onDownloadGuestPdf, downloadingGuestPdf }) => {
    const { hasPermission } = usePermissions();
    const [days, setDays] = useState([]);
    const [trip, setTrip] = useState({
        travelStartDate: booking.travelStartDate,
        travelEndDate: booking.travelEndDate,
        bookingStatus: booking.bookingStatus,
    });
    const [form, setForm] = useState(blankDay(toCalendarDateInput(booking.travelStartDate)));
    const [editingId, setEditingId] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const canEdit = hasPermission("booking.update") && trip.bookingStatus !== "Cancelled";
    const start = toCalendarDateInput(trip.travelStartDate);
    const end = toCalendarDateInput(trip.travelEndDate);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${booking._id}/itinerary`)
            .then(({ data }) => {
                if (!active) return;
                setDays(data.days || []);
                setTrip(data);
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to load the itinerary.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [booking._id]);

    const resetForm = () => {
        setEditingId("");
        setShowForm(false);
        setForm(blankDay(start));
    };

    const editDay = (day) => {
        setForm({
            date: toCalendarDateInput(day.date),
            title: day.title || "",
            plan: day.plan || "",
            overnightLocation: day.overnightLocation || "",
        });
        setEditingId(day._id);
        setShowForm(true);
        setError("");
        setSuccess("");
    };

    const saveDay = async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const url = `/bookings/${booking._id}/itinerary`;
            const { data } = editingId
                ? await api.put(`${url}/${editingId}`, form)
                : await api.post(url, form);
            setDays(data.days || []);
            setTrip(data);
            resetForm();
            setSuccess(editingId ? "Itinerary entry updated." : "Itinerary entry added.");
            onChanged?.();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save the itinerary entry.");
        } finally {
            setBusy(false);
        }
    };

    const removeDay = async (day) => {
        if (busy || !window.confirm(`Remove ${day.title} from the itinerary?`)) return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const { data } = await api.delete(`/bookings/${booking._id}/itinerary/${day._id}`);
            setDays(data.days || []);
            setTrip(data);
            if (editingId === day._id) resetForm();
            setSuccess("Itinerary entry removed.");
            onChanged?.();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove the itinerary entry.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="booking-itinerary-title">
                <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 id="booking-itinerary-title" className="modal-title"><FaMapMarkedAlt className="me-2" />Trip itinerary</h5>
                                <small className="text-muted">{booking.bookingCode} · {booking.customer?.fullName}</small>
                            </div>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                        </div>
                        <div className="modal-body">
                            <p className="text-muted small mb-3">Plan each travel day or add multiple activities on one date. Titles, plans, and overnight locations appear in the guest PDF and internal operations brief. Keep private notes elsewhere.</p>
                            <p className="small"><strong>Travel dates:</strong> {formatCalendarDate(trip.travelStartDate)} – {formatCalendarDate(trip.travelEndDate)}</p>
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {success && <div className="alert alert-success" role="status">{success}</div>}
                            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                                <h6 className="mb-0">{days.length} {days.length === 1 ? "entry" : "entries"}</h6>
                                {canEdit && !loading && !showForm && (
                                    <button type="button" className="btn btn-sm btn-primary" disabled={busy || days.length >= 60} onClick={() => { setForm(blankDay(start)); setEditingId(""); setShowForm(true); setError(""); setSuccess(""); }}>
                                        <FaPlus className="me-2" />Add entry
                                    </button>
                                )}
                            </div>
                            {loading ? <p className="text-muted">Loading itinerary...</p> : days.length === 0 ? (
                                <div className="border rounded-3 p-3 text-muted mb-3">No itinerary entries yet.</div>
                            ) : (
                                <div className="d-grid gap-3 mb-4">
                                    {days.map((day) => (
                                        <div className="border rounded-3 p-3" key={day._id}>
                                            <div className="d-flex justify-content-between align-items-start gap-3">
                                                <div>
                                                    <span className="badge text-bg-light border me-2">{formatCalendarDate(day.date)}</span>
                                                    <strong>{day.title}</strong>
                                                </div>
                                                {canEdit && (
                                                    <div className="d-flex gap-2">
                                                        <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => editDay(day)} aria-label={`Edit ${day.title}`}><FaEdit /></button>
                                                        <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => removeDay(day)} aria-label={`Remove ${day.title}`}><FaTrash /></button>
                                                    </div>
                                                )}
                                            </div>
                                            {day.plan && <p className="mb-1 mt-2" style={{ whiteSpace: "pre-wrap" }}>{day.plan}</p>}
                                            {day.overnightLocation && <small className="text-muted">Overnight: {day.overnightLocation}</small>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {canEdit && !loading && showForm && (
                                <form id="booking-itinerary-form" onSubmit={saveDay}>
                                    <h6 className="fw-bold mb-3">{editingId ? "Edit entry" : "Add entry"}</h6>
                                    <div className="row g-3">
                                        <div className="col-md-4">
                                            <label className="form-label" htmlFor="itinerary-date">Date *</label>
                                            <input id="itinerary-date" name="date" type="date" className="form-control" min={start} max={end} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
                                        </div>
                                        <div className="col-md-8">
                                            <label className="form-label" htmlFor="itinerary-title">Title *</label>
                                            <input id="itinerary-title" name="title" className="form-control" maxLength={120} placeholder="e.g. Arrive in Colombo" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label" htmlFor="itinerary-plan">Daily plan</label>
                                            <textarea id="itinerary-plan" name="plan" className="form-control" rows="3" maxLength={800} placeholder="Activities, meeting points, timing..." value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="itinerary-overnight">Overnight location</label>
                                            <input id="itinerary-overnight" name="overnightLocation" className="form-control" maxLength={120} placeholder="e.g. Sigiriya" value={form.overnightLocation} onChange={(event) => setForm({ ...form, overnightLocation: event.target.value })} />
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2 mt-3">
                                        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving..." : editingId ? "Save changes" : "Add entry"}</button>
                                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetForm} disabled={busy}>Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                        <div className="modal-footer">
                            {hasPermission("pdf.generate") && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={onDownloadGuestPdf}
                                    disabled={loading || busy || downloadingGuestPdf || days.length === 0 || trip.bookingStatus === "Cancelled"}
                                    title={days.length === 0 ? "Add itinerary entries first" : "Download a guest-facing itinerary PDF"}
                                >
                                    <FaFilePdf className="me-2" />{downloadingGuestPdf ? "Preparing PDF..." : "Download guest PDF"}
                                </button>
                            )}
                            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" />
        </>
    );
};

export default BookingItineraryModal;
