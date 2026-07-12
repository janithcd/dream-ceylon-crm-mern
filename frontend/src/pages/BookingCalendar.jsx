import { useEffect, useMemo, useState } from "react";
import {
    FaCalendarAlt,
    FaChevronLeft,
    FaChevronRight,
    FaEye,
    FaFilter,
    FaSyncAlt,
    FaTimes,
} from "react-icons/fa";
import api from "../api/axios";

const bookingStatusOptions = [
    "Pending",
    "Confirmed",
    "In Progress",
    "Completed",
    "Cancelled",
];

const vehicleTypeOptions = ["Car", "SUV", "Van", "Mini Bus", "Other"];

const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDate = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const formatMoney = (amount, currency = "USD") => {
    const number = Number(amount);

    return `${currency} ${(Number.isFinite(number) ? number : 0).toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }
    )}`;
};

const getDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const normalizeDateOnly = (value) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const isDateBetween = (date, startDate, endDate) => {
    const current = normalizeDateOnly(date);
    const start = normalizeDateOnly(startDate);
    const end = normalizeDateOnly(endDate || startDate);

    if (!current || !start || !end) {
        return false;
    }

    return current >= start && current <= end;
};

const getStatusBadgeClass = (status) => {
    switch (status) {
        case "Pending":
            return "bg-secondary";
        case "Confirmed":
            return "bg-success";
        case "In Progress":
            return "bg-primary";
        case "Completed":
            return "bg-dark";
        case "Cancelled":
            return "bg-danger";
        default:
            return "bg-secondary";
    }
};

const getPaymentBadgeClass = (status) => {
    switch (status) {
        case "Paid":
            return "bg-success";
        case "Partially Paid":
            return "bg-warning text-dark";
        case "Refunded":
            return "bg-info";
        case "Pending":
            return "bg-secondary";
        default:
            return "bg-secondary";
    }
};

const buildCalendarDays = (selectedDate) => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const calendarStart = new Date(firstDayOfMonth);
    calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());

    const calendarEnd = new Date(lastDayOfMonth);
    calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));

    const days = [];
    const currentDate = new Date(calendarStart);

    while (currentDate <= calendarEnd) {
        days.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
};

