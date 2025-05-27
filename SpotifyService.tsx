import { SpotifyStorage } from './storage/SpotifyStorage';

const CLIENT_ID = 'd2a4f6ca1a5641afb4d9a0d9fd3e522f';
const CLIENT_SECRET = '47c467188a564a41a80b798eb9205522';
const REDIRECT_URI = 'upl://callback'; 

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const USER_PROFILE_URL = 'https://api.spotify.com/v1/me';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const SpotifyService = {
  async requestAuthorization(): Promise<string> {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-modify-playback-state',
      'user-library-read',
      'streaming',
      'user-read-recently-played',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-top-read'
    ].join(' ');

    const authUrl = `${AUTHORIZE_URL}?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${encodeURIComponent(scopes)}`;
    console.log("AuthUrl: "+ authUrl)

    return authUrl; // open in WebView or browser
  },

  async handleAuthRedirect(redirectUrl: string): Promise<void> {
    console.log("[handleAuthRedirect] Redirect URL:", redirectUrl);

    try {
      const code = extractQueryParam(redirectUrl, 'code');
      const error = extractQueryParam(redirectUrl, 'error');

      if (error) {
        console.error("[handleAuthRedirect] Error during auth:", error);
        return;
      }

      if (!code) {
        console.warn("[handleAuthRedirect] No code found in redirect URL.");
        return;
      }

      console.log("[handleAuthRedirect] Extracted code:", code);

      // Proceed to exchange the code
      await this.exchangeCodeForToken(code);
    } catch (err) {
      console.error("[handleAuthRedirect] Failed to handle redirect:", err);
    }
  },

  async exchangeCodeForToken(code: string): Promise<void> {
    const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`;
    const authHeader = btoa(credentials);

    // const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json();
      console.log("[exchangeCodeForToken] Response:", data);

      if (response.ok && data.access_token) {
        await SpotifyStorage.setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expirationTime: Date.now() + data.expires_in * 1000,
        });

        console.log("[exchangeCodeForToken] Token saved!");
      } else {
        console.error("[exchangeCodeForToken] Token request failed:", data);
      }
    } catch (error) {
      console.error("[exchangeCodeForToken] Error:", error);
    }
  },

  async refreshAccessToken() {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    refreshToken = (refreshToken || (await SpotifyStorage.getRefreshToken())) ?? null;

    if (!refreshToken) {
      throw new Error('Missing refresh token');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`
      },
      body: body.toString()
    });

    if (!response.ok) throw new Error('Failed to refresh token');

    const data = await response.json();
    accessToken = data.access_token;
    console.log(accessToken);

    await SpotifyStorage.setTokens({
      accessToken: accessToken || '',
      refreshToken: refreshToken || '',
      expirationTime: Date.now() + data.expires_in * 1000,
    });

    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      console.log(refreshToken);

      // await AsyncStorage.setItem('refresh_token', refreshToken || "");
    }

    const expirationTime = Date.now() + data.expires_in * 1000;
    // await AsyncStorage.setItem('token_expiration', expirationTime.toString());

    return data;
  },

  async ensureTokenValid(): Promise<void> {
    const expiration = await SpotifyStorage.getExpirationTime();
    const token = await SpotifyStorage.getAccessToken();
    const refresh = await SpotifyStorage.getRefreshToken();

    const now = Date.now();

    console.log('[ensureTokenValid] Stored access token:', token);
    console.log('[ensureTokenValid] Stored refresh token:', refresh);
    console.log('[ensureTokenValid] Token expiration time:', expiration);

    if (!expiration || now > expiration) {
      console.log('Access token expired, refreshing...');
      await SpotifyService.refreshAccessToken();
    } else {
      console.log('Token is still valid');
    }
  },

  async addSongToUplPlaylist(songUri: string): Promise<void> {
    console.log('[addSongToUplPlaylist] Called with URI:', songUri);  

    await this.ensureTokenValid();

    const token = await SpotifyStorage.getAccessToken();
    console.log('[addSongToUplPlaylist] Retrieved access token:', token);

    if (!token) {
      console.error('[addSongToUplPlaylist] Token is still missing after validation. Aborting.');
      throw new Error('No access token found');
    }

    // Step 1: Get current user ID
    const profile = await this.getProfile();
    const userId = profile.spotifyID;

    console.log('[addSongToUplPlaylist] Retrieved user profile:', profile);
    console.log('[addSongToUplPlaylist] Spotify User ID:', userId);

    // Step 2: Check for existing playlists
    const playlistsRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists?limit=50`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('[addSongToUplPlaylist] Playlists fetch response status:', playlistsRes.status);

    if (!playlistsRes.ok) throw new Error('Failed to fetch playlists');
    const playlistsData = await playlistsRes.json();
    console.log('[addSongToUplPlaylist] Playlists data:', playlistsData);

    let playlist = playlistsData.items.find(
      (pl: any) => pl.name.toLowerCase() === 'upl playlist'
    );

    // Step 3: Create playlist if not found
    if (!playlist) {
      console.log('[addSongToUplPlaylist] Playlist not found, creating it...');

      const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Upl Playlist',
          description: 'Created by Upl App',
          public: false
        })
      });

      console.log('[addSongToUplPlaylist] Create playlist response status:', createRes.status);

      if (!createRes.ok) throw new Error('Failed to create playlist');
      playlist = await createRes.json();
      console.log('[addSongToUplPlaylist] Playlist created:', playlist);
    }

    // Step 4: Add song to playlist
    const addRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [songUri]
        })
      }
    );

    if (!addRes.ok) throw new Error('Failed to add song to playlist');
    console.log(`Song added to ${playlist.name}`);
  },

  // EXTRA
  async getProfile(): Promise<any> {
    await this.ensureTokenValid();
    const token = await SpotifyStorage.getAccessToken();
    if (!token) throw new Error('Access token not found');

    const response = await fetch(USER_PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch profile');

    const data = await response.json();
    return {
      displayName: data.display_name,
      email: data.email,
      spotifyID: data.id,
      country: data.country,
      profileImage: data.images?.[0]?.url || null,
      followersCount: data.followers?.total || 0
    };
  },

  async getTopArtists(limit: number = 4) {
    await this.ensureTokenValid();
    const token = await SpotifyStorage.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch top artists');

    const data = await response.json();
    return data.items;
  },

  async getTopTracks(limit: number = 10) {
    await this.ensureTokenValid();
    const token = await SpotifyStorage.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch top tracks');

    const data = await response.json();
    return data.items;
  },

  async searchTrack(query: string): Promise<string | null> {
    await this.ensureTokenValid();
    const token = await SpotifyStorage.getAccessToken(); 
    if (!token) throw new Error('Access token not found');

    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('[searchTrack] Failed to search track:', await response.text());
      return null;
    }

    const data = await response.json();

    const track = data.tracks.items[0];
    console.log("Track: ", track)
    return track?.uri ?? null;
  },
};

function extractQueryParam(url: string, param: string): string | null {
  const match = url.match(new RegExp(`[?&]${param}=([^&#]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}