import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import BookingExcursions from "../components/BookingExcursions";
import { ACTIVITY_STATUSES } from "../utils/excursionOptions";
import { addCalendarDays, formatCalendarDate, todayCalendarDate } from "../utils/calendarDate";

export default function Excursions() {
    const [params, setParams] = useSearchParams();
    const selectedId = params.get("booking") || "";
    const [filters, setFilters] = useState(() => ({ from: todayCalendarDate(), to: addCalendarDays(todayCalendarDate(), 6), status: "active", attention: "all" }));
    const [query, setQuery] = useState(filters);
    const [page, setPage] = useState(1);
    const [reload, setReload] = useState(0);
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [bookings, setBookings] = useState([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchError, setSearchError] = useState("");
    const selectBooking = (id) => setParams((current) => { const next = new URLSearchParams(current); next.delete("activity"); if (id) next.set("booking", id); else next.delete("booking"); return next; });
    useEffect(() => {
        let active = true;
        api.get("/bookings/excursion-schedule", { params: { ...query, page } }).then(({ data }) => {
            if (active) { if (page > data.pages) setPage(data.pages); else setSchedule(data); }
        }).catch((err) => { if (active) { setSchedule(null); setError(err.response?.data?.message || "Could not load the activity schedule."); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [query, page, reload]);
    const refreshSchedule = () => { setLoading(true); setError(""); setReload((n) => n + 1); };
    const changePage = (value) => { setLoading(true); setError(""); setPage(value); };
    const search = async (event) => {
        event.preventDefault(); setSearchBusy(true); setSearchError(""); setBookings([]);
        try { const { data } = await api.get("/bookings", { params: { keyword, limit: 100, page: 1 } }); setBookings(data.bookings); if (!data.bookings.length) setSearchError("No matching bookings."); }
        catch (err) { setSearchError(err.response?.data?.message || "Could not search bookings."); }
        finally { setSearchBusy(false); }
    };
    return <div>
        <div className="d-flex flex-wrap justify-content-between gap-2 mb-3"><div><h3>Activities &amp; Excursions</h3><p className="text-muted">Plan safaris, guides, train reservations and experiences. Track supplier confirmations and give guests clear meeting instructions.</p></div>
            <button className="btn btn-outline-secondary align-self-start" disabled={loading} onClick={refreshSchedule}>Refresh schedule</button></div>
        <div className="card border-0 shadow-sm mb-4"><div className="card-body"><h5>Find a booking to manage activities</h5>
            <form onSubmit={search} className="d-flex gap-2"><input className="form-control" aria-label="Booking reference or customer name" placeholder="Booking reference or customer name" maxLength={100} value={keyword} onChange={(e) => setKeyword(e.target.value)} /><button className="btn btn-primary" disabled={searchBusy}>{searchBusy ? "Searching…" : "Search"}</button></form>
            {searchError && <p role="status" className="mt-2 mb-0">{searchError}</p>}
            {!!bookings.length && <><label htmlFor="excursion-booking" className="form-label mt-2">Select booking (up to 100 matches)</label><select id="excursion-booking" className="form-select" value={bookings.some((b) => b._id === selectedId) ? selectedId : ""} onChange={(e) => selectBooking(e.target.value)}><option value="">Choose booking…</option>{bookings.map((b) => <option value={b._id} key={b._id}>{b.bookingCode} · {b.customer?.fullName} · {b.bookingStatus}</option>)}</select></>}
        </div></div>
        {selectedId && <div className="mb-4"><div className="d-flex gap-2 mb-2"><Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(bookings.find((b) => b._id === selectedId)?.bookingCode || "")}`}>Bookings</Link><button className="btn btn-sm btn-outline-secondary" onClick={() => selectBooking("")}>Close booking activities</button></div><BookingExcursions key={selectedId} bookingId={selectedId} onChanged={refreshSchedule} focusItemId={params.get("activity") || ""} /></div>}
        <section className="card border-0 shadow-sm"><div className="card-body"><h5>Operations schedule</h5><p className="small text-muted">Filter by activity date, up to 31 days at a time. Follow-up flags apply to activities in this date range. All dates and times are in Sri Lanka.</p>
            <form className="row g-3 mb-3" onSubmit={(e) => { e.preventDefault(); setLoading(true); setError(""); setPage(1); setQuery({ ...filters }); }}>
                {[["from", "From"], ["to", "To"]].map(([name, label]) => <div className="col-md-2" key={name}><label className="form-label" htmlFor={`schedule-${name}`}>{label}</label><input className="form-control" id={`schedule-${name}`} type="date" required value={filters[name]} onChange={(e) => setFilters({ ...filters, [name]: e.target.value })} /></div>)}
                <div className="col-md-3"><label className="form-label" htmlFor="schedule-status">Status</label><select id="schedule-status" className="form-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="active">Active activities</option><option value="all">All statuses</option>{ACTIVITY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
                <div className="col-md-3"><label className="form-label" htmlFor="schedule-attention">Attention</label><select id="schedule-attention" className="form-select" value={filters.attention} onChange={(e) => setFilters({ ...filters, attention: e.target.value })}><option value="all">All activities</option><option value="followup">Follow-up due</option><option value="missing">Missing arrangements</option><option value="cancellation">Cancellation follow-up</option></select></div>
                <div className="col-md-2 d-flex align-items-end"><button className="btn btn-primary" disabled={loading}>Apply</button></div>
            </form>
            {error && <p className="alert alert-danger" role="alert">{error}</p>}
            {loading && <p role="status">Loading schedule…</p>}
            {!loading && schedule && !error && <><p className="small"><strong>{schedule.total}</strong> activities · <strong>{schedule.summary.requested}</strong> awaiting confirmation · <strong>{schedule.summary.confirmed}</strong> confirmed · <strong>{schedule.summary.followUpDue}</strong> follow-ups due</p>
                {!schedule.items.length ? <p className="text-muted">No activities match these dates and filters.</p> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Date / time</th><th>Booking / activity</th><th>Supplier / meeting point</th><th>Status</th><th>Action</th></tr></thead><tbody>{schedule.items.map((item) => <tr key={item._id}>
                    <td>{formatCalendarDate(item.date)}<div className="small">{item.startTime || "Time needed"}</div></td><td><strong>{item.title}</strong><div className="small">{item.bookingCode} · {item.type} · {item.participants} participants</div>{["Cancelled", "Completed"].includes(item.bookingStatus) && <div className="small text-danger">Booking {item.bookingStatus.toLowerCase()}</div>}</td>
                    <td>{item.supplierName || "Supplier needed"}<div className="small">{item.supplierPhone}</div><div className="small text-muted">{item.meetingPoint || "Meeting point needed"}</div></td><td>{item.status}{item.followUpDue && <div className="small text-danger">Follow-up due {formatCalendarDate(item.followUpDate)}</div>}{item.missingDetails && <div className="small text-warning-emphasis">Missing arrangements</div>}</td>
                    <td><button className="btn btn-sm btn-outline-primary" onClick={() => { selectBooking(item.bookingId); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Open activities</button></td>
                </tr>)}</tbody></table></div>}
                <div className="d-flex gap-3 align-items-center"><button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span className="small">Page {page} of {schedule.pages}</span><button className="btn btn-sm btn-outline-secondary" disabled={page >= schedule.pages} onClick={() => changePage(page + 1)}>Next</button></div>
            </>}
        </div></section>
    </div>;
}
