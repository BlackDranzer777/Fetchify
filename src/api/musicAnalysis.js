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

// In musicAnalysis.js - Replace the extractFeatures function
// Replace your extractFeatures function in musicAnalysis.js with this improved version

// Replace your extractFeatures function in musicAnalysis.js with this improved version

// Replace your extractFeatures function in musicAnalysis.js with this improved version

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

  // Convert strings to numbers (keep this fix)
  const dance = parseFloat(high.highlevel?.danceability?.probability ?? 0);
  const energy = parseFloat(high.highlevel?.energy?.probability ?? 0);
  const valence = parseFloat(high.highlevel?.mood_happy?.probability ?? 0);
  const flux = parseFloat(low.lowlevel?.spectral_flux?.mean ?? 0);
  const tempo = parseFloat(low.rhythm?.bpm ?? 120);

  // SAFE hasLyrics Detection - simplified to avoid errors
  const hasLyrics = detectVocalsSafe(high);

  // SAFE Genre Detection - simplified to avoid complex distribution errors
  const genre = detectGenreSafe(high);

  const title = low.metadata?.tags?.title?.[0] || null;
  const artist = low.metadata?.tags?.artist?.[0] || null;

  const fusion = (dance + energy + valence + flux) / 4;

  return { dance, energy, valence, flux, tempo, hasLyrics, genre, title, artist, fusion };
}

// Simplified, safer vocal detection
function detectVocalsSafe(high) {
  try {
    // Method 1: Simple voice_instrumental check
    const voiceInstrumental = high.highlevel?.voice_instrumental;
    if (voiceInstrumental?.value === "voice") return true;
    if (voiceInstrumental?.value === "instrumental") return false;
    
    // Method 2: Check probability if available
    if (voiceInstrumental?.probability?.voice > 0.6) return true;
    if (voiceInstrumental?.probability?.instrumental > 0.7) return false;
    
    // Default to vocal (safer assumption)
    return true;
  } catch (error) {
    console.warn("Vocal detection error:", error);
    return true; // Safe default
  }
}

// Simplified, safer genre detection - returns just a string, not an object
function detectGenreSafe(high) {
  try {
    // Check the main genre classifiers one by one
    const classifiers = [
      high.highlevel?.genre_dortmund,
      high.highlevel?.genre_electronic, 
      high.highlevel?.genre_rosamerica
    ];

    for (const classifier of classifiers) {
      if (classifier?.value && classifier?.probability > 0.5) {
        const normalized = normalizeGenreSafe(classifier.value);
        if (normalized) return normalized;
      }
    }
    
    return 'pop'; // Safe fallback
  } catch (error) {
    console.warn("Genre detection error:", error);
    return 'pop'; // Safe fallback
  }
}

// Simplified genre mapping
function normalizeGenreSafe(acousticBrainzGenre) {
  if (!acousticBrainzGenre || typeof acousticBrainzGenre !== 'string') return 'pop';
  
  const normalized = acousticBrainzGenre.toLowerCase();
  
  // Simple mapping
  if (normalized.includes('electronic') || normalized.includes('techno')) return 'electronic';
  if (normalized.includes('dance') || normalized.includes('house')) return 'dance';
  if (normalized.includes('rock') || normalized.includes('punk') || normalized.includes('metal')) return 'rock';
  if (normalized.includes('indie') || normalized.includes('alternative')) return 'indie';
  if (normalized.includes('jazz') || normalized.includes('blues') || normalized.includes('soul')) return 'jazz';
  if (normalized.includes('hip') || normalized.includes('rap')) return 'hip-hop';
  if (normalized.includes('pop')) return 'pop';
  
  return 'pop'; // Default
}