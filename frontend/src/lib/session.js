const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";
const SESSION_EVENT_NAME = "auth:session";

function emitSessionChange() {
  window.dispatchEvent(new Event(SESSION_EVENT_NAME));
}

export function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || "";
}

export function getStoredUser() {
  const savedUser = localStorage.getItem(USER_KEY);
  return savedUser ? JSON.parse(savedUser) : null;
}

export function getStoredSession() {
  return {
    accessToken: getStoredAccessToken(),
    refreshToken: getStoredRefreshToken(),
    user: getStoredUser(),
  };
}

export function persistSession({ accessToken, refreshToken, user }) {
  if (typeof accessToken === "string") {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  if (typeof refreshToken === "string") {
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  emitSessionChange();
}

export function clearStoredSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emitSessionChange();
}

export function subscribeToSessionChanges(listener) {
  window.addEventListener(SESSION_EVENT_NAME, listener);
  return () => {
    window.removeEventListener(SESSION_EVENT_NAME, listener);
  };
}
