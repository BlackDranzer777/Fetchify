// src/services/recommendationService.js
import { 
  getMBIDFromISRC, 
  getSimilarMBIDs, 
  extractFeatures 
} from '../api/musicAnalysis';
import { getTrackById } from '../api/spotify';
import { calculateSimilarityScore, calculateCustomSimilarity } from '../utils/similarityUtils';

export class RecommendationService {
  constructor(token, currentTrack) {
    this.token = token;
    this.currentTrack = currentTrack;
  }

  // Main recommendation function
  async findRecommendations(tuneData = null) {
    const isCustomMode = tuneData?.hasUserChanges || false;
    const userPreferences = tuneData?.values;
    
    console.log(isCustomMode ? "Custom mode: Finding songs based on custom settings..." : "Finding songs similar to current track...");
    
    if (isCustomMode) {
      return await this.findSongsByAudioFeatures(userPreferences);
    } else {
      return await this.findSongsBySimilarity();
    }
  }

  // Custom search: Find songs directly by audio features
  async findSongsByAudioFeatures(userPreferences) {
    console.log("Searching by audio features:", userPreferences);
    
    const scoredCandidates = [];
    const seenTracks = new Set();
    
    const searchGenres = userPreferences.genres && userPreferences.genres.length > 0 
      ? userPreferences.genres 
      : ['pop'];
    
    // Search by genres
    for (const genre of searchGenres) {
      console.log(`Searching Spotify for ${genre} tracks...`);
      
      try {
        const tracks = await this.searchSpotifyByGenre(genre);
        
        for (const track of tracks) {
          if (scoredCandidates.length >= 5) break;
          
          const result = await this.processCustomTrack(track, userPreferences, seenTracks);
          if (result) {
            scoredCandidates.push(result);
          }
        }
        
        if (scoredCandidates.length >= 5) break;
        
      } catch (err) {
        console.warn(`Error searching genre ${genre}:`, err.message);
      }
    }
    
    // Expand search if needed
    if (scoredCandidates.length < 3) {
      const expandedResults = await this.expandedCustomSearch(userPreferences, seenTracks);
      scoredCandidates.push(...expandedResults);
    }
    
    return this.sortAndLimitResults(scoredCandidates, 5);
  }

  // Original similarity-based search
  async findSongsBySimilarity() {
    // Get current track details
    const isrc = this.currentTrack.external_ids?.isrc ||
      (await getTrackById(this.token.access_token, this.currentTrack.id)).external_ids.isrc;

    console.log("Finding similar songs for:", this.currentTrack.name);

    const mbid = await getMBIDFromISRC(isrc);
    if (!mbid) {
      throw new Error("No MBID found for current track");
    }

    const currentFeat = await extractFeatures(mbid);
    if (!currentFeat) {
      throw new Error("No features found for current track");
    }

    console.log("Current track features:", {
      dance: currentFeat.dance?.toFixed(3),
      energy: currentFeat.energy?.toFixed(3),
      valence: currentFeat.valence?.toFixed(3),
      tempo: currentFeat.tempo,
      genre: currentFeat.genre,
      hasLyrics: currentFeat.hasLyrics
    });

    // Get similarity candidates
    const sim = await getSimilarMBIDs(mbid, 200);
    const candidates = (sim?.[mbid]?.[0] || []).filter(
      (c) => c.recording_mbid && c.recording_mbid !== mbid
    );

    console.log("Got", candidates.length, "similarity candidates");

    const scoredCandidates = [];
    const seenTracks = new Set();

    // Process candidates in batches
    await this.processSimilarityCandidates(candidates, currentFeat, scoredCandidates, seenTracks);

    return this.sortAndLimitResults(scoredCandidates, 5);
  }

