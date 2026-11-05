import { useEffect, useState } from "react";
import api from "../api/axios";
import { formatCalendarDate, toCalendarDateInput } from "../utils/calendarDate";

const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QuotationRateEstimate = ({ quotation, onSaved }) => {
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [search, setSearch] = useState("");
    const [supplierPage, setSupplierPage] = useState(1);
    const [suppliers, setSuppliers] = useState({ items: [], pages: 0 });
    const [supplierId, setSupplierId] = useState("");
    const [ratePage, setRatePage] = useState(1);
    const [rateRefresh, setRateRefresh] = useState(0);
    const [rates, setRates] = useState({ items: [], pages: 0 });
    const [rateId, setRateId] = useState("");
    const [serviceFrom, setServiceFrom] = useState(toCalendarDateInput(quotation.travelStartDate));
    const [serviceTo, setServiceTo] = useState(toCalendarDateInput(quotation.travelStartDate));
    const [quantity, setQuantity] = useState("1");
    const [conversionRate, setConversionRate] = useState("");
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);
    const [loadingRates, setLoadingRates] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const selected = rates.items.find((item) => item._id === rateId);
    const differentCurrency = selected && selected.currency !== quotation.currency;
    const total = selected && Number.isInteger(Number(quantity)) && Number(quantity) > 0
        ? Math.round(selected.amount * 100) * Number(quantity) / 100 : null;

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoadingSuppliers(true);
        api.get("/suppliers", { params: { keyword: search, status: "Active", page: supplierPage, limit: 50 } })
            .then(({ data }) => { if (active) setSuppliers(data); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load suppliers."); })
            .finally(() => { if (active) setLoadingSuppliers(false); });
        return () => { active = false; };
    }, [open, search, supplierPage]);

    useEffect(() => {
        if (!open || !supplierId) return;
        let active = true;
        setLoadingRates(true);
        api.get(`/suppliers/${supplierId}/rates`, { params: { status: "Active", timing: "All", page: ratePage, limit: 50 } })
            .then(({ data }) => { if (active) setRates(data); })
            .catch((err) => { if (active) setError(err.response?.data?.message || "Could not load supplier rates."); })
            .finally(() => { if (active) setLoadingRates(false); });
        return () => { active = false; };
    }, [open, supplierId, ratePage, rateRefresh]);

    const submit = async (event) => {
        event.preventDefault();
        if (!selected || saving) return;
        setSaving(true); setError("");
        try {
            await api.post(`/finance/costs/quotation/${quotation.id}/from-rate`, {
                supplierId, rateId, expectedVersion: selected.__v, serviceFrom, serviceTo,
                quantity, ...(differentCurrency ? { conversionRate } : {}),
            });
            setOpen(false); setRateId("");
            onSaved();
        } catch (err) {
            setError(err.response?.data?.message || "Could not apply this supplier rate.");
            if (err.response?.status === 409) {
                setRateId("");
                setRates({ items: [], pages: 0 });
                setRatePage(1);
                setRateRefresh((value) => value + 1);
            }
        } finally { setSaving(false); }
    };

    return <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
            <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                <div><h5 className="fw-bold mb-1">Use a supplier rate</h5>
                    <p className="small text-muted mb-0">Choose a dated offer and review the total before adding it to this quotation's private costs.</p></div>
                <button type="button" className="btn btn-outline-primary" aria-expanded={open} onClick={() => { setError(""); setOpen(!open); }}>
                    {open ? "Close rate picker" : "Choose supplier rate"}
                </button>
            </div>
            {open && <form className="row g-3 mt-1" onSubmit={submit}>
                <div className="col-12 col-md-6">
                    <label htmlFor="rate-supplier-search" className="form-label">Find supplier</label>
                    <div className="input-group">
                        <input id="rate-supplier-search" className="form-control" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Hotel, guide, jeep or location" maxLength={100} />
                        <button type="button" className="btn btn-outline-secondary" onClick={() => { setSupplierPage(1); setSearch(keyword.trim()); setSupplierId(""); setRateId(""); }}>Search</button>
                    </div>
                </div>
                <div className="col-12 col-md-6">
                    <label htmlFor="rate-supplier" className="form-label">Supplier</label>
                    <select id="rate-supplier" className="form-select" value={supplierId} disabled={loadingSuppliers} onChange={(event) => {
                        setSupplierId(event.target.value); setRateId(""); setRatePage(1); setRates({ items: [], pages: 0 });
                    }}>
                        <option value="">Choose a supplier</option>
                        {suppliers.items.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.category}{item.location ? ` · ${item.location}` : ""}</option>)}
                    </select>
                    {suppliers.pages > 1 && <div className="d-flex gap-2 align-items-center mt-2 small">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={supplierPage === 1} onClick={() => { setSupplierPage(supplierPage - 1); setSupplierId(""); setRateId(""); }}>Previous</button>
                        Page {supplierPage} of {suppliers.pages}
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={supplierPage >= suppliers.pages} onClick={() => { setSupplierPage(supplierPage + 1); setSupplierId(""); setRateId(""); }}>Next</button>
                    </div>}
                </div>
                {supplierId && <div className="col-12">
                    <label htmlFor="rate-offer" className="form-label">Dated supplier offer</label>
                    <select id="rate-offer" className="form-select" value={rateId} disabled={loadingRates} required onChange={(event) => { setRateId(event.target.value); setConversionRate(""); }}>
                        <option value="">{loadingRates ? "Loading rates..." : "Choose a rate"}</option>
                        {rates.items.map((rate) => <option key={rate._id} value={rate._id}>{rate.service} · {rate.mealPlan || rate.unit} · {money(rate.amount, rate.currency)} / {rate.unit} · {formatCalendarDate(rate.validFrom)}–{formatCalendarDate(rate.validTo)}</option>)}
                    </select>
                    {!loadingRates && rates.items.length === 0 && <small className="text-muted">No active rates on this page. Add an offer in Supplier Directory first.</small>}
                    {rates.pages > 1 && <div className="d-flex gap-2 align-items-center mt-2 small">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={ratePage === 1} onClick={() => { setRatePage(ratePage - 1); setRateId(""); }}>Previous</button>
                        Page {ratePage} of {rates.pages}
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={ratePage >= rates.pages} onClick={() => { setRatePage(ratePage + 1); setRateId(""); }}>Next</button>
                    </div>}
                </div>}
                {selected && <>
                    <div className="col-md-3"><label htmlFor="estimate-from" className="form-label">Service from</label>
                        <input id="estimate-from" type="date" className="form-control" min={toCalendarDateInput(selected.validFrom)} max={toCalendarDateInput(selected.validTo)} required value={serviceFrom} onChange={(event) => setServiceFrom(event.target.value)} /></div>
                    <div className="col-md-3"><label htmlFor="estimate-to" className="form-label">Service to (inclusive)</label>
                        <input id="estimate-to" type="date" className="form-control" min={serviceFrom || toCalendarDateInput(selected.validFrom)} max={toCalendarDateInput(selected.validTo)} required value={serviceTo} onChange={(event) => setServiceTo(event.target.value)} /></div>
                    <div className="col-md-3"><label htmlFor="estimate-quantity" className="form-label">Total billable units</label>
                        <input id="estimate-quantity" type="number" className="form-control" min="1" max="1000" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
                    {differentCurrency && <div className="col-md-3"><label htmlFor="estimate-exchange" className="form-label">1 {selected.currency} in {quotation.currency}</label>
                        <input id="estimate-exchange" type="number" className="form-control" min="0.000001" max="1000000" step="0.000001" required value={conversionRate} onChange={(event) => setConversionRate(event.target.value)} /></div>}
                    <div className="col-12 small">{selected.mealPlan && <span className="me-3">{selected.mealPlan} · {selected.occupancy} guest(s) per room</span>}
                        Supplier source: {selected.sourceReference}. Valid {formatCalendarDate(selected.validFrom)}–{formatCalendarDate(selected.validTo)}.
                        {quotation.travelStartDate && quotation.travelEndDate && <> Trip: {formatCalendarDate(quotation.travelStartDate)}–{formatCalendarDate(quotation.travelEndDate)}.</>}
                    </div>
                    <div className="col-12 small text-muted">Enter the total units billed, for example 2 rooms × 3 nights = 6. Confirm occupancy, taxes and inclusions in the supplier offer. The saved estimate keeps this rate version; later rate edits do not change it.</div>
                    <div className="col-12"><strong>Estimated supplier cost: {total === null ? "—" : money(total, selected.currency)}</strong>{differentCurrency && " · enter your conversion rate for the quotation currency"}</div>
                    <div className="col-12"><button className="btn btn-primary" type="submit" disabled={saving || total === null || total > 1000000000}>{saving ? "Applying..." : "Add estimate from rate"}</button></div>
                </>}
                {error && <div className="col-12"><div className="alert alert-danger mb-0" role="alert">{error}</div></div>}
            </form>}
        </div>
    </div>;
};

export default QuotationRateEstimate;
