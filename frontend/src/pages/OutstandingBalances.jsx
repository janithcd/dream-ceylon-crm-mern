import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaSyncAlt, FaWallet } from "react-icons/fa";
import api from "../api/axios";
import BookingPaymentsModal from "../components/BookingPaymentsModal";
import { formatCalendarDate } from "../utils/calendarDate";

const emptyData = {
    items: [], summary: { open: 0, departed: 0, next30: 0, later: 0 },
    total: 0, page: 1, totalPages: 1,
};

const dateChoices = [
    { value: "next30", label: "Next 30 days", count: "next30" },
    { value: "departed", label: "Trip started", count: "departed" },
    { value: "later", label: "Later departures", count: "later" },
    { value: "all", label: "All open balances", count: "open" },
];

const formatMoney = (amount, currency) =>
    `${currency || "USD"} ${Number(amount || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const OutstandingBalances = () => {
    const [dateFilter, setDateFilter] = useState("next30");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/bookings/outstanding-balances", { params: { dateFilter, page } })
            .then((response) => {
                if (active) setData(response.data);
            })
            .catch((requestError) => {
                if (!active) return;
                setData(emptyData);
                setError(requestError.response?.data?.message || "Failed to load outstanding balances.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [dateFilter, page, reloadKey]);

    const refresh = () => {
        setLoading(true);
        setError("");
        setReloadKey((key) => key + 1);
    };
    const chooseFilter = (value) => {
        setDateFilter(value);
        setPage(1);
        setLoading(true);
        setError("");
    };
    const selectedBooking = selected && {
        _id: selected._id,
        bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName },
        totalPrice: selected.totalPrice,
        advancePayment: selected.recordedPaid,
        currency: selected.currency,
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1"><FaWallet className="me-2 text-primary" />Outstanding Balances</h3>
                    <p className="text-muted mb-0">Prioritize bookings by departure. A departure date is not a payment due date.</p>
                </div>
                <button type="button" className="btn btn-outline-primary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}

            <div className="row g-3 mb-4">
                {[
                    { label: "Bookings with a balance", value: data.summary.open, color: "primary" },
                    { label: "Trip started", value: data.summary.departed, color: "danger" },
                    { label: "Next 30 days", value: data.summary.next30, color: "warning" },
                    { label: "Later departures", value: data.summary.later, color: "primary" },
                ].map((item) => (
                    <div className="col-6 col-lg-3" key={item.label}>
                        <div className="card border-0 shadow-sm rounded-4 h-100"><div className="card-body p-3">
                            <small className="text-muted">{item.label}</small>
                            <h3 className={`fw-bold text-${item.color} mb-0`}>{item.value}</h3>
                        </div></div>
                    </div>
                ))}
            </div>

            <div className="card border-0 shadow-sm rounded-4"><div className="card-body p-4">
                <p className="text-muted small">Balances use each booking's recorded total and paid amount. Currency is shown per booking; amounts are not combined across currencies.</p>
                <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Departure timing">
                    {dateChoices.map((choice) => (
                        <button type="button" key={choice.value} className={`btn btn-sm ${dateFilter === choice.value ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => chooseFilter(choice.value)}>
                            {choice.label} ({data.summary[choice.count]})
                        </button>
                    ))}
                </div>

                {loading ? <p className="text-muted mb-0" role="status">Loading balances...</p> : !data.items.length ? (
                    <p className="text-muted mb-0">No bookings with an open balance in this view.</p>
                ) : (
                    <div className="table-responsive"><table className="table align-middle mb-0">
                        <thead><tr><th>Booking / guest</th><th>Departure</th><th>Status</th><th className="text-end">Total</th><th className="text-end">Recorded paid</th><th className="text-end">Balance</th><th className="text-end">Action</th></tr></thead>
                        <tbody>{data.items.map((item) => (
                            <tr key={item._id}>
                                <td><strong>{item.bookingCode}</strong><small className="d-block text-muted">{item.customerName || "-"}</small></td>
                                <td>{formatCalendarDate(item.travelStartDate)}</td>
                                <td><span className="badge text-bg-secondary">{item.bookingStatus}</span></td>
                                <td className="text-end text-nowrap">{formatMoney(item.totalPrice, item.currency)}</td>
                                <td className="text-end text-nowrap">{formatMoney(item.recordedPaid, item.currency)}</td>
                                <td className="text-end text-nowrap fw-semibold">{formatMoney(item.balance, item.currency)}</td>
                                <td className="text-end"><div className="d-flex justify-content-end gap-2">
                                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}>Payments</button>
                                    <Link className="btn btn-sm btn-outline-secondary" to={`/bookings?keyword=${encodeURIComponent(item.bookingCode)}`}>Booking</Link>
                                </div></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                )}

                {!loading && data.totalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <small className="text-muted">Page {data.page} of {data.totalPages} · {data.total} bookings</small>
                        <div className="d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= data.totalPages} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
                        </div>
                    </div>
                )}
            </div></div>

            {selectedBooking && (
                <BookingPaymentsModal
                    booking={selectedBooking}
                    onClose={() => { setSelected(null); refresh(); }}
                    onPaymentChanged={refresh}
                />
            )}
        </div>
    );
};

export default OutstandingBalances;
