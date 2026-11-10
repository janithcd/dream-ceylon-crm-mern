import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaCar, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingTransportModal from "../components/BookingTransportModal";
import { addCalendarDays, formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

const defaultDates = () => {
    const from = todayCalendarDate();
    return { from, to: addCalendarDays(from, 6) };
};
const choices = [
    ["all", "All assignments"], ["attention", "Needs attention"], ["requested", "Requested"],
    ["confirmed", "Confirmed"], ["missingDriver", "Missing driver"],
    ["missingVehicle", "Missing registration"], ["missingPickup", "Missing pickup"],
];

export default function TransportDispatch() {
    const [filters, setFilters] = useState(() => ({ ...defaultDates(), filter: "all", page: 1 }));
    const [dates, setDates] = useState(() => defaultDates());
    const [reload, setReload] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/bookings/transport-dispatch", { params: filters }).then(({ data: result }) => {
            if (!active) return;
            if (filters.page > result.totalPages) {
                setFilters((current) => ({ ...current, page: result.totalPages }));
                return;
            }
            setData(result); setError(""); setLoading(false);
        }).catch((err) => {
            if (!active) return;
            setError(err.response?.data?.message || "Could not load the transport dispatch schedule.");
            setData(null); setLoading(false);
        });
        return () => { active = false; };
    }, [filters, reload]);

    const refresh = () => { setLoading(true); setError(""); setReload((value) => value + 1); };
    const choose = (filter) => { setLoading(true); setFilters((current) => ({ ...current, filter, page: 1 })); };
    const submitDates = (event) => { event.preventDefault(); setLoading(true); setFilters((current) => ({ ...current, ...dates, page: 1 })); };
    const resetDates = () => { const next = defaultDates(); setDates(next); setLoading(true); setFilters((current) => ({ ...current, ...next, page: 1 })); };
    const changePage = (page) => { setLoading(true); setFilters((current) => ({ ...current, page })); };
    const booking = selected && { _id: selected.bookingId, bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName }, travelStartDate: selected.travelStartDate,
        travelEndDate: selected.travelEndDate };

    return <div>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-4">
            <div><h3 className="fw-bold mb-1"><FaCar className="me-2 text-primary" />Transport Dispatch</h3>
                <p className="text-muted mb-0">Review all tours and transfers on active bookings, including services continuing into the selected dates. Dates and times are in Sri Lanka.</p></div>
            <button type="button" className="btn btn-outline-primary" disabled={loading} onClick={refresh}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        <div className="card border-0 shadow-sm mb-4"><div className="card-body">
            <form className="row g-3 align-items-end" onSubmit={submitDates}>
                <div className="col-sm-4 col-lg-3"><label className="form-label" htmlFor="dispatch-from">From</label>
                    <input className="form-control" type="date" id="dispatch-from" required value={dates.from} onChange={(event) => setDates({ ...dates, from: event.target.value })} /></div>
                <div className="col-sm-4 col-lg-3"><label className="form-label" htmlFor="dispatch-to">Through</label>
                    <input className="form-control" type="date" id="dispatch-to" required min={dates.from} value={dates.to} onChange={(event) => setDates({ ...dates, to: event.target.value })} /></div>
                <div className="col-sm-4 col-lg-6 d-flex flex-wrap gap-2"><button type="submit" className="btn btn-primary" disabled={loading}>Apply dates</button>
                    <button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={resetDates}>Next 7 days</button></div>
            </form>
            <p className="small text-muted mt-3 mb-0">Choose up to 31 days. A multi-day drive appears if any of its service dates overlap this range. Flight-only pickups are also available in Airport Transfers.</p>
        </div></div>
        {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={refresh}>Retry</button></div>}
        {loading && <p className="text-muted" role="status">Loading transport dispatch…</p>}
        {!loading && data && <>
            <p className="text-muted">Service dates: {formatCalendarDate(data.from)} – {formatCalendarDate(data.to)} · {data.total} in this view.</p>
            <div className="row g-3 mb-4">
                {[["All active", data.summary.total], ["Needs attention", data.summary.attention], ["Awaiting confirmation", data.summary.requested],
                    ["Missing driver details", data.summary.missingDriver], ["Missing registration", data.summary.missingVehicle], ["Missing pickup details", data.summary.missingPickup]]
                    .map(([label, count]) => <div className="col-6 col-md-4 col-xl-2" key={label}><div className="card border-0 shadow-sm h-100"><div className="card-body p-3">
                        <small className="text-muted">{label}</small><div className="fs-3 fw-bold">{count}</div></div></div></div>)}
            </div>
            <div className="card border-0 shadow-sm"><div className="card-body">
                <div className="d-flex gap-2 flex-wrap mb-3" role="group" aria-label="Dispatch filter">
                    {choices.map(([value, label]) => <button type="button" key={value} className={`btn btn-sm ${filters.filter === value ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => choose(value)}>{label}</button>)}
                </div>
                <p className="small text-muted">Requested assignments need supplier confirmation. Confirmed assignments need a chauffeur name and phone, registration, pickup time and location before dispatch. Review possible vehicle overlaps in the booking’s Transport panel.</p>
                {!data.items.length ? <div className="py-4 text-center"><p className="mb-2">No transport assignments in this view.</p>
                    <Link to="/bookings" className="btn btn-outline-primary btn-sm">Open bookings</Link></div> :
                    <div className="table-responsive"><table className="table align-middle">
                        <thead><tr><th>Service</th><th>Booking / guest</th><th>Dates</th><th>Vehicle and chauffeur</th><th>Attention</th><th className="text-end">Action</th></tr></thead>
                        <tbody>{data.items.map((item) => <tr key={`${item.bookingId}-${item._id}`}>
                            <td><strong>{item.route}</strong><div><span className={`badge ${item.status === "Confirmed" ? "text-bg-success" : "text-bg-warning"}`}>{item.status}</span></div></td>
                            <td>{item.bookingCode}<div className="small text-muted">{item.customerName}</div></td>
                            <td>{formatCalendarDate(item.startDate)} – {formatCalendarDate(item.endDate)}
                                <div className="small text-muted">{item.pickupTime ? `${item.pickupTime} (Sri Lanka)` : "Time to confirm"}{item.pickupLocation && ` · ${item.pickupLocation}`}{item.dropoffLocation && ` → ${item.dropoffLocation}`}</div></td>
                            <td>{item.registration || "Registration needed"}<div className="small text-muted">{item.vehicleDescription && `${item.vehicleDescription} · `}{item.chauffeurName || "Chauffeur needed"}{item.chauffeurPhone && ` · ${item.chauffeurPhone}`}</div></td>
                            <td><div className="d-flex flex-wrap gap-1">
                                {item.status === "Requested" && <span className="badge text-bg-warning">Confirmation needed</span>}
                                {item.missingDriver && <span className="badge text-bg-danger">Driver details</span>}
                                {item.missingVehicle && <span className="badge text-bg-danger">Registration</span>}
                                {item.missingPickup && <span className="badge text-bg-danger">Pickup details</span>}
                                {!item.needsAttention && <span className="badge text-bg-success">Ready for dispatch</span>}
                            </div></td>
                            <td className="text-end"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}>Review transport</button></td>
                        </tr>)}</tbody>
                    </table></div>}
                {data.totalPages > 1 && <div className="d-flex align-items-center justify-content-between gap-2">
                    <small className="text-muted">Page {data.page} of {data.totalPages}</small>
                    <div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>Previous</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={data.page >= data.totalPages} onClick={() => changePage(data.page + 1)}>Next</button></div>
                </div>}
            </div></div>
        </>}
        {selected && <BookingTransportModal booking={booking} focusItemId={selected._id} onChanged={refresh}
            onClose={() => { setSelected(null); refresh(); }} />}
    </div>;
}
