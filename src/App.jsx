// src/App.jsx
import { useEffect, useState } from "react";
import RadioUI from "./components/RadioUI.jsx";
import TrackList from "./components/TrackList.jsx";
import {
  loginWithPKCE,
  handleCallback,
  getStoredToken,
  logout,
} from "./auth/spotifyAuth";
import { getCurrentlyPlaying } from "./api/spotify";
import { useTrackAnalysis } from "./hooks/useTrackAnalysis";
import { RecommendationService } from "./services/recommendationService";

export default function App() {
  // Core state
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [tracks, setTracks] = useState([]); // recommended songs
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(true); // loader until user plays

  // Custom hooks
  const { features, loading: analysisLoading } = useTrackAnalysis(token, currentTrack);

  // Authentication effects
  useEffect(() => {
    handleAuthentication();
  }, []);

  useEffect(() => {
    if (token) {
      fetchUserProfile();
    }
  }, [token]);

  // Track polling effect
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const now = await getCurrentlyPlaying(token.access_token);
        if (now?.item) {
          clearInterval(interval);
          setWaiting(false);
          setCurrentTrack(now.item);
        }
      } catch (err) {
        console.error("Error polling for track:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token]);

  // Authentication handlers
  const handleAuthentication = () => {
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
  };

  const fetchUserProfile = async () => {
    try {
      const res = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
  };

  // Recommendation handlers
  const handleFindSimilar = async (tuneData = null) => {
    if (!currentTrack || !token) return;
    
    setLoading(true);
    setTracks([]);

    try {
      const recommendationService = new RecommendationService(token, currentTrack);
      const results = await recommendationService.findRecommendations(tuneData);
      setTracks(results);
      
      console.log(`Found ${results.length} recommendations`);
    } catch (err) {
      console.error("Error finding recommendations:", err);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  // Render states
  if (!token) {
    return <LoginScreen onLogin={loginWithPKCE} />;
  }

  if (waiting) {
    return <WaitingScreen />;
  }

  return (
    <MainInterface
      user={user}
      currentTrack={currentTrack}
      features={features}
      tracks={tracks}
      loading={loading}
      onFindSimilar={handleFindSimilar}
      onLogout={logout}
    />
  );
}

// Component for login screen
const LoginScreen = ({ onLogin }) => (
  <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Fetchify</h1>
      <p>Retro-radio recommendations powered by Spotify.</p>
      <button onClick={onLogin} style={{
        padding: '12px 24px',
        fontSize: '16px',
        backgroundColor: '#1DB954',
        color: 'white',
        border: 'none',
        borderRadius: '24px',
        cursor: 'pointer'
      }}>
        Login with Spotify
      </button>
    </div>
  </div>
);

// Component for waiting screen
const WaitingScreen = () => (
  <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h2>Please play a song on Spotify to begin...</h2>
      <div style={{ marginTop: '20px', fontSize: '14px', opacity: 0.7 }}>
        Make sure Spotify is playing and try refreshing if needed
      </div>
    </div>
  </div>
);

// Component for current track display
const CurrentTrackDisplay = ({ track }) => (
  <div style={{ 
    textAlign: "center", 
    marginBottom: "30px",
    padding: "20px",
    backgroundColor: "white",
    borderRadius: "16px",
    border: "3px solid #111",
    boxShadow: "6px 8px 0 #111"
  }}>
    <img
      src={track.album.images[0]?.url}
      alt={track.name}
      style={{ 
        width: "160px", 
        height: "160px",
        borderRadius: "12px",
        border: "3px solid #111",
        marginBottom: "16px"
      }}
    />
    <h2 style={{ 
      fontWeight: 800, 
      margin: "0 0 8px 0",
      fontSize: "20px"
    }}>
      {track.name}
    </h2>
    <p style={{ 
      color: "#666", 
      fontSize: "16px",
      margin: 0
    }}>
      {track.artists.map((a) => a.name).join(", ")}
    </p>
  </div>
);

// Component for action buttons
const ActionButtons = ({ onFindSimilar, loading }) => (
  <div style={{ 
    marginBottom: "30px", 
    display: "flex", 
    gap: "12px", 
    justifyContent: "center",
    flexWrap: "wrap"
  }}>
    <button 
      onClick={() => onFindSimilar()}
      disabled={loading}
      style={{
        padding: "12px 24px",
        fontSize: "16px",
        fontWeight: 700,
        backgroundColor: loading ? "#ccc" : "#F26B1D",
        color: "white",
        border: "3px solid #111",
        borderRadius: "12px",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "4px 5px 0 #111"
      }}
    >
      {loading ? "Finding..." : "Find Similar Songs"}
    </button>
  </div>
);

// Main interface component
const MainInterface = ({ 
  user, 
  currentTrack, 
  features, 
  tracks, 
  loading, 
  onFindSimilar, 
  onLogout 
}) => (
  <div style={{
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "20px 0",
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
    boxSizing: "border-box"
  }}>
    <div style={{ 
      maxWidth: 1000, 
      width: "100%", 
      margin: "0 auto",
      padding: "0 16px",
      boxSizing: "border-box"
    }}>
      {/* Header */}
      <Header user={user} />

      {/* Current Track Display */}
      {currentTrack && <CurrentTrackDisplay track={currentTrack} />}

      {/* Radio UI */}
      <div style={{ marginBottom: "30px" }}>
        <RadioUI
          onTune={(data) => {
            console.log("onTune received in App.jsx:", data);
            onFindSimilar(data);
          }}
          onSave={() => {}}
          loading={loading}
          defaultValues={features}
        />
      </div>

      {/* Action Buttons */}
      <ActionButtons onFindSimilar={onFindSimilar} loading={loading} />

      {/* Track List */}
      <TrackList tracks={tracks} />

      {/* Logout */}
      <LogoutButton onLogout={onLogout} />
    </div>
  </div>
);

// Header component
const Header = ({ user }) => (
  <div style={{ 
    textAlign: "center", 
    marginBottom: "30px" 
  }}>
    <h1 style={{ 
      fontSize: '2.5em', 
      fontWeight: 800, 
      margin: '0 0 10px 0',
      color: '#111'
    }}>
      Fetchify
    </h1>
    <p style={{ 
      fontSize: '16px', 
      color: '#666', 
      margin: 0 
    }}>
      {user ? `Hello, ${user.display_name}!` : "Loading user..."}
    </p>
  </div>
);

// Logout button component
const LogoutButton = ({ onLogout }) => (
  <div style={{ 
    textAlign: "center", 
    marginTop: "40px" 
  }}>
    <button 
      onClick={onLogout}
      style={{
        padding: "10px 20px",
        fontSize: "14px",
        backgroundColor: "transparent",
        color: "#666",
        border: "2px solid #ccc",
        borderRadius: "8px",
        cursor: "pointer"
      }}
    >
      Logout
    </button>
  </div>
);