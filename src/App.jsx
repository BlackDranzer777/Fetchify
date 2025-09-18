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
  getABLowLevel
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

    // Step 3: Get AB features for current track
    const currentHigh = await getABFeatures(mbid);
    const currentLow = await getABLowLevel(mbid);

    const currentFeat = {
      tempo: currentLow.rhythm?.bpm || 120,
      dance: currentHigh.highlevel?.danceability?.value === "danceable" ? currentHigh.highlevel?.danceability?.probability : 0,
      energy: currentHigh.highlevel?.energy?.value === "energetic" ? currentHigh.highlevel?.energy?.probability : 0,
      valence: currentHigh.highlevel?.mood_happy?.value === "happy" ? currentHigh.highlevel?.mood_happy?.probability : 0,
    };

    // Step 4: Get AB Similarity candidates
    const sim = await getSimilarMBIDs(mbid, 30); // get candidates
    const candidates = sim?.[mbid]?.[0] || [];
    console.log("Raw similarity candidates:", candidates);

    // Step 5: For each candidate, fetch features & compute similarity score
    const enriched = [];
    for (const c of candidates) {
      if (!c.recording_mbid) continue;

      try {
        const high = await getABFeatures(c.recording_mbid);
        const low = await getABLowLevel(c.recording_mbid);

        const feat = {
          tempo: low.rhythm?.bpm || 120,
          dance: high.highlevel?.danceability?.value === "danceable" ? high.highlevel?.danceability?.probability : 0,
          energy: high.highlevel?.energy?.value === "energetic" ? high.highlevel?.energy?.probability : 0,
          valence: high.highlevel?.mood_happy?.value === "happy" ? high.highlevel?.mood_happy?.probability : 0,
        };

        // simple distance function (closer = better)
        const tempoDiff = Math.abs(feat.tempo - currentFeat.tempo) / 200; // normalize
        const danceDiff = Math.abs(feat.dance - currentFeat.dance);
        const energyDiff = Math.abs(feat.energy - currentFeat.energy);
        const valenceDiff = Math.abs(feat.valence - currentFeat.valence);

        const similarityScore =
          1 - (0.4 * tempoDiff + 0.2 * danceDiff + 0.2 * energyDiff + 0.2 * valenceDiff);

        enriched.push({
          mbid: c.recording_mbid,
          distance: c.distance,
          similarityScore,
        });
      } catch (err) {
        console.warn("Skipping candidate:", c.recording_mbid, err);
      }
    }

    // Step 6: Sort by similarityScore
    const topCandidates = enriched
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 10);

    console.log("Re-ranked candidates:", topCandidates);

    // Step 7: Convert MBIDs -> Spotify Tracks
    const spotifyTracks = [];
    for (const c of topCandidates) {
      const spTrack = await mbidToSpotifyTrack(token.access_token, c.mbid);
      if (spTrack) {
        spotifyTracks.push({
          ...spTrack,
          similarityScore: c.similarityScore.toFixed(3),
        });
      }
    }

    setTracks(spotifyTracks);
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
