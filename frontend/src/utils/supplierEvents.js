export const SUPPLIER_CONFIRMATIONS_CHANGED_EVENT = "crm:supplier-confirmations-changed";

export const notifySupplierConfirmationsChanged = () => {
    window.dispatchEvent(new Event(SUPPLIER_CONFIRMATIONS_CHANGED_EVENT));
};
