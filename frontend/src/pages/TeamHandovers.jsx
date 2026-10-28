import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaHistory, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingActivityModal from "../components/BookingActivityModal";
import { formatCalendarDate } from "../utils/calendarDate";

const formatTime = (value) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Colombo",
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const TeamHandovers = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = searchParams.get("filter") === "all" ? "all" : "active";
    const requestedPage = Number(searchParams.get("page"));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const [data, setData] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        api.get("/bookings/handover-worklist", { params: { page, filter } })
            .then(({ data: result }) => {
                if (!active) return;
                if (page > result.totalPages) {
                    setSearchParams(result.totalPages > 1 ? { page: String(result.totalPages), filter } : { filter }, { replace: true });
                    return;
                }
                setData(result);
                setError("");
            })
            .catch((err) => { if (active) { setData(null); setError(err.response?.data?.message || "Could not load team handovers."); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [page, filter, reload, setSearchParams]);

    const refresh = () => setReload((value) => value + 1);
    const changePage = (next) => setSearchParams(next > 1 ? { page: String(next), filter } : { filter });
    const visibleData = data?.page === page && data?.filter === filter ? data : null;

    return <div>
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
            <div><h3 className="mb-1"><FaHistory className="me-2" />Team Handovers</h3>
                <p className="text-muted mb-0">Find bookings with handover notes, ordered by the latest update.</p></div>
            <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        <p className="alert alert-info small">This list shows dates and note counts only. Open a booking to read its private team notes. The list includes saved notes from any date; it does not track which notes you have read.</p>
        <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Handover booking filter">
            {[["active", "Open bookings"], ["all", "All bookings"]].map(([value, label]) => <button type="button" key={value}
                aria-pressed={filter === value} className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setSearchParams(value === "active" ? {} : { filter: value })}>{label}</button>)}
        </div>
        {loading && <p className="text-muted" role="status">Loading handovers...</p>}
        {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={refresh}>Retry</button></div>}
        {!loading && !error && visibleData && <>
            <p className="small text-muted">{visibleData.total} {visibleData.total === 1 ? "booking" : "bookings"} with notes · newest update first.</p>
            {!visibleData.items.length && <div className="card border-0 shadow-sm"><div className="card-body">
                <p className="text-muted mb-2">No handover notes in this view yet.</p>
                <Link to="/bookings" className="btn btn-outline-primary btn-sm">Open bookings</Link>
            </div></div>}
            <div className="d-grid gap-3">{visibleData.items.map((item) => <article className="card border-0 shadow-sm" key={item.bookingId}>
                <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                    <div><h5 className="mb-1">{item.bookingCode}</h5>
                        <div className="small text-muted">{item.bookingStatus} · Departs {formatCalendarDate(item.travelStartDate)}</div>
                        <div className="small mt-1">{item.noteCount} {item.noteCount === 1 ? "note" : "notes"} · Latest by {item.lastAuthor} on {formatTime(item.lastNoteAt)} (Sri Lanka time)</div>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                        <Link to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`} className="btn btn-sm btn-outline-secondary">Open booking</Link>
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelectedBooking({ _id: item.bookingId, bookingCode: item.bookingCode })}>Read handover</button>
                    </div>
                </div>
            </article>)}</div>
            {visibleData.totalPages > 1 && <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-4">
                <small className="text-muted">Page {page} of {visibleData.totalPages}</small>
                <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= visibleData.totalPages} onClick={() => changePage(page + 1)}>Next</button>
                </div>
            </div>}
        </>}
        {selectedBooking && <BookingActivityModal key={selectedBooking._id} booking={selectedBooking} initialTab="handover"
            onClose={() => { setSelectedBooking(null); refresh(); }} />}
    </div>;
};

export default TeamHandovers;
