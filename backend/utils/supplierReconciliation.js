const parseSupplierReconciliation = (body) => {
    if (body?.reconciled === true) {
        const reference = body.statementReference;
        if (typeof reference !== "string" || !reference.trim() || reference.trim().length > 100) {
            return { error: "Enter the statement or cashbook reference (1–100 characters)." };
        }
        return { value: { reconciled: true, statementReference: reference.trim() } };
    }
    if (body?.reconciled === false) {
        const reason = body.reason;
        if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 300) {
            return { error: "Explain why this match was reopened (3–300 characters)." };
        }
        return { value: { reconciled: false, reason: reason.trim() } };
    }
    return { error: "Choose whether to reconcile or reopen this supplier payment." };
};

module.exports = { parseSupplierReconciliation };