const BookingDetailsPanel = ({ booking, onClose }) => {
    if (!booking) {
        return null;
    }

    const balance =
        Number(booking.totalPrice || 0) - Number(booking.advancePayment || 0);

    return (
        <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{
                background: "rgba(15, 23, 42, 0.45)",
                zIndex: 1050,
                overflowY: "auto",
            }}
        >
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-lg-7">
                        <div className="card border-0 shadow-lg rounded-4">
                            <div className="card-body p-4">
                                <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
                                    <div>
                                        <h4 className="fw-bold mb-1">{booking.bookingCode}</h4>
                                        <p className="text-muted mb-0">
                                            {booking.customer?.fullName || "Client name not available"}
                                        </p>
                                    </div>

                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={onClose}
                                    >
                                        <FaTimes />
                                    </button>
                                </div>

                                <div className="row g-3 mb-4">
                                    <div className="col-md-6">
                                        <div className="border rounded-4 p-3 h-100">
                                            <small className="text-muted">Client</small>
                                            <h6 className="fw-bold mb-1">
                                                {booking.customer?.fullName || "-"}
                                            </h6>
                                            <div className="text-muted small">
                                                {booking.customer?.email || "-"}
                                            </div>
                                            <div className="text-muted small">
                                                {booking.customer?.whatsappNumber || "-"}
                                            </div>
                                            <div className="text-muted small">
                                                {booking.customer?.country || "-"}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-md-6">
                                        <div className="border rounded-4 p-3 h-100">
                                            <small className="text-muted">Travel Dates</small>
                                            <h6 className="fw-bold mb-1">
                                                {formatDate(booking.travelStartDate)}
                                            </h6>
                                            <div className="text-muted small">
                                                to {formatDate(booking.travelEndDate)}
                                            </div>
                                            <div className="text-muted small">
                                                {booking.numberOfTravelers || 0} travelers ·{" "}
                                                {booking.vehicleType || "-"}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="row g-3 mb-4">
                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 text-center">
                                            <small className="text-muted">Total Price</small>
                                            <h6 className="fw-bold text-success mb-0">
                                                {formatMoney(booking.totalPrice, booking.currency)}
                                            </h6>
                                        </div>
                                    </div>

                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 text-center">
                                            <small className="text-muted">Advance</small>
                                            <h6 className="fw-bold mb-0">
                                                {formatMoney(booking.advancePayment, booking.currency)}
                                            </h6>
                                        </div>
                                    </div>

                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 text-center">
                                            <small className="text-muted">Balance</small>
                                            <h6 className="fw-bold text-danger mb-0">
                                                {formatMoney(balance, booking.currency)}
                                            </h6>
                                        </div>
                                    </div>
                                </div>

                                <div className="d-flex gap-2 flex-wrap mb-4">
                  <span
                      className={`badge ${getStatusBadgeClass(
                          booking.bookingStatus
                      )}`}
                  >
                    {booking.bookingStatus}
                  </span>

                                    <span
                                        className={`badge ${getPaymentBadgeClass(
                                            booking.paymentStatus
                                        )}`}
                                    >
                    {booking.paymentStatus}
                  </span>
                                </div>

                                {booking.selectedPackage && (
                                    <div className="border rounded-4 p-3 mb-3">
                                        <small className="text-muted">Selected Package</small>
                                        <h6 className="fw-bold mb-0">
                                            {booking.selectedPackage?.title}
                                        </h6>
                                    </div>
                                )}

                                {booking.specialRequests && (
                                    <div className="border rounded-4 p-3 mb-3">
                                        <small className="text-muted">Special Requests</small>
                                        <p className="mb-0">{booking.specialRequests}</p>
                                    </div>
                                )}

                                {booking.adminNotes && (
                                    <div className="border rounded-4 p-3">
                                        <small className="text-muted">Admin Notes</small>
                                        <p className="mb-0">{booking.adminNotes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BookingCalendar = () => {
    const [bookings, setBookings] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookingStatus, setBookingStatus] = useState("");
    const [vehicleType, setVehicleType] = useState("");
    const [selectedBooking, setSelectedBooking] = useState(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchBookings = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page: 1,
                limit: 500,
            };

            if (bookingStatus) {
                params.bookingStatus = bookingStatus;
            }

            if (vehicleType) {
                params.vehicleType = vehicleType;
            }

            const response = await api.get("/bookings", { params });

            setBookings(response.data.bookings || []);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load bookings."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingStatus, vehicleType]);

    const calendarDays = useMemo(() => {
        return buildCalendarDays(selectedDate);
    }, [selectedDate]);

    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();

    const calendarSummary = useMemo(() => {
        const monthBookings = bookings.filter((booking) => {
            const startDate = normalizeDateOnly(booking.travelStartDate);
            const endDate = normalizeDateOnly(booking.travelEndDate);

            if (!startDate) {
                return false;
            }

            const monthStart = new Date(currentYear, currentMonth, 1);
            const monthEnd = new Date(currentYear, currentMonth + 1, 0);

            return startDate <= monthEnd && (endDate || startDate) >= monthStart;
        });

        const confirmed = monthBookings.filter(
            (booking) => booking.bookingStatus === "Confirmed"
        ).length;

        const inProgress = monthBookings.filter(
            (booking) => booking.bookingStatus === "In Progress"
        ).length;

        const completed = monthBookings.filter(
            (booking) => booking.bookingStatus === "Completed"
        ).length;

        const cancelled = monthBookings.filter(
            (booking) => booking.bookingStatus === "Cancelled"
        ).length;

        return {
            total: monthBookings.length,
            confirmed,
            inProgress,
            completed,
            cancelled,
        };
    }, [bookings, currentMonth, currentYear]);

    const getBookingsForDay = (date) => {
        return bookings.filter((booking) =>
            isDateBetween(date, booking.travelStartDate, booking.travelEndDate)
        );
    };

    const goToPreviousMonth = () => {
        setSelectedDate(
            new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1)
        );
    };

    const goToNextMonth = () => {
        setSelectedDate(
            new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1)
        );
    };

    const goToToday = () => {
        setSelectedDate(new Date());
    };

    const handleResetFilters = () => {
        setBookingStatus("");
        setVehicleType("");
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Booking Calendar</h3>
                    <p className="text-muted mb-0">
                        View bookings by travel date and manage monthly tour schedules.
                    </p>
                </div>

                <div className="d-flex gap-2">
                    <button className="btn btn-outline-success" onClick={fetchBookings}>
                        <FaSyncAlt className="me-2" />
                        Refresh
                    </button>

                    <button className="btn btn-success" onClick={goToToday}>
                        Today
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row g-4 mb-4">
                <div className="col-xl-3 col-md-6">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">This Month</p>
                            <h3 className="fw-bold mb-1">{calendarSummary.total}</h3>
                            <small className="text-muted">total bookings</small>
                        </div>
                        <div className="stat-icon">
                            <FaCalendarAlt />
                        </div>
                    </div>
                </div>

                <div className="col-xl-3 col-md-6">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">Confirmed</p>
                            <h3 className="fw-bold mb-1">{calendarSummary.confirmed}</h3>
                            <small className="text-muted">confirmed tours</small>
                        </div>
                        <div className="stat-icon">
                            <FaCalendarAlt />
                        </div>
                    </div>
                </div>

                <div className="col-xl-3 col-md-6">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">In Progress</p>
                            <h3 className="fw-bold mb-1">{calendarSummary.inProgress}</h3>
                            <small className="text-muted">ongoing tours</small>
                        </div>
                        <div className="stat-icon">
                            <FaCalendarAlt />
                        </div>
                    </div>
                </div>

                <div className="col-xl-3 col-md-6">
                    <div className="stat-card h-100">
                        <div>
                            <p className="text-muted mb-1">Completed</p>
                            <h3 className="fw-bold mb-1">{calendarSummary.completed}</h3>
                            <small className="text-muted">completed tours</small>
                        </div>
                        <div className="stat-icon">
                            <FaCalendarAlt />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaFilter className="text-success" />
                        <h5 className="fw-bold mb-0">Calendar Filters</h5>
                    </div>

                    <div className="row g-3 align-items-end">
                        <div className="col-lg-4 col-md-6">
                            <label className="form-label">Booking Status</label>
                            <select
                                className="form-select"
                                value={bookingStatus}
                                onChange={(e) => setBookingStatus(e.target.value)}
                            >
                                <option value="">All Status</option>
                                {bookingStatusOptions.map((statusOption) => (
                                    <option key={statusOption} value={statusOption}>
                                        {statusOption}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-lg-4 col-md-6">
                            <label className="form-label">Vehicle Type</label>
                            <select
                                className="form-select"
                                value={vehicleType}
                                onChange={(e) => setVehicleType(e.target.value)}
                            >
                                <option value="">All Vehicles</option>
                                {vehicleTypeOptions.map((vehicleOption) => (
                                    <option key={vehicleOption} value={vehicleOption}>
                                        {vehicleOption}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-lg-4">
                            <button
                                className="btn btn-outline-secondary w-100"
                                onClick={handleResetFilters}
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-4">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                        <button
                            className="btn btn-outline-secondary"
                            onClick={goToPreviousMonth}
                        >
                            <FaChevronLeft className="me-2" />
                            Previous
                        </button>

                        <div className="text-center">
                            <h4 className="fw-bold mb-0">
                                {monthNames[currentMonth]} {currentYear}
                            </h4>
                            <small className="text-muted">
                                {loading ? "Loading bookings..." : `${bookings.length} bookings loaded`}
                            </small>
                        </div>

                        <button className="btn btn-outline-secondary" onClick={goToNextMonth}>
                            Next
                            <FaChevronRight className="ms-2" />
                        </button>
                    </div>

                    <div className="table-responsive">
                        <table className="table table-bordered align-top calendar-table mb-0">
                            <thead className="table-light">
                            <tr>
                                {weekDays.map((day) => (
                                    <th key={day} className="text-center">
                                        {day}
                                    </th>
                                ))}
                            </tr>
                            </thead>

                            <tbody>
                            {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map(
                                (_, weekIndex) => (
                                    <tr key={weekIndex}>
                                        {calendarDays
                                            .slice(weekIndex * 7, weekIndex * 7 + 7)
                                            .map((date) => {
                                                const dayBookings = getBookingsForDay(date);
                                                const isCurrentMonth =
                                                    date.getMonth() === currentMonth;
                                                const isToday =
                                                    getDateKey(date) === getDateKey(new Date());

                                                return (
                                                    <td
                                                        key={getDateKey(date)}
                                                        style={{
                                                            minWidth: "150px",
                                                            height: "145px",
                                                            background: isCurrentMonth
                                                                ? "#ffffff"
                                                                : "#f8fafc",
                                                        }}
                                                    >
                                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                <span
                                    className={`fw-bold ${
                                        isCurrentMonth
                                            ? "text-dark"
                                            : "text-muted opacity-50"
                                    }`}
                                >
                                  {date.getDate()}
                                </span>

                                                            {isToday && (
                                                                <span className="badge bg-success">Today</span>
                                                            )}
                                                        </div>

                                                        <div className="d-flex flex-column gap-1">
                                                            {dayBookings.slice(0, 3).map((booking) => (
                                                                <button
                                                                    key={booking._id}
                                                                    className="btn btn-sm text-start p-2 border rounded-3 bg-light"
                                                                    onClick={() => setSelectedBooking(booking)}
                                                                    title="View booking details"
                                                                >
                                                                    <div className="d-flex justify-content-between align-items-center gap-2">
                                      <span className="fw-semibold small text-truncate">
                                        {booking.customer?.fullName || "Client"}
                                      </span>
                                                                        <FaEye className="text-muted" size={11} />
                                                                    </div>

                                                                    <div className="d-flex align-items-center gap-1 mt-1">
                                      <span
                                          className={`badge ${getStatusBadgeClass(
                                              booking.bookingStatus
                                          )}`}
                                          style={{ fontSize: "0.65rem" }}
                                      >
                                        {booking.bookingStatus}
                                      </span>
                                                                    </div>

                                                                    <small className="text-muted d-block mt-1">
                                                                        {booking.vehicleType} ·{" "}
                                                                        {booking.numberOfTravelers} pax
                                                                    </small>
                                                                </button>
                                                            ))}

                                                            {dayBookings.length > 3 && (
                                                                <button
                                                                    className="btn btn-sm btn-outline-secondary"
                                                                    onClick={() =>
                                                                        setSelectedBooking(dayBookings[3])
                                                                    }
                                                                >
                                                                    +{dayBookings.length - 3} more
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                    </tr>
                                )
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <BookingDetailsPanel
                booking={selectedBooking}
                onClose={() => setSelectedBooking(null)}
            />
        </div>
    );
};

export default BookingCalendar;