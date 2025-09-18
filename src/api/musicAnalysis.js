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

export async function extractFeatures(mbid) {
  const url = `https://acousticbrainz.org/api/v1/${mbid}/high-level?map_classes=true&fmt=json`;
  const res = await fetch(url);

  if (res.status === 429) {
    const resetIn = res.headers.get("X-RateLimit-Reset-In") || 5;
    console.warn(`Rate limited. Retrying in ${resetIn}s...`);
    await new Promise(r => setTimeout(r, resetIn * 1000));
    return extractFeatures(mbid);
  }

  if (!res.ok) throw new Error(`AB high-level fetch failed for ${mbid}`);
  const high = await res.json();

  const lowRes = await fetch(`https://acousticbrainz.org/api/v1/${mbid}/low-level?fmt=json`);
  if (lowRes.status === 429) {
    const resetIn = lowRes.headers.get("X-RateLimit-Reset-In") || 5;
    console.warn(`Rate limited on low-level. Retrying in ${resetIn}s...`);
    await new Promise(r => setTimeout(r, resetIn * 1000));
    return extractFeatures(mbid);
  }
  if (!lowRes.ok) throw new Error(`AB low-level fetch failed for ${mbid}`);
  const low = await lowRes.json();

  // Convert strings to numbers
  const dance = parseFloat(high.highlevel?.danceability?.probability ?? 0);
  const energy = parseFloat(high.highlevel?.energy?.probability ?? 0);
  const valence = parseFloat(high.highlevel?.mood_happy?.probability ?? 0);
  const flux = parseFloat(low.lowlevel?.spectral_flux?.mean ?? 0);
  const tempo = parseFloat(low.rhythm?.bpm ?? 120);

  // ✅ IMPROVED hasLyrics Detection - Check multiple indicators
  const hasLyrics = detectVocals(high, low);

  const title = low.metadata?.tags?.title?.[0] || null;
  const artist = low.metadata?.tags?.artist?.[0] || null;

  const fusion = (dance + energy + valence + flux) / 4;

  // 🐛 Debug logging for vocals detection
  console.log(`🎤 Vocal detection for "${title}" by "${artist}":`, {
    hasLyrics,
    voiceInstrumental: high.highlevel?.voice_instrumental,
    vocal: high.highlevel?.vocal,
    instrumental: high.highlevel?.instrumental,
    speech: high.highlevel?.speech_music
  });

  return { dance, energy, valence, flux, tempo, hasLyrics, title, artist, fusion };
}

// Helper function to detect vocals using multiple methods
function detectVocals(high, low) {
  // Method 1: voice_instrumental classifier
  const voiceInstrumental = high.highlevel?.voice_instrumental;
  if (voiceInstrumental) {
    if (voiceInstrumental.value === "voice") return true;
    if (voiceInstrumental.value === "instrumental") return false;
    
    // Check probabilities if available
    if (voiceInstrumental.probability) {
      const voiceProb = parseFloat(voiceInstrumental.probability.voice || 0);
      const instrProb = parseFloat(voiceInstrumental.probability.instrumental || 0);
      if (voiceProb > instrProb && voiceProb > 0.6) return true;
      if (instrProb > voiceProb && instrProb > 0.7) return false;
    }
  }

  // Method 2: vocal vs instrumental classifiers
  const vocalClass = high.highlevel?.vocal;
  const instrumentalClass = high.highlevel?.instrumental;
  
  if (vocalClass && instrumentalClass) {
    const vocalProb = parseFloat(vocalClass.probability?.vocal || 0);
    const instrProb = parseFloat(instrumentalClass.probability?.instrumental || 0);
    
    if (vocalProb > 0.6 && vocalProb > instrProb) return true;
    if (instrProb > 0.7 && instrProb > vocalProb) return false;
  }

  // Method 3: speech_music classifier (speech usually indicates vocals)
  const speechMusic = high.highlevel?.speech_music;
  if (speechMusic?.value === "speech") return true;

  // Method 4: Check for genre indicators
  const genre = high.highlevel?.genre_dortmund || high.highlevel?.genre_electronic || high.highlevel?.genre_rosamerica;
  if (genre) {
    const genreValue = genre.value?.toLowerCase();
    // Genres that are typically instrumental
    if (genreValue && ['ambient', 'drone', 'neoclassical', 'soundtrack', 'classical'].some(g => genreValue.includes(g))) {
      return false;
    }
    // Genres that typically have vocals
    if (genreValue && ['pop', 'rock', 'indie', 'folk', 'country', 'rnb', 'soul', 'hip-hop', 'rap'].some(g => genreValue.includes(g))) {
      return true;
    }
  }

  // Method 5: Fallback - assume most music has vocals (safer default)
  return true;
}