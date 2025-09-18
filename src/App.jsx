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
              
              // ✅ Also get full features for genre
              const currentFeat = await extractFeatures(mbid);

              // Log EVERYTHING
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

              // Store some representative ones for UI
              // Feed RadioUI
              setFeatures({
                danceability: fused.danceability,
                energy: fused.energy,
                valence: fused.valence,
                tempo: Math.round(fused.tempo || 120),
                currentGenre: currentFeat?.genre || 'pop'  // ✅ Pass current genre to RadioUI
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

  // Helper function for similarity calculation
  const calculateSimilarityScore = (feat1, feat2) => {
    const weights = {
      dance: 0.20,
      energy: 0.20, 
      valence: 0.15,
      flux: 0.10,
      tempo: 0.10,
      genre: 0.25  // ✅ Genre gets significant weight
    };

    let totalSim = 0;
    let totalWeight = 0;

    // Feature similarities
    if (feat1.dance !== undefined && feat2.dance !== undefined) {
      totalSim += (1 - Math.abs(feat1.dance - feat2.dance)) * weights.dance;
      totalWeight += weights.dance;
    }
    
    if (feat1.energy !== undefined && feat2.energy !== undefined) {
      totalSim += (1 - Math.abs(feat1.energy - feat2.energy)) * weights.energy;
      totalWeight += weights.energy;
    }
    
    if (feat1.valence !== undefined && feat2.valence !== undefined) {
      totalSim += (1 - Math.abs(feat1.valence - feat2.valence)) * weights.valence;
      totalWeight += weights.valence;
    }
    
    if (feat1.flux !== undefined && feat2.flux !== undefined) {
      // Normalize flux differences (usually 0-0.5 range)
      const fluxSim = 1 - Math.min(Math.abs(feat1.flux - feat2.flux) / 0.5, 1);
      totalSim += fluxSim * weights.flux;
      totalWeight += weights.flux;
    }
    
    if (feat1.tempo && feat2.tempo) {
      // Tempo similarity with harmonic relationships (double/half time)
      const tempos1 = [feat1.tempo, feat1.tempo * 2, feat1.tempo / 2];
      const tempos2 = [feat2.tempo, feat2.tempo * 2, feat2.tempo / 2];
      
      let bestTempoSim = 0;
      for (const t1 of tempos1) {
        for (const t2 of tempos2) {
          const diff = Math.abs(t1 - t2);
          const sim = Math.max(0, 1 - diff / 80); // 80 BPM tolerance
          bestTempoSim = Math.max(bestTempoSim, sim);
        }
      }
      
      totalSim += bestTempoSim * weights.tempo;
      totalWeight += weights.tempo;
    }

    // ✅ Genre similarity
    if (feat1.genre && feat2.genre) {
      const genreSim = calculateGenreSimilarity(feat1.genre, feat2.genre);
      totalSim += genreSim * weights.genre;
      totalWeight += weights.genre;
    }

    return totalWeight > 0 ? totalSim / totalWeight : 0;
  };

  // Helper function for genre similarity
  const calculateGenreSimilarity = (genre1, genre2) => {
    if (genre1 === genre2) return 1.0; // Perfect match
    
    // Define genre relationships
    const genreGroups = {
      electronic: ['electronic', 'dance'],
      rock: ['rock', 'indie'],
      urban: ['hip-hop'],
      mellow: ['jazz', 'pop']
    };
    
    // Find which group each genre belongs to
    let group1 = null, group2 = null;
    for (const [groupName, genres] of Object.entries(genreGroups)) {
      if (genres.includes(genre1)) group1 = groupName;
      if (genres.includes(genre2)) group2 = groupName;
    }
    
    // Same group = moderate similarity
    if (group1 && group1 === group2) return 0.7;
    
    // Different groups = low similarity
    return 0.3;
  };

  // IMPROVED Find Similar Songs Function
  const handleFindSimilar = async () => {
    if (!currentTrack) return;
    setLoading(true);

    try {
      // Step 1: Get ISRC
      const isrc =
        currentTrack.external_ids?.isrc ||
        (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;

      console.log("🎵 Finding similar songs for:", currentTrack.name);

      // Step 2: ISRC -> MBID
      const mbid = await getMBIDFromISRC(isrc);
      if (!mbid) {
        console.warn("❌ No MBID found for ISRC:", isrc);
        setTracks([]);
        return;
      }

      // Step 3: Extract features for current song
      const currentFeat = await extractFeatures(mbid);
      if (!currentFeat) {
        console.warn("❌ No features for current track");
        setTracks([]);
        return;
      }

      console.log("🎯 Current track features:", {
        dance: currentFeat.dance?.toFixed(3),
        energy: currentFeat.energy?.toFixed(3),
        valence: currentFeat.valence?.toFixed(3),
        tempo: currentFeat.tempo,
        genre: currentFeat.genre,  // ✅ Show genre
        hasLyrics: currentFeat.hasLyrics
      });

      // Step 4: Get MORE similarity candidates (increase from 100 to 200)
      const sim = await getSimilarMBIDs(mbid, 200);
      const candidates = (sim?.[mbid]?.[0] || []).filter(
        (c) => c.recording_mbid && c.recording_mbid !== mbid
      );

      console.log("🔍 Got", candidates.length, "similarity candidates");

      const scoredCandidates = [];

      // Step 5: Process MORE candidates (increase limit to 20)
      for (let i = 0; i < Math.min(candidates.length, 20); i++) {
        const c = candidates[i];
        
        try {
          // Rate limit delay
          await new Promise(r => setTimeout(r, 1000));

          const feat = await extractFeatures(c.recording_mbid);
          if (!feat || !feat.title || !feat.artist) continue;

          // Calculate similarity score (0-1, higher = more similar)
          const similarity = calculateSimilarityScore(currentFeat, feat);
          
          // More flexible filtering (only filter out obvious mismatches)
          const isReasonableMatch = 
            similarity > 0.3 && // Basic similarity threshold
            Math.abs(feat.tempo - currentFeat.tempo) <= 60 && // Looser tempo
            !(currentFeat.hasLyrics && !feat.hasLyrics && similarity < 0.4); // More lenient vocal/instrumental mixing

          if (!isReasonableMatch) continue;

          // Try to find on Spotify
          const query = `track:"${feat.title}" artist:"${feat.artist}"`;
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          );

          if (res.ok) {
            const data = await res.json();
            const spTrack = data.tracks?.items?.[0];
            if (spTrack) {
              scoredCandidates.push({
                ...spTrack,
                similarity: similarity.toFixed(3),
                features: feat
              });
            }
          }
        } catch (err) {
          console.warn("⚠️ Skipping candidate:", c.recording_mbid, err.message);
        }
      }

      // Step 6: Sort by similarity and return top matches
      const topMatches = scoredCandidates
        .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
        .slice(0, 10);

      console.log("🎊 Found", topMatches.length, "similar tracks:");
      topMatches.forEach(track => {
        console.log(`  ${track.similarity} - ${track.name} by ${track.artists[0].name}`);
      });

      setTracks(topMatches);

    } catch (e) {
      console.error("❌ Error fetching similar songs:", e);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  // DEBUG FUNCTION - Remove this later
  const debugCurrentTrack = async () => {
    if (!currentTrack || !token) {
      console.log("❌ No current track or token");
      return;
    }

    console.log("🐛 DEBUGGING CURRENT TRACK 🐛");
    console.log("Track:", currentTrack.name, "by", currentTrack.artists[0].name);
    
    // Get ISRC
    const isrc = currentTrack.external_ids?.isrc || 
      (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;
    console.log("ISRC:", isrc);
    
    // Get MBID
    const mbid = await getMBIDFromISRC(isrc);
    console.log("MBID:", mbid);
    
    if (!mbid) {
      console.log("❌ No MBID found - this explains why recommendations fail!");
      return;
    }
    
    // Get features
    const features = await extractFeatures(mbid);
    console.log("Features:", features);
    
    // Get similarity candidates  
    const sim = await getSimilarMBIDs(mbid, 50);
    const candidates = sim?.[mbid]?.[0] || [];
    console.log("Similarity candidates:", candidates.length);
    
    // Test a few candidates
    if (candidates.length > 0) {
      console.log("Testing first 3 candidates:");
      for (let i = 0; i < Math.min(3, candidates.length); i++) {
        const c = candidates[i];
        try {
          const feat = await extractFeatures(c.recording_mbid);
          console.log(`Candidate ${i+1}:`, {
            mbid: c.recording_mbid,
            title: feat?.title,
            artist: feat?.artist,
            dance: feat?.dance?.toFixed(3),
            energy: feat?.energy?.toFixed(3),
            valence: feat?.valence?.toFixed(3)
          });
          await new Promise(r => setTimeout(r, 1000)); // Rate limit
        } catch (err) {
          console.log(`Candidate ${i+1} failed:`, err.message);
        }
      }
    }
    
    return { isrc, mbid, features, candidateCount: candidates.length };
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

        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={handleFindSimilar}>
            Find Similar Songs
          </button>
          
          {/* DEBUG BUTTON - Remove this later */}
          <button 
            onClick={debugCurrentTrack}
            style={{ 
              backgroundColor: "#ff6b6b", 
              color: "white", 
              border: "none", 
              padding: "8px 12px", 
              borderRadius: "4px" 
            }}
          >
            🐛 Debug Track
          </button>
        </div>

        <TrackList tracks={tracks} />

        <button style={{ marginTop: "20px" }} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}