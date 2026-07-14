import { useEffect, useState } from "react";
import {
    FaBuilding,
    FaCar,
    FaCog,
    FaFilePdf,
    FaGlobe,
    FaRedo,
    FaSave,
    FaShareAlt,
} from "react-icons/fa";
import api from "../api/axios";

const initialFormState = {
    companyName: "",
    tagline: "",
    address: "",
    mobilesText: "",
    whatsapp: "",
    email: "",
    website: "",
    defaultCurrency: "USD",
    status: "Active",

    socialLinks: [
        {
            name: "Facebook",
            url: "",
        },
        {
            name: "Instagram",
            url: "",
        },
        {
            name: "TikTok",
            url: "",
        },
        {
            name: "LinkedIn",
            url: "",
        },
    ],

    vehicleRates: {
        car: 80,
        suv: 95,
        van: 110,
        miniBus: 0,
        bus: 0,
    },

    pdfSettings: {
        showWatermark: true,
        watermarkOpacity: 0.06,
        footerText: "",
        paymentInstructions: "",
        termsAndConditions: "",
    },
};

const currencyOptions = ["USD", "LKR", "EUR", "GBP"];

const SettingsSection = ({ title, icon, children }) => {
    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
                <div className="d-flex align-items-center gap-2 mb-3">
                    <span className="text-success">{icon}</span>
                    <h5 className="fw-bold mb-0">{title}</h5>
                </div>

                {children}
            </div>
        </div>
    );
};

