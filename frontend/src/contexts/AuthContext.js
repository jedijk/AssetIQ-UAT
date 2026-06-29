import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { getApiUrl } from "../lib/apiConfig";
import { updateCachedPreferences, clearCachedPreferences } from "../lib/dateUtils";
import { clearRolePreviewStorage } from "./RolePreviewContext";
import { enforceDatabaseEnvironmentForRole, getDatabaseEnvironment } from "../lib/databaseEnv";
import { clearActiveTenantId, enforceActiveTenantForRole, getActiveTenantHeaders } from "../lib/activeTenant";
import { setCsrfToken, clearCsrfToken } from "../lib/apiConfig";
import { isPublicKioskPath } from "../lib/publicRoutes";
import { resetSessionExpiryState } from "../lib/apiClient";

const AuthContext = createContext(null);
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

// Current terms/privacy version - increment when terms change
const CURRENT_TERMS_VERSION = "1.0";

function getDbEnvHeaders() {
  // Keep auth-related calls consistent with the main API client, which uses this header
  // to select the active database environment (production vs UAT).
  try {
    const dbEnv = getDatabaseEnvironment();
    return {
      ...(dbEnv ? { "X-Database-Environment": dbEnv } : {}),
      ...getActiveTenantHeaders(),
    };
  } catch (_e) {
    return {};
  }
}

// Fetch user preferences and cache them for date formatting
const fetchAndCachePreferences = async (API_URL) => {
  try {
    const response = await axios.get(`${API_URL}/users/me/preferences`, {
      headers: getDbEnvHeaders(),
      withCredentials: AUTH_MODE === "cookie",
    });
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
        await axios.post(
          `${API_URL}/auth/logout`,
          {},
          { withCredentials: true, headers: getDbEnvHeaders() }
        );
      } catch (_e) {}
    }
    localStorage.removeItem("token");
    clearCsrfToken();
    clearRolePreviewStorage();
    clearActiveTenantId();
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
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: getDbEnvHeaders(),
        withCredentials: AUTH_MODE === "cookie",
      });
      setUser(response.data);
      enforceDatabaseEnvironmentForRole(response.data?.role);
      enforceActiveTenantForRole(response.data?.role);
      setMustChangePassword(response.data.must_change_password || false);

      // Check if user needs to accept terms (new or updated terms)
      const userTermsVersion = response.data.terms_accepted_version;
      const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
      // Only show terms dialog if password change is not required
      setMustAcceptTerms(needsTermsAcceptance && !response.data.must_change_password);

      // Fetch and cache user preferences for date/time formatting
      await fetchAndCachePreferences(API_URL);
    } catch (error) {
      // A 401 here is normal when booting logged-out (especially in cookie mode).
      // Only log unexpected errors.
      const status = error?.response?.status;
      if (status && status !== 401) {
        console.error("Failed to fetch user:", error);
      }
      // Avoid calling remote logout on a simple 401 (especially in cookie mode),
      // otherwise we can create a noisy loop if CORS/session is misconfigured.
      logout({ remote: false });
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (typeof window !== "undefined" && isPublicKioskPath(window.location.pathname)) {
      setLoading(false);
      return;
    }

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
    
    // Mark that we're authenticating to prevent the useEffect from calling fetchUser
    setIsAuthenticating(true);
    
    try {
      const response = await axios.post(
        loginUrl,
        { email, password },
        {
          withCredentials: AUTH_MODE === "cookie",
          headers: getDbEnvHeaders(),
        },
      );
      const data = response.data;
      if (data.requires_2fa) {
        setIsAuthenticating(false);
        return {
          requires2fa: true,
          challengeToken: data.challenge_token,
          maskedEmail: data.masked_email,
        };
      }
      return await finalizeLoginSession(data, API_URL);
    } catch (error) {
      setIsAuthenticating(false);
      console.error("[Auth] Login failed:", error.response?.status, error.response?.data || error.message);
      throw error;
    }
  };

  const verify2FA = async (challengeToken, code) => {
    const API_URL = getApiUrl();
    setIsAuthenticating(true);
    try {
      const response = await axios.post(
        `${API_URL}/auth/2fa/verify`,
        { challenge_token: challengeToken, code },
        {
          withCredentials: AUTH_MODE === "cookie",
          headers: getDbEnvHeaders(),
        },
      );
      return await finalizeLoginSession(response.data, API_URL);
    } catch (error) {
      setIsAuthenticating(false);
      throw error;
    }
  };

  const resend2FA = async (challengeToken) => {
    const API_URL = getApiUrl();
    const response = await axios.post(
      `${API_URL}/auth/2fa/resend`,
      { challenge_token: challengeToken },
      {
        withCredentials: AUTH_MODE === "cookie",
        headers: getDbEnvHeaders(),
      },
    );
    return response.data;
  };

  async function finalizeLoginSession(data, API_URL) {
    const { token: newToken, user: userData, must_change_password, csrf_token: csrfToken } = data;

    if (AUTH_MODE === "bearer") {
      localStorage.setItem("token", newToken);
      axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
      setToken(newToken);
    } else {
      axios.defaults.withCredentials = true;
      setToken(null);
      if (csrfToken) {
        setCsrfToken(csrfToken);
      }
    }
    setUser(userData);
    resetSessionExpiryState();
    enforceDatabaseEnvironmentForRole(userData?.role);
    enforceActiveTenantForRole(userData?.role);
    setLoading(false);
    setMustChangePassword(must_change_password || userData.must_change_password || false);

    const userTermsVersion = userData.terms_accepted_version;
    const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
    setMustAcceptTerms(needsTermsAcceptance && !(must_change_password || userData.must_change_password));

    await fetchAndCachePreferences(API_URL);

    if (must_change_password || userData.must_change_password || needsTermsAcceptance) {
      localStorage.setItem("assetiq_intro_seen", "true");
    } else if (userData.has_seen_intro === false) {
      localStorage.removeItem("assetiq_intro_seen");
    } else if (userData.has_seen_intro === true) {
      localStorage.setItem("assetiq_intro_seen", "true");
    }

    if (userData.default_simple_mode && !localStorage.getItem("operatorViewEnabled")) {
      localStorage.setItem("operatorViewEnabled", "true");
    }

    if (!localStorage.getItem("hierarchy-hidden-levels")) {
      localStorage.setItem("hierarchy-hidden-levels", JSON.stringify(["installation", "plant_unit"]));
    }

    setIsAuthenticating(false);
    return { ...userData, must_change_password: must_change_password || userData.must_change_password };
  }

  const loginWithSsoToken = async (token, userData) => {
    const API_URL = getApiUrl();
    setIsAuthenticating(true);

    try {
      if (AUTH_MODE === "bearer") {
        localStorage.setItem("token", token);
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        setToken(token);
      } else {
        axios.defaults.withCredentials = true;
        setToken(null);
      }

      setUser(userData);
      resetSessionExpiryState();
      enforceDatabaseEnvironmentForRole(userData?.role);
      enforceActiveTenantForRole(userData?.role);
      setLoading(false);
      setMustChangePassword(userData.must_change_password || false);

      const userTermsVersion = userData.terms_accepted_version;
      const needsTermsAcceptance = !userTermsVersion || userTermsVersion !== CURRENT_TERMS_VERSION;
      setMustAcceptTerms(needsTermsAcceptance && !userData.must_change_password);

      await fetchAndCachePreferences(API_URL);

      if (userData.must_change_password || needsTermsAcceptance) {
        localStorage.setItem("assetiq_intro_seen", "true");
      } else if (userData.has_seen_intro === false) {
        localStorage.removeItem("assetiq_intro_seen");
      } else if (userData.has_seen_intro === true) {
        localStorage.setItem("assetiq_intro_seen", "true");
      }

      setIsAuthenticating(false);
      return userData;
    } catch (error) {
      setIsAuthenticating(false);
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
      await axios.post(
        `${API_URL}/gdpr/accept-terms`,
        { terms_version: CURRENT_TERMS_VERSION },
        { headers: getDbEnvHeaders(), withCredentials: AUTH_MODE === "cookie" }
      );

      // Re-fetch canonical user state so acceptance survives reloads/sessions.
      const meResponse = await axios.get(`${API_URL}/auth/me`, {
        headers: getDbEnvHeaders(),
        withCredentials: AUTH_MODE === "cookie",
      });
      const serverVersion = meResponse.data?.terms_accepted_version;
      if (serverVersion !== CURRENT_TERMS_VERSION) {
        console.error(
          "[acceptTerms] backend did not persist terms version:",
          serverVersion
        );
        throw new Error("Terms acceptance was not saved. Please try again.");
      }

      setUser(meResponse.data);
      enforceDatabaseEnvironmentForRole(meResponse.data?.role);
      enforceActiveTenantForRole(meResponse.data?.role);
      setMustAcceptTerms(false);

      // Now show intro if user hasn't seen it
      if (meResponse.data?.has_seen_intro === false) {
        localStorage.removeItem("assetiq_intro_seen");
      }

      return meResponse.data;
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
    enforceDatabaseEnvironmentForRole(userData?.role);
    enforceActiveTenantForRole(userData?.role);
    
    return userData;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login,
      verify2FA,
      resend2FA,
      loginWithSsoToken,
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
