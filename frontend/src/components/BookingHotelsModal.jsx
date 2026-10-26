import { useEffect, useState } from "react";
import { FaEdit, FaEnvelope, FaFilePdf, FaHistory, FaHotel, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { getHotelNightCoverage } from "../utils/hotelNightCoverage";
import { notifySupplierConfirmationsChanged } from "../utils/supplierEvents";

const mealPlans = ["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive", "Other"];
const statuses = ["Requested", "Confirmed", "Cancelled"];
const formatNightRange = ({ from, to }) => from === to ? formatCalendarDate(from) : formatCalendarDate(from) + " – " + formatCalendarDate(to);

const emptyForm = () => ({
    hotelName: "",
    location: "",
    supplierEmail: "",
    checkInDate: "",
    checkOutDate: "",
    rooms: 1,
    roomType: "",
    mealPlan: "Room Only",
    status: "Requested",
    followUpDate: "",
    confirmationNumber: "",
    cancellationDeadline: "",
    cancellationTerms: "",
    notes: "",
});

const BookingHotelsModal = ({ booking, onClose, onChanged, onPrepareEmail, onPrepareCancellation, onPrepareRooming, onOpenContacts, focusItemId }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const canDownloadVoucher = hasPermission("booking.view") && hasPermission("pdf.generate");
    const [trip, setTrip] = useState(booking);
    const [stays, setStays] = useState(booking.hotelStays || []);
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [downloadingStayId, setDownloadingStayId] = useState("");

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${booking._id}`)
            .then((response) => {
                if (active) {
                    setTrip(response.data);
                    setStays(response.data.hotelStays || []);
                }
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to load hotel stays.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [booking._id]);

    useEffect(() => {
        if (!loading && focusItemId) document.getElementById(`hotel-request-${focusItemId}`)?.scrollIntoView({ block: "nearest" });
    }, [loading, focusItemId]);

    const confirmedCount = stays.filter((stay) => stay.status === "Confirmed").length;
    const requestedCount = stays.filter((stay) => stay.status === "Requested").length;
    const coverage = getHotelNightCoverage(trip, stays);

    const downloadVoucher = async (stay) => {
        if (busy || showForm) return;
        setBusy(true);
        setDownloadingStayId(stay._id);
        setError("");
        setSuccess("");
        try {
            const response = await api.post(`/booking-pdf/hotel-voucher/${booking._id}/${stay._id}`, {}, { responseType: "blob" });
            const fileUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
            const link = document.createElement("a");
            const safeCode = String(trip.bookingCode || "booking").replace(/[^a-zA-Z0-9-]/g, "-");
            try {
                link.href = fileUrl;
                link.download = `dream-ceylon-hotel-voucher-${safeCode}-${stay._id}.pdf`;
                document.body.appendChild(link);
                link.click();
            } finally {
                link.remove();
                window.setTimeout(() => window.URL.revokeObjectURL(fileUrl), 1000);
            }
            setSuccess(`Hotel voucher downloaded for ${stay.hotelName}.`);
        } catch (err) {
            let message = "Failed to download hotel voucher.";
            if (err.response?.data instanceof Blob) {
                try {
                    const detail = JSON.parse(await err.response.data.text());
                    message = detail.message || message;
                } catch {
                    // Keep a readable fallback for non-JSON proxy/server errors.
                }
            } else if (err.response?.data?.message) {
                message = err.response.data.message;
            }
            setError(message);
        } finally {
            setDownloadingStayId("");
            setBusy(false);
        }
    };

    const resetForm = () => {
        setForm(emptyForm());
        setEditingId("");
        setShowForm(false);
    };

    const editStay = (stay) => {
        setError("");
        setSuccess("");
        setForm({
            hotelName: stay.hotelName || "",
            location: stay.location || "",
            supplierEmail: stay.supplierEmail || "",
            checkInDate: toCalendarDateInput(stay.checkInDate),
            checkOutDate: toCalendarDateInput(stay.checkOutDate),
            rooms: stay.rooms || 1,
            roomType: stay.roomType || "",
            mealPlan: stay.mealPlan || "Room Only",
            status: stay.status || "Requested",
            followUpDate: toCalendarDateInput(stay.followUpDate),
            confirmationNumber: stay.confirmationNumber || "",
            cancellationDeadline: toCalendarDateInput(stay.cancellationDeadline),
            cancellationTerms: stay.cancellationTerms || "",
            notes: stay.notes || "",
        });
        setEditingId(stay._id);
        setShowForm(true);
    };

    const saveStay = async (event) => {
        event.preventDefault();
        if (busy) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const url = `/bookings/${booking._id}/hotel-stays`;
            const payload = { ...form, rooms: Number(form.rooms) };
            const response = editingId
                ? await api.put(`${url}/${editingId}`, payload)
                : await api.post(url, payload);
            setStays(response.data.hotelStays || []);
            setSuccess(editingId ? "Hotel stay updated." : "Hotel stay added.");
            resetForm();
            notifySupplierConfirmationsChanged();
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save hotel stay.");
        } finally {
            setBusy(false);
        }
    };

    const removeStay = async (stay) => {
        if (busy || !window.confirm(`Remove ${stay.hotelName} from this booking?`)) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.delete(`/bookings/${booking._id}/hotel-stays/${stay._id}`);
            setStays(response.data.hotelStays || []);
            if (editingId === stay._id) resetForm();
            notifySupplierConfirmationsChanged();
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove hotel stay.");
        } finally {
            setBusy(false);
        }
    };

    const updateField = (event) => setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));

    return (
        <>
            <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="booking-hotels-title">
                <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 id="booking-hotels-title" className="modal-title"><FaHotel className="me-2" />Hotel reservations</h5>
                                <small className="text-muted">{booking.bookingCode} · {booking.customer?.fullName}</small>
                            </div>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                        </div>

                        <div className="modal-body">
                            <p className="text-muted small">Internal stay details for this booking. Record supplier costs separately in Cost & Profit.</p>
                            {canDownloadVoucher && <p className="text-muted small">Confirmed stays have a guest hotel voucher with saved reservation details. Supplier prices and internal notes are excluded. Save or cancel edits before downloading.</p>}
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {success && <div className="alert alert-success" role="status">{success}</div>}

                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                                <h6 className="fw-bold mb-0">{confirmedCount} confirmed · {requestedCount} awaiting confirmation</h6>
                                {canUpdate && !loading && !showForm && (
                                    <button className="btn btn-primary btn-sm" type="button" onClick={() => { setForm(emptyForm()); setEditingId(""); setShowForm(true); }} disabled={busy || stays.length >= 50}>
                                        <FaPlus className="me-2" />Add hotel stay
                                    </button>
                                )}
                            </div>

                            {!loading && coverage && coverage.activeStays > 0 && (
                                <section className="border rounded-3 p-3 mb-3" aria-label="Hotel night coverage">
                                    <h6 className="fw-bold mb-2">Hotel night coverage</h6>
                                    <p className="small mb-2">{coverage.confirmedNights} of {coverage.totalNights} trip nights have a confirmed stay.</p>
                                    <div className="d-flex flex-wrap gap-2 mb-2">
                                        <span className="badge text-bg-success">{coverage.confirmedNights} confirmed</span>
                                        {coverage.requestedOnlyNights > 0 && <span className="badge text-bg-warning">{coverage.requestedOnlyNights} requested only</span>}
                                        {coverage.missingNights > 0 && <span className="badge text-bg-danger">{coverage.missingNights} without a stay</span>}
                                        {coverage.multipleStayNights > 0 && <span className="badge text-bg-info">{coverage.multipleStayNights} with multiple stays</span>}
                                    </div>
                                    {coverage.missingRanges.length > 0 && <p className="small mb-1"><strong>No stay recorded:</strong> {coverage.missingRanges.map(formatNightRange).join(", ")}</p>}
                                    {coverage.requestedOnlyRanges.length > 0 && <p className="small mb-1"><strong>Confirmation pending:</strong> {coverage.requestedOnlyRanges.map(formatNightRange).join(", ")}</p>}
                                    {coverage.multipleStayRanges.length > 0 && <p className="small mb-1"><strong>Multiple stays to review:</strong> {coverage.multipleStayRanges.map(formatNightRange).join(", ")}</p>}
                                    {coverage.outsideTrip.length > 0 && (
                                        <p className="small mb-1"><strong>Outside travel dates:</strong> {coverage.outsideTrip.map((stay) => stay.hotelName + " (" + formatCalendarDate(stay.checkInDate) + " – " + formatCalendarDate(stay.checkOutDate) + ")").join("; ")}</p>
                                    )}
                                    <small className="text-muted">This checks dates, not room capacity. Multiple stays may be intentional for split groups.</small>
                                </section>
                            )}
                            {!loading && coverage?.activeStays === 0 && stays.length > 0 && (
                                <div className="alert alert-secondary py-2 small">Only cancelled stays are recorded. Add an active stay if this booking includes accommodation.</div>
                            )}

                            {loading ? <p className="text-muted">Loading hotel stays...</p> : stays.length === 0 ? (
                                <div className="border rounded-3 p-3 text-muted mb-3">No hotel stays recorded. Transport-only bookings can leave this empty.</div>
                            ) : (
                                <div className="row g-3 mb-4">
                                    {stays.map((stay) => (
                                        <div key={stay._id} className="col-12 col-lg-6">
                                            <div id={`hotel-request-${stay._id}`} className={`border rounded-4 p-3 h-100 ${focusItemId === stay._id ? "border-primary" : ""}`}>
                                                <div className="d-flex justify-content-between align-items-start gap-2">
                                                    <div>
                                                        <h6 className="fw-bold mb-1">{stay.hotelName}</h6>
                                                        <small className="text-muted">{stay.location || "Location not specified"}</small>
                                                    </div>
                                                    <span className={`badge ${stay.status === "Confirmed" ? "text-bg-success" : stay.status === "Cancelled" ? "text-bg-secondary" : "text-bg-warning"}`}>
                                                        {stay.status}
                                                    </span>
                                                </div>
                                                <div className="small mt-3">
                                                    <div><strong>Stay:</strong> {formatCalendarDate(stay.checkInDate)} – {formatCalendarDate(stay.checkOutDate)}</div>
                                                    <div><strong>Rooms:</strong> {stay.rooms} {stay.roomType && `· ${stay.roomType}`}</div>
                                                    <div><strong>Meal plan:</strong> {stay.mealPlan}</div>
                                                    {stay.status === "Requested" && <div><strong>Follow up:</strong> {stay.followUpDate ? formatCalendarDate(stay.followUpDate) : "Not scheduled"}</div>}
                                                    {stay.cancellationDeadline && <div className={stay.status !== "Cancelled" && toCalendarDateInput(stay.cancellationDeadline) < todayCalendarDate() ? "text-danger" : ""}>
                                                        <strong>Cancellation cutoff:</strong> {formatCalendarDate(stay.cancellationDeadline)}{stay.status !== "Cancelled" && toCalendarDateInput(stay.cancellationDeadline) < todayCalendarDate() ? " · Passed" : ""}</div>}
                                                    {stay.cancellationTerms && <div><strong>Cancellation terms:</strong> {stay.cancellationTerms}</div>}
                                                    {stay.confirmationNumber && <div><strong>Confirmation:</strong> {stay.confirmationNumber}</div>}
                                                    {stay.supplierEmail && <div><strong>Supplier email:</strong> {stay.supplierEmail}</div>}
                                                    {stay.notes && <div className="text-muted mt-2">{stay.notes}</div>}
                                                </div>
                                                {(canUpdate || onOpenContacts || (canDownloadVoucher && stay.status === "Confirmed" && trip.bookingStatus !== "Cancelled")) && (
                                                    <div className="d-flex flex-wrap gap-2 mt-3">
                                                        {onOpenContacts && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onOpenContacts(stay._id)} disabled={busy || showForm}><FaHistory className="me-1" />{canUpdate && stay.status === "Requested" ? "Log contact" : "Contact history"}</button>}
                                                        {canUpdate && <>
                                                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => editStay(stay)} disabled={busy}><FaEdit className="me-1" />Edit</button>
                                                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeStay(stay)} disabled={busy}><FaTrash className="me-1" />Remove</button>
                                                            {stay.status === "Requested" && trip.bookingStatus !== "Cancelled" && trip.bookingStatus !== "Completed" && onPrepareEmail && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onPrepareEmail(stay._id)} disabled={busy || showForm}><FaEnvelope className="me-1" />Prepare email</button>}
                                                            {stay.status === "Confirmed" && !["Cancelled", "Completed"].includes(trip.bookingStatus) && onPrepareRooming && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onPrepareRooming(stay._id)} disabled={busy || showForm}><FaEnvelope className="me-1" />Rooming email</button>}
                                                            {trip.bookingStatus === "Cancelled" && stay.status !== "Cancelled" && onPrepareCancellation && <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => onPrepareCancellation(stay._id)} disabled={busy || showForm}><FaEnvelope className="me-1" />Cancellation email</button>}
                                                        </>}
                                                        {canDownloadVoucher && stay.status === "Confirmed" && trip.bookingStatus !== "Cancelled" && (
                                                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => downloadVoucher(stay)} disabled={busy || showForm}>
                                                                <FaFilePdf className="me-1" />{downloadingStayId === stay._id ? "Preparing PDF..." : "Hotel voucher"}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {canUpdate && !loading && showForm && (
                                <form id="hotel-stay-form" onSubmit={saveStay}>
                                    <h6 className="fw-bold mb-3">{editingId ? "Edit hotel stay" : "Add hotel stay"}</h6>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-name">Property / hotel *</label>
                                            <input id="stay-name" name="hotelName" className="form-control" value={form.hotelName} onChange={updateField} maxLength={120} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-location">Location</label>
                                            <input id="stay-location" name="location" className="form-control" value={form.location} onChange={updateField} maxLength={120} placeholder="e.g. Sigiriya" />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-supplier-email">Supplier email</label>
                                            <input id="stay-supplier-email" name="supplierEmail" type="email" className="form-control" value={form.supplierEmail} onChange={updateField} maxLength={254} placeholder="reservations@hotel.com" />
                                            <small className="text-muted">Optional; used in confirmation drafts. Guest contact remains separate.</small>
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label" htmlFor="stay-check-in">Check-in *</label>
                                            <input id="stay-check-in" name="checkInDate" type="date" className="form-control" value={form.checkInDate} onChange={updateField} required />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label" htmlFor="stay-check-out">Check-out *</label>
                                            <input id="stay-check-out" name="checkOutDate" type="date" className="form-control" value={form.checkOutDate} onChange={updateField} required />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label" htmlFor="stay-rooms">Rooms *</label>
                                            <input id="stay-rooms" name="rooms" type="number" min="1" max="20" step="1" className="form-control" value={form.rooms} onChange={updateField} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-room-type">Room type</label>
                                            <input id="stay-room-type" name="roomType" className="form-control" value={form.roomType} onChange={updateField} maxLength={100} placeholder="e.g. Superior double" />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-meal-plan">Meal plan</label>
                                            <select id="stay-meal-plan" name="mealPlan" className="form-select" value={form.mealPlan} onChange={updateField}>
                                                {mealPlans.map((plan) => <option key={plan}>{plan}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-status">Reservation status</label>
                                            <select id="stay-status" name="status" className="form-select" value={form.status} onChange={updateField}>
                                                {statuses.map((status) => <option key={status}>{status}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-reference">Hotel confirmation reference</label>
                                            <input id="stay-reference" name="confirmationNumber" className="form-control" value={form.confirmationNumber} onChange={updateField} maxLength={100} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-follow-up">Supplier follow-up date</label>
                                            <input id="stay-follow-up" name="followUpDate" type="date" className="form-control" value={form.followUpDate} onChange={updateField} max={form.checkInDate || undefined} />
                                            <small className="text-muted">Optional. Follow up by check-in if confirmation is still pending.</small>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" htmlFor="stay-cancellation-deadline">Hotel cancellation cutoff</label>
                                            <input id="stay-cancellation-deadline" name="cancellationDeadline" type="date" className="form-control"
                                                value={form.cancellationDeadline} onChange={updateField} max={form.checkInDate || undefined} />
                                            <small className="text-muted">Optional reminder date. Check the hotel’s exact cutoff time and policy.</small>
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label" htmlFor="stay-cancellation-terms">Cancellation terms</label>
                                            <input id="stay-cancellation-terms" name="cancellationTerms" className="form-control" maxLength={300}
                                                value={form.cancellationTerms} onChange={updateField} placeholder="e.g. Free until 18:00 Sri Lanka time, then one night charged" />
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label" htmlFor="stay-notes">Internal notes</label>
                                            <textarea id="stay-notes" name="notes" className="form-control" rows="2" value={form.notes} onChange={updateField} maxLength={500} />
                                        </div>
                                    </div>
                                    <div className="d-flex justify-content-end gap-2 mt-3">
                                        <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={busy}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : editingId ? "Save changes" : "Add stay"}</button>
                                    </div>
                                </form>
                            )}
                            {stays.length >= 50 && <small className="text-muted">Maximum of 50 hotel stays per booking.</small>}
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" />
        </>
    );
};

export default BookingHotelsModal;
