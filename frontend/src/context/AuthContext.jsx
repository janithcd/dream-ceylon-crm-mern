import { createContext, useContext, useState } from "react";
import api from "../api/axios";
import { readSavedAdmin } from "../utils/savedAdmin";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [admin, setAdmin] = useState(readSavedAdmin);

    const login = async (email, password) => {
        const response = await api.post("/auth/login", {
            email,
            password,
        });

        localStorage.setItem("adminInfo", JSON.stringify(response.data));
        setAdmin(response.data);

        return response.data;
    };

    const logout = () => {
        localStorage.removeItem("adminInfo");
        setAdmin(null);
    };

    return (
        <AuthContext.Provider value={{ admin, loading: false, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};
