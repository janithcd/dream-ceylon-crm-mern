import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaClipboardCheck, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { usePermissions } from "../context/PermissionContext";
import PreArrivalMessageModal from "../components/PreArrivalMessageModal";

const statusLabels = { attention: "Needs action", review: "Review scope", "recorded-clear": "No recorded gaps" };
const statusClasses = { attention: "text-bg-warning", review: "text-bg-secondary", "recorded-clear": "text-bg-success" };
const messageFilters = { all: "All departures", unsent: "Awaiting note", sent: "Note recorded" };

const DepartureReadiness = () => {
    const { hasPermission } = usePermissions();
    const [messageBookingId, setMessageBookingId] = useState(null);
    const [page, setPage] = useState(1);
    const [messageFilter, setMessageFilter] = useState("all");
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        api.get("/bookings/departure-readiness", { params: { page, message: messageFilter } })
            .then(({ data: result }) => {
                if (!active) return;
                if (page > result.totalPages) { setPage(result.totalPages); return; }
                setData(result);
                setError("");
            })
            .catch((err) => {
                if (!active) return;
                setData(null);
                setError(err.response?.data?.message || "Failed to load departure readiness.");
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [page, messageFilter, reloadKey]);

    const refresh = () => {
        setLoading(true);
        setError("");
        setReloadKey((value) => value + 1);
    };
    const changePage = (value) => {
        setLoading(true);
        setPage(value);
    };
    const changeFilter = (value) => {
        setLoading(true);
        setPage(1);
        setMessageFilter(value);
    };

    return <div>
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
            <div>
                <h3 className="mb-1"><FaClipboardCheck className="me-2" />Departure Readiness</h3>
                <p className="text-muted mb-0">Review active bookings starting in the next 30 days, including today in Sri Lanka time.</p>
            </div>
            <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        <div className="alert alert-info small">
            This view checks saved traveler names, supplier confirmations, hotel rooming plans and open tasks. A missing plan or service may be outside the agreed scope. Confirm the arrangements with the team; payment and supplier costs are reviewed separately.
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Pre-arrival message filter">
            {Object.entries(messageFilters).map(([value, label]) => <button key={value} type="button"
                className={`btn btn-sm ${messageFilter === value ? "btn-primary" : "btn-outline-primary"}`}
                aria-pressed={messageFilter === value} onClick={() => changeFilter(value)}>{label}</button>)}
        </div>
        {loading && <p role="status" className="text-muted py-3">Checking upcoming departures...</p>}
        {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={refresh}>Try again</button></div>}
        {!loading && !error && data && <>
            <p className="text-muted small">{data.total} {data.total === 1 ? "booking" : "bookings"} {messageFilter === "all" ? "departing in this window" : `in ${messageFilters[messageFilter].toLowerCase()}`} · ordered by departure date.</p>
            {!data.items.length ? <div className="card border-0 shadow-sm"><div className="card-body text-center py-5">
                <h5>No matching departures</h5><p className="text-muted mb-3">Confirmed bookings that still need a note appear under Awaiting note.</p>
                <Link className="btn btn-outline-primary" to="/bookings">Open bookings</Link>
            </div></div> : <div className="d-grid gap-3">
                {data.items.map((item) => <article className="card border-0 shadow-sm" key={item._id}>
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
                            <div>
                                <h5 className="mb-1">{item.bookingCode}</h5>
                                <div className="text-muted small">{item.customerName || "Guest"} · Departs {formatCalendarDate(item.travelStartDate)} · {item.bookingStatus}</div>
                            </div>
                            <div className="d-flex align-items-center flex-wrap gap-2">
                                <span className={`badge ${statusClasses[item.status]}`}>{statusLabels[item.status]}</span>
                                {item.preArrivalSentAt ? <span className="badge text-bg-success">Note recorded</span>
                                    : item.bookingStatus === "Confirmed" ? <span className="badge text-bg-warning">Note not recorded</span>
                                        : <span className="badge text-bg-secondary">Confirm before note</span>}
                                {item.bookingStatus === "Confirmed" && hasPermission("booking.update") && <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMessageBookingId(item._id)}>{item.preArrivalSentAt ? "View arrival note" : "Prepare arrival note"}</button>}
                                <Link className="btn btn-sm btn-outline-primary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}&open=readiness`}>Review booking</Link>
                            </div>
                        </div>
                        {item.preArrivalSentAt && <p className="text-muted small mb-3">Pre-arrival note recorded by {item.preArrivalSentByName || "Staff"} via {item.preArrivalSentChannel} on {new Date(item.preArrivalSentAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} (Sri Lanka time).</p>}
                        <div className="row g-3 small">
                            <div className="col-sm-6 col-xl"><strong>Travelers</strong><div className={item.missingTravelerCount ? "text-warning-emphasis" : "text-muted"}>{item.namedTravelerCount} of {item.travelerCount} named{item.missingTravelerCount ? ` · ${item.missingTravelerCount} missing` : ""}</div></div>
                            <div className="col-sm-6 col-xl"><strong>Hotels</strong><div className={item.pendingHotelCount ? "text-warning-emphasis" : "text-muted"}>{item.pendingHotelCount ? `${item.pendingHotelCount} awaiting confirmation` : "No pending confirmations"}</div></div>
                            <div className="col-sm-6 col-xl"><strong>Rooming plans</strong><div className={item.staleRoomingCount ? "text-warning-emphasis" : "text-muted"}>{item.staleRoomingCount ? `${item.staleRoomingCount} stale` : "No stale plans"}{item.missingRoomingCount ? ` · ${item.missingRoomingCount} missing` : ""}</div></div>
                            <div className="col-sm-6 col-xl"><strong>Transport</strong><div className={item.pendingTransportCount ? "text-warning-emphasis" : "text-muted"}>{item.pendingTransportCount ? `${item.pendingTransportCount} awaiting confirmation` : "No pending confirmations"}</div></div>
                            <div className="col-sm-6 col-xl"><strong>Tasks</strong><div className={item.openTaskCount ? "text-warning-emphasis" : "text-muted"}>{item.openTaskCount} open</div></div>
                        </div>
                    </div>
                </article>)}
            </div>}
            {data.totalPages > 1 && <div className="d-flex justify-content-between align-items-center gap-3 mt-4">
                <small className="text-muted">Page {data.page} of {data.totalPages}</small>
                <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.totalPages} onClick={() => changePage(page + 1)}>Next</button>
                </div>
            </div>}
        </>}
        {messageBookingId && <PreArrivalMessageModal bookingId={messageBookingId} onContactChanged={refresh} onClose={() => setMessageBookingId(null)} />}
    </div>;
};

export default DepartureReadiness;
