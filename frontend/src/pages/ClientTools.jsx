import { useEffect, useMemo, useState } from "react";
import {
    FaClock,
    FaCopy,
    FaGlobeAsia,
    FaLanguage,
    FaExternalLinkAlt,
    FaWhatsapp,
} from "react-icons/fa";
import AIReplyGenerator from "../components/AIReplyGenerator";

const countries = [
    {
        label: "Sri Lanka",
        city: "Colombo",
        timeZone: "Asia/Colombo",
        flag: "🇱🇰",
    },
    {
        label: "United States",
        city: "New York",
        timeZone: "America/New_York",
        flag: "🇺🇸",
    },
    {
        label: "United Kingdom",
        city: "London",
        timeZone: "Europe/London",
        flag: "🇬🇧",
    },
    {
        label: "Germany",
        city: "Berlin",
        timeZone: "Europe/Berlin",
        flag: "🇩🇪",
    },
    {
        label: "France",
        city: "Paris",
        timeZone: "Europe/Paris",
        flag: "🇫🇷",
    },
    {
        label: "Australia",
        city: "Sydney",
        timeZone: "Australia/Sydney",
        flag: "🇦🇺",
    },
    {
        label: "Canada",
        city: "Toronto",
        timeZone: "America/Toronto",
        flag: "🇨🇦",
    },
    {
        label: "Dubai",
        city: "Dubai",
        timeZone: "Asia/Dubai",
        flag: "🇦🇪",
    },
    {
        label: "India",
        city: "New Delhi",
        timeZone: "Asia/Kolkata",
        flag: "🇮🇳",
    },
];

const languages = [
    { label: "English", code: "en" },
    { label: "German", code: "de" },
    { label: "French", code: "fr" },
    { label: "Spanish", code: "es" },
    { label: "Italian", code: "it" },
    { label: "Russian", code: "ru" },
    { label: "Chinese Simplified", code: "zh-CN" },
    { label: "Japanese", code: "ja" },
    { label: "Arabic", code: "ar" },
    { label: "Hindi", code: "hi" },
];

const replyTemplates = [
    {
        title: "First Response",
        text: `Hello,

Thank you for contacting Dream Ceylon Journeys.

We would be happy to help you plan a memorable Sri Lanka tour. Please share your preferred travel dates, number of travelers, expected duration, and the type of experience you are looking for.

We can prepare a customized itinerary according to your interests.

Best regards,
Dream Ceylon Journeys`,
    },
    {
        title: "Itinerary Follow-up",
        text: `Hello,

Thank you for sharing your travel details.

We will prepare a customized Sri Lanka itinerary including culture, wildlife, beaches, scenic landscapes, and local experiences. Once the itinerary is ready, we will share it with you for review.

Best regards,
Dream Ceylon Journeys`,
    },
    {
        title: "Price Explanation",
        text: `Hello,

Our package price depends on the travel duration, vehicle type, route, number of travelers, hotel category, and activities included.

We can customize the tour according to your budget and travel preferences. Please share your expected budget range so we can suggest the best option.

Best regards,
Dream Ceylon Journeys`,
    },
    {
        title: "Vehicle Price",
        text: `Hello,

Our vehicle rates are as follows:

Car: 80 USD per day
SUV: 95 USD per day
Van: 110 USD per day

The price includes an air-conditioned vehicle, experienced chauffeur guide, airport pickup, and water bottles. Entrance fees, activities, hotels, and meals are not included unless mentioned separately.

Best regards,
Dream Ceylon Journeys`,
    },
    {
        title: "Payment Follow-up",
        text: `Hello,

Thank you for confirming your tour with Dream Ceylon Journeys.

To secure the booking, we kindly request an advance payment. Once the payment is received, we will confirm your tour arrangement and share the final details.

Best regards,
Dream Ceylon Journeys`,
    },
];

