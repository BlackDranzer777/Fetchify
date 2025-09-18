// src/api/musicAnalysis.js
import { searchByISRC, searchByTitleArtist } from "./spotify";

// Get MBID from ISRC using MusicBrainz
export async function getMBIDFromISRC(isrc) {
  const path = encodeURIComponent(`/ws/2/recording?query=isrc:${isrc}&fmt=json`);

  const res = await fetch(`/.netlify/functions/musicProxy?path=${path}`);
  if (!res.ok) throw new Error("MusicBrainz ISRC lookup failed");

  const data = await res.json();
  return data.recordings?.[0]?.id || null; // first MBID
}

// Convert MBID → Spotify track (via MusicBrainz metadata + Spotify search)
export async function mbidToSpotifyTrack(token, mbid) {
  if (!mbid) return null; // ✅ safety check

  const path = encodeURIComponent(
    `/ws/2/recording/${mbid}?inc=artist-credits+releases+isrcs&fmt=json`
  );

  const res = await fetch(`/.netlify/functions/musicProxy?path=${path}`);
  if (!res.ok) throw new Error("MusicBrainz recording fetch failed");

  const rec = await res.json();

  const isrc = rec.isrcs?.[0];
  if (isrc) {
    const search = await searchByISRC(token, isrc);
    return search.tracks?.items?.[0] || null;
  }

  const title = rec.title;
  const artist = rec["artist-credit"]?.[0]?.name;
  if (title && artist) {
    const search = await searchByTitleArtist(token, title, artist);
    return search.tracks?.items?.[0] || null;
  }

  return null;
}
