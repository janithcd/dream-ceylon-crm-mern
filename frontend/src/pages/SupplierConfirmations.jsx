import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaClipboardCheck, FaEnvelope, FaHistory, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingHotelsModal from "../components/BookingHotelsModal";
import HotelSupplierEmailModal from "../components/HotelSupplierEmailModal";
import SupplierContactModal from "../components/SupplierContactModal";
import BookingTransportModal from "../components/BookingTransportModal";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const emptyData = {
    items: [], summary: { open: 0, hotels: 0, transport: 0, overdue: 0, today: 0, noDue: 0 },
    total: 0, page: 1, totalPages: 1,
};

const dateChoices = [
    { value: "all", label: "All dates" },
    { value: "actionable", label: "Due now" },
    { value: "overdue", label: "Overdue", count: "overdue" },
    { value: "today", label: "Due today", count: "today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "noDue", label: "No follow-up", count: "noDue" },
];

const followUpStatus = (followUpDate, today) => {
    if (!followUpDate) return { label: "Not scheduled", color: "secondary" };
    const date = toCalendarDateInput(followUpDate);
    if (date < today) return { label: "Overdue", color: "danger" };
    if (date === today) return { label: "Due today", color: "warning" };
    return { label: "Upcoming", color: "primary" };
};

const SupplierConfirmations = () => {
    const { hasPermission } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();
    const [type, setType] = useState("all");
    const requestedDateFilter = searchParams.get("dateFilter");
    const dateFilter = dateChoices.some((choice) => choice.value === requestedDateFilter) ? requestedDateFilter : "all";
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [selectedContact, setSelectedContact] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/bookings/supplier-confirmations", { params: { type, dateFilter, page } })
            .then((response) => {
                if (active) setData(response.data);
            })
            .catch((requestError) => {
                if (active) {
                    setData(emptyData);
                    setError(requestError.response?.data?.message || "Failed to load supplier confirmations.");
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [type, dateFilter, page, reloadKey]);

    const refresh = () => {
        setError("");
        setLoading(true);
        setReloadKey((key) => key + 1);
    };
    const changeFilter = (setter, value) => {
        setter(value);
        setPage(1);
        setLoading(true);
        setError("");
    };
    const changeDateFilter = (value) => {
        setSearchParams(value === "all" ? {} : { dateFilter: value });
        setPage(1);
        setLoading(true);
        setError("");
    };
    const afterChange = () => {
        if (page > 1 && data.items.length === 1) setPage(page - 1);
        else refresh();
    };
    const selectedBooking = selected && {
        _id: selected.bookingId,
        bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName },
    };
    const today = todayCalendarDate();

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1"><FaClipboardCheck className="me-2 text-primary" />Supplier Confirmations</h3>
                    <p className="text-muted mb-0">Hotel and transport requests awaiting a reply. Follow-up dates use Sri Lanka time.</p>
                </div>
                <button type="button" className="btn btn-outline-primary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}

            <div className="row g-3 mb-4">
                {[
                    { label: "Awaiting reply", value: data.summary.open, color: "primary" },
                    { label: "Hotels", value: data.summary.hotels, color: "primary" },
                    { label: "Transport", value: data.summary.transport, color: "primary" },
                    { label: "Overdue follow-ups", value: data.summary.overdue, color: "danger" },
                    { label: "Due today", value: data.summary.today, color: "warning" },
                ].map((item) => (
                    <div className="col-6 col-md-4 col-xl" key={item.label}>
                        <div className="card border-0 shadow-sm rounded-4 h-100"><div className="card-body p-3">
                            <small className="text-muted">{item.label}</small>
                            <h3 className={`fw-bold text-${item.color} mb-0`}>{item.value}</h3>
                        </div></div>
                    </div>
                ))}
            </div>

            <div className="card border-0 shadow-sm rounded-4"><div className="card-body p-4">
                <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Supplier type">
                    {[
                        { value: "all", label: "All requests", count: data.summary.open },
                        { value: "hotel", label: "Hotels", count: data.summary.hotels },
                        { value: "transport", label: "Transport", count: data.summary.transport },
                    ].map((choice) => (
                        <button type="button" key={choice.value} className={`btn btn-sm ${type === choice.value ? "btn-primary" : "btn-outline-primary"}`} onClick={() => changeFilter(setType, choice.value)}>
                            {choice.label} ({choice.count})
                        </button>
                    ))}
                </div>
                <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Follow-up date">
                    {dateChoices.map((choice) => (
                        <button type="button" key={choice.value} className={`btn btn-sm ${dateFilter === choice.value ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => changeDateFilter(choice.value)}>
                            {choice.label}{choice.count ? ` (${data.summary[choice.count]})` : choice.value === "actionable" ? ` (${data.summary.overdue + data.summary.today})` : ""}
                        </button>
                    ))}
                </div>

                {loading ? <p className="text-muted mb-0" role="status">Loading supplier requests...</p> : !data.items.length ? (
                    <p className="text-muted mb-0">No requests awaiting confirmation in this view.</p>
                ) : (
                    <div className="table-responsive"><table className="table align-middle mb-0">
                        <thead><tr><th>Request</th><th>Booking / guest</th><th>Service date</th><th>Follow up</th><th className="text-end">Actions</th></tr></thead>
                        <tbody>{data.items.map((item) => {
                            const due = followUpStatus(item.followUpDate, today);
                            const servicePassed = toCalendarDateInput(item.serviceDate) < today;
                            return (
                                <tr key={`${item.bookingId}-${item.type}-${item._id}`}>
                                    <td>
                                        <span className={`badge me-2 ${item.type === "hotel" ? "text-bg-info" : "text-bg-primary"}`}>{item.type === "hotel" ? "Hotel" : "Transport"}</span>
                                        <strong>{item.title}</strong>
                                        {item.detail && <small className="d-block text-muted mt-1">{item.detail}</small>}
                                    </td>
                                    <td><div>{item.bookingCode}</div><small className="text-muted">{item.customerName || "-"}</small></td>
                                    <td>
                                        {formatCalendarDate(item.serviceDate)}{item.endDate && ` – ${formatCalendarDate(item.endDate)}`}
                                        {servicePassed && <span className="badge text-bg-danger d-block mt-1" style={{ width: "fit-content" }}>Service date passed</span>}
                                    </td>
                                    <td>
                                        <div>{formatCalendarDate(item.followUpDate)}</div><span className={`badge text-bg-${due.color}`}>{due.label}</span>
                                        {item.lastContactedAt && <small className="d-block text-muted mt-1">Last contacted {formatCalendarDate(item.lastContactedAt)} · {item.lastContactChannel}</small>}
                                    </td>
                                    <td className="text-end">
                                        <div className="d-flex justify-content-end gap-2 flex-wrap">
                                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}>Review</button>
                                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelectedContact({ bookingId: item.bookingId, type: item.type, itemId: item._id })}><FaHistory className="me-1" />{hasPermission("booking.update") ? "Log contact" : "History"}</button>
                                            {item.type === "hotel" && hasPermission("booking.update") && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelectedEmail({ bookingId: item.bookingId, stayId: item._id })}><FaEnvelope className="me-1" />Prepare email</button>}
                                            <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Booking</Link>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}</tbody>
                    </table></div>
                )}

                {!loading && data.totalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <small className="text-muted">Page {data.page} of {data.totalPages} · {data.total} requests</small>
                        <div className="d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.totalPages} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
                        </div>
                    </div>
                )}
            </div></div>

            {selected?.type === "hotel" && <BookingHotelsModal booking={selectedBooking} focusItemId={selected._id} onClose={() => { setSelected(null); refresh(); }} onChanged={afterChange} onPrepareEmail={(stayId) => { setSelectedEmail({ bookingId: selected.bookingId, stayId }); setSelected(null); }} onOpenContacts={(stayId) => { setSelectedContact({ bookingId: selected.bookingId, type: "hotel", itemId: stayId }); setSelected(null); }} />}
            {selected?.type === "transport" && <BookingTransportModal booking={selectedBooking} focusItemId={selected._id} onClose={() => { setSelected(null); refresh(); }} onChanged={afterChange} onOpenContacts={(itemId) => { setSelectedContact({ bookingId: selected.bookingId, type: "transport", itemId }); setSelected(null); }} />}
            {selectedEmail && <HotelSupplierEmailModal key={`${selectedEmail.bookingId}-${selectedEmail.stayId}`} bookingId={selectedEmail.bookingId} stayId={selectedEmail.stayId} onClose={() => setSelectedEmail(null)} />}
            {selectedContact && <SupplierContactModal key={`${selectedContact.bookingId}-${selectedContact.itemId}`} {...selectedContact} onClose={() => { setSelectedContact(null); refresh(); }} onChanged={refresh} />}
        </div>
    );
};

export default SupplierConfirmations;
