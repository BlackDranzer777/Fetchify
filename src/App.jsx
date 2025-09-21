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
              
              // Also get full features for genre
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
                currentGenre: currentFeat?.genre || 'pop'  // Pass current genre to RadioUI (now just a string)
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
      genre: 0.25  // Genre gets significant weight
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

    // Genre similarity
    if (feat1.genre && feat2.genre) {
      try {
        const genreSim = calculateGenreSimilarity(feat1.genre, feat2.genre);
        totalSim += genreSim * weights.genre;
        totalWeight += weights.genre;
      } catch (err) {
        console.warn("Error calculating genre similarity:", err);
        // Skip genre similarity if it fails
      }
    }

    return totalWeight > 0 ? totalSim / totalWeight : 0;
  };

  // Helper function for genre similarity - simplified for safety
  const calculateGenreSimilarity = (genre1, genre2) => {
    try {
      // Handle both string and object formats safely
      const g1 = typeof genre1 === 'string' ? genre1 : genre1?.primary || 'pop';
      const g2 = typeof genre2 === 'string' ? genre2 : genre2?.primary || 'pop';
      
      if (g1 === g2) return 1.0; // Perfect match
      
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
        if (genres.includes(g1)) group1 = groupName;
        if (genres.includes(g2)) group2 = groupName;
      }
      
      // Same group = moderate similarity
      if (group1 && group1 === group2) return 0.7;
      
      // Different groups = low similarity
      return 0.3;
    } catch (error) {
      console.warn("Genre similarity error:", error);
      return 0.5; // Neutral similarity if error
    }
  };

  // Create a custom similarity function for user-defined preferences
  const calculateCustomSimilarity = (candidateFeatures, userPreferences) => {
    const weights = {
      dance: 0.30,    // Higher weight for user preferences
      energy: 0.30, 
      valence: 0.25,
      tempo: 0.15
    };

    let totalSim = 0;
    let totalWeight = 0;

    // Danceability similarity
    if (candidateFeatures.dance !== undefined) {
      const diff = Math.abs(candidateFeatures.dance - userPreferences.danceability);
      totalSim += (1 - diff) * weights.dance;
      totalWeight += weights.dance;
    }
    
    // Energy similarity
    if (candidateFeatures.energy !== undefined) {
      const diff = Math.abs(candidateFeatures.energy - userPreferences.energy);
      totalSim += (1 - diff) * weights.energy;
      totalWeight += weights.energy;
    }
    
    // Valence similarity
    if (candidateFeatures.valence !== undefined) {
      const diff = Math.abs(candidateFeatures.valence - userPreferences.valence);
      totalSim += (1 - diff) * weights.valence;
      totalWeight += weights.valence;
    }
    
    // Tempo similarity
    if (candidateFeatures.tempo) {
      const diff = Math.abs(candidateFeatures.tempo - userPreferences.tempo);
      const tempoSim = Math.max(0, 1 - diff / 60); // 60 BPM tolerance
      totalSim += tempoSim * weights.tempo;
      totalWeight += weights.tempo;
    }

    return totalWeight > 0 ? totalSim / totalWeight : 0;
  };

  // IMPROVED Find Similar Songs Function - now handles custom preferences
  const handleFindSimilar = async (tuneData = null) => {
    if (!currentTrack) return;
    setLoading(true);
    
    // Check if user provided custom values or we should use original track features
    const isCustomMode = tuneData?.hasUserChanges || false;
    const userPreferences = tuneData?.values;
    
    console.log(isCustomMode ? "Custom mode: Finding songs based on custom settings..." : "Finding songs similar to current track...");
    
    // Clear previous results to prevent showing stale data if there's an error
    setTracks([]);

    try {
      if (isCustomMode) {
        // CUSTOM MODE: Search directly by audio features, not by similar tracks
        await findSongsByAudioFeatures(userPreferences);
      } else {
        // ORIGINAL MODE: Use similarity-based search
        await findSongsBySimilarity();
      }
    } catch (e) {
      console.error("Error fetching songs:", e);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  // Custom search: Find songs directly by audio features
  const findSongsByAudioFeatures = async (userPreferences) => {
    console.log("Searching by audio features:", userPreferences);
    
    const scoredCandidates = [];
    const seenTracks = new Set();
    
    // Search strategy: Use Spotify's genre-based search + audio feature filtering
    const searchGenres = userPreferences.genres && userPreferences.genres.length > 0 
      ? userPreferences.genres 
      : ['pop']; // Default to pop if no genres selected
    
    for (const genre of searchGenres) {
      console.log(`Searching Spotify for ${genre} tracks...`);
      
      try {
        // Search Spotify for tracks in this genre
        const genreQuery = `genre:${genre}`;
        const res = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(genreQuery)}&type=track&limit=50&market=US`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        
        if (!res.ok) {
          console.warn(`Spotify search failed for genre ${genre}:`, res.status);
          continue;
        }
        
        const data = await res.json();
        const tracks = data.tracks?.items || [];
        
        console.log(`Found ${tracks.length} tracks for genre: ${genre}`);
        
        // Process each track
        for (const track of tracks) {
          if (scoredCandidates.length >= 5) break; // Stop when we have enough
          
          // Skip duplicates and current track
          const trackKey = `${track.name.toLowerCase().trim()}-${track.artists[0].name.toLowerCase().trim()}`;
          if (seenTracks.has(trackKey) || track.id === currentTrack.id) continue;
          
          try {
            // Rate limit
            await new Promise(r => setTimeout(r, 800));
            
            // Get audio features for this track
            const isrc = track.external_ids?.isrc;
            if (!isrc) continue;
            
            const mbid = await getMBIDFromISRC(isrc);
            if (!mbid) continue;
            
            const features = await extractFeatures(mbid);
            if (!features) continue;
            
            // Calculate how well this matches user preferences
            const similarity = calculateCustomSimilarity(features, userPreferences);
            
            // More lenient threshold for custom search since we're searching broadly
            if (similarity > 0.4) {
              seenTracks.add(trackKey);
              scoredCandidates.push({
                ...track,
                similarity: similarity.toFixed(3),
                features: features
              });
              
              console.log(`Added custom match: ${track.name} by ${track.artists[0].name} (similarity: ${similarity.toFixed(3)})`);
            }
            
          } catch (err) {
            console.warn(`Error processing track ${track.name}:`, err.message);
          }
        }
        
        // Break if we have enough tracks
        if (scoredCandidates.length >= 5) break;
        
      } catch (err) {
        console.warn(`Error searching genre ${genre}:`, err.message);
      }
    }
    
    // If we still don't have enough tracks, expand search with broader terms
    if (scoredCandidates.length < 3) {
      console.log("Expanding search with broader terms...");
      
      // Try searching with tempo and energy ranges
      const tempoRange = userPreferences.tempo > 120 ? "fast" : "slow";
      const energyRange = userPreferences.energy > 0.6 ? "energetic" : "chill";
      
      try {
        const broadQuery = `${tempoRange} ${energyRange}`;
        const res = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(broadQuery)}&type=track&limit=30&market=US`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        
        if (res.ok) {
          const data = await res.json();
          const tracks = data.tracks?.items || [];
          
          for (const track of tracks) {
            if (scoredCandidates.length >= 5) break;
            
            const trackKey = `${track.name.toLowerCase().trim()}-${track.artists[0].name.toLowerCase().trim()}`;
            if (seenTracks.has(trackKey) || track.id === currentTrack.id) continue;
            
            try {
              await new Promise(r => setTimeout(r, 800));
              
              const isrc = track.external_ids?.isrc;
              if (!isrc) continue;
              
              const mbid = await getMBIDFromISRC(isrc);
              if (!mbid) continue;
              
              const features = await extractFeatures(mbid);
              if (!features) continue;
              
              const similarity = calculateCustomSimilarity(features, userPreferences);
              
              if (similarity > 0.3) { // Even more lenient for broad search
                seenTracks.add(trackKey);
                scoredCandidates.push({
                  ...track,
                  similarity: similarity.toFixed(3),
                  features: features
                });
                
                console.log(`Added broad match: ${track.name} (similarity: ${similarity.toFixed(3)})`);
              }
              
            } catch (err) {
              console.warn(`Error in broad search:`, err.message);
            }
          }
        }
      } catch (err) {
        console.warn("Broad search failed:", err.message);
      }
    }
    
    // Sort by similarity and return results
    const topMatches = scoredCandidates
      .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
      .slice(0, 5);
      
    console.log(`Custom search complete: Found ${topMatches.length} matching tracks`);
    setTracks(topMatches);
  };

  // Original similarity-based search
  const findSongsBySimilarity = async () => {
    // Step 1: Get ISRC
    const isrc =
      currentTrack.external_ids?.isrc ||
      (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;

    console.log("Finding similar songs for:", currentTrack.name);

    // Step 2: ISRC -> MBID
    const mbid = await getMBIDFromISRC(isrc);
    if (!mbid) {
      console.warn("No MBID found for ISRC:", isrc);
      setTracks([]);
      return;
    }

    // Step 3: Extract features for current song
    const currentFeat = await extractFeatures(mbid);
    if (!currentFeat) {
      console.warn("No features for current track");
      setTracks([]);
      return;
    }

    console.log("Current track features:", {
      dance: currentFeat.dance?.toFixed(3),
      energy: currentFeat.energy?.toFixed(3),
      valence: currentFeat.valence?.toFixed(3),
      tempo: currentFeat.tempo,
      genre: currentFeat.genre,
      hasLyrics: currentFeat.hasLyrics
    });

    // Step 4: Get similarity candidates
    const sim = await getSimilarMBIDs(mbid, 200);
    const candidates = (sim?.[mbid]?.[0] || []).filter(
      (c) => c.recording_mbid && c.recording_mbid !== mbid
    );

    console.log("Got", candidates.length, "similarity candidates");

    const scoredCandidates = [];
    const seenTracks = new Set();
    let candidateIndex = 0;
    
    // Helper function to process a batch of candidates
    const processCandidateBatch = async (startIndex, batchSize) => {
      const endIndex = Math.min(startIndex + batchSize, candidates.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        const c = candidates[i];
        
        try {
          await new Promise(r => setTimeout(r, 1000));

          const feat = await extractFeatures(c.recording_mbid);
          if (!feat || !feat.title || !feat.artist) continue;

          const similarity = calculateSimilarityScore(currentFeat, feat);
          
          const isReasonableMatch = 
            similarity > 0.3 &&
            Math.abs(feat.tempo - currentFeat.tempo) <= 60 &&
            !(currentFeat.hasLyrics && !feat.hasLyrics && similarity < 0.4);

          if (!isReasonableMatch) continue;

          const query = `track:"${feat.title}" artist:"${feat.artist}"`;
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${token.access_token}` } }
          );

          if (res.ok) {
            const data = await res.json();
            
            if (data && data.tracks && data.tracks.items && Array.isArray(data.tracks.items)) {
              const spTrack = data.tracks.items[0];
              
              if (spTrack && 
                  typeof spTrack.id === 'string' && 
                  typeof spTrack.name === 'string' && 
                  Array.isArray(spTrack.artists) && 
                  spTrack.artists.length > 0 &&
                  spTrack.artists[0].name &&
                  spTrack.external_urls &&
                  spTrack.external_urls.spotify) {
                
                const trackKey = `${spTrack.name.toLowerCase().trim()}-${spTrack.artists[0].name.toLowerCase().trim()}`;
                
                if (seenTracks.has(trackKey) || spTrack.id === currentTrack.id) continue;
                
                seenTracks.add(trackKey);
                
                scoredCandidates.push({
                  id: spTrack.id,
                  name: spTrack.name,
                  artists: spTrack.artists,
                  album: spTrack.album || { images: [] },
                  external_urls: spTrack.external_urls,
                  preview_url: spTrack.preview_url || null,
                  popularity: spTrack.popularity || 0,
                  similarity: similarity.toFixed(3),
                  features: feat
                });
                
                console.log(`Added track ${scoredCandidates.length}: ${spTrack.name} by ${spTrack.artists[0].name}`);
              }
            }
          }
        } catch (err) {
          console.warn("Skipping candidate:", c.recording_mbid, err.message);
        }
      }
      
      return endIndex;
    };

    // Process candidates in batches
    candidateIndex = await processCandidateBatch(0, 15);
    if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
      candidateIndex = await processCandidateBatch(candidateIndex, 10);
    }
    if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
      candidateIndex = await processCandidateBatch(candidateIndex, 10);
    }

    const topMatches = scoredCandidates
      .filter(track => track && track.id && track.name && track.artists)
      .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
      .slice(0, 5);

    console.log("Found", topMatches.length, "unique similar tracks");
    setTracks(topMatches);
  };

  // show login if no token yet
  if (!token) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h1>Fetchify</h1>
          <p>Retro-radio recommendations powered by Spotify.</p>
          <button onClick={loginWithPKCE} style={{
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
  }

  // show loader until track is detected
  if (waiting) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h2>Please play a song on Spotify to begin...</h2>
          <div style={{ marginTop: '20px', fontSize: '14px', opacity: 0.7 }}>
            Make sure Spotify is playing and try refreshing if needed
          </div>
        </div>
      </div>
    );
  }

  // main UI
  return (
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

        {/* Current Track Display */}
        {currentTrack && (
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
              src={currentTrack.album.images[0]?.url}
              alt={currentTrack.name}
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
              {currentTrack.name}
            </h2>
            <p style={{ 
              color: "#666", 
              fontSize: "16px",
              margin: 0
            }}>
              {currentTrack.artists.map((a) => a.name).join(", ")}
            </p>
          </div>
        )}

        {/* Radio UI */}
        <div style={{ marginBottom: "30px" }}>
          <RadioUI
            onTune={(data) => {
              console.log("onTune received in App.jsx:", data);
              handleFindSimilar(data);
            }}
            onSave={() => {}}
            loading={loading}
            defaultValues={features}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ 
          marginBottom: "30px", 
          display: "flex", 
          gap: "12px", 
          justifyContent: "center",
          flexWrap: "wrap"
        }}>
          <button 
            onClick={() => handleFindSimilar()}
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

        {/* Track List */}
        <TrackList tracks={tracks} />

        {/* Logout */}
        <div style={{ 
          textAlign: "center", 
          marginTop: "40px" 
        }}>
          <button 
            onClick={logout}
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
      </div>
    </div>
  );
}