const Settings = () => {
    const [formData, setFormData] = useState(initialFormState);
    const [loading, setLoading] = useState(true);
    const [saveLoading, setSaveLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const mapSettingsToForm = (settings) => {
        return {
            companyName: settings.companyName || "",
            tagline: settings.tagline || "",
            address: settings.address || "",
            mobilesText: Array.isArray(settings.mobiles)
                ? settings.mobiles.join("\n")
                : "",
            whatsapp: settings.whatsapp || "",
            email: settings.email || "",
            website: settings.website || "",
            defaultCurrency: settings.defaultCurrency || "USD",
            status: settings.status || "Active",

            socialLinks:
                settings.socialLinks && settings.socialLinks.length > 0
                    ? settings.socialLinks
                    : initialFormState.socialLinks,

            vehicleRates: {
                car: settings.vehicleRates?.car ?? 80,
                suv: settings.vehicleRates?.suv ?? 95,
                van: settings.vehicleRates?.van ?? 110,
                miniBus: settings.vehicleRates?.miniBus ?? 0,
                bus: settings.vehicleRates?.bus ?? 0,
            },

            pdfSettings: {
                showWatermark: settings.pdfSettings?.showWatermark ?? true,
                watermarkOpacity: settings.pdfSettings?.watermarkOpacity ?? 0.06,
                footerText: settings.pdfSettings?.footerText || "",
                paymentInstructions: settings.pdfSettings?.paymentInstructions || "",
                termsAndConditions: settings.pdfSettings?.termsAndConditions || "",
            },
        };
    };

    const fetchSettings = async () => {
        try {
            setLoading(true);
            setError("");
            setSuccess("");

            const response = await api.get("/settings/company");

            setFormData(mapSettingsToForm(response.data));
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load company settings."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleVehicleRateChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            vehicleRates: {
                ...prev.vehicleRates,
                [name]: value,
            },
        }));
    };

    const handlePdfChange = (e) => {
        const { name, value, type, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            pdfSettings: {
                ...prev.pdfSettings,
                [name]: type === "checkbox" ? checked : value,
            },
        }));
    };

    const handleSocialLinkChange = (index, field, value) => {
        setFormData((prev) => {
            const updatedLinks = [...prev.socialLinks];

            updatedLinks[index] = {
                ...updatedLinks[index],
                [field]: value,
            };

            return {
                ...prev,
                socialLinks: updatedLinks,
            };
        });
    };

    const addSocialLink = () => {
        setFormData((prev) => ({
            ...prev,
            socialLinks: [
                ...prev.socialLinks,
                {
                    name: "",
                    url: "",
                },
            ],
        }));
    };

    const removeSocialLink = (index) => {
        setFormData((prev) => ({
            ...prev,
            socialLinks: prev.socialLinks.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const buildPayload = () => {
        return {
            companyName: formData.companyName,
            tagline: formData.tagline,
            address: formData.address,
            mobiles: formData.mobilesText
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean),
            whatsapp: formData.whatsapp,
            email: formData.email,
            website: formData.website,
            defaultCurrency: formData.defaultCurrency,
            status: formData.status,

            socialLinks: formData.socialLinks
                .map((item) => ({
                    name: item.name?.trim() || "",
                    url: item.url?.trim() || "",
                }))
                .filter((item) => item.name || item.url),

            vehicleRates: {
                car: Number(formData.vehicleRates.car) || 0,
                suv: Number(formData.vehicleRates.suv) || 0,
                van: Number(formData.vehicleRates.van) || 0,
                miniBus: Number(formData.vehicleRates.miniBus) || 0,
                bus: Number(formData.vehicleRates.bus) || 0,
            },

            pdfSettings: {
                showWatermark: Boolean(formData.pdfSettings.showWatermark),
                watermarkOpacity: Number(formData.pdfSettings.watermarkOpacity) || 0,
                footerText: formData.pdfSettings.footerText,
                paymentInstructions: formData.pdfSettings.paymentInstructions,
                termsAndConditions: formData.pdfSettings.termsAndConditions,
            },
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setSaveLoading(true);
            setError("");
            setSuccess("");

            const response = await api.put("/settings/company", buildPayload());

            setFormData(mapSettingsToForm(response.data.settings));
            setSuccess("Company settings updated successfully.");
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to update company settings."
            );
        } finally {
            setSaveLoading(false);
        }
    };

    const handleResetSettings = async () => {
        const confirmReset = window.confirm(
            "Are you sure you want to reset company settings to default values?"
        );

        if (!confirmReset) {
            return;
        }

        try {
            setResetLoading(true);
            setError("");
            setSuccess("");

            const response = await api.post("/settings/company/reset");

            setFormData(mapSettingsToForm(response.data.settings));
            setSuccess("Company settings reset successfully.");
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to reset company settings."
            );
        } finally {
            setResetLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-5 text-center text-muted">
                    Loading settings...
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Admin Settings</h2>
                    <p className="text-muted mb-0">
                        Manage company profile, contact details, vehicle rates, and PDF
                        document settings.
                    </p>
                </div>

                <div className="d-flex gap-2">
                    <button
                        className="btn btn-outline-success"
                        onClick={fetchSettings}
                        disabled={loading}
                    >
                        <FaRedo className="me-2" />
                        Refresh
                    </button>

                    <button
                        className="btn btn-outline-danger"
                        onClick={handleResetSettings}
                        disabled={resetLoading}
                    >
                        <FaRedo className="me-2" />
                        {resetLoading ? "Resetting..." : "Reset Defaults"}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <form onSubmit={handleSubmit}>
                <SettingsSection title="Company Profile" icon={<FaBuilding />}>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Company Name</label>
                            <input
                                type="text"
                                name="companyName"
                                className="form-control"
                                value={formData.companyName}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Tagline</label>
                            <input
                                type="text"
                                name="tagline"
                                className="form-control"
                                value={formData.tagline}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">Address</label>
                            <textarea
                                name="address"
                                className="form-control"
                                rows="2"
                                value={formData.address}
                                onChange={handleChange}
                            ></textarea>
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">
                                Mobile Numbers
                            </label>
                            <textarea
                                name="mobilesText"
                                className="form-control"
                                rows="3"
                                value={formData.mobilesText}
                                onChange={handleChange}
                                placeholder="+94 77 512 4645"
                            ></textarea>
                            <small className="text-muted">
                                Add one number per line or separate with commas.
                            </small>
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">WhatsApp</label>
                            <input
                                type="text"
                                name="whatsapp"
                                className="form-control"
                                value={formData.whatsapp}
                                onChange={handleChange}
                            />

                            <label className="form-label fw-semibold mt-3">Status</label>
                            <select
                                name="status"
                                className="form-select"
                                value={formData.status}
                                onChange={handleChange}
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection title="Online Contact Details" icon={<FaGlobe />}>
                    <div className="row g-3">
                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">Email</label>
                            <input
                                type="email"
                                name="email"
                                className="form-control"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">Website</label>
                            <input
                                type="text"
                                name="website"
                                className="form-control"
                                value={formData.website}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">
                                Default Currency
                            </label>
                            <select
                                name="defaultCurrency"
                                className="form-select"
                                value={formData.defaultCurrency}
                                onChange={handleChange}
                            >
                                {currencyOptions.map((currency) => (
                                    <option key={currency} value={currency}>
                                        {currency}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection title="Social Links" icon={<FaShareAlt />}>
                    <div className="row g-3">
                        {formData.socialLinks.map((link, index) => (
                            <div className="col-12" key={`${link.name}-${index}`}>
                                <div className="row g-2 align-items-center">
                                    <div className="col-12 col-md-3">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Platform name"
                                            value={link.name}
                                            onChange={(e) =>
                                                handleSocialLinkChange(index, "name", e.target.value)
                                            }
                                        />
                                    </div>

                                    <div className="col-12 col-md-8">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Social media URL"
                                            value={link.url}
                                            onChange={(e) =>
                                                handleSocialLinkChange(index, "url", e.target.value)
                                            }
                                        />
                                    </div>

                                    <div className="col-12 col-md-1 d-grid">
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger"
                                            onClick={() => removeSocialLink(index)}
                                        >
                                            X
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="col-12">
                            <button
                                type="button"
                                className="btn btn-outline-success"
                                onClick={addSocialLink}
                            >
                                Add Social Link
                            </button>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection title="Default Vehicle Rates" icon={<FaCar />}>
                    <div className="row g-3">
                        <div className="col-12 col-md-4 col-lg-2">
                            <label className="form-label fw-semibold">Car</label>
                            <input
                                type="number"
                                name="car"
                                className="form-control"
                                value={formData.vehicleRates.car}
                                onChange={handleVehicleRateChange}
                                min="0"
                            />
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <label className="form-label fw-semibold">SUV</label>
                            <input
                                type="number"
                                name="suv"
                                className="form-control"
                                value={formData.vehicleRates.suv}
                                onChange={handleVehicleRateChange}
                                min="0"
                            />
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <label className="form-label fw-semibold">Van</label>
                            <input
                                type="number"
                                name="van"
                                className="form-control"
                                value={formData.vehicleRates.van}
                                onChange={handleVehicleRateChange}
                                min="0"
                            />
                        </div>

                        <div className="col-12 col-md-4 col-lg-3">
                            <label className="form-label fw-semibold">Mini Bus</label>
                            <input
                                type="number"
                                name="miniBus"
                                className="form-control"
                                value={formData.vehicleRates.miniBus}
                                onChange={handleVehicleRateChange}
                                min="0"
                            />
                        </div>

                        <div className="col-12 col-md-4 col-lg-3">
                            <label className="form-label fw-semibold">Bus</label>
                            <input
                                type="number"
                                name="bus"
                                className="form-control"
                                value={formData.vehicleRates.bus}
                                onChange={handleVehicleRateChange}
                                min="0"
                            />
                        </div>

                        <div className="col-12">
                            <small className="text-muted">
                                These values can be used later for quotation auto-calculation.
                            </small>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection title="PDF Document Settings" icon={<FaFilePdf />}>
                    <div className="row g-3">
                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">
                                Watermark Opacity
                            </label>
                            <input
                                type="number"
                                name="watermarkOpacity"
                                className="form-control"
                                value={formData.pdfSettings.watermarkOpacity}
                                onChange={handlePdfChange}
                                min="0"
                                max="1"
                                step="0.01"
                            />
                            <small className="text-muted">
                                Recommended value: 0.04 to 0.08
                            </small>
                        </div>

                        <div className="col-12 col-md-4 d-flex align-items-center">
                            <div className="form-check mt-4">
                                <input
                                    type="checkbox"
                                    name="showWatermark"
                                    className="form-check-input"
                                    checked={formData.pdfSettings.showWatermark}
                                    onChange={handlePdfChange}
                                    id="showWatermark"
                                />
                                <label className="form-check-label" htmlFor="showWatermark">
                                    Show watermark on PDFs
                                </label>
                            </div>
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">PDF Footer Text</label>
                            <input
                                type="text"
                                name="footerText"
                                className="form-control"
                                value={formData.pdfSettings.footerText}
                                onChange={handlePdfChange}
                            />
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">
                                Payment Instructions
                            </label>
                            <textarea
                                name="paymentInstructions"
                                className="form-control"
                                rows="3"
                                value={formData.pdfSettings.paymentInstructions}
                                onChange={handlePdfChange}
                            ></textarea>
                        </div>

                        <div className="col-12">
                            <label className="form-label fw-semibold">
                                Terms and Conditions
                            </label>
                            <textarea
                                name="termsAndConditions"
                                className="form-control"
                                rows="3"
                                value={formData.pdfSettings.termsAndConditions}
                                onChange={handlePdfChange}
                            ></textarea>
                        </div>
                    </div>
                </SettingsSection>

                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body p-4 d-flex justify-content-between align-items-center flex-wrap gap-3">
                        <div>
                            <h5 className="fw-bold mb-1">Save Settings</h5>
                            <p className="text-muted mb-0">
                                Save company settings to MongoDB.
                            </p>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-success btn-lg"
                            disabled={saveLoading}
                        >
                            <FaSave className="me-2" />
                            {saveLoading ? "Saving..." : "Save Settings"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default Settings;