import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaSyncAlt, FaWallet, FaWhatsapp } from "react-icons/fa";
import api from "../api/axios";
import BookingPaymentsModal from "../components/BookingPaymentsModal";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { buildWhatsAppUrl } from "../utils/whatsappFollowUp";
import { buildPaymentReminderMessage } from "../utils/paymentReminder";

const emptyData = {
    items: [], summary: { open: 0, departed: 0, next30: 0, later: 0, overdue: 0, due7: 0, scheduledLater: 0, unscheduled: 0, followUpsDue: 0 },
    total: 0, page: 1, totalPages: 1,
};

const dateChoices = [
    { value: "next30", label: "Next 30 days", count: "next30" },
    { value: "departed", label: "Trip started", count: "departed" },
    { value: "later", label: "Later departures", count: "later" },
    { value: "all", label: "All open balances", count: "open" },
];

const dueChoices = [
    { value: "all", label: "All open", count: "open" },
    { value: "overdue", label: "Overdue", count: "overdue" },
    { value: "due7", label: "Due within 7 days", count: "due7" },
    { value: "later", label: "Scheduled later", count: "scheduledLater" },
    { value: "unscheduled", label: "No due date", count: "unscheduled" },
];

const formatMoney = (amount, currency) =>
    `${currency || "USD"} ${Number(amount || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const formatContactTime = (value) => value ? new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Colombo", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}) : "-";

const OutstandingBalances = () => {
    const { hasPermission } = usePermissions();
    const canChangeDueDate = hasPermission("payment.update");
    const canLogContact = hasPermission("payment.update");
    const canPrepareReminder = hasPermission("payment.create");
    const [dateFilter, setDateFilter] = useState("all");
    const [dueFilter, setDueFilter] = useState("all");
    const [contactFilter, setContactFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [selected, setSelected] = useState(null);
    const [editingDue, setEditingDue] = useState(null);
    const [savingDue, setSavingDue] = useState(false);
    const [contactForm, setContactForm] = useState(null);
    const [savingContact, setSavingContact] = useState(false);
    const [contactError, setContactError] = useState("");
    const [reminderLoadingId, setReminderLoadingId] = useState("");
    const [reminderDraft, setReminderDraft] = useState(null);
    const [reminderError, setReminderError] = useState("");

    useEffect(() => {
        let active = true;
        api.get("/bookings/outstanding-balances", { params: { dateFilter, dueFilter, contactFilter, page } })
            .then((response) => {
                if (!active) return;
                if (page > response.data.totalPages) {
                    setPage(response.data.totalPages);
                    return;
                }
                setData(response.data);
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
    }, [dateFilter, dueFilter, contactFilter, page, reloadKey]);

    const refresh = () => {
        setLoading(true);
        setError("");
        setReloadKey((key) => key + 1);
    };
    const chooseFilter = (setter, value) => {
        setter(value);
        setPage(1);
        setLoading(true);
        setError("");
    };
    const saveDueDate = async (event, clear = false) => {
        event?.preventDefault();
        if (!editingDue || !canChangeDueDate) return;
        try {
            setSavingDue(true);
            setError("");
            setSuccess("");
            await api.patch(`/bookings/${editingDue.id}/payment-due-date`, {
                paymentDueDate: clear ? null : editingDue.value || null,
            });
            setEditingDue(null);
            setSuccess("Payment due date updated.");
            refresh();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Failed to update payment due date.");
        } finally {
            setSavingDue(false);
        }
    };
    const saveContact = async (event) => {
        event.preventDefault();
        if (!contactForm || !canLogContact) return;
        try {
            setSavingContact(true);
            setContactError("");
            setSuccess("");
            await api.patch(`/bookings/${contactForm.id}/payment-contact`, {
                channel: contactForm.channel,
                nextFollowUpDate: contactForm.nextFollowUpDate || null,
            });
            setContactForm(null);
            setSuccess("Payment contact logged.");
            refresh();
        } catch (requestError) {
            setContactError(requestError.response?.data?.message || "Failed to log payment contact.");
        } finally {
            setSavingContact(false);
        }
    };
    const prepareReminder = async (item) => {
        if (!canPrepareReminder) return;
        try {
            setReminderLoadingId(item._id);
            setError("");
            setReminderError("");
            // Fetch on click so the draft does not rely on a balance left open in the queue.
            const { data: booking } = await api.get(`/bookings/${item._id}`);
            const message = buildPaymentReminderMessage(booking);
            if (!message) {
                refresh();
                setError("This booking no longer has an open balance. The queue is refreshing.");
                return;
            }
            setReminderDraft({
                bookingCode: booking.bookingCode,
                number: booking.customer?.whatsappNumber || "",
                message,
            });
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Failed to prepare the payment reminder.");
        } finally {
            setReminderLoadingId("");
        }
    };
    const openReminder = (event) => {
        event.preventDefault();
        const url = buildWhatsAppUrl(reminderDraft.number, reminderDraft.message);
        if (!url) {
            setReminderError("Enter a valid international number with country code and a message.");
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        setReminderDraft(null);
    };
    const selectedBooking = selected && {
        _id: selected._id,
        bookingCode: selected.bookingCode,
        customer: { fullName: selected.customerName },
        totalPrice: selected.totalPrice,
        advancePayment: selected.recordedPaid,
        currency: selected.currency,
    };
    const today = todayCalendarDate();
    const paymentDueStatus = (value) => {
        if (!value) return { label: "No due date", color: "secondary" };
        const date = toCalendarDateInput(value);
        if (date < today) return { label: "Overdue", color: "danger" };
        const weekEnd = new Date(`${today}T00:00:00.000Z`);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
        if (date < weekEnd.toISOString().slice(0, 10)) return { label: "Due soon", color: "warning" };
        return { label: "Scheduled", color: "primary" };
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1"><FaWallet className="me-2 text-primary" />Outstanding Balances</h3>
                    <p className="text-muted mb-0">Collect balances by their agreed due date. Departure dates remain visible for planning.</p>
                </div>
                <button type="button" className="btn btn-outline-primary" onClick={refresh} disabled={loading}>
                    <FaSyncAlt className="me-2" />Refresh
                </button>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}

            <div className="row g-3 mb-4">
                {[
                    { label: "Bookings with a balance", value: data.summary.open, color: "primary" },
                    { label: "Overdue payment dates", value: data.summary.overdue, color: "danger" },
                    { label: "Due within 7 days", value: data.summary.due7, color: "warning" },
                    { label: "No due date", value: data.summary.unscheduled, color: "secondary" },
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
                <p className="text-muted small">Balances use each booking's recorded total and paid amount. Currency is shown per booking; amounts are not combined across currencies. No due date means no agreed deadline has been recorded. Counts cover all open bookings; the filters can be combined.</p>
                <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Payment contact follow-up">
                    <button type="button" className={`btn btn-sm ${contactFilter === "all" ? "btn-success" : "btn-outline-success"}`} onClick={() => chooseFilter(setContactFilter, "all")}>All balances</button>
                    <button type="button" className={`btn btn-sm ${contactFilter === "due" ? "btn-success" : "btn-outline-success"}`} onClick={() => chooseFilter(setContactFilter, "due")}>Follow-ups due ({data.summary.followUpsDue})</button>
                </div>
                <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Payment due timing">
                    {dueChoices.map((choice) => (
                        <button type="button" key={choice.value} className={`btn btn-sm ${dueFilter === choice.value ? "btn-primary" : "btn-outline-primary"}`} onClick={() => chooseFilter(setDueFilter, choice.value)}>
                            {choice.label} ({data.summary[choice.count]})
                        </button>
                    ))}
                </div>
                <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Departure timing">
                    {dateChoices.map((choice) => (
                        <button type="button" key={choice.value} className={`btn btn-sm ${dateFilter === choice.value ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => chooseFilter(setDateFilter, choice.value)}>
                            {choice.label} ({data.summary[choice.count]})
                        </button>
                    ))}
                </div>

                {loading ? <p className="text-muted mb-0" role="status">Loading balances...</p> : !data.items.length ? (
                    <p className="text-muted mb-0">No bookings with an open balance in this view.</p>
                ) : (
                    <div className="table-responsive"><table className="table align-middle mb-0">
                        <thead><tr><th>Booking / guest</th><th>Payment due</th><th>Contact / follow-up</th><th>Departure</th><th>Status</th><th className="text-end">Total</th><th className="text-end">Recorded paid</th><th className="text-end">Balance</th><th className="text-end">Action</th></tr></thead>
                        <tbody>{data.items.map((item) => (
                            <tr key={item._id}>
                                <td><strong>{item.bookingCode}</strong><small className="d-block text-muted">{item.customerName || "-"}</small></td>
                                <td>{editingDue?.id === item._id ? (
                                    <form onSubmit={saveDueDate} className="d-flex flex-column gap-1" aria-label={`Payment due date for ${item.bookingCode}`}>
                                        <input type="date" className="form-control form-control-sm" aria-label="Payment due date" value={editingDue.value} onChange={(event) => setEditingDue({ ...editingDue, value: event.target.value })} disabled={savingDue} />
                                        <div className="d-flex gap-1">
                                            <button type="submit" className="btn btn-sm btn-primary" disabled={savingDue}>Save</button>
                                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => saveDueDate(null, true)} disabled={savingDue}>Clear date</button>
                                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingDue(null)} disabled={savingDue}>Cancel</button>
                                        </div>
                                    </form>
                                ) : (
                                    <><div>{formatCalendarDate(item.paymentDueDate)}</div><span className={`badge text-bg-${paymentDueStatus(item.paymentDueDate).color}`}>{paymentDueStatus(item.paymentDueDate).label}</span></>
                                )}</td>
                                <td>
                                    {item.lastContactedAt ? <><div>{item.contactChannel} · {formatContactTime(item.lastContactedAt)}</div>
                                        <small className="text-muted">Next: {formatCalendarDate(item.nextFollowUpDate)}</small></> : <span className="text-muted">No contact logged</span>}
                                    {item.nextFollowUpDate && toCalendarDateInput(item.nextFollowUpDate) <= today && <span className="badge text-bg-warning ms-2">Follow up due</span>}
                                </td>
                                <td>{formatCalendarDate(item.travelStartDate)}</td>
                                <td><span className="badge text-bg-secondary">{item.bookingStatus}</span></td>
                                <td className="text-end text-nowrap">{formatMoney(item.totalPrice, item.currency)}</td>
                                <td className="text-end text-nowrap">{formatMoney(item.recordedPaid, item.currency)}</td>
                                <td className="text-end text-nowrap fw-semibold">{formatMoney(item.balance, item.currency)}</td>
                                <td className="text-end"><div className="d-flex flex-wrap justify-content-end gap-2">
                                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setSelected(item)}>Payments</button>
                                    {canChangeDueDate && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditingDue({ id: item._id, value: toCalendarDateInput(item.paymentDueDate) })}>Due date</button>}
                                    {canPrepareReminder && <button type="button" className="btn btn-sm btn-outline-success" onClick={() => prepareReminder(item)} disabled={Boolean(reminderLoadingId)} aria-label={`Prepare WhatsApp payment reminder for ${item.bookingCode}`}><FaWhatsapp className="me-1" />{reminderLoadingId === item._id ? "Loading..." : "Reminder"}</button>}
                                    {canLogContact && <button type="button" className="btn btn-sm btn-outline-success" onClick={() => { setContactError(""); setContactForm({ id: item._id, bookingCode: item.bookingCode, channel: item.contactChannel || "WhatsApp", nextFollowUpDate: "" }); }}>Log contact</button>}
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
            {contactForm && (
                <>
                    <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="payment-contact-title">
                        <div className="modal-dialog modal-dialog-centered">
                            <form className="modal-content" onSubmit={saveContact}>
                                <div className="modal-header">
                                    <h5 id="payment-contact-title" className="modal-title">Log payment contact · {contactForm.bookingCode}</h5>
                                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setContactForm(null)} disabled={savingContact} />
                                </div>
                                <div className="modal-body">
                                    <p className="text-muted">Save this only after you have actually contacted the guest. Opening a WhatsApp draft does not log contact.</p>
                                    <label className="form-label fw-semibold" htmlFor="payment-contact-channel">Channel</label>
                                    <select id="payment-contact-channel" className="form-select mb-3" value={contactForm.channel} onChange={(event) => setContactForm({ ...contactForm, channel: event.target.value })} disabled={savingContact}>
                                        {["WhatsApp", "Phone", "Email", "Other"].map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                                    </select>
                                    <label className="form-label fw-semibold" htmlFor="payment-contact-next">Next follow-up date (optional)</label>
                                    <input id="payment-contact-next" type="date" className="form-control" value={contactForm.nextFollowUpDate} onChange={(event) => setContactForm({ ...contactForm, nextFollowUpDate: event.target.value })} disabled={savingContact} />
                                    <small className="text-muted">Leave blank when no further contact is planned. Dates use Sri Lanka time.</small>
                                    {contactError && <div className="alert alert-danger mt-3 mb-0" role="alert">{contactError}</div>}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline-secondary" onClick={() => setContactForm(null)} disabled={savingContact}>Cancel</button>
                                    <button type="submit" className="btn btn-success" disabled={savingContact}>{savingContact ? "Saving..." : "Log contact"}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                    <div className="modal-backdrop fade show" />
                </>
            )}
            {reminderDraft && (
                <>
                    <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="payment-reminder-title">
                        <div className="modal-dialog modal-dialog-centered">
                            <form className="modal-content" onSubmit={openReminder}>
                                <div className="modal-header">
                                    <h5 id="payment-reminder-title" className="modal-title">Payment reminder · {reminderDraft.bookingCode}</h5>
                                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setReminderDraft(null)} />
                                </div>
                                <div className="modal-body">
                                    <p className="text-muted mb-3">Review the recipient and current balance below. WhatsApp opens a draft for you to send.</p>
                                    <label className="form-label fw-semibold" htmlFor="payment-reminder-number">Client number</label>
                                    <input
                                        id="payment-reminder-number" type="tel" className="form-control" autoFocus
                                        value={reminderDraft.number}
                                        onChange={(event) => { setReminderDraft((draft) => ({ ...draft, number: event.target.value })); setReminderError(""); }}
                                        placeholder="+94 77 123 4567"
                                    />
                                    <small className="text-muted d-block mt-1 mb-3">Use the full international number with country code.</small>
                                    <label className="form-label fw-semibold" htmlFor="payment-reminder-message">Message</label>
                                    <textarea
                                        id="payment-reminder-message" className="form-control" rows="6"
                                        value={reminderDraft.message}
                                        onChange={(event) => { setReminderDraft((draft) => ({ ...draft, message: event.target.value })); setReminderError(""); }}
                                    />
                                    {reminderError && <div className="alert alert-danger mt-3 mb-0" role="alert">{reminderError}</div>}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline-secondary" onClick={() => setReminderDraft(null)}>Cancel</button>
                                    <button type="submit" className="btn btn-success"><FaWhatsapp className="me-2" />Open WhatsApp</button>
                                </div>
                            </form>
                        </div>
                    </div>
                    <div className="modal-backdrop fade show" />
                </>
            )}
        </div>
    );
};

export default OutstandingBalances;
