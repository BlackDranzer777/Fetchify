import { useState } from 'react';
import styles from '../styles/radio.module.css';

const GENRES = ['pop', 'rock', 'jazz', 'hip-hop', 'dance', 'electronic', 'indie'];

export default function RadioUI({ onTune, onSave }) {
  const [vals, setVals] = useState({
    danceability: 0.7,
    energy: 0.6,
    valence: 0.5,
    tempo: 120,
    genres: ['pop'],
  });

  const setNum = (k) => (e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }));
  const toggleGenre = (g) => {
    setVals((v) => {
      const has = v.genres.includes(g);
      const next = has ? v.genres.filter((x) => x !== g) : [...v.genres, g];
      return { ...v, genres: next.slice(0, 5) }; // max 5 seeds
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
          return (
            <button
              key={g}
              className={active ? styles.genreActive : styles.genre}
              onClick={(e) => { e.preventDefault(); toggleGenre(g); }}
              aria-pressed={active}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={(e) => { e.preventDefault(); onTune(vals); }} // ✅ send current state
          aria-label="Tune In"
        >
          Tune In
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
