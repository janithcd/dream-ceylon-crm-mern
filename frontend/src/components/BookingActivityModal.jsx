import { useEffect, useState } from "react";
import { FaHistory } from "react-icons/fa";
import api from "../api/axios";
import BookingHandoverPanel from "./BookingHandoverPanel";

const formatDateTime = (value) => {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const BookingActivityModal = ({ booking, onClose }) => {
    const [tab, setTab] = useState("history");
    const [events, setEvents] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${booking._id}/activity`, { params: { page } })
            .then(({ data }) => {
                if (!active) return;
                setEvents((current) => page === 1
                    ? data.events || []
                    : [...current, ...(data.events || []).filter((event) => !current.some((item) => item.id === event.id))]);
                setTotalPages(data.totalPages || 1);
                setError("");
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Could not load booking history.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [booking._id, page, reload]);

    return (
        <>
            <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="booking-activity-title">
                <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 id="booking-activity-title" className="modal-title"><FaHistory className="me-2" />Booking history &amp; handover</h5>
                                <small className="text-muted">{booking.bookingCode} · {booking.customer?.fullName}</small>
                            </div>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                        </div>

                        <div className="modal-body">
                            <div className="btn-group mb-3" role="group" aria-label="Booking record view">
                                <button type="button" className={`btn btn-sm ${tab === "history" ? "btn-primary" : "btn-outline-primary"}`}
                                    aria-pressed={tab === "history"} aria-controls="booking-history-panel" onClick={() => {
                                        setTab("history"); setPage(1); setLoading(true); setReload((value) => value + 1);
                                    }}>Activity</button>
                                <button type="button" className={`btn btn-sm ${tab === "handover" ? "btn-primary" : "btn-outline-primary"}`}
                                    aria-pressed={tab === "handover"} aria-controls="booking-handover-panel" onClick={() => setTab("handover")}>Handover notes</button>
                            </div>
                            {tab === "handover" ? <BookingHandoverPanel bookingId={booking._id} /> : <div id="booking-history-panel" role="region" aria-label="Booking activity">
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {events.length === 0 && !loading && !error && (
                                <p className="text-muted mb-0">No changes have been recorded for this booking.</p>
                            )}
                            <div className="list-group list-group-flush">
                                {events.map((event) => (
                                    <div className="list-group-item px-0 py-3" key={event.id}>
                                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                            <div>
                                                <span className="badge text-bg-light border me-2">{event.module}</span>
                                                <span className="badge text-bg-secondary">{event.action}</span>
                                            </div>
                                            <small className="text-muted">{formatDateTime(event.createdAt)} · Sri Lanka time</small>
                                        </div>
                                        <p className="mb-1 mt-2">{event.description}</p>
                                        <small className="text-muted">By {event.actor}</small>
                                    </div>
                                ))}
                            </div>
                            {loading && <p className="text-muted mt-3 mb-0" role="status">Loading history...</p>}
                            {page < totalPages && !loading && !error && (
                                <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>
                                    Load older changes
                                </button>
                            )}
                            {error && !loading && (
                                <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={() => { setError(""); setLoading(true); setReload((current) => current + 1); }}>
                                    Retry
                                </button>
                            )}
                            </div>}
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

export default BookingActivityModal;
