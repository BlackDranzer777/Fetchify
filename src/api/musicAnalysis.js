// // Get MBID from ISRC using MusicBrainz
// export async function getMBIDFromISRC(isrc) {
//   const res = await fetch(
//     `https://musicbrainz.org/ws/2/recording?query=isrc:${isrc}&fmt=json`,
//     {
//       headers: {
//         "User-Agent": "Fetchify/1.0 (contact@yourapp.com)", // MusicBrainz requires this
//       },
//     }
//   );
//   if (!res.ok) throw new Error("MusicBrainz ISRC lookup failed");
//   const data = await res.json();
//   return data.recordings?.[0]?.id || null; // first MBID
// }

// // Get high-level features (mood, danceability, genre, etc.)
// export async function getABFeatures(mbid) {
//   const res = await fetch(
//     `https://acousticbrainz.org/api/v1/${mbid}/high-level?map_classes=true`
//   );
//   if (!res.ok) throw new Error("AcousticBrainz feature fetch failed");
//   return res.json();
// }

// // Get similar tracks from AcousticBrainz
// export async function getSimilarMBIDs(mbid, limit = 25) {
//   const res = await fetch(
//     `https://acousticbrainz.org/api/v1/similarity/moods?recording_ids=${mbid}&n_neighbours=${limit}&remove_dups=all`
//   );
//   if (!res.ok) throw new Error("AcousticBrainz similarity fetch failed");
//   return res.json();
// }

// // Convert MBID → Spotify track (via MusicBrainz metadata + Spotify search)
// export async function mbidToSpotifyTrack(token, mbid) {
//   const res = await fetch(
//     `https://musicbrainz.org/ws/2/recording/${mbid}?inc=artist-credits+releases+isrcs&fmt=json`,
//     {
//       headers: {
//         "User-Agent": "Fetchify/1.0 (contact@yourapp.com)",
//       },
//     }
//   );
//   if (!res.ok) throw new Error("MusicBrainz recording fetch failed");
//   const rec = await res.json();

//   const isrc = rec.isrcs?.[0];
//   if (isrc) {
//     const search = await searchByISRC(token, isrc);
//     return search.tracks?.items?.[0] || null;
//   }

//   const title = rec.title;
//   const artist = rec["artist-credit"]?.[0]?.name;
//   if (title && artist) {
//     const search = await searchByTitleArtist(token, title, artist);
//     return search.tracks?.items?.[0] || null;
//   }

//   return null;
// }







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
    `https://acousticbrainz.org/api/v1/${mbid}/high-level?map_classes=true`
  );
  if (!res.ok) throw new Error("AcousticBrainz feature fetch failed");
  return res.json();
}

// ✅ Get similar tracks (via Netlify proxy)
export async function getSimilarMBIDs(mbid, limit = 25) {
  const res = await fetch(
    `/.netlify/functions/acousticProxy?path=/api/v1/similarity/moods?recording_ids=${mbid}&n_neighbours=${limit}&remove_dups=all`
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
