import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { getApiUrl } from "../lib/apiConfig";
import { updateCachedPreferences, clearCachedPreferences } from "../lib/dateUtils";

const AuthContext = createContext(null);
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

// Current terms/privacy version - increment when terms change
const CURRENT_TERMS_VERSION = "1.0";

// Fetch user preferences and cache them for date formatting
const fetchAndCachePreferences = async (API_URL) => {
  try {
    const response = await axios.get(`${API_URL}/users/me/preferences`);
    if (response.data) {
      updateCachedPreferences(response.data);
    }
  } catch (error) {
    console.warn("Failed to fetch user preferences:", error);
    // On error, use browser's detected timezone as fallback
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    updateCachedPreferences({ timezone: detectedTimezone });
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(AUTH_MODE === "bearer" ? localStorage.getItem("token") : null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [mustAcceptTerms, setMustAcceptTerms] = useState(false);

  // Track if we're in the middle of a login/auth operation to avoid duplicate fetches
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Use a ref to check user state without adding it as a dependency
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const logout = useCallback(async (options = {}) => {
    const { remote = true } = options || {};
    if (AUTH_MODE === "cookie" && remote) {
      try {
        const API_URL = getApiUrl();
        await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
      } catch (_e) {}
    }
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
    setMustAcceptTerms(false);
    // Clear cached preferences on logout
    clearCachedPreferences();
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const API_URL = getApiUrl();
      const response = await axios.get(`${API_URL}/auth/me`);
      setUser(response.data);
      setMustChangePassword(response.data.must_change_password || false);

      // Check if user needs to accept terms (new or updated terms)
      const userTermsVersion = response.data.terms_accepted_version;
      const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
      // Only show terms dialog if password change is not required
      setMustAcceptTerms(needsTermsAcceptance && !response.data.must_change_password);

      // Fetch and cache user preferences for date/time formatting
      await fetchAndCachePreferences(API_URL);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      // Avoid calling remote logout on a simple 401 (especially in cookie mode),
      // otherwise we can create a noisy loop if CORS/session is misconfigured.
      logout({ remote: false });
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (AUTH_MODE === "cookie") {
      // Cookie auth: always attempt to fetch current user on boot.
      axios.defaults.withCredentials = true;
      fetchUser();
      return;
    }

    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      // Only fetch user if:
      // 1. We're not in the middle of a login operation (login sets user directly)
      // 2. User is not already loaded (prevents double-fetch after login)
      if (!isAuthenticating && !userRef.current) {
        fetchUser();
      } else {
        // Token exists, either authenticating or user already loaded
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [token, isAuthenticating, fetchUser]);

  const login = async (email, password) => {
    const API_URL = getApiUrl();
    
    // Validate API URL includes /api prefix
    if (!API_URL || !API_URL.includes('/api')) {
      console.error("[Auth] ERROR: API URL is invalid or missing /api prefix:", API_URL);
      console.error("[Auth] Expected format: https://your-backend.domain/api");
      console.error("[Auth] Check REACT_APP_BACKEND_URL environment variable.");
    }
    
    const loginUrl = `${API_URL}/auth/login`;
    console.log("[Auth] ===== LOGIN ATTEMPT =====");
    console.log("[Auth] API_URL:", API_URL);
    console.log("[Auth] Login URL:", loginUrl);
    console.log("[Auth] ========================");
    
    // Mark that we're authenticating to prevent the useEffect from calling fetchUser
    setIsAuthenticating(true);
    
    try {
      const response = await axios.post(loginUrl, { email, password }, { withCredentials: AUTH_MODE === "cookie" });
      const { token: newToken, user: userData, must_change_password } = response.data;

    if (AUTH_MODE === "bearer") {
      localStorage.setItem("token", newToken);
      axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      setToken(newToken);
    } else {
      // Cookie mode: token is in HttpOnly cookie, keep state token null.
      axios.defaults.withCredentials = true;
      setToken(null);
    }
    setUser(userData);
    setLoading(false);
    setMustChangePassword(must_change_password || userData.must_change_password || false);
    
    // Check if user needs to accept terms (after password change if applicable)
    const userTermsVersion = userData.terms_accepted_version;
    const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
    // Only show terms if password change is not required first
    setMustAcceptTerms(needsTermsAcceptance && !(must_change_password || userData.must_change_password));
    
    // Fetch and cache user preferences for date/time formatting
    await fetchAndCachePreferences(API_URL);
    
    // Sync intro seen status with localStorage
    // If user must change password or accept terms, don't show intro yet
    if (must_change_password || userData.must_change_password || needsTermsAcceptance) {
      localStorage.setItem("assetiq_intro_seen", "true");
    } else if (userData.has_seen_intro === false) {
      // User doesn't need to change password and hasn't seen intro - show it
      localStorage.removeItem("assetiq_intro_seen");
    } else if (userData.has_seen_intro === true) {
      // User has already seen intro
      localStorage.setItem("assetiq_intro_seen", "true");
    }
    
    // Apply default simple mode on first login if set by admin
    if (userData.default_simple_mode && !localStorage.getItem("operatorViewEnabled")) {
      localStorage.setItem("operatorViewEnabled", "true");
    }

    // Set default hidden hierarchy levels for new users
    if (!localStorage.getItem("hierarchy-hidden-levels")) {
      localStorage.setItem("hierarchy-hidden-levels", JSON.stringify(["installation", "plant_unit"]));
    }

    // Clear the authenticating flag now that login is complete
    setIsAuthenticating(false);
    
    return { ...userData, must_change_password: must_change_password || userData.must_change_password };
    } catch (error) {
      // Clear authenticating flag on error
      setIsAuthenticating(false);
      
      // Log detailed error for debugging
      console.error("[Auth] Login failed:", error.response?.status, error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error("Invalid email or password");
      } else if (error.response?.status === 429) {
        throw new Error("Too many login attempts. Please try again later.");
      } else if (!error.response) {
        // Network error - likely CORS or backend unreachable
        console.error("[Auth] Network error - check if backend is reachable and CORS is configured");
        throw new Error("Cannot connect to server. Please try again later.");
      }
      
      throw error;
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    const API_URL = getApiUrl();
    const response = await axios.post(`${API_URL}/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
    
    // Clear the must_change_password flag after successful change
    setMustChangePassword(false);
    if (user) {
      const updatedUser = { ...user, must_change_password: false, has_seen_intro: false };
      setUser(updatedUser);
      
      // Now check if terms acceptance is needed
      const userTermsVersion = user.terms_accepted_version;
      const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
      setMustAcceptTerms(needsTermsAcceptance);
    }
    
    // Clear intro flag so the tour shows after password change (and terms acceptance)
    localStorage.removeItem("assetiq_intro_seen");
    
    return response.data;
  };

  const acceptTerms = async () => {
    const API_URL = getApiUrl();
    try {
      const response = await axios.post(`${API_URL}/gdpr/accept-terms`, {
        terms_version: CURRENT_TERMS_VERSION
      });

      // CRITICAL: re-fetch the canonical user state from backend so the
      // terms version we just persisted is reflected in the UI. Previously we
      // only updated local state optimistically, which could drift out of sync
      // if /auth/me was called again by another effect.
      try {
        const meResponse = await axios.get(`${API_URL}/auth/me`);
        setUser(meResponse.data);
        const serverVersion = meResponse.data?.terms_accepted_version;
        // Only close the dialog if backend actually confirms the acceptance
        if (serverVersion === CURRENT_TERMS_VERSION) {
          setMustAcceptTerms(false);
        } else {
          console.warn("[acceptTerms] backend did not persist terms version; keeping dialog open");
        }
      } catch (meErr) {
        // Fallback to optimistic local update if /auth/me fails
        console.warn("[acceptTerms] /auth/me refresh failed, applying optimistic state:", meErr);
        if (user) {
          const updatedUser = {
            ...user,
            terms_accepted_version: CURRENT_TERMS_VERSION,
            terms_accepted_at: new Date().toISOString()
          };
          setUser(updatedUser);
        }
        setMustAcceptTerms(false);
      }

      // Now show intro if user hasn't seen it
      if (user && user.has_seen_intro === false) {
        localStorage.removeItem("assetiq_intro_seen");
      }

      return response.data;
    } catch (error) {
      console.error("Failed to accept terms:", error);
      throw error;
    }
  };

  const register = async (name, email, password, options = {}) => {
    const API_URL = getApiUrl();
    const { honeypot = "", recaptchaToken = null } = options;
    
    const response = await axios.post(`${API_URL}/auth/register`, { 
      name, 
      email, 
      password,
      website: honeypot,  // Honeypot field - should be empty
      recaptcha_token: recaptchaToken,
    });
    
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

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      register, 
      logout, 
      mustChangePassword, 
      changePassword,
      mustAcceptTerms,
      acceptTerms
    }}>
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
