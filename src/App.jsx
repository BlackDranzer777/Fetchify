import { useEffect, useState } from "react";
import RadioUI from "./components/RadioUI.jsx";
import TrackList from "./components/TrackList.jsx";
import {
  loginWithPKCE,
  handleCallback,
  getStoredToken,
  logout,
} from "./auth/spotifyAuth";
import { getRecommendations } from "./api/spotify";

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);

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

  // fetch profile + sample API calls once token is set
  useEffect(() => {
    if (!token) return;

    // fetch profile
    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(console.error);

    // fetch saved tracks (needs user-library-read)
    fetch("https://api.spotify.com/v1/me/tracks?limit=5", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
      .then((res) => {
        console.log("Saved tracks response:", res.status, res.statusText);
        return res.json();
      })
      .then((data) => console.log("Saved tracks:", data))
      .catch(console.error);

    // fetch audio analysis for a test track (needs user token, not client creds)
    fetch("https://api.spotify.com/v1/audio-analysis/11dFghVXANMlKmJXsNCbNl", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
      .then((res) => {
        console.log("Audio analysis response:", res.status, res.statusText);
        return res.json();
      })
      .then((data) => console.log("Audio analysis:", data))
      .catch(console.error);
  }, [token]);

  // fetch recommendations when tuning
  const handleTune = async (values) => {
    setLoading(true);
    try {
      const rec = await getRecommendations({
        seedGenres: values.genres,
        targets: {
          danceability: values.danceability,
          energy: values.energy,
          valence: values.valence,
          tempo: values.tempo,
        },
        limit: 15,
        market: "US",
      });
      setTracks(rec.tracks || []);
    } catch (e) {
      console.error("Error fetching recommendations:", e);
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
          {user ? `Hello, ${user.display_name} looking for new music?` : "Loading user..."}
        </h2>
        <RadioUI onTune={handleTune} onSave={() => {}} loading={loading} />
        <TrackList tracks={tracks} />
        <button style={{ marginTop: "20px" }} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
