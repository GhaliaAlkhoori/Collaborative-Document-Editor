
import axios from "axios";
import {
  clearStoredSession,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSession,
  persistSession,
} from "../lib/session";

const api = axios.create({
  baseURL: "http://127.0.0.1:8001",
});

const refreshClient = axios.create({
  baseURL: api.defaults.baseURL,
});

let refreshPromise = null;

function isAuthRoute(url = "") {
  return ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"].some(
    (path) => url.includes(path)
  );
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function isAccessTokenExpired(token, bufferSeconds = 20) {
  if (!token) {
    return true;
  }

  const payload = decodeJwtPayload(token);
  const expiresAt = payload?.exp;
  if (!expiresAt) {
    return false;
  }

  return Date.now() >= expiresAt * 1000 - bufferSeconds * 1000;
}

async function performRefresh() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await refreshClient.post("/api/v1/auth/refresh", {
    refresh_token: refreshToken,
  });
  const currentUser = getStoredSession().user;

  persistSession({
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    user:
      currentUser || {
        user_id: response.data.user_id,
        name: response.data.name,
        email: response.data.email,
      },
  });

  return response.data;
}

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .catch((error) => {
        clearStoredSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function ensureValidAccessToken() {
  const accessToken = getStoredAccessToken();
  if (accessToken && !isAccessTokenExpired(accessToken)) {
    return accessToken;
  }

  if (getStoredRefreshToken()) {
    const refreshed = await refreshSession();
    return refreshed.access_token;
  }

  return accessToken;
}

export async function fetchWithAuth(input, init = {}) {
  const requestUrl =
    typeof input === "string" ? input : input?.url || "";

  const buildHeaders = async () => {
    const headers = new Headers(init.headers || {});
    const accessToken = await ensureValidAccessToken().catch(() => getStoredAccessToken());
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return headers;
  };

  let response = await fetch(input, {
    ...init,
    headers: await buildHeaders(),
  });

  if (
    response.status !== 401 ||
    isAuthRoute(requestUrl) ||
    !getStoredRefreshToken()
  ) {
    return response;
  }

  try {
    await refreshSession();
    response = await fetch(input, {
      ...init,
      headers: await buildHeaders(),
    });
  } catch {
    return response;
  }

  return response;
}

api.interceptors.request.use(async (config) => {
  if (isAuthRoute(config.url || "")) {
    return config;
  }

  const accessToken = await ensureValidAccessToken().catch(() => getStoredAccessToken());
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (
      error?.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthRoute(originalRequest.url || "")
    ) {
      return Promise.reject(error);
    }

    if (!getStoredRefreshToken()) {
      clearStoredSession();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshed = await refreshSession();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${refreshed.access_token}`;
      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

export default api;
