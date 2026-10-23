import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaHotel, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingHotelsModal from "../components/BookingHotelsModal";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const filters = [
    { value: "due7", label: "Due soon" },
    { value: "overdue", label: "Passed" },
    { value: "later", label: "Later" },
    { value: "all", label: "All upcoming stays" },
];
const emptyData = { items: [], summary: { total: 0, overdue: 0, dueSoon: 0, later: 0 },
    total: 0, page: 1, pageSize: 25, pages: 0 };

const HotelCancellationDeadlines = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedFilter = searchParams.get("filter");
    const filter = filters.some((choice) => choice.value === requestedFilter) ? requestedFilter : "due7";
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        api.get("/bookings/hotel-cancellation-deadlines", { params: { filter, page } })
            .then(({ data: response }) => {
                if (!active) return;
                if (page > Math.max(1, response.pages)) {
                    setPage(Math.max(1, response.pages));
                    return;
                }
                setData(response);
            })
            .catch((requestError) => {
                if (active) setError(requestError.response?.data?.message || "Could not load hotel deadlines.");
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filter, page, reloadKey]);

    const refresh = () => setReloadKey((current) => current + 1);
    const today = todayCalendarDate();
    const selectedBooking = selected && { _id: selected.bookingId, bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName } };

    return <div>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-4">
            <div><h3 className="fw-bold mb-1"><FaHotel className="me-2 text-primary" />Hotel cancellation deadlines</h3>
                <p className="text-muted mb-0">Review saved hotel cutoffs for upcoming stays. Dates use Sri Lanka time; confirm the exact time and policy with each hotel.</p></div>
            <button className="btn btn-outline-primary" type="button" disabled={loading} onClick={refresh}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="row g-3 mb-4">
            {[
                { label: "Passed cutoff", count: data.summary.overdue, color: "danger" },
                { label: "Today–next 6 days", count: data.summary.dueSoon, color: "warning" },
                { label: "Later", count: data.summary.later, color: "primary" },
                { label: "Tracked stays", count: data.summary.total, color: "primary" },
            ].map(({ label, count, color }) => <div className="col-6 col-lg-3" key={label}>
                <div className="card border-0 shadow-sm h-100"><div className="card-body"><small className="text-muted">{label}</small>
                    <h3 className={`fw-bold text-${color} mb-0`}>{count}</h3></div></div>
            </div>)}
        </div>
        <div className="card border-0 shadow-sm"><div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Cancellation deadline timing">
                {filters.map(({ value, label }) => <button className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-outline-primary"}`}
                    aria-pressed={filter === value} type="button" key={value} onClick={() => {
                        setSearchParams(value === "due7" ? {} : { filter: value }); setPage(1); setSelected(null);
                    }}>{label}</button>)}
            </div>
            <p className="small text-muted">Due soon includes passed cutoffs, today, and the next six Sri Lanka calendar days. Cancelled stays and stays whose check-in date has passed are excluded. A date alone does not confirm a free cancellation policy.</p>
            {loading && <p className="text-muted mb-0" role="status">Loading hotel deadlines...</p>}
            {!loading && !error && data.items.length === 0 && <p className="text-muted mb-0">No hotel cancellation deadlines in this view.</p>}
            {!loading && !error && data.items.length > 0 && <>
                <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                    <thead><tr><th>Cutoff</th><th>Hotel / status</th><th>Booking / guest</th><th>Check-in</th><th>Terms</th><th className="text-end">Actions</th></tr></thead>
                    <tbody>{data.items.map((item) => {
                        const passed = toCalendarDateInput(item.cancellationDeadline) < today;
                        return <tr key={`${item.bookingId}-${item._id}`}>
                            <td className={passed ? "text-danger fw-semibold" : "fw-semibold"}>{formatCalendarDate(item.cancellationDeadline)}
                                {passed && <span className="badge text-bg-danger d-block mt-1" style={{ width: "fit-content" }}>Passed</span>}</td>
                            <td><strong>{item.hotelName}</strong><div className="small text-muted">{item.location || ""} · {item.status}</div></td>
                            <td>{item.bookingCode}<div className="small text-muted">{item.customerName}</div></td>
                            <td>{formatCalendarDate(item.checkInDate)}</td>
                            <td className="small">{item.cancellationTerms || "Confirm policy with hotel"}</td>
                            <td className="text-end"><div className="d-flex justify-content-end flex-wrap gap-2">
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}>Review</button>
                                <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Booking</Link>
                            </div></td>
                        </tr>;
                    })}</tbody>
                </table></div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
                    <small className="text-muted">Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total} stays</small>
                    {data.pages > 1 && <div className="d-flex align-items-center gap-2">
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                        <span className="small">Page {data.page} of {data.pages}</span>
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
                    </div>}
                </div>
            </>}
        </div></div>
        {selected && <BookingHotelsModal booking={selectedBooking} focusItemId={selected._id}
            onClose={() => { setSelected(null); refresh(); }} onChanged={refresh} />}
    </div>;
};

export default HotelCancellationDeadlines;
