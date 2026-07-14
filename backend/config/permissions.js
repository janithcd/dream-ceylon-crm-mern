const PERMISSIONS = Object.freeze({
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

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
    "Super Admin": ALL_PERMISSIONS,

    Manager: [
        PERMISSIONS.DASHBOARD_VIEW,

        PERMISSIONS.DESTINATION_VIEW,
        PERMISSIONS.DESTINATION_MANAGE,

        PERMISSIONS.PACKAGE_VIEW,
        PERMISSIONS.PACKAGE_MANAGE,

        PERMISSIONS.VEHICLE_VIEW,
        PERMISSIONS.VEHICLE_MANAGE,

        PERMISSIONS.INQUIRY_VIEW,
        PERMISSIONS.INQUIRY_CREATE,
        PERMISSIONS.INQUIRY_UPDATE,
        PERMISSIONS.INQUIRY_DELETE,

        PERMISSIONS.QUOTATION_VIEW,
        PERMISSIONS.QUOTATION_CREATE,
        PERMISSIONS.QUOTATION_UPDATE,
        PERMISSIONS.QUOTATION_DELETE,
        PERMISSIONS.QUOTATION_CONVERT,

        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.BOOKING_CREATE,
        PERMISSIONS.BOOKING_UPDATE,
        PERMISSIONS.BOOKING_DELETE,

        PERMISSIONS.PAYMENT_VIEW,
        PERMISSIONS.PAYMENT_CREATE,
        PERMISSIONS.PAYMENT_UPDATE,

        PERMISSIONS.FOLLOW_UP_VIEW,
        PERMISSIONS.FOLLOW_UP_MANAGE,

        PERMISSIONS.CUSTOMER_VIEW,

        PERMISSIONS.REPORT_VIEW,
        PERMISSIONS.REPORT_EXPORT,

        PERMISSIONS.PDF_GENERATE,

        PERMISSIONS.SETTINGS_VIEW,
        PERMISSIONS.ACTIVITY_LOG_VIEW,

        PERMISSIONS.ADMIN_VIEW,
    ],

    Sales: [
        PERMISSIONS.DASHBOARD_VIEW,

        PERMISSIONS.DESTINATION_VIEW,
        PERMISSIONS.PACKAGE_VIEW,
        PERMISSIONS.VEHICLE_VIEW,

        PERMISSIONS.INQUIRY_VIEW,
        PERMISSIONS.INQUIRY_CREATE,
        PERMISSIONS.INQUIRY_UPDATE,

        PERMISSIONS.QUOTATION_VIEW,
        PERMISSIONS.QUOTATION_CREATE,
        PERMISSIONS.QUOTATION_UPDATE,
        PERMISSIONS.QUOTATION_CONVERT,

        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.BOOKING_CREATE,
        PERMISSIONS.BOOKING_UPDATE,

        PERMISSIONS.FOLLOW_UP_VIEW,
        PERMISSIONS.FOLLOW_UP_MANAGE,

        PERMISSIONS.CUSTOMER_VIEW,
        PERMISSIONS.PDF_GENERATE,
    ],

    Finance: [
        PERMISSIONS.DASHBOARD_VIEW,

        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.CUSTOMER_VIEW,

        PERMISSIONS.PAYMENT_VIEW,
        PERMISSIONS.PAYMENT_CREATE,
        PERMISSIONS.PAYMENT_UPDATE,
        PERMISSIONS.PAYMENT_REFUND,

        PERMISSIONS.REPORT_VIEW,
        PERMISSIONS.REPORT_EXPORT,

        PERMISSIONS.QUOTATION_VIEW,
        PERMISSIONS.PDF_GENERATE,
    ],

    Viewer: [
        PERMISSIONS.DASHBOARD_VIEW,

        PERMISSIONS.DESTINATION_VIEW,
        PERMISSIONS.PACKAGE_VIEW,
        PERMISSIONS.VEHICLE_VIEW,

        PERMISSIONS.INQUIRY_VIEW,
        PERMISSIONS.QUOTATION_VIEW,
        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.PAYMENT_VIEW,
        PERMISSIONS.FOLLOW_UP_VIEW,
        PERMISSIONS.CUSTOMER_VIEW,

        PERMISSIONS.REPORT_VIEW,
    ],
});

const normalizePermissions = (permissions) => {
    if (!Array.isArray(permissions)) {
        return [];
    }

    return [
        ...new Set(
            permissions.filter((permission) =>
                ALL_PERMISSIONS.includes(permission)
            )
        ),
    ];
};

const resolveAdminPermissions = (admin) => {
    if (!admin) {
        return [];
    }

    const role = admin.role || "Viewer";

    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    const customPermissions = normalizePermissions(
        admin.customPermissions || []
    );

    return [...new Set([...rolePermissions, ...customPermissions])];
};

module.exports = {
    PERMISSIONS,
    ALL_PERMISSIONS,
    ROLE_PERMISSIONS,
    normalizePermissions,
    resolveAdminPermissions,
};