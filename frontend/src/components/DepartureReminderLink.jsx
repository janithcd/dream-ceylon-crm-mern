import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FaClipboardCheck } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { PRE_ARRIVAL_CHANGED_EVENT } from "../utils/preArrivalEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const DepartureReminderLink = () => {
    const { hasPermission } = usePermissions();
    const canRecord = hasPermission("booking.update");
    const location = useLocation();
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!canRecord) return undefined;
        let active = true;
        let latestRequest = 0;
        const refresh = () => {
            const request = ++latestRequest;
            api.get("/bookings/departure-readiness/alerts")
                .then(({ data }) => { if (active && request === latestRequest) setCount(data.count); })
                .catch(() => { if (active && request === latestRequest) setCount(0); });
        };
        const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
        refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener(PRE_ARRIVAL_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(PRE_ARRIVAL_CHANGED_EVENT, refresh);
            window.clearInterval(interval);
        };
    }, [canRecord, location.pathname]);

    return <NavLink to={canRecord && count > 0 ? "/departure-readiness?message=due" : "/departure-readiness"}>
        <FaClipboardCheck />
        <span>Departure Readiness</span>
        {canRecord && count > 0 && <span className="badge rounded-pill text-bg-warning ms-auto"
            title={`${count} confirmed trips within 3 days have no recorded pre-arrival note`}
            aria-label={`${count} trips within 3 days awaiting a pre-arrival note`}>{count > 99 ? "99+" : count}</span>}
    </NavLink>;
};

export default DepartureReminderLink;
