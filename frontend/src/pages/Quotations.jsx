import { useMemo, useState } from "react";
import {
    FaCalculator,
    FaDownload,
    FaFileInvoiceDollar,
    FaMoneyBillWave,
} from "react-icons/fa";
import api from "../api/axios";

const vehicleRates = {
    Car: 80,
    SUV: 95,
    Van: 110,
    "Mini Bus": 0,
    Bus: 0,
    Other: 0,
};

const initialFormState = {
    clientName: "",
    country: "",
    tourTitle: "",
    travelStartDate: "",
    travelEndDate: "",
    travelers: "",
    durationDays: "",
    vehicleType: "Car",
    vehicleDailyRate: "80",
    vehicleDays: "",
    hotelCost: "0",
    activitiesCost: "0",
    entranceFeesCost: "0",
    otherCost: "0",
    discount: "0",
    advancePayment: "0",
    currency: "USD",
    inclusionsText:
        "Private air-conditioned car\nProfessional chauffeur guide\nAirport pickup and drop-off\nCustomized route planning\nWater bottles during transfers",
    exclusionsText:
        "Hotel accommodation\nEntrance fees\nSafari and activity fees\nMeals\nPersonal expenses",
    notes:
        "This quotation is based on private transport only. Hotels, entrance tickets, safari fees, and activities can be added separately according to the client's preferred budget.",
};

