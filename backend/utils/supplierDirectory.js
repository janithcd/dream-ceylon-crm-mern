const CATEGORIES = Object.freeze(["Hotel", "Guide", "Safari jeep", "Transport", "Activity", "Other"]);
const STATUSES = Object.freeze(["Active", "Inactive"]);
const FIELDS = Object.freeze({ name: 160, location: 120, contactName: 120, email: 254,
    phone: 30, whatsapp: 30, terms: 500, notes: 1000 });
const key = (value) => value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en");

const parseSupplier = (body = {}) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Enter supplier details." };
    if (!CATEGORIES.includes(body.category)) return { error: "Choose a supplier category." };
    const status = body.status ?? "Active";
    if (!STATUSES.includes(status)) return { error: "Choose Active or Inactive." };
    const value = { category: body.category, status };
    for (const [field, max] of Object.entries(FIELDS)) {
        const raw = body[field] ?? "";
        const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
        const invalid = ["terms", "notes"].includes(field)
            ? /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u
            : /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
        if (typeof raw !== "string" || text.length > max || invalid.test(text)) {
            return { error: `${field} must be text of at most ${max} characters.` };
        }
        value[field] = text;
    }
    if (value.name.length < 2) return { error: "Enter a supplier name of at least two characters." };
    if (value.email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.email)) {
        return { error: "Enter one valid supplier email address." };
    }
    for (const field of ["phone", "whatsapp"]) {
        if (value[field] && (!/^[+]?[\d ()-]+$/.test(value[field]) || value[field].replace(/\D/g, "").length < 6)) {
            return { error: `Enter a valid ${field} number.` };
        }
    }
    value.email = value.email.toLowerCase();
    value.nameKey = key(value.name);
    value.locationKey = key(value.location);
    return { value };
};

const parseSupplierList = (params = {}) => {
    const category = params.category ?? "";
    const status = params.status ?? "Active";
    const keyword = params.keyword ?? "";
    const page = params.page ?? "1", limit = params.limit ?? "20";
    if (category && !CATEGORIES.includes(category)) return { error: "Choose a valid supplier category." };
    if (![...STATUSES, "All"].includes(status)) return { error: "Choose a valid supplier status." };
    if (typeof keyword !== "string" || keyword.length > 100) return { error: "Search must be at most 100 characters." };
    if (!/^[1-9]\d*$/.test(String(page)) || !/^[1-9]\d*$/.test(String(limit)) ||
        Number(page) > 1000 || Number(limit) > 50) return { error: "Choose page 1–1000 and limit 1–50." };
    const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { value: { page: Number(page), limit: Number(limit), query: {
        ...(category ? { category } : {}), ...(status === "All" ? {} : { status }),
        ...(escaped ? { $or: ["name", "location", "contactName", "email", "phone", "whatsapp"].map((field) =>
            ({ [field]: { $regex: escaped, $options: "i" } })) } : {}),
    } } };
};

module.exports = { CATEGORIES, STATUSES, parseSupplier, parseSupplierList };
