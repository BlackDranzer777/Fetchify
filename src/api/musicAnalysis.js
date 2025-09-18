// src/api/musicAnalysis.js

// Get MBID from ISRC using MusicBrainz
export async function getMBIDFromISRC(isrc) {
  const res = await fetch(
    `/.netlify/functions/musicProxy?path=/ws/2/recording?query=isrc:${isrc}&fmt=json`,
    {
      headers: {
        "User-Agent": "Fetchify/1.0 (contact@yourapp.com)", // MusicBrainz requires this
      },
    }
  );
  if (!res.ok) throw new Error("MusicBrainz ISRC lookup failed");
  const data = await res.json();
  return data.recordings?.[0]?.id || null; // first MBID
}

// Get high-level features (mood, danceability, genre, etc.)
export async function getABFeatures(mbid) {
  const res = await fetch(
    `https://acousticbrainz.org/api/v1/${mbid}/high-level?map_classes=true&fmt=json`
  );
  if (!res.ok) throw new Error("AcousticBrainz feature fetch failed");
  return res.json();
}

// ✅ Get similar tracks (via Netlify proxy)
export async function getSimilarMBIDs(mbid, limit = 25) {
  const res = await fetch(
    `/.netlify/functions/acousticProxy?path=/api/v1/similarity/moods?recording_ids=${mbid}&n_neighbours=${limit}&remove_dups=all&fmt=json`
  );
  if (!res.ok) throw new Error("AcousticBrainz similarity fetch failed");
  return res.json();
}

// Convert MBID → Spotify track (via MusicBrainz metadata + Spotify search)
import { searchByISRC, searchByTitleArtist } from "./spotify";

export async function mbidToSpotifyTrack(token, mbid) {
  if (!mbid) return null; // ✅ safety check

  const res = await fetch(
    `/.netlify/functions/musicProxy?path=/ws/2/recording/${mbid}?inc=artist-credits+releases+isrcs&fmt=json`,
    {
      headers: {
        "User-Agent": "Fetchify/1.0 (contact@yourapp.com)",
      },
    }
  );
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

// Get low-level features (BPM, key, loudness, etc.)
export async function getABLowLevel(mbid) {
  const res = await fetch(
    `https://acousticbrainz.org/api/v1/${mbid}/low-level?fmt=json`
  );
  if (!res.ok) throw new Error("AcousticBrainz low-level fetch failed");
  return res.json();
}

/**
 * Extract normalized features from AcousticBrainz (high + low)
 * Returns consistent values for re-ranking
 */
export async function extractFeatures(mbid) {
  const high = await getABFeatures(mbid);
  const low = await getABLowLevel(mbid);

  const feat = {
    tempo: low.rhythm?.bpm || 120,
    dance:
      high.highlevel?.danceability?.value === "danceable"
        ? high.highlevel?.danceability?.probability
        : 0,
    energy:
      high.highlevel?.energy?.value === "energetic"
        ? high.highlevel?.energy?.probability
        : 0,
    valence:
      high.highlevel?.mood_happy?.value === "happy"
        ? high.highlevel?.mood_happy?.probability
        : 0,
    flux: low.lowlevel?.spectral_flux?.mean || 0.5,
    // ⚠️ Placeholder (AcousticBrainz doesn’t directly return lyrics info)
    hasLyrics: high.highlevel?.ismir04_rhythm?.value === "lyrics",
  };

  // Fusion score (used for ranking)
  const fusion =
    0.3 * feat.dance +
    0.3 * feat.energy +
    0.2 * feat.valence +
    0.2 * (feat.tempo / 200);

  return { ...feat, fusion };
}
