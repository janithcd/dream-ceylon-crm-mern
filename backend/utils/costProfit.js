const CURRENCIES = Object.freeze(["USD", "LKR", "EUR", "GBP"]);
const CATEGORIES = Object.freeze(["Hotel", "Transport", "Guide", "Activities", "Entrance Fees", "Payment Fees", "Other"]);

const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

const costSummary = (saleAmount, saleCurrency, entries) => {
    const currencyMismatch = entries.filter((entry) => entry.targetCurrency !== saleCurrency).length;
    const ready = entries.length > 0 && currencyMismatch === 0;
    const totalCents = ready
        ? entries.reduce((sum, entry) => sum + Math.round(entry.amount * entry.conversionRate * 100), 0)
        : null;
    const price = roundMoney(Number(saleAmount) || 0);
    const profit = ready ? roundMoney(price - totalCents / 100) : null;

    return {
        saleAmount: price,
        saleCurrency,
        costTotal: ready ? totalCents / 100 : null,
        profit,
        marginPercent: ready && price > 0 ? roundMoney((profit / price) * 100) : null,
        entriesCount: entries.length,
        currencyMismatch,
    };
};

const parseCostPayload = (body, targetCurrency) => {
    const category = String(body?.category || "");
    const description = String(body?.description || "").trim();
    const currency = String(body?.currency || "");
    const amount = Number(body?.amount);
    const conversionRate = currency === targetCurrency ? 1 : Number(body?.conversionRate);

    if (!CATEGORIES.includes(category) || !description || description.length > 200 || !CURRENCIES.includes(currency)) {
        return { error: "Choose a category and currency, and enter a description of up to 200 characters." };
    }
    if (body?.amount === "" || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || roundMoney(amount) !== amount) {
        return { error: "Enter a positive supplier cost with at most two decimal places." };
    }
    if (!Number.isFinite(conversionRate) || conversionRate <= 0 || conversionRate > 1000000 ||
        Math.round(conversionRate * 1000000) / 1000000 !== conversionRate || amount * conversionRate > 1000000000000) {
        return { error: "Enter a positive exchange rate (one supplier currency unit in the sale currency), up to six decimal places." };
    }
    return { value: { category, description, amount, currency, conversionRate, targetCurrency } };
};

module.exports = { CURRENCIES, CATEGORIES, costSummary, parseCostPayload };
