import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { notifyLeadsChanged } from "../utils/leadEvents";

const filters = [
    { value: "all", label: "All new" },
    { value: "unassigned", label: "Unassigned" },
    { value: "mine", label: "Mine" },
];
const channels = ["Email", "WhatsApp", "Phone", "Other"];
const waitingDays = (createdAt) => {
    const createdDay = toCalendarDateInput(createdAt);
    if (!createdDay) return 0;
    return Math.max(0, Math.round((Date.parse(`${todayCalendarDate()}T00:00:00Z`) - Date.parse(`${createdDay}T00:00:00Z`)) / 86400000));
};

const LeadTriage = () => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("inquiry.update");
    const [filter, setFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [queue, setQueue] = useState(null);
    const [assignees, setAssignees] = useState([]);
    const [channelsById, setChannelsById] = useState({});
    const [busyId, setBusyId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (!canUpdate) return;
        let active = true;
        api.get("/inquiries/assignees")
            .then(({ data }) => { if (active) setAssignees(data.admins || []); })
            .catch(() => { if (active) setError("Could not load staff eligible to own leads."); });
        return () => { active = false; };
    }, [canUpdate]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        api.get("/inquiries/triage", { params: { filter, page } })
            .then(({ data }) => { if (active) { setQueue(data); setError(""); } })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to load new inquiries."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filter, page, refresh]);

    const changeOwner = async (inquiry, assignedTo) => {
        try {
            setBusyId(inquiry._id); setError(""); setSuccess("");
            await api.patch(`/inquiries/${inquiry._id}/assignee`, { assignedTo: assignedTo || null });
            notifyLeadsChanged();
            setSuccess(`Owner updated for ${inquiry.fullName}.`);
            setRefresh((value) => value + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to change the lead owner.");
        } finally { setBusyId(""); }
    };

    const recordContact = async (inquiry) => {
        const channel = channelsById[inquiry._id];
        if (!channel) return;
        try {
            setBusyId(inquiry._id); setError(""); setSuccess("");
            await api.patch(`/inquiries/${inquiry._id}/contacted`, { channel });
            notifyLeadsChanged();
            setSuccess(`Contact recorded for ${inquiry.fullName}.`);
            setRefresh((value) => value + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to record contact.");
        } finally { setBusyId(""); }
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4">
                <div>
                    <h2 className="fw-bold mb-1">New Lead Queue</h2>
                    <p className="text-muted mb-0">Review new inquiries oldest first, assign an owner, and log guest contact.</p>
                </div>
                <Link to="/inquiries" className="btn btn-outline-primary">All Inquiries</Link>
            </div>
            <p className="text-muted small">Recording contact updates the inquiry to Contacted and removes it from this queue. It does not send an email or WhatsApp message. An unassigned lead is assigned to the staff member who records contact.</p>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}

            <div className="row g-3 mb-4">
                {filters.map(({ value, label }) => (
                    <div className="col-12 col-md-4" key={value}>
                        <button type="button" className={`card rounded-4 w-100 text-start shadow-sm ${filter === value ? "border-primary" : "border-0"}`}
                            onClick={() => { setPage(1); setFilter(value); }} aria-pressed={filter === value}>
                            <span className="card-body d-flex justify-content-between align-items-center">
                                <span>{label}</span><strong className="fs-4">{queue?.summary?.[value] ?? "–"}</strong>
                            </span>
                        </button>
                    </div>
                ))}
            </div>

            <div className="card rounded-4 border-0 shadow-sm"><div className="card-body">
                <div className="d-flex justify-content-between mb-3"><h5 className="fw-bold mb-0">Awaiting review</h5><small className="text-muted">{queue?.total ?? 0} in this view</small></div>
                {loading ? <p role="status">Loading new inquiries...</p> : !error && queue?.items?.length === 0 ? (
                    <p className="text-muted mb-0">No new inquiries in this view.</p>
                ) : !error && queue && (
                    <div className="table-responsive"><table className="table align-middle">
                        <thead><tr><th>Guest</th><th>Received</th><th>Source</th><th>Priority</th><th>Owner</th><th>Contact</th></tr></thead>
                        <tbody>{queue.items.map((inquiry) => (
                            <tr key={inquiry._id}>
                                <td>
                                    <strong>{inquiry.fullName}</strong><br />
                                    <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a><br />
                                    <small>{inquiry.whatsappNumber} · {inquiry.country}</small><br />
                                    <Link to={`/inquiries?keyword=${encodeURIComponent(inquiry.email)}`} className="small">Open inquiry</Link>
                                </td>
                                <td className="text-nowrap">{formatCalendarDate(inquiry.createdAt)}<br /><small className="text-muted">{waitingDays(inquiry.createdAt)} days waiting</small></td>
                                <td>{inquiry.source}</td>
                                <td>{inquiry.priority}</td>
                                <td>
                                    {canUpdate ? (
                                        <select className="form-select form-select-sm" aria-label={`Owner for ${inquiry.fullName}`}
                                            value={inquiry.assignedTo?._id || ""} onChange={(event) => changeOwner(inquiry, event.target.value)} disabled={Boolean(busyId)}>
                                            <option value="">Unassigned</option>
                                            {inquiry.assignedTo && !assignees.some((admin) => admin._id === inquiry.assignedTo._id) && (
                                                <option value={inquiry.assignedTo._id} disabled>{inquiry.assignedTo.name} (inactive)</option>
                                            )}
                                            {assignees.map((admin) => <option key={admin._id} value={admin._id}>{admin.name} · {admin.role}</option>)}
                                        </select>
                                    ) : (inquiry.assignedTo?.name || "Unassigned")}
                                </td>
                                <td>
                                    {canUpdate ? <div className="d-flex gap-2">
                                        <select className="form-select form-select-sm" aria-label={`Contact channel for ${inquiry.fullName}`}
                                            value={channelsById[inquiry._id] || ""} onChange={(event) => setChannelsById((previous) => ({ ...previous, [inquiry._id]: event.target.value }))} disabled={Boolean(busyId)}>
                                            <option value="">Channel</option>
                                            {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                                        </select>
                                        <button type="button" className="btn btn-sm btn-outline-success text-nowrap" onClick={() => recordContact(inquiry)} disabled={!channelsById[inquiry._id] || Boolean(busyId)}>Record contact</button>
                                    </div> : <span className="text-muted small">View only</span>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                )}
                {!loading && !error && queue && <div className="d-flex justify-content-between align-items-center mt-3">
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>Previous</button>
                    <small>Page {queue.page} of {queue.totalPages}</small>
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => setPage((value) => value + 1)} disabled={page >= queue.totalPages}>Next</button>
                </div>}
            </div></div>
        </div>
    );
};

export default LeadTriage;
