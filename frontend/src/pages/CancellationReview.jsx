import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaBan, FaSyncAlt } from "react-icons/fa";
import api from "../api/axios";
import BookingHotelsModal from "../components/BookingHotelsModal";
import BookingTransportModal from "../components/BookingTransportModal";
import BookingPaymentsModal from "../components/BookingPaymentsModal";
import HotelSupplierEmailModal from "../components/HotelSupplierEmailModal";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate } from "../utils/calendarDate";

const emptyData = { items: [], summary: { total: 0, withActiveServices: 0 },
    total: 0, page: 1, pageSize: 20, pages: 0 };
const formatMoney = (amount, currency) => `${currency} ${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
const formatRecordedAt = (value) => new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short",
});

const FinancialSnapshot = ({ item }) => {
    const rows = item.guestLedger || [];
    const received = rows.filter((row) => row.currency === item.currency && row.status === "Received")
        .reduce((sum, row) => sum + row.amount, 0);
    const refunded = rows.filter((row) => row.currency === item.currency && row.status === "Refunded")
        .reduce((sum, row) => sum + row.amount, 0);
    const foreign = rows.filter((row) => row.currency !== item.currency);
    const difference = Math.round((Number(item.bookedPaidAmount || 0) - (received - refunded)) * 100);

    return <div className="border-top pt-3 mt-3 small">
        <strong>Finance review</strong>
        <div className="row g-2 mt-1">
            <div className="col-md-6">
                <div>Booked paid total: {formatMoney(item.bookedPaidAmount, item.currency)}</div>
                <div>Payment records: received {formatMoney(received, item.currency)} · refunded {formatMoney(refunded, item.currency)}</div>
                {difference !== 0 && <div className="text-warning-emphasis fw-semibold">Booked paid total differs from payment records. Verify the ledger before deciding any refund.</div>}
                {foreign.length > 0 && <div className="text-warning-emphasis">Some payment records use another currency; review them in Payments.</div>}
            </div>
            <div className="col-md-6">
                {item.supplierCosts?.length ? item.supplierCosts.map((cost) =>
                    <div key={cost.currency}>Supplier costs ({cost.currency}): recorded {formatMoney(cost.recordedCost, cost.currency)} · paid {formatMoney(cost.recordedPaid, cost.currency)} · unpaid {formatMoney(cost.recordedUnpaid, cost.currency)}</div>
                ) : <div>No supplier costs recorded.</div>}
            </div>
        </div>
        <div className="text-muted mt-1">Recorded amounts are review context. Check cancellation terms and agree any supplier charge or guest refund separately.</div>
    </div>;
};

const CancellationReview = () => {
    const { hasPermission } = usePermissions();
    const canRequestCancellation = hasPermission("booking.update");
    const canSeeFinance = hasPermission("payment.view") && hasPermission("cost.view");
    const [filter, setFilter] = useState("open");
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
        api.get("/bookings/cancellation-review", { params: { filter, page } })
            .then(({ data: response }) => {
                if (!active) return;
                if (page > Math.max(1, response.pages)) {
                    setPage(Math.max(1, response.pages));
                    return;
                }
                setData(response);
            })
            .catch((requestError) => {
                if (active) setError(requestError.response?.data?.message || "Could not load cancellation review.");
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filter, page, reloadKey]);

    const refresh = () => setReloadKey((current) => current + 1);
    const openPanel = (item, type, itemId = "") => setSelected({ item, type, itemId });
    const selectedBooking = selected && { _id: selected.item._id, bookingCode: selected.item.bookingCode,
        customer: { fullName: selected.item.customerName }, bookingStatus: "Cancelled",
        travelStartDate: selected.item.travelStartDate, currency: selected.item.currency };

    return <div>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-4">
            <div><h3 className="fw-bold mb-1"><FaBan className="me-2 text-primary" />Cancellation review</h3>
                <p className="text-muted mb-0">Follow up on cancelled trips with hotel or transport arrangements still open.</p></div>
            <button type="button" className="btn btn-outline-primary" disabled={loading} onClick={refresh}><FaSyncAlt className="me-2" />Refresh</button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="row g-3 mb-4">
            <div className="col-sm-6"><div className="card border-0 shadow-sm"><div className="card-body"><small className="text-muted">Cancelled trips with open arrangements</small><h3 className="mb-0 text-warning-emphasis">{data.summary.withActiveServices}</h3></div></div></div>
            <div className="col-sm-6"><div className="card border-0 shadow-sm"><div className="card-body"><small className="text-muted">All cancelled trips</small><h3 className="mb-0">{data.summary.total}</h3></div></div></div>
        </div>
        <div className="card border-0 shadow-sm"><div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Cancellation review filter">
                {[{ value: "open", label: "Open arrangements" }, { value: "all", label: "All cancelled trips" }].map(({ value, label }) =>
                    <button key={value} type="button" aria-pressed={filter === value}
                        className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{label}</button>)}
            </div>
            <p className="small text-muted">Requested and confirmed services on cancelled trips stay here until their individual status is changed. Contact the supplier and check the agreed terms before recording a cancellation. This screen does not calculate fees or issue refunds.</p>
            {loading && <p className="text-muted" role="status">Loading cancelled trips...</p>}
            {!loading && !error && data.items.length === 0 && <p className="text-muted mb-0">No cancelled trips in this view.</p>}
            {!loading && !error && data.items.map((item) => <div key={item._id} className="border rounded-3 p-3 mb-3">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                    <div><strong>{item.bookingCode}</strong> · {item.customerName}
                        <div className="small text-muted">Travel start: {formatCalendarDate(item.travelStartDate)} · Last edited: {formatCalendarDate(item.updatedAt)}</div></div>
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                        <span className={`badge ${item.activeServiceCount ? "text-bg-warning" : "text-bg-success"}`}>
                            {item.activeServiceCount} open {item.activeServiceCount === 1 ? "arrangement" : "arrangements"}
                        </span>
                        <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Booking</Link>
                    </div>
                </div>
                <div className="small mt-2"><strong>Cancellation reason:</strong> {item.cancellationReason || "Not recorded for this older booking"}
                    {item.cancelledAt && <div className="text-muted">Recorded {formatRecordedAt(item.cancelledAt)} (Sri Lanka){item.cancelledByName && ` by ${item.cancelledByName}`}</div>}
                </div>
                {item.activeServiceCount > 0 && <div className="row g-2 mt-2">
                    {item.activeHotels.map((stay) => <div className="col-md-6" key={stay._id}>
                        <div className="border rounded p-2 h-100 small">
                            <strong>Hotel · {stay.name}</strong> <span className="text-muted">({stay.status})</span>
                            <div>Check-in: {formatCalendarDate(stay.date)}{stay.cancellationDeadline && ` · Cutoff: ${formatCalendarDate(stay.cancellationDeadline)}`}</div>
                            {stay.cancellationTerms && <div className="text-muted">{stay.cancellationTerms}</div>}
                            <div className="d-flex flex-wrap gap-2 mt-2">
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openPanel(item, "hotel", stay._id)}>Review hotel</button>
                                {canRequestCancellation && <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => openPanel(item, "cancellation-email", stay._id)}>Prepare cancellation email</button>}
                            </div>
                        </div>
                    </div>)}
                    {item.activeTransport.map((leg) => <div className="col-md-6" key={leg._id}>
                        <div className="border rounded p-2 h-100 small">
                            <strong>Transport · {leg.name}</strong> <span className="text-muted">({leg.status})</span>
                            <div>Start: {formatCalendarDate(leg.date)}</div>
                            <button type="button" className="btn btn-sm btn-outline-primary mt-2" onClick={() => openPanel(item, "transport", leg._id)}>Review transport</button>
                        </div>
                    </div>)}
                </div>}
                {canSeeFinance && item.guestLedger && <>
                    <FinancialSnapshot item={item} />
                    <div className="d-flex flex-wrap gap-2 mt-2">
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openPanel(item, "payment")}>Guest payments</button>
                        <Link className="btn btn-sm btn-outline-secondary" to={`/cost-profit?type=booking&id=${item._id}`}>Supplier costs</Link>
                    </div>
                </>}
            </div>)}
            {!loading && !error && data.total > 0 && <div className="d-flex justify-content-between align-items-center gap-2">
                <small className="text-muted">Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</small>
                <div className="d-flex align-items-center gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                    <span className="small">Page {data.page} of {Math.max(data.pages, 1)}</span>
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
                </div>
            </div>}
        </div></div>
        {selected?.type === "hotel" && <BookingHotelsModal key={`${selected.item._id}-${selected.itemId}`} booking={selectedBooking}
            focusItemId={selected.itemId} onClose={() => { setSelected(null); refresh(); }} onChanged={refresh}
            onPrepareCancellation={(stayId) => openPanel(selected.item, "cancellation-email", stayId)} />}
        {selected?.type === "cancellation-email" && canRequestCancellation && <HotelSupplierEmailModal
            key={`${selected.item._id}-${selected.itemId}`} bookingId={selected.item._id} stayId={selected.itemId}
            purpose="cancellation" onClose={() => setSelected(null)} />}
        {selected?.type === "transport" && <BookingTransportModal key={`${selected.item._id}-${selected.itemId}`} booking={selectedBooking}
            focusItemId={selected.itemId} onClose={() => { setSelected(null); refresh(); }} onChanged={refresh} />}
        {selected?.type === "payment" && canSeeFinance && <BookingPaymentsModal booking={selectedBooking}
            onClose={() => { setSelected(null); refresh(); }} onPaymentChanged={refresh} />}
    </div>;
};

export default CancellationReview;
