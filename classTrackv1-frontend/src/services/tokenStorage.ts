import { REFRESH_STORAGE_KEY, TOKEN_STORAGE_KEY } from "@utils/constants";
import type { TokenPair } from "@/types/auth";

/**
 * Single source of truth for reading/writing auth tokens.
 * Keeping this isolated means swapping storage strategy (e.g. httpOnly
 * cookies issued by the backend) later only touches this file.
 */
export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  },
  setTokens({ accessToken, refreshToken }: TokenPair): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
  },
  setAccessToken(accessToken: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  },
  clear(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  },
  hasSession(): boolean {
    return Boolean(this.getAccessToken() && this.getRefreshToken());
  },
};
