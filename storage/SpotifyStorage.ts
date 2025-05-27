import { MMKV } from './mmkv';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const EXPIRATION_KEY = 'token_expiration';

export const SpotifyStorage = {
  async setTokens({
    accessToken,
    refreshToken,
    expirationTime,
  }: {
    accessToken: string;
    refreshToken: string;
    expirationTime: number;
  }) {
    await MMKV.setStringAsync(ACCESS_TOKEN_KEY, accessToken);
    await MMKV.setStringAsync(REFRESH_TOKEN_KEY, refreshToken);
    await MMKV.setStringAsync(EXPIRATION_KEY, expirationTime.toString());
  },

  async getAccessToken() {
    return await MMKV.getStringAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken() {
    return await MMKV.getStringAsync(REFRESH_TOKEN_KEY);
  },

  async getExpirationTime() {
    const value = await MMKV.getStringAsync(EXPIRATION_KEY);
    return value ? parseInt(value, 10) : null;
  },

  async clearTokens() {
    await MMKV.removeItem(ACCESS_TOKEN_KEY);
    await MMKV.removeItem(REFRESH_TOKEN_KEY);
    await MMKV.removeItem(EXPIRATION_KEY);
  },
};
