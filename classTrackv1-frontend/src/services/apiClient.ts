import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, AUTH_SESSION_EXPIRED_EVENT, ROUTES } from "@utils/constants";
import { tokenStorage } from "./tokenStorage";
import { navigateTo } from "./navigationService";
import type { RefreshResponseData } from "@/types/auth";
import type { ApiResponse } from "@/types/common";

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Plain axios instance (no interceptors) used only for the refresh call
// itself, so a failing refresh can never recursively trigger this same
// interceptor chain.
const refreshClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((resolve) => resolve(token));
  pendingQueue = [];
}

function forceLogout() {
  tokenStorage.clear();
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  navigateTo(ROUTES.LOGIN, { replace: true });
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/admin/login") ||
      originalRequest?.url?.includes("/auth/teacher/login") ||
      originalRequest?.url?.includes("/auth/student/login") ||
      originalRequest?.url?.includes("/auth/refresh");

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    if (!tokenStorage.getRefreshToken()) {
      forceLogout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = tokenStorage.getRefreshToken();
      const { data } = await refreshClient.post<ApiResponse<RefreshResponseData>>(
        "/auth/refresh",
        { refreshToken }
      );

      if (!data.success) throw new Error(data.message);

      const newAccessToken = data.data.accessToken;
      tokenStorage.setTokens({
        accessToken: newAccessToken,
        refreshToken: data.data.refreshToken ?? refreshToken!,
      });

      flushQueue(newAccessToken);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      flushQueue(null);
      forceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
