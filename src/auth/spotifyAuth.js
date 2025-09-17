import { randomString, sha256 } from './pkce';

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
// const SCOPES = [
//   'user-read-private',
//   'playlist-modify-public',
//   'playlist-modify-private',
// ];

// const SCOPES = [
//   'user-read-private',
//   'playlist-modify-public',
//   'playlist-modify-private',
//   'user-library-read',      // ✅ needed for /me/tracks
//   'user-library-modify',    // ✅ if you want to save tracks
// ];

const SCOPES = [
  'user-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-read-currently-playing',  // ✅ needed
  'user-read-playback-state',     // ✅ recommended
];

const TOKEN_KEY = 'fetchify:spotify_token';
const VERIFIER_KEY = 'fetchify:code_verifier';

export function getStoredToken() {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  const token = JSON.parse(raw);
  if (Date.now() > token.expires_at) return null;
  return token;
}

export async function loginWithPKCE() {
  const verifier = randomString(64);
  const challenge = await sha256(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES.join(' '),
  });

  window.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleCallback() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return null;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description);

  const token = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  sessionStorage.removeItem(VERIFIER_KEY);

  return token;
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.href = '/';
}
