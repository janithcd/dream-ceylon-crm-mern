import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FaHistory } from "react-icons/fa";
import api from "../api/axios";
import { HANDOVER_CHANGED_EVENT } from "../utils/handoverEvents";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const TeamHandoverLink = () => {
    const location = useLocation();
    const [count, setCount] = useState(null);

    useEffect(() => {
        let active = true;
        let latestRequest = 0;
        const refresh = () => {
            const request = ++latestRequest;
            api.get("/bookings/handover-worklist", { params: { filter: "unread", page: 1 } })
                .then(({ data }) => { if (active && request === latestRequest) setCount(data.total); })
                .catch(() => { if (active && request === latestRequest) setCount(null); });
        };
        const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
        refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener(HANDOVER_CHANGED_EVENT, refresh);
        const interval = window.setInterval(refresh, REFRESH_INTERVAL);
        return () => {
            active = false;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener(HANDOVER_CHANGED_EVENT, refresh);
            window.clearInterval(interval);
        };
    }, [location.pathname]);

    return <NavLink to={count > 0 ? "/team-handovers?filter=unread" : "/team-handovers"}>
        <FaHistory />
        <span>Team Handovers</span>
        {count > 0 && <span className="badge rounded-pill text-bg-primary ms-auto"
            title={`${count} open bookings have handover notes unread by you`}
            aria-label={`${count} open bookings have unread handover notes for you`}>{count > 99 ? "99+" : count}</span>}
    </NavLink>;
};

export default TeamHandoverLink;
