// src/utils/similarityUtils.js

// Calculate similarity between two tracks based on their features
export const calculateSimilarityScore = (feat1, feat2) => {
  const weights = {
    dance: 0.20,
    energy: 0.20, 
    valence: 0.15,
    flux: 0.10,
    tempo: 0.10,
    genre: 0.25
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

// Calculate similarity between candidate features and user preferences
export const calculateCustomSimilarity = (candidateFeatures, userPreferences) => {
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

// Calculate similarity between two genres
export const calculateGenreSimilarity = (genre1, genre2) => {
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