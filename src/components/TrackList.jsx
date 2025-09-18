export default function TrackList({ tracks = [] }) {
  if (!tracks.length) return null;

  return (
    <div style={{ 
      marginTop: 20, 
      maxWidth: '100%', 
      width: '100%' 
    }}>
      <h3 style={{ 
        textAlign: 'center', 
        marginBottom: '16px',
        fontWeight: 800,
        color: '#111'
      }}>
        Similar Tracks
      </h3>
      
      {tracks.map((t, index) => (
        <article
          key={t.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px',
            border: '3px solid #111',
            borderRadius: 14,
            background: '#fff',
            marginBottom: 12,
            boxShadow: '6px 8px 0 #111',
            maxWidth: '100%',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Similarity Score Badge */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            backgroundColor: '#F26B1D',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold',
            border: '2px solid #111'
          }}>
            {parseFloat(t.similarity * 100).toFixed(0)}%
          </div>

          {/* Album art */}
          <img
            src={t.album.images?.[0]?.url}
            alt={`${t.name} album cover`}
            style={{ 
              width: 56, 
              height: 56, 
              borderRadius: 8, 
              objectFit: 'cover',
              flexShrink: 0,
              border: '2px solid #111'
            }}
          />

          {/* Song info */}
          <div style={{ 
            flex: 1, 
            minWidth: 0, // Allows text to truncate
            paddingRight: '80px' // Space for similarity badge
          }}>
            <div style={{ 
              fontWeight: 800, 
              fontSize: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {t.name}
            </div>
            
            <div style={{ 
              opacity: 0.75, 
              fontSize: "14px",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '2px'
            }}>
              {t.artists.map((a) => a.name).join(', ')}
            </div>

            {/* Feature info */}
            {t.features && (
              <div style={{
                fontSize: '12px',
                color: '#666',
                marginTop: '4px',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <span>Genre: {t.features.genre || 'Unknown'}</span>
                <span>•</span>
                <span>Tempo: {Math.round(t.features.tempo || 0)} BPM</span>
                <span>•</span>
                <span>{t.features.hasLyrics ? 'Vocal' : 'Instrumental'}</span>
              </div>
            )}

            {/* Audio preview */}
            {t.preview_url && (
              <audio
                src={t.preview_url}
                controls
                style={{ 
                  marginTop: 8, 
                  width: "100%", 
                  maxWidth: '300px',
                  height: '32px'
                }}
              />
            )}
          </div>

          {/* Open in Spotify */}
          <a
            href={t.external_urls.spotify}
            target="_blank"
            rel="noreferrer"
            style={{
              fontWeight: 600,
              color: "#1DB954",
              textDecoration: "none",
              padding: "8px 12px",
              border: "2px solid #1DB954",
              borderRadius: 8,
              fontSize: '14px',
              flexShrink: 0,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#1DB954';
              e.target.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#1DB954';
            }}
          >
            Open
          </a>
        </article>
      ))}
    </div>
  );
}