export const SUPPLIER_PAYABLES_CHANGED_EVENT = "crm:supplier-payables-changed";

export const notifySupplierPayablesChanged = () => {
    window.dispatchEvent(new Event(SUPPLIER_PAYABLES_CHANGED_EVENT));
};
