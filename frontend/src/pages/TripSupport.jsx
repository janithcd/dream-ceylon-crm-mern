import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaLifeRing, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import TripIssuesModal from "../components/TripIssuesModal";
import { formatCalendarDate } from "../utils/calendarDate";

const filters = [["open", "Unresolved issues"], ["mine", "My issues"], ["unassigned", "Unassigned"],
    ["active", "On tour today"], ["all", "All active and unresolved"]];

const TripSupport = () => {
    const [filter, setFilter] = useState("open");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedId = searchParams.get("booking");
    const setSelectedId = (id) => setSearchParams((current) => {
        const params = new URLSearchParams(current);
        if (id) params.set("booking", id);
        else params.delete("booking");
        return params;
    }, { replace: true });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        api.get("/bookings/trip-support", { params: { filter, page } })
            .then(({ data: result }) => {
                if (!active) return;
                if (page > result.pages) { setPage(result.pages); return; }
                setData(result); setError("");
            })
            .catch((err) => { if (active) { setData(null); setError(err.response?.data?.message || "Could not load trip support."); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filter, page, reloadKey]);

    const refresh = () => setReloadKey((value) => value + 1);
    return <div>
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
            <div><h3 className="mb-1"><FaLifeRing className="me-2" />Trip Support</h3>
                <p className="text-muted mb-0">See trips underway today and follow up on unresolved guest issues.</p></div>
            <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        <p className="alert alert-info small">A trip is active from its saved start through end date in Sri Lanka time. Issues are private operational records; opening or updating one does not message the guest. Unresolved issues remain here after a trip ends or its booking status changes.</p>
        {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={refresh}>Try again</button></div>}
        {data && <div className="row g-3 mb-4">
            {[["Trips underway today", data.summary.active], ["Bookings with open issues", data.summary.open],
                ["With issues assigned to me", data.summary.mine], ["With unassigned issues", data.summary.unassigned]].map(([label, count]) =>
                <div className="col-6 col-xl-3" key={label}><div className="card border-0 shadow-sm h-100"><div className="card-body"><small className="text-muted">{label}</small><h3 className="mb-0">{count}</h3></div></div></div>)}
        </div>}
        <div className="card border-0 shadow-sm"><div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Trip support filter">
                {filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value}
                    className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => { setFilter(value); setPage(1); setSelectedId(null); }}>{label}</button>)}
            </div>
            {loading && <p role="status" className="text-muted">Loading trips...</p>}
            {!loading && !error && data && <>
                {!data.items.length && <p className="text-muted mb-0">No trips in this view.</p>}
                <div className="d-grid gap-3">{data.items.map((item) => <article className="border rounded p-3" key={item._id}>
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                        <div><strong>{item.bookingCode}</strong> · {item.customerName || "Guest"}
                            <div className="small text-muted">{formatCalendarDate(item.travelStartDate)} – {formatCalendarDate(item.travelEndDate)} · {item.bookingStatus}</div>
                            <div className="small mt-1">{item.activeToday ? "On tour today" : "Trip no longer active"} · {item.openIssueCount} open {item.openIssueCount === 1 ? "issue" : "issues"}
                                {item.urgentIssueCount > 0 && <strong className="text-danger"> · {item.urgentIssueCount} urgent</strong>}</div>
                            {item.openIssueCount > 0 && <div className="small mt-1 text-muted">
                                {item.overdueIssueCount > 0 && <strong className="text-danger me-2">{item.overdueIssueCount} overdue</strong>}
                                {item.dueTodayIssueCount > 0 && <strong className="text-warning-emphasis me-2">{item.dueTodayIssueCount} due today</strong>}
                                {item.unscheduledIssueCount > 0 && <span>{item.unscheduledIssueCount} without a follow-up date</span>}
                            </div>}
                            {item.openIssueCount > 0 && <div className="small mt-1">
                                {item.ownerNames.length > 0 && <span>Owners: {item.ownerNames.join(", ")}</span>}
                                {item.unassignedIssueCount > 0 && <span className="text-warning-emphasis">{item.ownerNames.length > 0 ? " · " : ""}{item.unassignedIssueCount} unassigned</span>}
                                {item.myIssueCount > 0 && <span className="text-primary"> · {item.myIssueCount} mine</span>}
                            </div>}
                        </div>
                        <div className="d-flex gap-2 flex-wrap">
                            <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Open booking</Link>
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelectedId(item._id)}>Trip issues</button>
                        </div>
                    </div>
                </article>)}</div>
                {data.pages > 1 && <div className="d-flex justify-content-between align-items-center gap-3 mt-4">
                    <small className="text-muted">Page {data.page} of {data.pages} · {data.total} bookings</small>
                    <div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>
                </div>}
            </>}
        </div></div>
        {selectedId && <TripIssuesModal key={selectedId} bookingId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />}
    </div>;
};

export default TripSupport;
