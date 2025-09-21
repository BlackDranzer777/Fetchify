// src/hooks/useTrackAnalysis.js
import { useState, useEffect } from 'react';
import { 
  getMBIDFromISRC, 
  getABFeatures, 
  getABLowLevel, 
  extractFeatures 
} from '../api/musicAnalysis';
import { getTrackById } from '../api/spotify';
import { fuseFeatures } from '../lib/fuseFeatures';

export const useTrackAnalysis = (token, currentTrack) => {
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token || !currentTrack) return;

    analyzeTrack();
  }, [token, currentTrack]);

  const analyzeTrack = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get ISRC
      const isrc = currentTrack.external_ids?.isrc ||
        (await getTrackById(token.access_token, currentTrack.id)).external_ids.isrc;

      if (!isrc) {
        throw new Error('No ISRC found for track');
      }

      // Get MBID
      const mbid = await getMBIDFromISRC(isrc);
      if (!mbid) {
        throw new Error('No MBID found for ISRC');
      }

      // Get features
      const [abHigh, abLow, currentFeat] = await Promise.all([
        getABFeatures(mbid),
        getABLowLevel(mbid),
        extractFeatures(mbid)
      ]);

      if (!abHigh || !abLow) {
        throw new Error('Could not fetch AcousticBrainz features');
      }

      // Fuse features
      const fused = fuseFeatures(abHigh, abLow);

      // Log analysis results
      logFeatureAnalysis(abHigh, abLow, fused);

      // Set features for RadioUI
      setFeatures({
        danceability: fused.danceability,
        energy: fused.energy,
        valence: fused.valence,
        tempo: Math.round(fused.tempo || 120),
        currentGenre: currentFeat?.genre || 'pop'
      });

    } catch (err) {
      console.error('Track analysis error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logFeatureAnalysis = (abHigh, abLow, fused) => {
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

    console.log("=== FUSED FEATURES ===");
    console.log("tempo :", fused.tempo);
    console.log("danceability :", fused.danceability, fused.debug);
    console.log("energy :", fused.energy, fused.debug);
    console.log("valence :", fused.valence, fused.debug);
  };

  return {
    features,
    loading,
    error,
    analyzeTrack
  };
};