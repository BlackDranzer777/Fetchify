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
  searchByISRC,
  searchByTitleArtist,
} from "./api/spotify";
import {
  getMBIDFromISRC,
  getABFeatures,
  getSimilarMBIDs,
  mbidToSpotifyTrack,
} from "./api/musicAnalysis";

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
              const ab = await getABFeatures(mbid);
              setFeatures({
                danceability: ab.highlevel?.danceability?.probability || 0.5,
                energy: ab.highlevel?.energy?.probability || 0.5,
                valence: ab.highlevel?.mood_happy?.probability || 0.5,
                tempo: ab.rhythm?.bpm || 120,
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

  // Fetch similar songs
  // const handleFindSimilar = async () => {
  //   if (!currentTrack) return;
  //   setLoading(true);
  //   try {
  //     const isrc =
  //       currentTrack.external_ids?.isrc ||
  //       (await getTrackById(token.access_token, currentTrack.id))
  //         .external_ids.isrc;

  //     const mbid = await getMBIDFromISRC(isrc);
  //     if (mbid) {
  //       const sim = await getSimilarMBIDs(mbid, 25);
  //       const similarMbids = Object.values(sim?.[mbid]?.["0"] || [])
  //       .map((arr) => {
  //         console.log("Similarity response:", sim); 
  //         return arr?.[0]
  //       })
  //       .filter((id) => id); // remove null/undefined


  //       const spotifyTracks = [];
  //       for (const id of similarMbids) {
  //         const spTrack = await mbidToSpotifyTrack(token.access_token, id);
  //         if (spTrack) spotifyTracks.push(spTrack);
  //       }
  //       setTracks(spotifyTracks);
  //     }
  //   } catch (e) {
  //     console.error("Error fetching similar songs:", e);
  //   } finally {
  //     setLoading(false);
  //   }
  // };


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

    // Step 3: Get AB Similarity
    const sim = await getSimilarMBIDs(mbid, 50); // get more candidates
    const candidates = sim?.[mbid]?.[0] || [];
    console.log("Similarity candidates:", candidates);

    // Step 4: Sort by AB distance (closest first)
    const sorted = candidates
      .filter((x) => x.recording_mbid)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10); // top 10 closest matches

    // Step 5: Convert MBIDs -> Spotify Tracks
    const spotifyTracks = [];
    for (const s of sorted) {
      const spTrack = await mbidToSpotifyTrack(
        token.access_token,
        s.recording_mbid
      );
      if (spTrack) {
        spotifyTracks.push({
          ...spTrack,
          abDistance: s.distance, // keep AB distance
        });
      }
    }

    if (!spotifyTracks.length) {
      console.warn("No Spotify tracks resolved from AB MBIDs");
      return;
    }

    // ✅ Directly set these tracks (skip popularity ranking)
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

        {/* Show currently playing */}
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

        {/* Radio UI with analysis features */}
        <RadioUI
          onTune={() => {}}
          onSave={() => {}}
          loading={loading}
          defaultValues={features}
        />

        {/* Similar songs button */}
        <button style={{ marginTop: "20px" }} onClick={handleFindSimilar}>
          Find Similar Songs
        </button>

        {/* Display TrackList */}
        <TrackList tracks={tracks} />

        <button style={{ marginTop: "20px" }} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