  // Helper method to search Spotify by genre
  async searchSpotifyByGenre(genre) {
    const genreQuery = `genre:${genre}`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(genreQuery)}&type=track&limit=50&market=US`,
      { headers: { Authorization: `Bearer ${this.token.access_token}` } }
    );
    
    if (!res.ok) {
      throw new Error(`Spotify search failed for genre ${genre}: ${res.status}`);
    }
    
    const data = await res.json();
    return data.tracks?.items || [];
  }

  // Helper method to process a single custom track
  async processCustomTrack(track, userPreferences, seenTracks) {
    const trackKey = `${track.name.toLowerCase().trim()}-${track.artists[0].name.toLowerCase().trim()}`;
    if (seenTracks.has(trackKey) || track.id === this.currentTrack.id) return null;
    
    try {
      await new Promise(r => setTimeout(r, 800)); // Rate limit
      
      const isrc = track.external_ids?.isrc;
      if (!isrc) return null;
      
      const mbid = await getMBIDFromISRC(isrc);
      if (!mbid) return null;
      
      const features = await extractFeatures(mbid);
      if (!features) return null;
      
      const similarity = calculateCustomSimilarity(features, userPreferences);
      
      if (similarity > 0.4) {
        seenTracks.add(trackKey);
        console.log(`Added custom match: ${track.name} by ${track.artists[0].name} (similarity: ${similarity.toFixed(3)})`);
        
        return {
          ...track,
          similarity: similarity.toFixed(3),
          features: features
        };
      }
      
    } catch (err) {
      console.warn(`Error processing track ${track.name}:`, err.message);
    }
    
    return null;
  }

  // Helper method for expanded custom search
  async expandedCustomSearch(userPreferences, seenTracks) {
    console.log("Expanding search with broader terms...");
    
    const tempoRange = userPreferences.tempo > 120 ? "fast" : "slow";
    const energyRange = userPreferences.energy > 0.6 ? "energetic" : "chill";
    const broadQuery = `${tempoRange} ${energyRange}`;
    
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(broadQuery)}&type=track&limit=30&market=US`,
        { headers: { Authorization: `Bearer ${this.token.access_token}` } }
      );
      
      if (!res.ok) return [];
      
      const data = await res.json();
      const tracks = data.tracks?.items || [];
      const results = [];
      
      for (const track of tracks) {
        if (results.length >= 5) break;
        
        const result = await this.processCustomTrack(track, userPreferences, seenTracks);
        if (result && result.similarity > 0.3) { // More lenient for broad search
          results.push(result);
        }
      }
      
      return results;
      
    } catch (err) {
      console.warn("Broad search failed:", err.message);
      return [];
    }
  }

  // Helper method to process similarity candidates in batches
  async processSimilarityCandidates(candidates, currentFeat, scoredCandidates, seenTracks) {
    let candidateIndex = 0;
    
    const processBatch = async (startIndex, batchSize) => {
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

          const spTrack = await this.searchSpotifyForTrack(feat.title, feat.artist);
          if (spTrack) {
            const trackKey = `${spTrack.name.toLowerCase().trim()}-${spTrack.artists[0].name.toLowerCase().trim()}`;
            
            if (!seenTracks.has(trackKey) && spTrack.id !== this.currentTrack.id) {
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
        } catch (err) {
          console.warn("Skipping candidate:", c.recording_mbid, err.message);
        }
      }
      
      return endIndex;
    };

    // Process in batches
    candidateIndex = await processBatch(0, 15);
    if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
      candidateIndex = await processBatch(candidateIndex, 10);
    }
    if (scoredCandidates.length < 5 && candidateIndex < candidates.length) {
      await processBatch(candidateIndex, 10);
    }
  }

  // Helper method to search Spotify for a specific track
  async searchSpotifyForTrack(title, artist) {
    const query = `track:"${title}" artist:"${artist}"`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${this.token.access_token}` } }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const spTrack = data.tracks?.items?.[0];
    
    // Validate track structure
    if (spTrack && 
        typeof spTrack.id === 'string' && 
        typeof spTrack.name === 'string' && 
        Array.isArray(spTrack.artists) && 
        spTrack.artists.length > 0 &&
        spTrack.artists[0].name &&
        spTrack.external_urls &&
        spTrack.external_urls.spotify) {
      return spTrack;
    }
    
    return null;
  }

  // Helper method to sort and limit results
  sortAndLimitResults(candidates, limit) {
    return candidates
      .filter(track => track && track.id && track.name && track.artists)
      .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
      .slice(0, limit);
  }
}