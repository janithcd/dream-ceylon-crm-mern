export const PERMISSIONS = Object.freeze({
    DASHBOARD_VIEW: "dashboard.view",

    DESTINATION_VIEW: "destination.view",
    DESTINATION_MANAGE: "destination.manage",

    PACKAGE_VIEW: "package.view",
    PACKAGE_MANAGE: "package.manage",

    VEHICLE_VIEW: "vehicle.view",
    VEHICLE_MANAGE: "vehicle.manage",

    INQUIRY_VIEW: "inquiry.view",
    INQUIRY_CREATE: "inquiry.create",
    INQUIRY_UPDATE: "inquiry.update",
    INQUIRY_DELETE: "inquiry.delete",

    QUOTATION_VIEW: "quotation.view",
    QUOTATION_CREATE: "quotation.create",
    QUOTATION_UPDATE: "quotation.update",
    QUOTATION_DELETE: "quotation.delete",
    QUOTATION_CONVERT: "quotation.convert",

    BOOKING_VIEW: "booking.view",
    BOOKING_CREATE: "booking.create",
    BOOKING_UPDATE: "booking.update",
    BOOKING_DELETE: "booking.delete",

    PAYMENT_VIEW: "payment.view",
    PAYMENT_CREATE: "payment.create",
    PAYMENT_UPDATE: "payment.update",
    PAYMENT_DELETE: "payment.delete",
    PAYMENT_REFUND: "payment.refund",

    FOLLOW_UP_VIEW: "followUp.view",
    FOLLOW_UP_MANAGE: "followUp.manage",

    CUSTOMER_VIEW: "customer.view",

    REPORT_VIEW: "report.view",
    REPORT_EXPORT: "report.export",

    PDF_GENERATE: "pdf.generate",

    SETTINGS_VIEW: "settings.view",
    SETTINGS_UPDATE: "settings.update",

    ACTIVITY_LOG_VIEW: "activityLog.view",

    ADMIN_VIEW: "admin.view",
    ADMIN_CREATE: "admin.create",
    ADMIN_UPDATE: "admin.update",
    ADMIN_DELETE: "admin.delete",
});

export const ROLE_OPTIONS = [
    "Super Admin",
    "Manager",
    "Sales",
    "Finance",
    "Viewer",
];

export const STATUS_OPTIONS = ["Active", "Inactive"];

export const PERMISSION_GROUPS = [
    {
        title: "Dashboard",
        permissions: [["dashboard.view", "View dashboard"]],
    },
    {
        title: "Destinations",
        permissions: [
            ["destination.view", "View destinations"],
            ["destination.manage", "Manage destinations"],
        ],
    },
    {
        title: "Tour Packages",
        permissions: [
            ["package.view", "View packages"],
            ["package.manage", "Manage packages"],
        ],
    },
    {
        title: "Vehicles",
        permissions: [
            ["vehicle.view", "View vehicles"],
            ["vehicle.manage", "Manage vehicles"],
        ],
    },
    {
        title: "Inquiries",
        permissions: [
            ["inquiry.view", "View inquiries"],
            ["inquiry.create", "Create inquiries"],
            ["inquiry.update", "Update inquiries"],
            ["inquiry.delete", "Delete inquiries"],
        ],
    },
    {
        title: "Quotations",
        permissions: [
            ["quotation.view", "View quotations"],
            ["quotation.create", "Create quotations"],
            ["quotation.update", "Update quotations"],
            ["quotation.delete", "Delete quotations"],
            ["quotation.convert", "Convert quotations"],
        ],
    },
    {
        title: "Bookings",
        permissions: [
            ["booking.view", "View bookings"],
            ["booking.create", "Create bookings"],
            ["booking.update", "Update bookings"],
            ["booking.delete", "Delete bookings"],
        ],
    },
    {
        title: "Payments",
        permissions: [
            ["payment.view", "View payments"],
            ["payment.create", "Create payments"],
            ["payment.update", "Update payments"],
            ["payment.delete", "Delete payments"],
            ["payment.refund", "Refund payments"],
        ],
    },
    {
        title: "Follow-Ups",
        permissions: [
            ["followUp.view", "View follow-ups"],
            ["followUp.manage", "Manage follow-ups"],
        ],
    },
    {
        title: "Customers & Reports",
        permissions: [
            ["customer.view", "View customers"],
            ["report.view", "View reports"],
            ["report.export", "Export reports"],
        ],
    },
    {
        title: "Documents",
        permissions: [["pdf.generate", "Generate PDF documents"]],
    },
    {
        title: "Settings & Audit",
        permissions: [
            ["settings.view", "View settings"],
            ["settings.update", "Update settings"],
            ["activityLog.view", "View activity logs"],
        ],
    },
    {
        title: "Admin Management",
        permissions: [
            ["admin.view", "View admin accounts"],
            ["admin.create", "Create admin accounts"],
            ["admin.update", "Update admin accounts"],
            ["admin.delete", "Delete admin accounts"],
        ],
    },
];

export const hasPermission = (admin, permission) => {
    if (!admin || !permission) {
        return false;
    }

    if (admin.role === "Super Admin") {
        return true;
    }

    return Array.isArray(admin.permissions)
        ? admin.permissions.includes(permission)
        : false;
};
