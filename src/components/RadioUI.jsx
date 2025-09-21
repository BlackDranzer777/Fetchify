import { useState, useEffect } from 'react';
import styles from '../styles/radio.module.css';

const GENRES = ['pop', 'rock', 'jazz', 'hip-hop', 'dance', 'electronic', 'indie'];

export default function RadioUI({ onTune, onSave, defaultValues, loading }) {
  const [vals, setVals] = useState({
    danceability: 0.7,
    energy: 0.6,
    valence: 0.5,
    tempo: 120,
    genres: ['pop'],
  });

  const [hasUserChanges, setHasUserChanges] = useState(false);

  // Update state when defaultValues arrive from App.jsx
  useEffect(() => {
    if (defaultValues) {
      setVals((v) => ({
        ...v,
        ...defaultValues, // override danceability, energy, valence, tempo
        // Auto-select current track's genre if available
        genres: defaultValues.currentGenre ? [defaultValues.currentGenre] : v.genres
      }));
      // Reset user changes when new track loads
      setHasUserChanges(false);
    }
  }, [defaultValues]);

  const setNum = (k) => (e) => {
    setVals((v) => ({ ...v, [k]: Number(e.target.value) }));
    setHasUserChanges(true); // Mark that user has made changes
  };

  const toggleGenre = (g) => {
    setVals((v) => {
      const has = v.genres.includes(g);
      const next = has ? v.genres.filter((x) => x !== g) : [...v.genres, g];
      return { ...v, genres: next.slice(0, 5) }; // max 5 seeds
    });
    setHasUserChanges(true); // Mark that user has made changes
  };

  const handleTuneIn = () => {
    // Pass current values and whether user made changes to parent
    onTune({
      values: vals,
      hasUserChanges: hasUserChanges
    });
  };

  return (
    <div className={styles.radio} role="group" aria-label="Fetchify Radio Controls">
      <div className={styles.header}>
        <span className={styles.badge}>FETCHIFY</span>
        <span className={styles.tagline}>tune your vibe</span>
      </div>

      {/* Screen */}
      <div className={styles.screen} aria-live="polite">
        <div className={styles.screenRow}>
          <span>Danceability</span>
          <strong>{vals.danceability.toFixed(2)}</strong>
        </div>
        <div className={styles.screenRow}>
          <span>Energy</span>
          <strong>{vals.energy.toFixed(2)}</strong>
        </div>
        <div className={styles.screenRow}>
          <span>Mood (Valence)</span>
          <strong>{vals.valence.toFixed(2)}</strong>
        </div>
        <div className={styles.screenRow}>
          <span>Tempo</span>
          <strong>{vals.tempo} BPM</strong>
        </div>
        {/* Show current track's genre */}
        {defaultValues?.currentGenre && (
          <div className={styles.screenRow}>
            <span>Current Genre</span>
            <strong className={styles.currentGenre}>{defaultValues.currentGenre.toUpperCase()}</strong>
          </div>
        )}
        {/* Show if user has made changes */}
        {hasUserChanges && (
          <div className={styles.screenRow}>
            <span>Mode</span>
            <strong style={{ color: '#F26B1D' }}>CUSTOM</strong>
          </div>
        )}
        <div className={styles.equalizer} aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
      </div>

      {/* Sliders */}
      <div className={styles.controls}>
        <label className={styles.control}>
          <span>Danceability</span>
          <input
            type="range" min="0" max="1" step="0.01"
            value={vals.danceability} onChange={setNum('danceability')}
            aria-label="Danceability"
          />
        </label>

        <label className={styles.control}>
          <span>Energy</span>
          <input
            type="range" min="0" max="1" step="0.01"
            value={vals.energy} onChange={setNum('energy')}
            aria-label="Energy"
          />
        </label>

        <label className={styles.control}>
          <span>Mood (Valence)</span>
          <input
            type="range" min="0" max="1" step="0.01"
            value={vals.valence} onChange={setNum('valence')}
            aria-label="Valence"
          />
        </label>

        <label className={styles.control}>
          <span>Tempo</span>
          <input
            type="range" min="60" max="180" step="1"
            value={vals.tempo} onChange={setNum('tempo')}
            aria-label="Tempo"
          />
        </label>
      </div>

      {/* Genre pills */}
      <div className={styles.genres} aria-label="Genre seeds">
        {GENRES.map((g) => {
          const active = vals.genres.includes(g);
          const isCurrent = defaultValues?.currentGenre === g;
          return (
            <button
              key={g}
              className={active ? styles.genreActive : styles.genre}
              onClick={(e) => { e.preventDefault(); toggleGenre(g); }}
              aria-pressed={active}
              style={isCurrent ? { 
                border: '2px solid #00ff41', 
                boxShadow: '0 0 8px #00ff4150' 
              } : {}}
              title={isCurrent ? "Current track's genre" : undefined}
            >
              {g}
              {isCurrent && ' ★'}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleTuneIn}
          disabled={loading}
          aria-label="Tune In"
        >
          {hasUserChanges ? "Find Custom Mix" : "Find Similar Songs"}
        </button>
        <button
          className={`${styles.btn} ${styles.btnSecondary}`}
          onClick={onSave}
          aria-label="Save to Playlist (disabled)"
        >
          Save to Playlist
        </button>
      </div>

      {/* Grill / feet purely decorative */}
      <div className={styles.grill} aria-hidden="true" />
      <div className={styles.feet} aria-hidden="true"><span /><span /></div>
    </div>
  );
}