const escapeCsvValue = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    const stringValue = String(value);

    if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
};

export const exportToCsv = (rows, filename = "export.csv") => {
    if (!Array.isArray(rows) || rows.length === 0) {
        alert("No data available to export.");
        return;
    }

    const headers = Object.keys(rows[0]);

    const csvContent = [
        headers.map(escapeCsvValue).join(","),
        ...rows.map((row) =>
            headers.map((header) => escapeCsvValue(row[header])).join(",")
        ),
    ].join("\n");

    const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
    });

    const fileUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = fileUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(fileUrl);
};