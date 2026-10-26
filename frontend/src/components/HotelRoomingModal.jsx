import { useEffect, useRef, useState } from "react";
import { FaCopy, FaEnvelope } from "react-icons/fa";
import api from "../api/axios";
import { buildHotelRoomingEmail } from "../utils/hotelRoomingEmail";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";

const HotelRoomingModal = ({ bookingId, stayId, onClose, onOpenRoster }) => {
    const [details, setDetails] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    const closeRef = useRef(onClose);

    useEffect(() => {
        let active = true;
        api.get(`/bookings/${bookingId}/hotel-stays/${stayId}/rooming-details`)
            .then(({ data }) => {
                if (!active) return;
                setDetails(data);
                setAssignments(data.roomingPlan.status === "current" ? data.roomingPlan.assignments : data.travelerNames.map(() => ""));
            })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Failed to load rooming details."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [bookingId, stayId, reloadKey]);

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
            const controls = [...dialog.querySelectorAll("button, a[href], input, select, textarea")]
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

    const savedAssignments = details?.roomingPlan?.status === "current"
        ? details.roomingPlan.assignments : details?.travelerNames.map(() => "") || [];
    const dirty = JSON.stringify(assignments) !== JSON.stringify(savedAssignments);
    const hasWork = dirty || Boolean(draft);
    const close = () => {
        if (busy || (hasWork && !window.confirm("Discard the unsaved room changes or email draft?"))) return;
        onClose();
    };
    closeRef.current = close;

    const reload = () => {
        if (busy || (hasWork && !window.confirm("Discard unsaved changes and load the latest saved details?"))) return;
        setDetails(null);
        setAssignments([]);
        setDraft(null);
        setLoading(true);
        setError("");
        setStatus("");
        setReloadKey((value) => value + 1);
    };
    const setRoom = (index, room) => {
        if (busy) return;
        if (draft && !window.confirm("Changing a room group will clear the prepared email. Continue?")) return;
        setAssignments((previous) => previous.map((entry, position) => position === index ? room : entry));
        setDraft(null);
        setStatus("");
        setError("");
    };
    const prepared = details ? buildHotelRoomingEmail(details, assignments) : null;
    const planUrl = `/bookings/${bookingId}/hotel-stays/${stayId}/rooming-plan`;
    const detailsUrl = `/bookings/${bookingId}/hotel-stays/${stayId}/rooming-details`;
    const savePlan = async () => {
        if (busy || !prepared?.value || !details) return;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const { data } = await api.put(planUrl, {
                assignments,
                expectedRosterVersion: details.rosterVersion,
                expectedRooms: details.rooms,
                expectedRevision: details.roomingPlan.revision,
            });
            setDetails((previous) => ({ ...previous, roomingPlan: data.roomingPlan }));
            setAssignments(data.roomingPlan.assignments);
            setDraft(null);
            setStatus("Rooming plan saved. You can now prepare the supplier email.");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save the rooming plan. Reload and try again.");
        } finally {
            setBusy(false);
        }
    };
    const clearPlan = async () => {
        if (busy || !details || details.roomingPlan.status === "none" ||
            !window.confirm("Clear this saved hotel rooming plan?")) return;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const { data } = await api.delete(planUrl, { data: { expectedRevision: details.roomingPlan.revision } });
            setDetails((previous) => ({ ...previous, roomingPlan: data.roomingPlan }));
            setAssignments(details.travelerNames.map(() => ""));
            setDraft(null);
            setStatus("Saved rooming plan cleared.");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to clear the rooming plan. Reload and try again.");
        } finally {
            setBusy(false);
        }
    };
    const prepare = async () => {
        if (busy || dirty || details?.roomingPlan.status !== "current" || prepared?.error) return;
        if (draft && !window.confirm("Replace the edited email with a fresh rooming draft?")) return;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            const { data } = await api.get(detailsUrl);
            if (data.roomingPlan.status !== "current" ||
                data.roomingPlan.revision !== details.roomingPlan.revision ||
                data.rosterVersion !== details.rosterVersion || data.rooms !== details.rooms) {
                setDetails(data);
                setAssignments(data.roomingPlan.status === "current" ? data.roomingPlan.assignments : data.travelerNames.map(() => ""));
                setDraft(null);
                setError("The hotel or traveler roster changed. Review and save the rooming plan again.");
                return;
            }
            const result = buildHotelRoomingEmail(data, data.roomingPlan.assignments);
            if (result.error) { setError(result.error); return; }
            setDetails(data);
            setAssignments(data.roomingPlan.assignments);
            setDraft(result.value);
        } catch (err) {
            setDraft(null);
            setError(err.response?.data?.message || "Failed to refresh rooming details.");
        } finally {
            setBusy(false);
        }
    };
    const edit = (field, value) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setStatus("");
    };
    const copy = async () => {
        if (!draft?.body.trim()) return;
        try {
            await navigator.clipboard.writeText(`To: ${draft.recipient}\nSubject: ${draft.subject}\n\n${draft.body}`);
            setStatus("Rooming email copied. Check the recipient and guest grouping before sending.");
        } catch {
            bodyRef.current?.focus();
            bodyRef.current?.select();
            setStatus("The message is selected. Press Ctrl+C or Command+C to copy it.");
        }
    };
    const mailto = draft ? buildSupplierMailtoUrl(draft) : "";
    const included = assignments.filter((room) => room && room !== "not-staying").length;

    return <>
        <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="hotel-rooming-title">
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 id="hotel-rooming-title" className="modal-title">Hotel rooming email{details?.bookingCode && ` · ${details.bookingCode}`}</h5>
                        <button type="button" className="btn-close" aria-label="Close rooming email" onClick={close} />
                    </div>
                    <div className="modal-body">
                        <p className="text-muted small">Choose which travelers stay here and who shares each reserved room. Room groups are planning labels, not physical hotel room numbers. Review the email before sending it yourself.</p>
                        {loading && <p role="status">Loading the latest hotel and roster details...</p>}
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        {!loading && !details && <div className="d-flex gap-2"><button type="button" className="btn btn-outline-primary" onClick={reload}>Try again</button>{error.toLowerCase().includes("traveler roster") && <button type="button" className="btn btn-outline-secondary" onClick={onOpenRoster}>Open traveler roster</button>}</div>}
                        {!loading && details && <>
                            <p className="small mb-1"><strong>{details.hotelName}</strong> · {details.checkIn} – {details.checkOut} · {details.rooms} {details.rooms === 1 ? "room" : "rooms"}</p>
                            <p className="text-muted small">{included} of {details.travelerNames.length} travelers selected for this hotel. Every traveler needs a choice and every reserved room group needs an occupant. <button type="button" className="btn btn-link btn-sm p-0" disabled={busy} onClick={() => { if (!hasWork || window.confirm("Discard unsaved changes and open the traveler roster?")) onOpenRoster(); }}>Edit traveler roster</button></p>
                            {details.roomingPlan.status === "stale" && <div className="alert alert-warning small">The saved rooming plan needs review because the traveler roster or reserved room count changed. Choose each room group again and save.</div>}
                            {details.roomingPlan.status === "current" && <p className="small text-success">Saved plan loaded{details.roomingPlan.savedByName ? ` by ${details.roomingPlan.savedByName}` : ""}. Review it before emailing the hotel.</p>}
                            {details.missingDetails.length > 0 && <div className="alert alert-warning small">Missing from the saved stay: {details.missingDetails.join(", ")}. Add or review these details before sending.</div>}
                            <div className="d-grid gap-2 mb-3">
                                {details.travelerNames.map((name, index) => <div className="row align-items-center g-2" key={index}>
                                    <label className="col-sm-7 text-break" htmlFor={`rooming-guest-${index}`}>{index + 1}. {name}</label>
                                    <div className="col-sm-5"><select id={`rooming-guest-${index}`} className="form-select form-select-sm" value={assignments[index] || ""} onChange={(event) => setRoom(index, event.target.value)} disabled={busy}>
                                        <option value="">Choose a room group</option>
                                        {Array.from({ length: details.rooms }, (_, room) => <option value={String(room + 1)} key={room}>Room group {room + 1}</option>)}
                                        <option value="not-staying">Not staying at this hotel</option>
                                    </select></div>
                                </div>)}
                            </div>
                            {!prepared?.value && <p className="text-muted small">{prepared?.error}</p>}
                            <div className="d-flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary btn-sm" onClick={savePlan} disabled={busy || !prepared?.value || (!dirty && details.roomingPlan.status === "current")}>{busy ? "Saving or loading..." : "Save rooming plan"}</button>
                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={prepare} disabled={busy || dirty || details.roomingPlan.status !== "current" || !prepared?.value}>{draft ? "Regenerate email" : "Prepare rooming email"}</button>
                                {details.roomingPlan.status !== "none" && <button type="button" className="btn btn-outline-danger btn-sm" onClick={clearPlan} disabled={busy}>Clear saved plan</button>}
                            </div>
                            {prepared?.value && (dirty || details.roomingPlan.status !== "current") && <p className="text-muted small mt-2">Save the rooming plan before preparing an email. Saving records the groups, but does not contact the hotel.</p>}
                            {draft && <div className="border-top mt-4 pt-3">
                                <p className="text-muted small">Review the guest names, room groups, dates, and recipient. Drafting or opening an email app does not send or log a message in the CRM.</p>
                                <label htmlFor="rooming-recipient" className="form-label fw-semibold">Supplier email</label>
                                <input id="rooming-recipient" type="email" className="form-control mb-3" value={draft.recipient} onChange={(event) => edit("recipient", event.target.value)} maxLength={254} placeholder="reservations@hotel.com" />
                                <label htmlFor="rooming-subject" className="form-label fw-semibold">Subject</label>
                                <input id="rooming-subject" className="form-control mb-3" value={draft.subject} onChange={(event) => edit("subject", event.target.value)} maxLength={160} />
                                <label htmlFor="rooming-body" className="form-label fw-semibold">Message</label>
                                <textarea id="rooming-body" ref={bodyRef} className="form-control" rows="16" value={draft.body} onChange={(event) => edit("body", event.target.value)} maxLength={10000} />
                                {!mailto && <small className="d-block text-muted mt-2">A valid recipient, subject, and message of at most 1,800 characters are needed to open your email app. Longer lists can be copied into an email manually.</small>}
                                {status && <div className="alert alert-info mt-3 mb-0" role="status">{status}</div>}
                            </div>}
                        </>}
                    </div>
                    <div className="modal-footer flex-wrap">
                        <button type="button" className="btn btn-outline-secondary" onClick={reload} disabled={loading || busy}>Reload details</button>
                        <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>Close</button>
                        {draft && <>
                            <button type="button" className="btn btn-outline-secondary" onClick={copy} disabled={!draft.body.trim()}><FaCopy className="me-2" />Copy email</button>
                            {mailto && <a className="btn btn-primary" href={mailto}><FaEnvelope className="me-2" />Open email app</a>}
                        </>}
                    </div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show" />
    </>;
};

export default HotelRoomingModal;
