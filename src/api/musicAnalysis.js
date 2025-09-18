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
// src/api/musicAnalysis.js

export async function extractFeatures(mbid) {
  const url = `https://acousticbrainz.org/api/v1/${mbid}/high-level?map_classes=true&fmt=json`;
  const res = await fetch(url);

  if (res.status === 429) {
    // Respect rate limiting
    const resetIn = res.headers.get("X-RateLimit-Reset-In") || 5;
    console.warn(`Rate limited. Retrying in ${resetIn}s...`);
    await new Promise(r => setTimeout(r, resetIn * 1000));
    return extractFeatures(mbid); // retry once
  }

  if (!res.ok) throw new Error(`AB high-level fetch failed for ${mbid}`);

  const high = await res.json();

  // Fetch low-level too
  const lowRes = await fetch(`https://acousticbrainz.org/api/v1/${mbid}/low-level?fmt=json`);
  if (lowRes.status === 429) {
    const resetIn = lowRes.headers.get("X-RateLimit-Reset-In") || 5;
    console.warn(`Rate limited on low-level. Retrying in ${resetIn}s...`);
    await new Promise(r => setTimeout(r, resetIn * 1000));
    return extractFeatures(mbid);
  }
  if (!lowRes.ok) throw new Error(`AB low-level fetch failed for ${mbid}`);
  const low = await lowRes.json();

  // Safely extract values
  const dance = high.highlevel?.danceability?.probability ?? 0;
  const energy = high.highlevel?.energy?.probability ?? 0;
  const valence = high.highlevel?.mood_happy?.probability ?? 0;
  const flux = low.lowlevel?.spectral_flux?.mean ?? 0;
  const tempo = low.rhythm?.bpm ?? 120;
  const hasLyrics = !!high.highlevel?.voice_instrumental?.value &&
    high.highlevel?.voice_instrumental?.value === "voice";

  // Metadata (title + artist)
  const title = low.metadata?.tags?.title?.[0] || null;
  const artist = low.metadata?.tags?.artist?.[0] || null;

  // Fusion score (example: average of main factors)
  const fusion = (dance + energy + valence + flux) / 4;

  return { dance, energy, valence, flux, tempo, hasLyrics, title, artist, fusion };
}