const ClientTools = () => {
    const [now, setNow] = useState(new Date());
    const [replyText, setReplyText] = useState(replyTemplates[0].text);
    const [targetLanguage, setTargetLanguage] = useState("de");
    const [clientWhatsappNumber, setClientWhatsappNumber] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const googleTranslateUrl = useMemo(() => {
        const encodedText = encodeURIComponent(replyText);

        return `https://translate.google.com/?sl=auto&tl=${targetLanguage}&text=${encodedText}&op=translate`;
    }, [replyText, targetLanguage]);

    const whatsappUrl = useMemo(() => {
        const cleanedNumber = clientWhatsappNumber.replace(/\D/g, "");
        const encodedText = encodeURIComponent(replyText);

        if (!cleanedNumber) {
            return "";
        }

        return `https://wa.me/${cleanedNumber}?text=${encodedText}`;
    }, [clientWhatsappNumber, replyText]);

    const getTime = (timeZone) => {
        return new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        }).format(now);
    };

    const getDate = (timeZone) => {
        return new Intl.DateTimeFormat("en-US", {
            timeZone,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(now);
    };

    const getGoodTimeStatus = (timeZone) => {
        const hour = Number(
            new Intl.DateTimeFormat("en-US", {
                timeZone,
                hour: "2-digit",
                hour12: false,
            }).format(now)
        );

        if (hour >= 9 && hour <= 20) {
            return {
                label: "Good time to message",
                className: "text-bg-success",
            };
        }

        if (hour >= 7 && hour < 9) {
            return {
                label: "Early morning",
                className: "text-bg-warning",
            };
        }

        if (hour > 20 && hour <= 22) {
            return {
                label: "Late evening",
                className: "text-bg-warning",
            };
        }

        return {
            label: "Avoid messaging now",
            className: "text-bg-danger",
        };
    };

    const handleTemplateSelect = (text) => {
        setReplyText(text);
        setCopied(false);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(replyText);
            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (error) {
            alert("Failed to copy text");
        }
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Client Tools</h2>
                    <p className="text-muted mb-0">
                        Check client time zones, generate AI replies, translate messages, and
                        open WhatsApp replies quickly.
                    </p>
                </div>
            </div>

            <AIReplyGenerator
                onUseReply={(text) => {
                    setReplyText(text);
                    setCopied(false);
                }}
            />

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaClock className="text-primary" />
                        <h5 className="fw-bold mb-0">World Time</h5>
                    </div>

                    <div className="row g-3">
                        {countries.map((country) => {
                            const status = getGoodTimeStatus(country.timeZone);

                            return (
                                <div className="col-12 col-md-6 col-xl-4" key={country.timeZone}>
                                    <div className="world-time-card">
                                        <div className="d-flex justify-content-between align-items-start">
                                            <div>
                                                <h5 className="fw-bold mb-1">
                                                    <span className="me-2">{country.flag}</span>
                                                    {country.city}
                                                </h5>
                                                <p className="text-muted mb-2">{country.label}</p>
                                            </div>

                                            <FaGlobeAsia className="text-muted" />
                                        </div>

                                        <h3 className="fw-bold mb-1">{getTime(country.timeZone)}</h3>
                                        <p className="text-muted mb-3">{getDate(country.timeZone)}</p>

                                        <span className={`badge ${status.className}`}>
                      {status.label}
                    </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaLanguage className="text-primary" />
                        <h5 className="fw-bold mb-0">Quick Reply Translator</h5>
                    </div>

                    <div className="row g-3">
                        <div className="col-12 col-lg-4">
                            <label className="form-label fw-semibold">
                                Quick Reply Templates
                            </label>

                            <div className="d-grid gap-2">
                                {replyTemplates.map((template) => (
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary text-start"
                                        key={template.title}
                                        onClick={() => handleTemplateSelect(template.text)}
                                    >
                                        {template.title}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="col-12 col-lg-8">
                            <label className="form-label fw-semibold">Reply Message</label>
                            <textarea
                                className="form-control"
                                rows="11"
                                value={replyText}
                                onChange={(e) => {
                                    setReplyText(e.target.value);
                                    setCopied(false);
                                }}
                            ></textarea>

                            <div className="row g-3 mt-2">
                                <div className="col-12 col-md-5">
                                    <label className="form-label fw-semibold">Translate To</label>
                                    <select
                                        className="form-select"
                                        value={targetLanguage}
                                        onChange={(e) => setTargetLanguage(e.target.value)}
                                    >
                                        {languages.map((language) => (
                                            <option key={language.code} value={language.code}>
                                                {language.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-7 d-flex align-items-end gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={handleCopy}
                                    >
                                        <FaCopy className="me-2" />
                                        {copied ? "Copied!" : "Copy Reply"}
                                    </button>

                                    <a
                                        href={googleTranslateUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn-primary"
                                    >
                                        <FaExternalLinkAlt className="me-2" />
                                        Open Translator
                                    </a>
                                </div>
                            </div>

                            <div className="card border-0 bg-light rounded-4 mt-4">
                                <div className="card-body">
                                    <div className="d-flex align-items-center gap-2 mb-3">
                                        <FaWhatsapp className="text-success" />
                                        <h6 className="fw-bold mb-0">WhatsApp Reply Helper</h6>
                                    </div>

                                    <div className="row g-3">
                                        <div className="col-12 col-md-6">
                                            <label className="form-label fw-semibold">
                                                Client WhatsApp Number
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={clientWhatsappNumber}
                                                onChange={(e) =>
                                                    setClientWhatsappNumber(e.target.value)
                                                }
                                                placeholder="+14155550123"
                                            />
                                            <small className="text-muted">
                                                Use country code. Example: +1 USA, +44 UK, +49 Germany,
                                                +94 Sri Lanka.
                                            </small>
                                        </div>

                                        <div className="col-12 col-md-6 d-flex align-items-end">
                                            <a
                                                href={whatsappUrl || "#"}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={`btn btn-success w-100 ${
                                                    !whatsappUrl ? "disabled" : ""
                                                }`}
                                            >
                                                <FaWhatsapp className="me-2" />
                                                Open WhatsApp with Reply
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>


                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientTools;