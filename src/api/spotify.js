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
