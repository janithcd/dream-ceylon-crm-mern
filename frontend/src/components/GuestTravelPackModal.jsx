import { useEffect, useState } from "react";
import api from "../api/axios";
import { formatCalendarDate } from "../utils/calendarDate";
import { buildSupplierMailtoUrl } from "../utils/supplierEmail";

export default function GuestTravelPackModal({ booking, onClose, onOpenItinerary, onOpenHotels, onOpenTransport, onOpenActivities }) {
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [stale, setStale] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    useEffect(() => {
        let active = true;
        api.get(`/booking-pdf/travel-pack/${booking._id}/preview`).then(({ data }) => {
            if (active) { setReview(data); setStale(false); }
        }).catch((err) => { if (active) setError(err.response?.data?.message || "Could not load the travel pack."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [booking._id, reload]);
    const refresh = () => { setLoading(true); setReview(null); setError(""); setNotice(""); setAcknowledged(false); setDownloaded(false); setReload((n) => n + 1); };
    const download = async () => {
        setBusy(true); setError(""); setNotice(""); setDownloaded(false);
        try {
            const { data } = await api.post(`/booking-pdf/travel-pack/${booking._id}`, { reviewed: acknowledged, fingerprint: review.fingerprint }, { responseType: "blob" });
            const url = URL.createObjectURL(data), anchor = document.createElement("a");
            anchor.href = url; anchor.download = `dream-ceylon-travel-pack-${String(review.pack.bookingCode || "booking").replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
            document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDownloaded(true); setNotice("PDF download started. Open and check it before attaching it to your guest email.");
        } catch (err) {
            let message = err.response?.data?.message || "Could not download the travel pack.";
            if (err.response?.data instanceof Blob) { try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* Keep the safe fallback. */ } }
            setError(message); if (err.response?.status === 409) { setStale(true); setAcknowledged(false); }
        } finally { setBusy(false); }
    };
    const copyMessage = async () => {
        try { await navigator.clipboard.writeText(`Subject: ${review.message.subject}\n\n${review.message.body}`); setNotice("Email draft copied. Attach the downloaded PDF before sending."); }
        catch { setError("Clipboard unavailable. Select and copy the email text below."); }
    };
    return <>
        <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="travel-pack-title">
            <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div className="modal-content">
                <div className="modal-header"><div><h5 id="travel-pack-title" className="modal-title">Guest Travel Pack</h5><small className="text-muted">{booking.bookingCode}</small></div><button className="btn-close" aria-label="Close travel pack" disabled={busy} onClick={onClose} /></div>
                <div className="modal-body">
                    <p>Review the itinerary, confirmed stays, transport and activities together before sharing one PDF with your guest.</p>
                    <div className="d-flex flex-wrap gap-2 mb-3"><button className="btn btn-sm btn-outline-secondary" disabled={busy || loading} onClick={refresh}>Reload preview</button>
                        {[["Itinerary", onOpenItinerary], ["Hotels", onOpenHotels], ["Transport", onOpenTransport], ["Activities", onOpenActivities]].map(([label, handler]) => <button key={label} className="btn btn-sm btn-outline-primary" disabled={busy} onClick={handler}>Review {label.toLowerCase()}</button>)}
                    </div>
                    {error && <div role="alert" className="alert alert-danger">{error}</div>}
                    {notice && <div role="status" className="alert alert-success">{notice}</div>}
                    {loading && <p role="status">Preparing travel pack preview…</p>}
                    {review && <>
                        <div className="d-flex flex-wrap gap-3 mb-3">{[["Daily plans", "itinerary"], ["Hotels", "hotels"], ["Transport", "transport"], ["Activities", "activities"]].map(([label, key]) => <div key={key} className="border rounded py-2 px-3"><strong>{review.counts[key]}</strong> {label}</div>)}</div>
                        {!!review.blockers.length && <div className="alert alert-danger"><strong>Resolve before download</strong><ul className="mb-0">{review.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                        {!!review.warnings.length && <div className="alert alert-warning"><strong>Review before sharing</strong><ul className="mb-0">{review.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                        <section className="border rounded p-3" aria-label="Travel pack content preview">
                            <h4>{review.brand.companyName || "Dream Ceylon Journeys"}</h4><h5>Your travel pack · {review.pack.guestName}</h5>
                            <p>{formatCalendarDate(review.pack.travelStartDate)} – {formatCalendarDate(review.pack.travelEndDate)} · {review.pack.numberOfTravelers} travelers</p>
                            <p className="small text-muted">{review.pack.notice}</p>
                            {review.pack.entries.map((entry, index) => <article key={index} className="border-top pt-3 mt-3" style={{ overflowWrap: "anywhere" }}>
                                <div className="small text-muted">{formatCalendarDate(entry.date)} · {entry.category}</div><h6 className="mt-1">{entry.title}</h6>
                                {entry.plan && <p>{entry.plan}</p>}
                                {entry.details.map((detail, i) => <div className="small mb-1" key={i}>{detail}</div>)}
                                {entry.overnightLocation && <p className="small text-muted">Overnight: {entry.overnightLocation}</p>}
                            </article>)}
                            <p className="small text-muted mt-3 mb-0">{[review.brand.whatsapp, review.brand.email, review.brand.website].filter(Boolean).join(" · ")}</p>
                        </section>
                        {review.ready && !stale && <label className="form-check mt-3"><input type="checkbox" className="form-check-input" checked={acknowledged} disabled={busy} onChange={(e) => setAcknowledged(e.target.checked)} /><span className="form-check-label">I reviewed the guest-facing details and all warnings. I understand that pending reservations are omitted and daily plans do not confirm a reservation.</span></label>}
                        {downloaded && !stale && <section className="border rounded p-3 mt-3"><h6>Guest email draft</h6><p className="small text-muted">Attach the downloaded PDF yourself. Opening an email app does not send the email or attach the file.</p>
                            <label className="form-label d-block">Recipient<input className="form-control" value={review.message.recipient} readOnly /></label>
                            <label className="form-label d-block">Subject<input className="form-control" value={review.message.subject} readOnly /></label>
                            <label className="form-label d-block">Message<textarea className="form-control" rows={9} value={review.message.body} readOnly /></label>
                            <div className="d-flex gap-2"><button className="btn btn-sm btn-outline-primary" onClick={copyMessage}>Copy email draft</button>{buildSupplierMailtoUrl(review.message) && <a className="btn btn-sm btn-outline-primary" href={buildSupplierMailtoUrl(review.message)}>Open email app</a>}</div>
                        </section>}
                    </>}
                </div>
                <div className="modal-footer"><button className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Close</button><button className="btn btn-primary" onClick={download} disabled={loading || busy || stale || !review?.ready || !acknowledged}>{busy ? "Preparing PDF…" : "Download travel pack PDF"}</button></div>
            </div></div>
        </div><div className="modal-backdrop fade show" />
    </>;
}
