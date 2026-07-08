import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedAdmin = localStorage.getItem("adminInfo");

        if (savedAdmin) {
            setAdmin(JSON.parse(savedAdmin));
        }

        setLoading(false);
    }, []);

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
        <AuthContext.Provider value={{ admin, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};