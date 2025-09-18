import { useEffect, useState } from "react";
import RadioUI from "./components/RadioUI.jsx";
import TrackList from "./components/TrackList.jsx";
import {
  loginWithPKCE,
  handleCallback,
  getStoredToken,
  logout,
} from "./auth/spotifyAuth";
import {
  getCurrentlyPlaying,
  getTrackById,
} from "./api/spotify";
import {
  getMBIDFromISRC,
  getABFeatures,
  getSimilarMBIDs,
  mbidToSpotifyTrack,
  getABLowLevel,
  extractFeatures
} from "./api/musicAnalysis";


import { fuseFeatures } from "./lib/fuseFeatures";



export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [features, setFeatures] = useState(null); // for RadioUI
  const [tracks, setTracks] = useState([]); // similar songs
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(true); // loader until user plays

  // handle callback and restore stored token
  useEffect(() => {
    if (window.location.search.includes("code=")) {
      handleCallback()
        .then((t) => {
          setToken(t);
          window.history.replaceState({}, "", "/");
        })
        .catch(console.error);
    } else {
      setToken(getStoredToken());
    }
  }, []);

  // fetch profile once token is set
  useEffect(() => {
    if (!token) return;

    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(console.error);
  }, [token]);

  // Poll for currently playing track
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const now = await getCurrentlyPlaying(token.access_token);
        if (now?.item) {
          clearInterval(interval);
          setWaiting(false);
          setCurrentTrack(now.item);

          // Step 2: analysis
          const isrc =
            now.item.external_ids?.isrc ||
            (await getTrackById(token.access_token, now.item.id))
              .external_ids.isrc;

          if (isrc) {
            const mbid = await getMBIDFromISRC(isrc);
            if (mbid) {
              const abHigh = await getABFeatures(mbid);
              const abLow = await getABLowLevel(mbid);
              const fused = fuseFeatures(abHigh, abLow);

              // ✅ Log EVERYTHING
              console.log("=== HIGH LEVEL FEATURES ===");
              console.log("Danceability:", abHigh?.highlevel?.danceability);
              console.log("Energy:", abHigh?.highlevel?.energy);
              console.log("Mood Happy:", abHigh?.highlevel?.mood_happy);
              console.log("Mood Sad:", abHigh?.highlevel?.mood_sad);
              console.log("Genre:", abHigh?.highlevel?.genre_dortmund);

              console.log("=== LOW LEVEL FEATURES ===");
              console.log("Tempo:", abLow?.rhythm?.bpm);
              console.log("Beats Position:", abLow?.rhythm?.beats_position?.slice(0, 5));
              console.log("Key:", abLow?.tonal?.key_key, abLow?.tonal?.key_scale);
              console.log("Chords:", abLow?.tonal?.chords_key, abLow?.tonal?.chords_scale);
              console.log("Loudness:", abLow?.lowlevel?.average_loudness);
              console.log("Spectral Flux:", abLow?.lowlevel?.spectral_flux?.mean);
              console.log("MFCC (first 5):", abLow?.lowlevel?.mfcc?.mean?.slice(0, 5));


              // Console: everything
              console.log("=== FUSED FEATURES ===");
              console.log("tempo :", fused.tempo);
              console.log("danceability :", fused.danceability, fused.debug);
              console.log("energy :", fused.energy, fused.debug);
              console.log("valence :", fused.valence, fused.debug);


              // ✅ Store some representative ones for UI
              // Feed RadioUI
              setFeatures({
                danceability: fused.danceability,
                energy: fused.energy,
                valence: fused.valence,
                tempo: Math.round(fused.tempo || 120),
              });
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 5000); // poll every 5s

    return () => clearInterval(interval);
  }, [token]);








  // Find Similar Songs
  const handleFindSimilar = async () => {
  if (!currentTrack) return;
  setLoading(true);

  try {
    // Step 1: Get ISRC
    const isrc =
      currentTrack.external_ids?.isrc ||
      (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;

    // Step 2: ISRC -> MBID
    const mbid = await getMBIDFromISRC(isrc);
    if (!mbid) {
      console.warn("No MBID found for ISRC:", isrc);
      return;
    }

    // Step 3: Extract features for current song
    const currentFeat = await extractFeatures(mbid);
    if (!currentFeat) {
      console.warn("No features for current track");
      return;
    }
    const currentFusion = currentFeat.fusion;

    // Step 4: Get AB Similarity (pool = 100)
    const sim = await getSimilarMBIDs(mbid, 100);
    const candidates = (sim?.[mbid]?.[0] || []).filter(
      (c) => c.recording_mbid && c.recording_mbid !== mbid // skip self
    );

    const validCandidates = [];

    for (const c of candidates) {
      if (validCandidates.length >= 2) break; // ✅ stop after 2

      try {
        // respect API rate limit
        await new Promise((r) => setTimeout(r, 1000));

        const feat = await extractFeatures(c.recording_mbid);
        if (!feat) continue;

        // tolerance checks
        const withinTolerance =
          Math.abs(feat.dance - currentFeat.dance) <= 0.3 &&
          Math.abs(feat.energy - currentFeat.energy) <= 0.3 &&
          Math.abs(feat.valence - currentFeat.valence) <= 0.3 &&
          Math.abs(feat.flux - currentFeat.flux) <= 0.3 &&
          Math.abs(feat.tempo - currentFeat.tempo) <= 40 &&
          feat.hasLyrics === currentFeat.hasLyrics &&
          feat.language === currentFeat.language;

        if (!withinTolerance) continue;

        const fusionDiff = Math.abs(feat.fusion - currentFusion);

        // search on Spotify by title + artist
        if (feat.title && feat.artist) {
          const query = `track:"${feat.title}" artist:"${feat.artist}"`;
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(
              query
            )}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          );

          if (res.ok) {
            const data = await res.json();
            const spTrack = data.tracks?.items?.[0];
            if (spTrack) {
              validCandidates.push({
                ...spTrack,
                fusionDiff: fusionDiff.toFixed(3),
              });
            }
          }
        }
      } catch (err) {
        console.warn("Skipping candidate:", c.recording_mbid, err);
      }
    }

    setTracks(validCandidates);
  } catch (e) {
    console.error("Error fetching similar songs:", e);
  } finally {
    setLoading(false);
  }
};

















  // show login if no token yet
  if (!token) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <div>
          <h1>Fetchify</h1>
          <p>Retro-radio recommendations powered by Spotify.</p>
          <button onClick={loginWithPKCE}>Login with Spotify</button>
        </div>
      </div>
    );
  }

  // show loader until track is detected
  if (waiting) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <h2>Please play a song on Spotify to begin…</h2>
      </div>
    );
  }

  // main UI
  return (
    <div
      className="appWrapper"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ maxWidth: 980, width: "100%", padding: "0 16px" }}>
        <h2 style={{ textAlign: "center" }}>
          {user ? `Hello, ${user.display_name}!` : "Loading user..."}
        </h2>

        {currentTrack && (
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img
              src={currentTrack.album.images[0]?.url}
              alt={currentTrack.name}
              style={{ width: "200px", borderRadius: "8px" }}
            />
            <h3>{currentTrack.name}</h3>
            <p>{currentTrack.artists.map((a) => a.name).join(", ")}</p>
          </div>
        )}

        <RadioUI
          onTune={() => {}}
          onSave={() => {}}
          loading={loading}
          defaultValues={features}
        />

        <button style={{ marginTop: "20px" }} onClick={handleFindSimilar}>
          Find Similar Songs
        </button>

        <TrackList tracks={tracks} />

        <button style={{ marginTop: "20px" }} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}










