import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

// Attach token automatically to protected requests
api.interceptors.request.use(
    (config) => {
        const adminInfo = localStorage.getItem("adminInfo");

        if (adminInfo) {
            const parsedAdmin = JSON.parse(adminInfo);

            if (parsedAdmin.token) {
                config.headers.Authorization = `Bearer ${parsedAdmin.token}`;
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;