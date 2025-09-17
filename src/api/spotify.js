import { getStoredToken } from "../auth/spotifyAuth";

async function api(path, init = {}) {
  const token = getStoredToken();
  if (!token) throw new Error("No Spotify token found");

  const url = `https://api.spotify.com/v1/${path}`;
  console.log("Spotify API request →", url); // ✅ debug log

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getRecommendations({
  seedGenres = ["pop"],
  targets = {},
  limit = 10,
  market = "US",
}) {
  const params = new URLSearchParams({ limit: String(limit), market });
  
  if (seedGenres.length > 0) {
    params.set("seed_genres", seedGenres.slice(0, 5).join(","));
  }

  Object.entries(targets).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      params.set(`target_${k}`, String(v));
    }
  });

  // ✅ no leading slash
  return api(`recommendations?${params.toString()}`);
}




// Get currently playing track
export async function getCurrentlyPlaying(token) {
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null; // nothing playing
  if (!res.ok) throw new Error("Failed to get currently playing track");
  return res.json(); // includes track info
}

// Get full track info (useful to fetch ISRC)
export async function getTrackById(token, trackId) {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get track by ID");
  return res.json();
}

// Search by ISRC
export async function searchByISRC(token, isrc) {
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=isrc:${encodeURIComponent(isrc)}&type=track&market=from_token&limit=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error("Spotify ISRC search failed");
  return res.json();
}

// Fallback search by track + artist
export async function searchByTitleArtist(token, title, artist) {
  const query = `track:"${title}" artist:"${artist}"`;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=from_token&limit=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error("Spotify title/artist search failed");
  return res.json();
}
