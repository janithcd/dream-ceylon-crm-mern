export const PAYMENT_ATTENTION_CHANGED_EVENT = "crm:payment-attention-changed";

export const notifyPaymentAttentionChanged = () => {
    window.dispatchEvent(new Event(PAYMENT_ATTENTION_CHANGED_EVENT));
};
