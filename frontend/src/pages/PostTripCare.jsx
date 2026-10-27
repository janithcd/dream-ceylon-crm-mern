import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaHeart, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import PostTripCareModal from "../components/PostTripCareModal";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate } from "../utils/calendarDate";

const filters = [
    ["due", "Contact needed"], ["closeout", "Close out trips"],
    ["waiting", "Awaiting feedback"], ["done", "Recorded outcomes"], ["all", "All recent trips"],
];

const PostTripCare = () => {
    const { hasPermission } = usePermissions();
    const [filter, setFilter] = useState("due");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(null);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        api.get("/bookings/post-trip-care", { params: { filter, page } })
            .then(({ data: result }) => {
                if (!active) return;
                if (page > result.pages) { setPage(result.pages); return; }
                setData(result); setError("");
            })
            .catch((err) => { if (active) { setData(null); setError(err.response?.data?.message || "Could not load post-trip care."); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filter, page, reloadKey]);

    const refresh = () => setReloadKey((value) => value + 1);
    return <div>
        <div className="d-flex flex-wrap justify-content-between gap-3 align-items-start mb-4">
            <div><h3 className="mb-1"><FaHeart className="me-2" />Post-trip Care</h3>
                <p className="text-muted mb-0">Close out ended tours, thank guests, and record feedback from the last 90 days.</p></div>
            <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        <p className="alert alert-info small">Tours enter this queue the day after their saved end date in Sri Lanka. Drafting a message or opening WhatsApp never sends it or records contact. Record contact only after reaching the guest. No automatic review request is sent.</p>
        {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={refresh}>Try again</button></div>}
        {data && <div className="row g-3 mb-4">
            {[["Trips to close", data.summary.closeout], ["Guests to contact", data.summary.due],
                ["Awaiting feedback", data.summary.waiting], ["Outcomes recorded", data.summary.done]].map(([label, count]) =>
                <div className="col-6 col-xl-3" key={label}><div className="card border-0 shadow-sm h-100"><div className="card-body"><small className="text-muted">{label}</small><h3 className="mb-0">{count}</h3></div></div></div>)}
        </div>}
        <div className="card border-0 shadow-sm"><div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Post-trip care filter">
                {filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value}
                    className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{label}</button>)}
            </div>
            {loading && <p role="status" className="text-muted">Loading recent trips...</p>}
            {!loading && !error && data && <>
                {!data.items.length && <p className="text-muted mb-0">No trips in this view.</p>}
                <div className="d-grid gap-3">
                    {data.items.map((item) => <article className="border rounded p-3" key={item._id}>
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                            <div><strong>{item.bookingCode}</strong> · {item.customerName || "Guest"}
                                <div className="small text-muted">Trip ended {formatCalendarDate(item.travelEndDate)} · {item.bookingStatus}</div>
                                <div className="small mt-1">{item.bookingStatus !== "Completed" ? "Needs booking closeout" : item.status}
                                    {item.contactCount ? ` · ${item.contactCount} ${item.contactCount === 1 ? "contact" : "contacts"}` : ""}
                                    {item.feedbackRating != null ? ` · Rating ${item.feedbackRating} / 5` : ""}</div>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                                <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Open booking</Link>
                                {item.bookingStatus === "Completed" && <button type="button" className="btn btn-sm btn-outline-primary"
                                    onClick={() => setSelected(item)}>{hasPermission("booking.update") ? "Manage care" : "View record"}</button>}
                            </div>
                        </div>
                    </article>)}
                </div>
                {data.pages > 1 && <div className="d-flex justify-content-between align-items-center gap-3 mt-4">
                    <small className="text-muted">Page {data.page} of {data.pages} · {data.total} trips</small>
                    <div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>
                </div>}
            </>}
        </div></div>
        {selected && <PostTripCareModal key={selected._id} booking={selected} onClose={() => setSelected(null)} onChanged={refresh} />}
    </div>;
};

export default PostTripCare;
