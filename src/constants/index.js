// src/constants/index.js

// Similarity calculation weights
export const SIMILARITY_WEIGHTS = {
  TRACK_TO_TRACK: {
    dance: 0.20,
    energy: 0.20, 
    valence: 0.15,
    flux: 0.10,
    tempo: 0.10,
    genre: 0.25
  },
  CUSTOM_PREFERENCES: {
    dance: 0.30,
    energy: 0.30, 
    valence: 0.25,
    tempo: 0.15
  }
};

// Genre groupings for similarity calculations
export const GENRE_GROUPS = {
  electronic: ['electronic', 'dance'],
  rock: ['rock', 'indie'],
  urban: ['hip-hop'],
  mellow: ['jazz', 'pop']
};

// Search configuration
export const SEARCH_CONFIG = {
  SIMILARITY_CANDIDATES: 200,
  SPOTIFY_SEARCH_LIMIT: 50,
  BROAD_SEARCH_LIMIT: 30,
  MAX_RECOMMENDATIONS: 5,
  RATE_LIMIT_DELAY: 1000,
  CUSTOM_RATE_LIMIT_DELAY: 800
};

// Similarity thresholds
export const SIMILARITY_THRESHOLDS = {
  BASIC: 0.3,
  CUSTOM_HIGH: 0.4,
  CUSTOM_BROAD: 0.3,
  TEMPO_TOLERANCE: 60,
  GENRE_MODERATE: 0.7,
  GENRE_LOW: 0.3
};

// Batch processing configuration
export const BATCH_CONFIG = {
  FIRST_BATCH: 15,
  SECOND_BATCH: 10,
  THIRD_BATCH: 10,
  FALLBACK_BATCH: 15
};

// Available genres for RadioUI
export const AVAILABLE_GENRES = [
  'pop', 'rock', 'jazz', 'hip-hop', 'dance', 'electronic', 'indie'
];

// Default values
export const DEFAULTS = {
  GENRE: 'pop',
  TEMPO: 120,
  DANCEABILITY: 0.7,
  ENERGY: 0.6,
  VALENCE: 0.5
};