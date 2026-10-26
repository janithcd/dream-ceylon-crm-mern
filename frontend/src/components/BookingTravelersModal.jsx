import { useEffect, useRef, useState } from "react";
import { FaCopy, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";

const BookingTravelersModal = ({ bookingId, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission("booking.update");
    const [saved, setSaved] = useState(null);
    const [draft, setDraft] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const dialogRef = useRef(null);
    const closeRef = useRef(onClose);
    const dirty = Boolean(saved) && JSON.stringify(draft) !== JSON.stringify(saved.travelerNames);
    const headcount = saved?.numberOfTravelers || 0;

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/travelers`)
            .then(({ data }) => { if (active) { setSaved(data); setDraft(data.travelerNames); } })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to load traveler names."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeRef.current();
            }
            if (event.key !== "Tab" || !dialog) return;
            const controls = [...dialog.querySelectorAll("button, input")]
                .filter((element) => !element.disabled && element.offsetParent !== null);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first) return;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        dialog?.addEventListener("keydown", handleKey);
        return () => {
            dialog?.removeEventListener("keydown", handleKey);
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const close = () => {
        if (busy || (dirty && !window.confirm("Discard unsaved traveler names?"))) return;
        onClose();
    };
    closeRef.current = close;

    const reload = async () => {
        if (busy || (dirty && !window.confirm("Discard these changes and reload the saved roster?"))) return;
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const { data } = await api.get(`/bookings/${bookingId}/travelers`);
            setSaved(data);
            setDraft(data.travelerNames);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to reload traveler names.");
        } finally {
            setLoading(false);
        }
    };

    const save = async (event) => {
        event.preventDefault();
        if (busy || !dirty) return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const { data } = await api.put(`/bookings/${bookingId}/travelers`, {
                travelerNames: draft,
                expectedVersion: saved.version,
                expectedHeadcount: saved.numberOfTravelers,
            });
            setSaved(data);
            setDraft(data.travelerNames);
            setSuccess("Traveler roster saved.");
            onChanged?.();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save traveler names.");
        } finally {
            setBusy(false);
        }
    };

    const copySaved = async () => {
        if (!saved?.travelerNames.length || dirty) return;
        try {
            const list = saved.travelerNames.map((name, index) => `${index + 1}. ${name}`).join("\n");
            await navigator.clipboard.writeText(`${saved.bookingCode} · Traveler names (${saved.travelerNames.length}/${saved.numberOfTravelers})\n${list}`);
            setError("");
            setSuccess("Saved traveler names copied. Check recipients before sharing.");
        } catch {
            setError("Could not copy the names. Select and copy them manually.");
        }
    };

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="traveler-roster-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 id="traveler-roster-title" className="modal-title">Traveler roster{saved?.bookingCode && ` · ${saved.bookingCode}`}</h5>
                        <button type="button" className="btn-close" aria-label="Close traveler roster" onClick={close} />
                    </div>
                    <div className="modal-body">
                        <p className="text-muted small">Record the names of people actually traveling. The booking contact is not automatically added. Do not enter passport numbers or other identity documents here.</p>
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {success && <div className="alert alert-success" role="status">{success}</div>}
                        {loading ? <p role="status">Loading traveler names...</p> : saved ? <>
                            <p className="fw-semibold mb-1">{saved.travelerNames.length} of {headcount} travelers named</p>
                            <p className="text-muted small">These names are separate from the booking headcount. Update the booking first if the group size changes.</p>
                            {canEdit ? <form id="traveler-roster-form" onSubmit={save}>
                                {draft.map((name, index) => <div className="input-group mb-2" key={index}>
                                    <label className="input-group-text" htmlFor={`traveler-name-${index}`}>{index + 1}</label>
                                    <input id={`traveler-name-${index}`} className="form-control" value={name} maxLength={120} required disabled={busy}
                                        onChange={(event) => setDraft((previous) => previous.map((item, position) => position === index ? event.target.value : item))}
                                        placeholder="Full name" />
                                    <button type="button" className="btn btn-outline-danger" aria-label={`Remove traveler ${index + 1}`} disabled={busy}
                                        onClick={() => setDraft((previous) => previous.filter((_, position) => position !== index))}><FaTrash /></button>
                                </div>)}
                                {draft.length === 0 && <p className="text-muted small">No names saved yet. Add each traveler when their names are confirmed.</p>}
                                {draft.length < Math.min(headcount, 60) && <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy}
                                    onClick={() => setDraft((previous) => [...previous, ""])}><FaPlus className="me-1" />Add traveler</button>}
                                {draft.length > headcount && <p className="text-danger small mt-2">Too many names for the booked group size. Review the booking headcount.</p>}
                            </form> : <ol className="ps-4">{saved.travelerNames.map((name, index) => <li key={index}>{name}</li>)}</ol>}
                        </> : !loading && <button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>}
                    </div>
                    <div className="modal-footer">
                        {saved && <button type="button" className="btn btn-outline-secondary" onClick={copySaved} disabled={busy || dirty || !saved.travelerNames.length}><FaCopy className="me-1" />Copy saved names</button>}
                        {saved && <button type="button" className="btn btn-outline-secondary" onClick={reload} disabled={busy || loading}>Reload saved list</button>}
                        {canEdit && saved && <button type="submit" form="traveler-roster-form" className="btn btn-primary" disabled={busy || loading || !dirty || draft.length > headcount || draft.some((name) => !name.trim())}>{busy ? "Saving..." : "Save roster"}</button>}
                        <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default BookingTravelersModal;
