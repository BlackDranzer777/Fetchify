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



  // IMPROVED Find Similar Songs Function
  const handleFindSimilar = async () => {
    if (!currentTrack) return;
    setLoading(true);
    
    // Clear previous results to prevent showing stale data if there's an error
    setTracks([]);

    try {
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
        genre: currentFeat.genre,  // Show genre (now just a string)
        hasLyrics: currentFeat.hasLyrics
      });

      // Step 4: Get MORE similarity candidates (increase from 100 to 200)
      const sim = await getSimilarMBIDs(mbid, 200);
      const candidates = (sim?.[mbid]?.[0] || []).filter(
        (c) => c.recording_mbid && c.recording_mbid !== mbid
      );

      console.log("Got", candidates.length, "similarity candidates");

      const scoredCandidates = [];
      const seenTracks = new Set(); // Track seen combinations to prevent duplicates
      let candidateIndex = 0;
      
      // Helper function to process a batch of candidates
      const processCandidateBatch = async (startIndex, batchSize) => {
        const endIndex = Math.min(startIndex + batchSize, candidates.length);
        
        for (let i = startIndex; i < endIndex; i++) {
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
              
              // Add comprehensive validation for Spotify track data
              if (data && data.tracks && data.tracks.items && Array.isArray(data.tracks.items)) {
                const spTrack = data.tracks.items[0];
                
                // Validate all required properties
                if (spTrack && 
                    typeof spTrack.id === 'string' && 
                    typeof spTrack.name === 'string' && 
                    Array.isArray(spTrack.artists) && 
                    spTrack.artists.length > 0 &&
                    spTrack.artists[0].name &&
                    spTrack.external_urls &&
                    spTrack.external_urls.spotify) {
                  
                  // Create unique identifier for duplicate detection
                  const trackKey = `${spTrack.name.toLowerCase().trim()}-${spTrack.artists[0].name.toLowerCase().trim()}`;
                  
                  // Skip if we've already seen this track
                  if (seenTracks.has(trackKey)) {
                    console.log(`Skipping duplicate: ${spTrack.name} by ${spTrack.artists[0].name}`);
                    continue;
                  }
                  
                  // Skip if this is the same as current track
                  if (spTrack.id === currentTrack.id) {
                    console.log(`Skipping current track: ${spTrack.name}`);
                    continue;
                  }
                  
                  // Add to seen tracks
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
                  
                  console.log(`Added track ${scoredCandidates.length}: ${spTrack.name} by ${spTrack.artists[0].name} (similarity: ${similarity.toFixed(3)})`);
                  
                } else {
                  console.warn("Invalid Spotify track structure:", spTrack);
                }
              } else {
                console.warn("Invalid Spotify search response:", data);
              }
            } else {
              console.warn("Spotify search failed:", res.status, res.statusText);
            }
          } catch (err) {
            console.warn("Skipping candidate:", c.recording_mbid, err.message);
          }
        }
        
        return endIndex; // Return where we stopped
      };

      // Step 5: Process candidates in batches until we have 5 unique songs
      console.log("Starting recommendation search...");
      
      // First batch - process 15 candidates
      candidateIndex = await processCandidateBatch(0, 15);
      console.log(`After batch 1: Found ${scoredCandidates.length} tracks`);
      
      // If we don't have 5 tracks, process more batches
      if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
        console.log(`Need more tracks. Processing additional candidates...`);
        
        // Second batch - process 10 more
        candidateIndex = await processCandidateBatch(candidateIndex, 10);
        console.log(`After batch 2: Found ${scoredCandidates.length} tracks`);
      }
      
      // If we still don't have 5 tracks, process more batches
      if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
        console.log(`Still need more tracks. Processing additional candidates...`);
        
        // Third batch - process 10 more
        candidateIndex = await processCandidateBatch(candidateIndex, 10);
        console.log(`After batch 3: Found ${scoredCandidates.length} tracks`);
      }
      
      // Final fallback - if we still don't have 5, lower the similarity threshold
      if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
        console.log(`Lowering similarity threshold to find more tracks...`);
        
        // Temporarily lower similarity threshold for remaining candidates
        const originalCalculateSimilarity = calculateSimilarityScore;
        const lowerThresholdCalculate = (feat1, feat2) => {
          const originalScore = originalCalculateSimilarity(feat1, feat2);
          return originalScore * 1.2; // Boost scores by 20% to pass the 0.3 threshold
        };
        
        // Save original function and use boosted version
        const tempCalculateFunc = calculateSimilarityScore;
        calculateSimilarityScore = lowerThresholdCalculate;
        
        // Process remaining candidates with lower threshold
        await processCandidateBatch(candidateIndex, 15);
        
        // Restore original function
        calculateSimilarityScore = tempCalculateFunc;
        
        console.log(`After lowered threshold: Found ${scoredCandidates.length} tracks`);
      }

      // Step 6: Sort by similarity and return top 5 matches
      const topMatches = scoredCandidates
        .filter(track => track && track.id && track.name && track.artists) // Filter out invalid tracks
        .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
        .slice(0, 5); // Limit to 5 recommendations

      console.log("Found", topMatches.length, "unique similar tracks:");
      topMatches.forEach((track, index) => {
        try {
          const artistName = track.artists?.[0]?.name || 'Unknown Artist';
          console.log(`  ${index + 1}. ${track.similarity} - ${track.name} by ${artistName}`);
        } catch (err) {
          console.warn(`Error logging track ${index}:`, err);
        }
      });

      // Final safety check before setting state
      try {
        setTracks(topMatches);
      } catch (err) {
        console.error("Error setting tracks state:", err);
        setTracks([]); // Set empty array as fallback
      }

    } catch (e) {
      console.error("Error fetching similar songs:", e);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  // DEBUG FUNCTION - Remove this later
  const debugCurrentTrack = async () => {
    if (!currentTrack || !token) {
      console.log("No current track or token");
      return;
    }

    console.log("DEBUGGING CURRENT TRACK");
    console.log("Track:", currentTrack.name, "by", currentTrack.artists[0].name);
    
    // Get ISRC
    const isrc = currentTrack.external_ids?.isrc || 
      (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;
    console.log("ISRC:", isrc);
    
    // Get MBID
    const mbid = await getMBIDFromISRC(isrc);
    console.log("MBID:", mbid);
    
    if (!mbid) {
      console.log("No MBID found - this explains why recommendations fail!");
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
            onTune={() => {}}
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
            onClick={handleFindSimilar}
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
          
          {/* DEBUG BUTTON - Remove this later */}
          <button 
            onClick={debugCurrentTrack}
            style={{ 
              padding: "8px 16px",
              fontSize: "14px",
              backgroundColor: "#ff6b6b", 
              color: "white", 
              border: "3px solid #111", 
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow: "3px 4px 0 #111"
            }}
          >
            Debug Track
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