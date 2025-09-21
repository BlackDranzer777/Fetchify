// src/utils/errorUtils.js

// Custom error classes for better error handling
export class RecommendationError extends Error {
  constructor(message, type = 'GENERAL') {
    super(message);
    this.name = 'RecommendationError';
    this.type = type;
  }
}

export class APIError extends Error {
  constructor(message, status, endpoint) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

// Error handling utilities
export const handleAPIError = (error, context = '') => {
  console.error(`API Error in ${context}:`, error);
  
  if (error.status === 429) {
    throw new APIError('Rate limit exceeded. Please try again later.', 429, context);
  }
  
  if (error.status >= 400 && error.status < 500) {
    throw new APIError('Client error occurred. Please check your request.', error.status, context);
  }
  
  if (error.status >= 500) {
    throw new APIError('Server error occurred. Please try again later.', error.status, context);
  }
  
  throw new APIError(error.message || 'Unknown API error', error.status, context);
};

export const handleRecommendationError = (error, operation = '') => {
  console.error(`Recommendation Error during ${operation}:`, error);
  
  if (error.message.includes('MBID')) {
    throw new RecommendationError('Track not found in music database', 'MBID_NOT_FOUND');
  }
  
  if (error.message.includes('features')) {
    throw new RecommendationError('Audio features not available for this track', 'FEATURES_NOT_FOUND');
  }
  
  if (error.message.includes('ISRC')) {
    throw new RecommendationError('Track identification failed', 'ISRC_NOT_FOUND');
  }
  
  throw new RecommendationError(error.message || 'Unknown recommendation error', 'GENERAL');
};

// Retry utility for failed API calls
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Validate track object structure
export const validateTrackStructure = (track) => {
  const requiredFields = ['id', 'name', 'artists', 'external_urls'];
  
  for (const field of requiredFields) {
    if (!track[field]) {
      throw new RecommendationError(`Invalid track structure: missing ${field}`, 'INVALID_TRACK');
    }
  }
  
  if (!Array.isArray(track.artists) || track.artists.length === 0) {
    throw new RecommendationError('Invalid track structure: no artists', 'INVALID_TRACK');
  }
  
  if (!track.artists[0].name) {
    throw new RecommendationError('Invalid track structure: missing artist name', 'INVALID_TRACK');
  }
  
  if (!track.external_urls.spotify) {
    throw new RecommendationError('Invalid track structure: missing Spotify URL', 'INVALID_TRACK');
  }
  
  return true;
};