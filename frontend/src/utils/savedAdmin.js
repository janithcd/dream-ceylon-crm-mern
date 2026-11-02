export const readSavedAdmin = (storage) => {
    let source;
    try {
        source = storage || localStorage;
        const value = source.getItem("adminInfo");
        const parsed = value ? JSON.parse(value) : null;
        return parsed && typeof parsed === "object" && typeof parsed.token === "string" ? parsed : null;
    } catch {
        try { source?.removeItem("adminInfo"); } catch { /* Storage can be disabled by the browser. */ }
        return null;
    }
};
