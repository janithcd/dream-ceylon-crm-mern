import { useEffect, useRef, useState } from "react";
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate } from "../utils/calendarDate";
import { getBookingReadiness } from "../utils/bookingReadiness";

const statusLabels = { attention: "Needs attention", clear: "No gaps found", unassessed: "Not assessed" };
const statusClasses = { attention: "text-bg-warning", clear: "text-bg-success", unassessed: "text-bg-secondary" };
const actionLabels = { booking: "Edit booking", travelers: "Open traveler roster", itinerary: "Open itinerary", hotels: "Open hotels", transport: "Open transport", tasks: "Open checklist" };

const BookingReadinessModal = ({ bookingId, onClose, onOpenSection }) => {
    const { hasPermission } = usePermissions();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const dialogRef = useRef(null);
    const closeRef = useRef(onClose);

    useEffect(() => { closeRef.current = onClose; }, [onClose]);
    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}`)
            .then(({ data }) => { if (active) setTrip(data); })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to load the readiness review.");
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, reloadKey]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeRef.current();
            }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea")]
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
        setTrip(null);
        setLoading(true);
        setError("");
        setReloadKey((value) => value + 1);
    };
    const review = trip ? getBookingReadiness(trip) : null;

    return (
        <>
            <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="booking-readiness-title">
                <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="booking-readiness-title">Readiness review{trip?.bookingCode && ` · ${trip.bookingCode}`}</h5>
                            <button type="button" className="btn-close" aria-label="Close readiness review" onClick={onClose} />
                        </div>
                        <div className="modal-body">
                            {loading && <p className="text-muted" role="status">Checking the latest saved booking details...</p>}
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {!loading && !trip && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                            {!loading && trip && <>
                                <p className="mb-1 fw-semibold text-break">{trip.customer?.fullName || "Guest name missing"}</p>
                                <p className="text-muted small">{formatCalendarDate(trip.travelStartDate)} – {formatCalendarDate(trip.travelEndDate)} · {trip.bookingStatus}</p>
                                {review.inactive ? <div className="alert alert-secondary mb-0">This booking is {trip.bookingStatus.toLowerCase()}. Readiness checks apply to active trips only.</div> : <>
                                    <div className={`alert ${review.attentionCount ? "alert-warning" : review.unassessedCount ? "alert-secondary" : "alert-success"}`} role="status">
                                        <strong>{review.attentionCount
                                            ? `${review.attentionCount} ${review.attentionCount === 1 ? "area needs" : "areas need"} attention`
                                            : review.unassessedCount ? "More information is needed" : "No gaps found in the recorded details"}</strong>
                                        <div className="small mt-1">{review.unassessedCount > 0 && `${review.unassessedCount} ${review.unassessedCount === 1 ? "area has" : "areas have"} not been assessed. `}Review the agreed services before departure. This checks saved records and does not mark the trip ready.</div>
                                    </div>
                                    <div className="d-flex flex-column gap-3">
                                        {review.sections.map((item) => <section key={item.id} className="border rounded p-3" aria-labelledby={`readiness-${item.id}`}>
                                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                                                <h6 className="mb-0" id={`readiness-${item.id}`}>{item.status === "attention" ? <FaExclamationCircle className="me-2 text-warning" aria-hidden="true" /> : item.status === "clear" ? <FaCheckCircle className="me-2 text-success" aria-hidden="true" /> : <FaInfoCircle className="me-2 text-secondary" aria-hidden="true" />}{item.title}</h6>
                                                <span className={`badge ${statusClasses[item.status]}`}>{statusLabels[item.status]}</span>
                                            </div>
                                            <p className="small text-muted mb-2">{item.summary}</p>
                                            {item.issues.length > 0 && <ul className="small ps-3 mb-3 text-break">{item.issues.map((issue, index) => <li className="mb-1" key={index}>{issue}</li>)}</ul>}
                                            {(item.id !== "booking" || hasPermission("booking.update")) && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onOpenSection(item.id, trip)}>{actionLabels[item.id]}</button>}
                                        </section>)}
                                    </div>
                                    <p className="small text-muted mt-3 mb-0">Reopen this review after saving changes. Dates and overdue tasks use Sri Lanka time. Payments and supplier costs are reviewed separately.</p>
                                </>}
                            </>}
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-secondary" onClick={reload} disabled={loading}><FaSyncAlt className="me-2" aria-hidden="true" />Refresh review</button>
                            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" />
        </>
    );
};

export default BookingReadinessModal;
