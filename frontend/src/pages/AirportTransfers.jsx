import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaPlane, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingTransportModal from "../components/BookingTransportModal";
import { formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

const initialFilters = () => {
    const startDate = todayCalendarDate();
    const endDate = new Date(new Date(startDate + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return { startDate, endDate, direction: "all", status: "all", chauffeur: "all", page: 1 };
};

const AirportTransfers = () => {
    const [filters, setFilters] = useState(initialFilters);
    const [form, setForm] = useState(filters);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/bookings/airport-transfers", { params: filters })
            .then(({ data: result }) => {
                if (!active) return;
                if (filters.page > result.totalPages) {
                    setFilters((current) => ({ ...current, page: result.totalPages }));
                    return;
                }
                setData(result);
                setLoading(false);
            })
            .catch((err) => {
                if (!active) return;
                setData(null);
                setError(err.response?.data?.message || "Failed to load airport transfers.");
                setLoading(false);
            });
        return () => { active = false; };
    }, [filters]);

    const loadFilters = (next) => {
        setError("");
        setLoading(true);
        setFilters({ ...next });
    };
    const refresh = () => loadFilters(filters);
    const applyFilters = (event) => {
        event.preventDefault();
        loadFilters({ ...form, page: 1 });
    };
    const resetFilters = () => {
        const next = initialFilters();
        setForm(next);
        loadFilters(next);
    };
    const selectedBooking = selected && {
        _id: selected.bookingId,
        bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName },
        travelStartDate: selected.travelStartDate,
        travelEndDate: selected.travelEndDate,
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-4">
                <div>
                    <h3 className="mb-1"><FaPlane className="me-2" />Airport Transfers</h3>
                    <p className="text-muted mb-0">Plan airport pickups and drop-offs across active bookings. All dates and times are in Sri Lanka time.</p>
                </div>
                <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            <div className="card border-0 shadow-sm mb-4"><div className="card-body">
                <form onSubmit={applyFilters}>
                    <div className="row g-3 align-items-end">
                        <div className="col-6 col-lg-2">
                            <label className="form-label" htmlFor="transfer-start">Pickup from</label>
                            <input id="transfer-start" type="date" className="form-control" required value={form.startDate}
                                onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
                        </div>
                        <div className="col-6 col-lg-2">
                            <label className="form-label" htmlFor="transfer-end">Pickup through</label>
                            <input id="transfer-end" type="date" className="form-control" required min={form.startDate} value={form.endDate}
                                onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
                        </div>
                        <div className="col-6 col-lg-2">
                            <label className="form-label" htmlFor="transfer-direction">Flight</label>
                            <select id="transfer-direction" className="form-select" value={form.direction}
                                onChange={(event) => setForm({ ...form, direction: event.target.value })}>
                                <option value="all">All flights</option><option value="Arrival">Arrivals</option><option value="Departure">Departures</option>
                            </select>
                        </div>
                        <div className="col-6 col-lg-2">
                            <label className="form-label" htmlFor="transfer-status">Transfer status</label>
                            <select id="transfer-status" className="form-select" value={form.status}
                                onChange={(event) => setForm({ ...form, status: event.target.value })}>
                                <option value="all">All active</option><option value="Requested">Requested</option><option value="Confirmed">Confirmed</option>
                            </select>
                        </div>
                        <div className="col-6 col-lg-2">
                            <label className="form-label" htmlFor="transfer-chauffeur">Chauffeur</label>
                            <select id="transfer-chauffeur" className="form-select" value={form.chauffeur}
                                onChange={(event) => setForm({ ...form, chauffeur: event.target.value })}>
                                <option value="all">All assignments</option><option value="missing">Missing name</option>
                            </select>
                        </div>
                        <div className="col-6 col-lg-2 d-flex gap-2 flex-wrap">
                            <button className="btn btn-primary" type="submit" disabled={loading}>Apply</button>
                            <button className="btn btn-outline-secondary" type="button" onClick={resetFilters} disabled={loading}>Next 7 days</button>
                        </div>
                    </div>
                    <small className="text-muted d-block mt-3">Choose up to 31 days. The pickup date is the transport leg’s start date; flight date and time are shown separately.</small>
                </form>
            </div></div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {loading && <div className="text-muted py-4" role="status">Loading airport transfers...</div>}

            {!loading && !error && data && (
                <>
                    <p className="text-muted">Pickups: {formatCalendarDate(data.startDate)} – {formatCalendarDate(data.endDate)} · Totals reflect the applied filters.</p>
                    <div className="row g-3 mb-4">
                        {[
                            ["Transfers", data.total],
                            ["Awaiting confirmation", data.summary.requested],
                            ["Missing chauffeur name", data.summary.missingChauffeur],
                            ["Missing pickup time", data.summary.missingPickupTime],
                        ].map(([label, count]) => (
                            <div className="col-6 col-lg-3" key={label}>
                                <div className="card border-0 shadow-sm h-100"><div className="card-body">
                                    <div className="text-muted small">{label}</div><strong className="fs-3">{count}</strong>
                                </div></div>
                            </div>
                        ))}
                    </div>

                    {data.items.length === 0 ? (
                        <div className="card border-0 shadow-sm"><div className="card-body text-center py-5">
                            <h5>No airport transfers match these filters</h5>
                            <p className="text-muted mb-3">Open a booking’s Transport panel and attach arrival or departure flight details to a transport leg. Requested and confirmed transfers on active bookings appear here.</p>
                            <Link className="btn btn-outline-primary" to="/bookings">Open bookings</Link>
                        </div></div>
                    ) : (
                        <div className="d-grid gap-3">
                            {data.items.map((item) => (
                                <article className="card border-0 shadow-sm" key={item.bookingId + "-" + item._id}>
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                                            <div>
                                                <h5 className="mb-1">{item.route}</h5>
                                                <Link to={"/bookings?keyword=" + encodeURIComponent(item.bookingCode)}>{item.bookingCode}</Link>
                                                <span className="text-muted"> · {item.customerName || "Guest"} · {item.numberOfTravelers || 0} travellers</span>
                                                <small className="d-block text-muted">Booking: {item.bookingStatus}</small>
                                            </div>
                                            <div className="d-flex align-items-center gap-2 flex-wrap">
                                                <span className={"badge " + (item.status === "Confirmed" ? "text-bg-success" : "text-bg-warning")}>{item.status}</span>
                                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}
                                                    aria-label={"Review transport for " + item.bookingCode}>Review transport</button>
                                            </div>
                                        </div>
                                        <div className="row g-3">
                                            <div className="col-md-4">
                                                <div className="small text-muted mb-1">Pickup</div>
                                                <strong>{formatCalendarDate(item.pickupDate)} · {item.pickupTime || "Time not set"}</strong>
                                                <div className="mt-1">From: {item.pickupLocation || "Not set"}</div>
                                                <div>To: {item.dropoffLocation || "Not set"}</div>
                                                {!item.pickupTime && <span className="badge text-bg-warning mt-2">Set pickup time</span>}
                                            </div>
                                            <div className="col-md-4">
                                                <div className="small text-muted mb-1">{item.flight.direction} flight</div>
                                                <strong>{item.flight.number}</strong>
                                                <div>{formatCalendarDate(item.flight.date)} · {item.flight.time || "Time not set"}</div>
                                                <div>{item.flight.airport || "Airport not set"}{item.flight.terminal && " · " + item.flight.terminal}</div>
                                            </div>
                                            <div className="col-md-4">
                                                <div className="small text-muted mb-1">Chauffeur &amp; vehicle</div>
                                                <strong>{item.chauffeurName || "Chauffeur not assigned"}</strong>
                                                {item.chauffeurPhone && <div>{item.chauffeurPhone}</div>}
                                                <div>{item.vehicleDescription || "Vehicle not set"}{item.registration && " · " + item.registration}</div>
                                                {item.missingChauffeur && <span className="badge text-bg-warning mt-2">Assign chauffeur</span>}
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}

                    {data.totalPages > 1 && (
                        <div className="d-flex justify-content-between align-items-center gap-3 mt-4">
                            <small className="text-muted">Page {data.page} of {data.totalPages} · {data.total} transfers</small>
                            <div className="d-flex gap-2">
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={filters.page <= 1}
                                    onClick={() => loadFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={filters.page >= data.totalPages}
                                    onClick={() => loadFilters({ ...filters, page: filters.page + 1 })}>Next</button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {selected && <BookingTransportModal booking={selectedBooking} focusItemId={selected._id}
                onChanged={refresh} onClose={() => { setSelected(null); refresh(); }} />}
        </div>
    );
};

export default AirportTransfers;
