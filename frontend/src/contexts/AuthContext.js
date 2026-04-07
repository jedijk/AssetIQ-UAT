import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { getApiUrl } from "../lib/apiConfig";

const AuthContext = createContext(null);

// Get API URL dynamically to ensure env vars are loaded
const getAuthApiUrl = () => {
  const url = getApiUrl();
  console.log("[AuthContext] API URL:", url);
  return url;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const API_URL = getAuthApiUrl();
      const response = await axios.get(`${API_URL}/auth/me`);
      setUser(response.data);
      setMustChangePassword(response.data.must_change_password || false);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const API_URL = getAuthApiUrl();
    console.log("[AuthContext] Login request to:", `${API_URL}/auth/login`);
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { token: newToken, user: userData, must_change_password } = response.data;
    
    localStorage.setItem("token", newToken);
    axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    setMustChangePassword(must_change_password || userData.must_change_password || false);
    
    // Sync intro seen status with localStorage
    // If user must change password, don't show intro yet (will show after password change)
    if (must_change_password || userData.must_change_password) {
      localStorage.setItem("assetiq_intro_seen", "true");
    } else if (userData.has_seen_intro === false) {
      // User doesn't need to change password and hasn't seen intro - show it
      localStorage.removeItem("assetiq_intro_seen");
    } else if (userData.has_seen_intro === true) {
      // User has already seen intro
      localStorage.setItem("assetiq_intro_seen", "true");
    }
    
    return { ...userData, must_change_password: must_change_password || userData.must_change_password };
  };

  const changePassword = async (currentPassword, newPassword) => {
    const API_URL = getAuthApiUrl();
    const response = await axios.post(`${API_URL}/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
    
    // Clear the must_change_password flag after successful change
    setMustChangePassword(false);
    if (user) {
      setUser({ ...user, must_change_password: false, has_seen_intro: false });
    }
    
    // Clear intro flag so the tour shows after password change
    localStorage.removeItem("assetiq_intro_seen");
    
    return response.data;
  };

  const register = async (name, email, password) => {
    const API_URL = getAuthApiUrl();
    const response = await axios.post(`${API_URL}/auth/register`, { name, email, password });
    
    // Check if registration requires approval (new workflow)
    if (response.data.status === "pending_approval") {
      // Don't set token or user - they need to wait for approval
      return response.data;
    }
    
    // Legacy behavior: auto-login after registration (for backwards compatibility)
    const { token: newToken, user: userData } = response.data;
    
    localStorage.setItem("token", newToken);
    axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, mustChangePassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
