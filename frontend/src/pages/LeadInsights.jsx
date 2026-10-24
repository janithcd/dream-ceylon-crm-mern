import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const periods = [
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
    { value: "365", label: "Last 365 days" },
    { value: "all", label: "All time" },
];

const LeadInsights = () => {
    const [window, setWindow] = useState("90");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        api.get("/inquiries/insights", { params: { window } })
            .then(({ data: result }) => { if (active) setData(result); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to load lead insights."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [window]);

    const summary = data?.summary;
    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-start mb-4">
                <div>
                    <h2 className="fw-bold mb-1">Lead Insights</h2>
                    <p className="text-muted mb-0">See which inquiry sources lead to bookings and why leads close.</p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    <label htmlFor="lead-insights-window" className="visually-hidden">Inquiry period</label>
                    <select id="lead-insights-window" className="form-select" value={window} onChange={(event) => setWindow(event.target.value)}>
                        {periods.map((period) => <option value={period.value} key={period.value}>{period.label}</option>)}
                    </select>
                    <Link to="/inquiries" className="btn btn-outline-primary text-nowrap">Inquiries</Link>
                </div>
            </div>

            <p className="text-muted small">
                The period selects inquiries created in Sri Lanka calendar days. “Booked” means the inquiry has a linked booking,
                including one later cancelled. Closing a lead without a booking counts as lost. Booking dates may fall outside the selected period.
            </p>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {loading ? <p role="status">Loading insights...</p> : !error && summary && (
                <>
                    <div className="row g-3 mb-4">
                        {[
                            ["Inquiries", summary.inquiries],
                            ["Linked bookings", summary.booked],
                            ["Closed without booking", summary.lost],
                            ["Booking conversion", `${summary.conversionRate}%`],
                        ].map(([label, value]) => (
                            <div className="col-6 col-lg-3" key={label}>
                                <div className="card border-0 shadow-sm h-100 rounded-4"><div className="card-body">
                                    <small className="text-muted">{label}</small>
                                    <h3 className="fw-bold mb-0 mt-2">{value}</h3>
                                </div></div>
                            </div>
                        ))}
                    </div>

                    {summary.inquiries === 0 ? (
                        <div className="alert alert-info">No inquiries were created in this period.</div>
                    ) : (
                        <div className="row g-3">
                            <div className="col-12 col-xl-8">
                                <div className="card border-0 shadow-sm rounded-4 h-100"><div className="card-body">
                                    <h5 className="fw-bold mb-3">Source performance</h5>
                                    <div className="table-responsive"><table className="table align-middle mb-0">
                                        <thead><tr><th>Source</th><th className="text-end">Inquiries</th><th className="text-end">Booked</th><th className="text-end">Closed</th><th style={{ minWidth: 130 }}>Conversion</th></tr></thead>
                                        <tbody>{data.sources.map((row) => (
                                            <tr key={row.source}>
                                                <th scope="row">{row.source}</th>
                                                <td className="text-end">{row.inquiries}</td>
                                                <td className="text-end">{row.booked}</td>
                                                <td className="text-end">{row.lost}</td>
                                                <td>
                                                    <span>{row.conversionRate}%</span>
                                                    <div className="progress mt-1" role="progressbar" aria-label={`${row.source} conversion`} aria-valuenow={row.conversionRate} aria-valuemin="0" aria-valuemax="100" style={{ height: 6 }}>
                                                        <div className="progress-bar bg-success" style={{ width: `${row.conversionRate}%` }} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}</tbody>
                                    </table></div>
                                </div></div>
                            </div>
                            <div className="col-12 col-xl-4">
                                <div className="card border-0 shadow-sm rounded-4 h-100"><div className="card-body">
                                    <h5 className="fw-bold mb-3">Why leads closed</h5>
                                    {data.reasons.length === 0 ? <p className="text-muted mb-0">No closed inquiries without bookings in this period.</p> : (
                                        <ul className="list-group list-group-flush">
                                            {data.reasons.map(({ reason, count }) => (
                                                <li key={reason} className="list-group-item d-flex justify-content-between px-0">
                                                    <span>{reason}</span><strong>{count}</strong>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <small className="text-muted">Unspecified includes older inquiries closed before reasons were recorded.</small>
                                </div></div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default LeadInsights;