const numberValue = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const formatMoney = (amount, currency = "USD") => {
    return `${currency} ${numberValue(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};

const splitLines = (value) => {
    return String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const Quotations = () => {
    const [formData, setFormData] = useState(initialFormState);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const totals = useMemo(() => {
        const durationDays = numberValue(formData.durationDays);
        const vehicleDays = numberValue(formData.vehicleDays || durationDays);
        const vehicleDailyRate = numberValue(formData.vehicleDailyRate);

        const vehicleTotal = vehicleDays * vehicleDailyRate;
        const hotelTotal = numberValue(formData.hotelCost);
        const activitiesTotal = numberValue(formData.activitiesCost);
        const entranceFeesTotal = numberValue(formData.entranceFeesCost);
        const otherTotal = numberValue(formData.otherCost);

        const subtotal =
            vehicleTotal +
            hotelTotal +
            activitiesTotal +
            entranceFeesTotal +
            otherTotal;

        const discount = Math.min(numberValue(formData.discount), subtotal);
        const grandTotal = Math.max(subtotal - discount, 0);
        const advancePayment = Math.min(
            numberValue(formData.advancePayment),
            grandTotal
        );
        const balancePayment = Math.max(grandTotal - advancePayment, 0);

        return {
            durationDays,
            vehicleDays,
            vehicleDailyRate,
            vehicleTotal,
            hotelTotal,
            activitiesTotal,
            entranceFeesTotal,
            otherTotal,
            subtotal,
            discount,
            grandTotal,
            advancePayment,
            balancePayment,
        };
    }, [formData]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleVehicleTypeChange = (e) => {
        const selectedVehicle = e.target.value;

        setFormData((previous) => ({
            ...previous,
            vehicleType: selectedVehicle,
            vehicleDailyRate:
                vehicleRates[selectedVehicle] !== undefined
                    ? String(vehicleRates[selectedVehicle])
                    : previous.vehicleDailyRate,
        }));
    };

    const handleReset = () => {
        setFormData(initialFormState);
        setError("");
    };

    const handleGeneratePdf = async (e) => {
        e.preventDefault();
        setError("");

        if (!formData.clientName.trim()) {
            setError("Client name is required.");
            return;
        }

        if (!formData.tourTitle.trim()) {
            setError("Tour title is required.");
            return;
        }

        try {
            setLoading(true);

            const payload = {
                clientName: formData.clientName,
                country: formData.country,
                tourTitle: formData.tourTitle,
                travelStartDate: formData.travelStartDate,
                travelEndDate: formData.travelEndDate,
                travelers: numberValue(formData.travelers),
                durationDays: numberValue(formData.durationDays),
                vehicleType: formData.vehicleType,
                vehicleDailyRate: numberValue(formData.vehicleDailyRate),
                vehicleDays: numberValue(formData.vehicleDays || formData.durationDays),
                hotelCost: numberValue(formData.hotelCost),
                activitiesCost: numberValue(formData.activitiesCost),
                entranceFeesCost: numberValue(formData.entranceFeesCost),
                otherCost: numberValue(formData.otherCost),
                discount: numberValue(formData.discount),
                advancePayment: numberValue(formData.advancePayment),
                currency: formData.currency,
                inclusions: splitLines(formData.inclusionsText),
                exclusions: splitLines(formData.exclusionsText),
                notes: formData.notes,
            };

            const response = await api.post("/quotations/pdf", payload, {
                responseType: "blob",
            });

            const blob = new Blob([response.data], {
                type: "application/pdf",
            });

            const fileUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");

            const cleanClientName =
                formData.clientName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "client";

            link.href = fileUrl;
            link.download = `dream-ceylon-quotation-${cleanClientName}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message = "Failed to generate quotation PDF.";

            if (err.response?.data instanceof Blob) {
                const errorText = await err.response.data.text();

                try {
                    const errorJson = JSON.parse(errorText);
                    message = errorJson.error || errorJson.message || message;
                } catch {
                    message = errorText || message;
                }
            } else if (err.response?.data?.message) {
                message = err.response.data.message;
            }

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Quotation Generator</h3>
                    <p className="text-muted mb-0">
                        Create professional client quotation PDFs for Dream Ceylon Journeys.
                    </p>
                </div>

                <button className="btn btn-outline-secondary" onClick={handleReset}>
                    Reset Form
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row g-4">
                <div className="col-lg-8">
                    <form onSubmit={handleGeneratePdf}>
                        <div className="card border-0 shadow-sm rounded-4 mb-4">
                            <div className="card-body p-4">
                                <div className="d-flex align-items-center gap-2 mb-3">
                                    <FaFileInvoiceDollar className="text-success" />
                                    <h5 className="fw-bold mb-0">Client & Tour Details</h5>
                                </div>

                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label">Client Name *</label>
                                        <input
                                            type="text"
                                            name="clientName"
                                            className="form-control"
                                            value={formData.clientName}
                                            onChange={handleChange}
                                            placeholder="Subham Guna"
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Country</label>
                                        <input
                                            type="text"
                                            name="country"
                                            className="form-control"
                                            value={formData.country}
                                            onChange={handleChange}
                                            placeholder="India"
                                        />
                                    </div>

                                    <div className="col-12">
                                        <label className="form-label">Tour Title *</label>
                                        <input
                                            type="text"
                                            name="tourTitle"
                                            className="form-control"
                                            value={formData.tourTitle}
                                            onChange={handleChange}
                                            placeholder="10 Days Sri Lanka Budget Private Tour"
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Travel Start Date</label>
                                        <input
                                            type="date"
                                            name="travelStartDate"
                                            className="form-control"
                                            value={formData.travelStartDate}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Travel End Date</label>
                                        <input
                                            type="date"
                                            name="travelEndDate"
                                            className="form-control"
                                            value={formData.travelEndDate}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-4">
                                        <label className="form-label">Travelers</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="travelers"
                                            className="form-control"
                                            value={formData.travelers}
                                            onChange={handleChange}
                                            placeholder="2"
                                        />
                                    </div>

                                    <div className="col-md-4">
                                        <label className="form-label">Duration Days</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="durationDays"
                                            className="form-control"
                                            value={formData.durationDays}
                                            onChange={handleChange}
                                            placeholder="10"
                                        />
                                    </div>

                                    <div className="col-md-4">
                                        <label className="form-label">Currency</label>
                                        <select
                                            name="currency"
                                            className="form-select"
                                            value={formData.currency}
                                            onChange={handleChange}
                                        >
                                            <option value="USD">USD</option>
                                            <option value="LKR">LKR</option>
                                            <option value="EUR">EUR</option>
                                            <option value="GBP">GBP</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card border-0 shadow-sm rounded-4 mb-4">
                            <div className="card-body p-4">
                                <div className="d-flex align-items-center gap-2 mb-3">
                                    <FaMoneyBillWave className="text-success" />
                                    <h5 className="fw-bold mb-0">Cost Details</h5>
                                </div>

                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <label className="form-label">Vehicle Type</label>
                                        <select
                                            name="vehicleType"
                                            className="form-select"
                                            value={formData.vehicleType}
                                            onChange={handleVehicleTypeChange}
                                        >
                                            <option value="Car">Car</option>
                                            <option value="SUV">SUV</option>
                                            <option value="Van">Van</option>
                                            <option value="Mini Bus">Mini Bus</option>
                                            <option value="Bus">Bus</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div className="col-md-4">
                                        <label className="form-label">Vehicle Daily Rate</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="vehicleDailyRate"
                                            className="form-control"
                                            value={formData.vehicleDailyRate}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-4">
                                        <label className="form-label">Vehicle Days</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="vehicleDays"
                                            className="form-control"
                                            value={formData.vehicleDays}
                                            onChange={handleChange}
                                            placeholder="Same as duration"
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Hotel Cost</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="hotelCost"
                                            className="form-control"
                                            value={formData.hotelCost}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Activities Cost</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="activitiesCost"
                                            className="form-control"
                                            value={formData.activitiesCost}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Entrance Fees Cost</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="entranceFeesCost"
                                            className="form-control"
                                            value={formData.entranceFeesCost}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Other Cost</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="otherCost"
                                            className="form-control"
                                            value={formData.otherCost}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Discount</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="discount"
                                            className="form-control"
                                            value={formData.discount}
                                            onChange={handleChange}
                                        />
                                    </div>

                                    <div className="col-md-6">
                                        <label className="form-label">Advance Payment</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="advancePayment"
                                            className="form-control"
                                            value={formData.advancePayment}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card border-0 shadow-sm rounded-4 mb-4">
                            <div className="card-body p-4">
                                <h5 className="fw-bold mb-3">Inclusions, Exclusions & Notes</h5>

                                <div className="mb-3">
                                    <label className="form-label">
                                        Inclusions <span className="text-muted">(one per line)</span>
                                    </label>
                                    <textarea
                                        name="inclusionsText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.inclusionsText}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">
                                        Exclusions <span className="text-muted">(one per line)</span>
                                    </label>
                                    <textarea
                                        name="exclusionsText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.exclusionsText}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Additional Notes</label>
                                    <textarea
                                        name="notes"
                                        className="form-control"
                                        rows="4"
                                        value={formData.notes}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-success btn-lg w-100 mb-4"
                            disabled={loading}
                        >
                            <FaDownload className="me-2" />
                            {loading ? "Generating Quotation PDF..." : "Download Quotation PDF"}
                        </button>
                    </form>
                </div>

                <div className="col-lg-4">
                    <div className="card border-0 shadow-sm rounded-4 sticky-top">
                        <div className="card-body p-4">
                            <div className="d-flex align-items-center gap-2 mb-3">
                                <FaCalculator className="text-success" />
                                <h5 className="fw-bold mb-0">Live Calculation</h5>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Vehicle Total</span>
                                <strong>
                                    {formatMoney(totals.vehicleTotal, formData.currency)}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Hotel Total</span>
                                <strong>{formatMoney(totals.hotelTotal, formData.currency)}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Activities Total</span>
                                <strong>
                                    {formatMoney(totals.activitiesTotal, formData.currency)}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Entrance Fees</span>
                                <strong>
                                    {formatMoney(totals.entranceFeesTotal, formData.currency)}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Other Cost</span>
                                <strong>{formatMoney(totals.otherTotal, formData.currency)}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Subtotal</span>
                                <strong>{formatMoney(totals.subtotal, formData.currency)}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2 text-danger">
                                <span>Discount</span>
                                <strong>- {formatMoney(totals.discount, formData.currency)}</strong>
                            </div>

                            <div className="d-flex justify-content-between bg-success text-white rounded-3 px-3 py-3 my-3">
                                <span className="fw-bold">Grand Total</span>
                                <strong>{formatMoney(totals.grandTotal, formData.currency)}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Advance Payment</span>
                                <strong>
                                    {formatMoney(totals.advancePayment, formData.currency)}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between py-2">
                                <span className="text-muted">Balance Payment</span>
                                <strong className="text-success">
                                    {formatMoney(totals.balancePayment, formData.currency)}
                                </strong>
                            </div>

                            <div className="alert alert-info mt-3 mb-0 small">
                                This calculation will be used in the generated quotation PDF.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Quotations;