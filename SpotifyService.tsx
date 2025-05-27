import AsyncStorage from '@react-native-async-storage/async-storage';

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
      'user-top-read'
    ].join(' ');

    const authUrl = `${AUTHORIZE_URL}?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${encodeURIComponent(scopes)}`;
    console.log("AuthUrl: "+ authUrl)

    return authUrl; // open in WebView or browser
  },

  async handleAuthRedirect(url: string) {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');

    if (error) {
      console.error('Spotify auth error:', error);
      return;
    }

    if (!code) {
      console.error('No code found in redirect URI');
      return;
    }

    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `client_id=${CLIENT_ID}&grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(
          REDIRECT_URI,
        )}`,
      });

      const tokenJson = await tokenResponse.json();

      if (tokenJson.access_token) {
        console.log('Access Token:', tokenJson.access_token);
        // Store this token for later use
      } else {
        console.error('Token response missing access token:', tokenJson);
      }
    } catch (err) {
      console.error('Error exchanging code for token:', err);
    }
  },

  async exchangeCodeForToken(code: string) {
    ///
    if (!code) {
      console.error('[handleAuthRedirect] No code found in redirect URI');
      return;
    }

    try {
      console.log('[handleAuthRedirect] Authorization code received:', code);
      const tokenData = await SpotifyService.exchangeCodeForToken(code);
      console.log('[handleAuthRedirect] Token exchange successful:', tokenData);
    } catch (err) {
      console.error('[handleAuthRedirect] Error exchanging code for token:', err);
    } ///

    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`
      },
      body: body.toString()
    });

    if (!response.ok) throw new Error('Failed to exchange code');

    const data = await response.json();
    await AsyncStorage.setItem('access_token', data.access_token);
    await AsyncStorage.setItem('refresh_token', data.refresh_token);
    const expirationTime = Date.now() + data.expires_in * 1000;
    await AsyncStorage.setItem('token_expiration', expirationTime.toString());

    accessToken = data.access_token;
    refreshToken = data.refresh_token;

    console.log('[exchangeCodeForToken] Access token saved:', data.access_token);
    console.log('[exchangeCodeForToken] Refresh token saved:', data.refresh_token);
    console.log('[exchangeCodeForToken] Expires at:', new Date(data.expirationTime).toISOString());

    return data;
  },

  async refreshAccessToken() {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    refreshToken = refreshToken || (await AsyncStorage.getItem('refresh_token'));
    // let refreshToken = await SecureStore.getItemAsync('refresh_token');

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

    await AsyncStorage.setItem('access_token', accessToken || "");

    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      console.log(refreshToken);

      await AsyncStorage.setItem('refresh_token', refreshToken || "");
    }

    const expirationTime = Date.now() + data.expires_in * 1000;
    await AsyncStorage.setItem('token_expiration', expirationTime.toString());

    return data;
  },

  async ensureTokenValid(): Promise<void> {
    const expiration = await AsyncStorage.getItem('token_expiration');
    const token = await AsyncStorage.getItem('access_token');
    const refresh = await AsyncStorage.getItem('refresh_token');
    // const expiration = await SecureStore.getItemAsync('token_expiration');
    // const token = await SecureStore.getItemAsync('access_token');
    // const refresh = await SecureStore.getItemAsync('refresh_token');

    const now = Date.now();

    console.log('[ensureTokenValid] Stored access token:', token);
    console.log('[ensureTokenValid] Stored refresh token:', refresh);
    console.log('[ensureTokenValid] Token expiration time:', expiration);

    if (!expiration || now > parseInt(expiration)) {
      console.log('Access token expired, refreshing...');
      await SpotifyService.refreshAccessToken();
    } else {
      console.log('Token is still valid');
    }
  },

  async addSongToUplPlaylist(songUri: string): Promise<void> {
    console.log('[addSongToUplPlaylist] Called with URI:', songUri);  

    await this.ensureTokenValid();

    const token = await AsyncStorage.getItem('access_token');
    // const token = await SecureStore.getItemAsync('access_token');
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
    await SpotifyService.ensureTokenValid();
    const token = await AsyncStorage.getItem('access_token');
    // const token = await SecureStore.getItemAsync('access_token');
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
    await SpotifyService.ensureTokenValid();
    const token = await AsyncStorage.getItem('access_token');
    // const token = await SecureStore.getItemAsync('access_token');
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
    await SpotifyService.ensureTokenValid();
    const token = await AsyncStorage.getItem('access_token');
    // const token = await SecureStore.getItemAsync('access_token');
    const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch top tracks');

    const data = await response.json();
    return data.items;
  }
};

function extractQueryParam(url: string, param: string): string | null {
  const match = url.match(new RegExp(`[?&]${param}=([^&#]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}