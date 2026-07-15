import axios from "axios";

const api = axios.create({
    baseURL:
        import.meta.env.VITE_API_URL ||
        "http://localhost:5000/api",
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use(
    (config) => {
        try {
            const adminInfo =
                localStorage.getItem("adminInfo");

            if (adminInfo) {
                const parsedAdmin =
                    JSON.parse(adminInfo);

                if (parsedAdmin?.token) {
                    config.headers.Authorization =
                        `Bearer ${parsedAdmin.token}`;
                }
            }
        } catch {
            localStorage.removeItem("adminInfo");
        }

        return config;
    },
    (error) => Promise.reject(error)
);

export default api;