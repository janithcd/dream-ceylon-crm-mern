import { useState } from "react";
import { FaCopy, FaMagic, FaRobot } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";

const initialFormState = {
    clientName: "",
    country: "",
    clientMessage: "",
    travelers: "",
    durationDays: "",
    interests: "",
    tone: "Friendly and professional",
    channel: "WhatsApp",
    language: "English",
};

const AIReplyGenerator = ({ onUseReply }) => {
    const { loading: permissionsLoading, hasAnyPermission } = usePermissions();

    const canGenerateReply = hasAnyPermission([
        "inquiry.update",
        "quotation.create",
    ]);
    const [formData, setFormData] = useState(initialFormState);
    const [generatedReply, setGeneratedReply] = useState("");
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const toneOptions = [
        "Friendly and professional",
        "Luxury and premium",
        "Short and direct",
        "Warm and personal",
        "Formal email style",
    ];

    const channelOptions = ["WhatsApp", "Email", "Facebook Message"];

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
                durationDays: formData.durationDays
                    ? Number(formData.durationDays)
                    : "",
            };

            const response = await api.post("/ai/client-reply", payload);

            setGeneratedReply(response.data.reply || "");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to generate AI reply");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generatedReply);
            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (error) {
            alert("Failed to copy reply");
        }
    };

    const handleUseReply = () => {
        if (generatedReply && onUseReply) {
            onUseReply(generatedReply);
        }
    };

    if (permissionsLoading || !canGenerateReply) {
        return null;
    }

    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-3">
                    <FaRobot className="text-primary" />
                    <h5 className="fw-bold mb-0">AI Reply Generator</h5>
                </div>

                <p className="text-muted">
                    Generate professional replies for travel inquiries, WhatsApp messages,
                    and email follow-ups.
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

                        <div className="col-12">
                            <label className="form-label fw-semibold">Client Message</label>
                            <textarea
                                name="clientMessage"
                                className="form-control"
                                rows="4"
                                value={formData.clientMessage}
                                onChange={handleChange}
                                placeholder="Paste the client's inquiry message here..."
                            ></textarea>
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
                            />
                        </div>

                        <div className="col-12 col-md-6">
                            <label className="form-label fw-semibold">Interests</label>
                            <input
                                type="text"
                                name="interests"
                                className="form-control"
                                value={formData.interests}
                                onChange={handleChange}
                                placeholder="Culture, wildlife, beaches, scenic train ride"
                            />
                        </div>

                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">Tone</label>
                            <select
                                name="tone"
                                className="form-select"
                                value={formData.tone}
                                onChange={handleChange}
                            >
                                {toneOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4">
                            <label className="form-label fw-semibold">Channel</label>
                            <select
                                name="channel"
                                className="form-select"
                                value={formData.channel}
                                onChange={handleChange}
                            >
                                {channelOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4">
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
                    </div>

                    <button className="btn btn-primary mt-4" disabled={loading}>
                        <FaMagic className="me-2" />
                        {loading ? "Generating..." : "Generate AI Reply"}
                    </button>
                </form>

                {generatedReply && (
                    <div className="mt-4">
                        <label className="form-label fw-semibold">Generated Reply</label>
                        <textarea
                            className="form-control"
                            rows="8"
                            value={generatedReply}
                            onChange={(e) => setGeneratedReply(e.target.value)}
                        ></textarea>

                        <div className="d-flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={handleCopy}
                            >
                                <FaCopy className="me-2" />
                                {copied ? "Copied!" : "Copy AI Reply"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-primary"
                                onClick={handleUseReply}
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

export default AIReplyGenerator;