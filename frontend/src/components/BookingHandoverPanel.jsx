import { useEffect, useState } from "react";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";

const formatTime = (value) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Colombo",
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const BookingHandoverPanel = ({ bookingId }) => {
    const { hasPermission } = usePermissions();
    const canWrite = hasPermission("booking.update");
    const [notes, setNotes] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/handover-notes`, { params: { page } })
            .then(({ data }) => {
                if (!active) return;
                setNotes((current) => page === 1 ? data.notes : [...current,
                    ...data.notes.filter((note) => !current.some((item) => item.id === note.id))]);
                setTotalPages(data.totalPages);
                setError("");
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load handover notes."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, page, reloadKey]);

    const saveNote = async (event) => {
        event.preventDefault();
        if (saving || !text.trim()) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            await api.post(`/bookings/${bookingId}/handover-notes`, { text: text.trim() });
            setText("");
            setSuccess("Handover note saved for the team.");
            setLoading(true);
            setPage(1);
            setReloadKey((value) => value + 1);
        } catch (err) {
            setError(err.response?.data?.message || "Could not save handover note.");
        } finally {
            setSaving(false);
        }
    };

    return <div id="booking-handover-panel" role="region" aria-label="Internal handover notes">
        <p className="small text-muted">Private team notes appear newest first. They are kept separate from the editable Admin Notes field and guest messages.</p>
        {canWrite && <form onSubmit={saveNote} className="mb-3">
            <label className="form-label fw-semibold" htmlFor="handover-note-text">Add a handover note</label>
            <textarea id="handover-note-text" className="form-control" rows="3" maxLength="1000" value={text}
                onChange={(event) => setText(event.target.value)} placeholder="What should the next team member know?" />
            <div className="d-flex justify-content-between align-items-center mt-2 gap-2">
                <small className="text-muted">{text.length}/1000 characters · Append-only</small>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !text.trim()}>{saving ? "Saving..." : "Add note"}</button>
            </div>
        </form>}
        {success && <div className="alert alert-success small" role="status">{success}</div>}
        {error && <div className="alert alert-danger small" role="alert">{error}</div>}
        {!loading && !error && notes.length === 0 && <p className="text-muted">No handover notes have been added yet.</p>}
        <div className="list-group list-group-flush">{notes.map((note) => <div className="list-group-item px-0 py-3" key={note.id}>
            <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>{note.text}</p>
            <small className="text-muted">{note.createdByName} · {formatTime(note.createdAt)} · Sri Lanka time</small>
        </div>)}</div>
        {loading && <p className="text-muted mt-3" role="status">Loading handover notes...</p>}
        {page < totalPages && !loading && !error && <button type="button" className="btn btn-outline-secondary btn-sm mt-3"
            onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Load older notes</button>}
        {error && !loading && <button type="button" className="btn btn-outline-secondary btn-sm mt-2"
            onClick={() => { setError(""); setLoading(true); setReloadKey((value) => value + 1); }}>Retry</button>}
    </div>;
};

export default BookingHandoverPanel;
