import { useEffect, useRef, useState } from "react";
import { buildQuotationComparison } from "../utils/quotationComparison.js";

const QuotationComparisonModal = ({ source, revision, onClose }) => {
    const [onlyChanges, setOnlyChanges] = useState(false);
    const closeButton = useRef(null);
    const sections = buildQuotationComparison(source, revision);
    const changedCount = sections.reduce(
        (total, section) => total + section.rows.filter((row) => row.changed).length, 0
    );
    const visibleSections = sections
        .map((section) => ({
            ...section,
            rows: onlyChanges ? section.rows.filter((row) => row.changed) : section.rows,
        }))
        .filter((section) => section.rows.length);

    useEffect(() => {
        const previouslyFocused = document.activeElement;
        closeButton.current?.focus();
        const handleEscape = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("keydown", handleEscape);
            previouslyFocused?.focus?.();
        };
    }, [onClose]);

    return (
        <div className="modal show d-block" role="dialog" aria-modal="true"
            aria-labelledby="quotation-comparison-title" aria-describedby="quotation-comparison-help"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <div>
                            <h4 className="modal-title" id="quotation-comparison-title">Compare quotations</h4>
                            <div className="text-muted small">
                                {source.quotationNo} → {revision.quotationNo}
                            </div>
                        </div>
                        <button ref={closeButton} type="button" className="btn-close"
                            aria-label="Close comparison" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        <p className="text-muted small" id="quotation-comparison-help">
                            These are the current saved values for both offers. The original can still
                            be edited; status and validity reset when a revised draft is created.
                            Prices in different currencies are shown as recorded, without conversion.
                        </p>
                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                            <span className="badge text-bg-primary">{changedCount} changed fields</span>
                            <label className="form-check mb-0">
                                <input type="checkbox" className="form-check-input"
                                    checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} />
                                <span className="form-check-label">Only changes</span>
                            </label>
                        </div>
                        {visibleSections.length === 0 && (
                            <p className="alert alert-info mb-0">No differences in the saved fields.</p>
                        )}
                        {visibleSections.map((section) => (
                            <section key={section.title} className="mb-4">
                                <h5 className="fw-semibold">{section.title}</h5>
                                <div className="table-responsive">
                                    <table className="table table-bordered table-sm align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th scope="col" style={{ width: "25%" }}>Field</th>
                                                <th scope="col" style={{ width: "37.5%" }}>{source.quotationNo}</th>
                                                <th scope="col" style={{ width: "37.5%" }}>{revision.quotationNo}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.rows.map((row) => (
                                                <tr key={row.label} className={row.changed ? "table-warning" : ""}>
                                                    <th scope="row">
                                                        {row.label}
                                                        {row.changed && <span className="visually-hidden"> (changed)</span>}
                                                    </th>
                                                    <td style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{row.before}</td>
                                                    <td style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{row.after}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        ))}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuotationComparisonModal;
