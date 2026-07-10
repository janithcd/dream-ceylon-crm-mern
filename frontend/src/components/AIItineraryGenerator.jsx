import { useState } from "react";
import { FaCopy, FaMapMarkedAlt, FaMagic } from "react-icons/fa";
import api from "../api/axios";

const initialFormState = {
    clientName: "",
    country: "",
    travelers: "",
    durationDays: "",
    interests: "",
    preferredDestinations: "",
    travelStyle: "Comfortable private tour",
    budgetLevel: "Mid-range",
    vehicleType: "SUV",
    arrivalCity: "",
    endingPreference: "",
    language: "English",
};

const AIItineraryGenerator = ({ onUseItinerary }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [generatedItinerary, setGeneratedItinerary] = useState("");
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const travelStyleOptions = [
        "Comfortable private tour",
        "Luxury private tour",
        "Budget-friendly private tour",
        "Family-friendly tour",
        "Honeymoon tour",
        "Adventure and nature tour",
        "Relaxed slow-paced tour",
    ];

    const budgetOptions = ["Budget", "Mid-range", "Comfort", "Luxury", "Premium"];

    const vehicleOptions = ["Car", "SUV", "Van", "Mini Bus"];

    const languageOptions = [
        "English",
        "German",
        "French",
        "Spanish",
        "Italian",
        "Arabic",
        "Russian",
        "Chinese",
        "Japanese",
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleGenerate = async (e) => {
        e.preventDefault();

        try {
            setLoading(true);
            setError("");
            setCopied(false);

            const payload = {
                ...formData,
                travelers: formData.travelers ? Number(formData.travelers) : "",
                durationDays: Number(formData.durationDays),
            };

            const response = await api.post("/ai/itinerary", payload);

            setGeneratedItinerary(response.data.itinerary || "");
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to generate AI itinerary"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generatedItinerary);
            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (error) {
            alert("Failed to copy itinerary");
        }
    };

    const handleUseItinerary = () => {
        if (generatedItinerary && onUseItinerary) {
            onUseItinerary(generatedItinerary);
        }
    };

    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-3">
                    <FaMapMarkedAlt className="text-primary" />
                    <h5 className="fw-bold mb-0">AI Itinerary Generator</h5>
                </div>

                <p className="text-muted">
                    Generate a day-by-day Sri Lanka itinerary based on client interests,
                    travel style, budget, and preferred destinations.
                </p>

                {error && <div className="alert alert-danger">{error}</div>}

                <form onSubmit={handleGenerate}>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Client Name</label>
                            <input
                                type="text"
                                name="clientName"
                                className="form-control"
                                value={formData.clientName}
                                onChange={handleChange}
                                placeholder="Michael"
                            />
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Country</label>
                            <input
                                type="text"
                                name="country"
                                className="form-control"
                                value={formData.country}
                                onChange={handleChange}
                                placeholder="Germany"
                            />
                        </div>

                        <div className="col-12 col-md-3">
                            <label className="form-label fw-semibold">Travelers</label>
                            <input
                                type="number"
                                name="travelers"
                                className="form-control"
                                value={formData.travelers}
                                onChange={handleChange}
                                min="1"
                                placeholder="2"
                            />
                        </div>

                        <div className="col-12 col-md-3">
                            <label className="form-label fw-semibold">Duration Days</label>
                            <input
                                type="number"
                                name="durationDays"
                                className="form-control"
                                value={formData.durationDays}
                                onChange={handleChange}
                                min="1"
                                placeholder="14"
                                required
                            />
                        </div>

                        <div className="col-12 col-md-3">
                            <label className="form-label fw-semibold">Budget Level</label>
                            <select
                                name="budgetLevel"
                                className="form-select"
                                value={formData.budgetLevel}
                                onChange={handleChange}
                            >
                                {budgetOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-3">
                            <label className="form-label fw-semibold">Vehicle Type</label>
                            <select
                                name="vehicleType"
                                className="form-select"
                                value={formData.vehicleType}
                                onChange={handleChange}
                            >
                                {vehicleOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Travel Style</label>
                            <select
                                name="travelStyle"
                                className="form-select"
                                value={formData.travelStyle}
                                onChange={handleChange}
                            >
                                {travelStyleOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Language</label>
                            <select
                                name="language"
                                className="form-select"
                                value={formData.language}
                                onChange={handleChange}
                            >
                                {languageOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">Interests</label>
                            <input
                                type="text"
                                name="interests"
                                className="form-control"
                                value={formData.interests}
                                onChange={handleChange}
                                placeholder="Culture, wildlife, beaches, local food, scenic train journey"
                                required
                            />
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">
                                Preferred Destinations
                            </label>
                            <input
                                type="text"
                                name="preferredDestinations"
                                className="form-control"
                                value={formData.preferredDestinations}
                                onChange={handleChange}
                                placeholder="Sigiriya, Kandy, Nuwara Eliya, Ella, Yala, Mirissa, Galle"
                            />
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">
                                Arrival City / Airport
                            </label>
                            <input
                                type="text"
                                name="arrivalCity"
                                className="form-control"
                                value={formData.arrivalCity}
                                onChange={handleChange}
                                placeholder="Colombo Airport"
                            />
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Ending Preference</label>
                            <input
                                type="text"
                                name="endingPreference"
                                className="form-control"
                                value={formData.endingPreference}
                                onChange={handleChange}
                                placeholder="Beach stay at the end"
                            />
                        </div>
                    </div>

                    <button className="btn btn-primary mt-4" disabled={loading}>
                        <FaMagic className="me-2" />
                        {loading ? "Generating Itinerary..." : "Generate AI Itinerary"}
                    </button>
                </form>

                {generatedItinerary && (
                    <div className="mt-4">
                        <label className="form-label fw-semibold">
                            Generated Itinerary
                        </label>
                        <textarea
                            className="form-control"
                            rows="14"
                            value={generatedItinerary}
                            onChange={(e) => setGeneratedItinerary(e.target.value)}
                        ></textarea>

                        <div className="d-flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={handleCopy}
                            >
                                <FaCopy className="me-2" />
                                {copied ? "Copied!" : "Copy Itinerary"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary"
                                onClick={handleUseItinerary}
                            >
                                Use in Translator / WhatsApp Tool
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIItineraryGenerator;