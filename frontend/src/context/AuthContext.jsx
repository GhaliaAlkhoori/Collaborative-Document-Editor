
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import {
  clearStoredSession,
  getStoredSession,
  persistSession,
  subscribeToSessionChanges,
} from "../lib/session";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());

  useEffect(() => {
    const syncSession = () => {
      setSession(getStoredSession());
    };

    syncSession();
    return subscribeToSessionChanges(syncSession);
  }, []);

  const login = ({ accessToken, refreshToken }, userData) => {
    persistSession({
      accessToken,
      refreshToken,
      user: userData,
    });
    setSession(getStoredSession());
  };

  const logout = () => {
    clearStoredSession();
    setSession(getStoredSession());
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
        isAuthenticated: !!(session.accessToken || session.refreshToken),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
