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
      
      {tracks.map((t, index) => {
        // Safety checks for all properties
        if (!t || !t.id) {
          console.warn('Invalid track object:', t);
          return null;
        }

        const albumImage = t.album?.images?.[0]?.url;
        const trackName = t.name || 'Unknown Track';
        const artists = t.artists || [];
        const artistNames = artists.length > 0 
          ? artists.map((a) => a?.name || 'Unknown Artist').join(', ')
          : 'Unknown Artist';
        const spotifyUrl = t.external_urls?.spotify;
        const previewUrl = t.preview_url;
        const similarity = t.similarity || '0.000';
        
        return (
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
              {Math.round(parseFloat(similarity) * 100)}%
            </div>

            {/* Album art */}
            {albumImage ? (
              <img
                src={albumImage}
                alt={`${trackName} album cover`}
                style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: 8, 
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '2px solid #111'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div style={{ 
                width: 56, 
                height: 56, 
                borderRadius: 8, 
                backgroundColor: '#eee',
                flexShrink: 0,
                border: '2px solid #111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: '#666'
              }}>
                No Image
              </div>
            )}

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
                {trackName}
              </div>
              
              <div style={{ 
                opacity: 0.75, 
                fontSize: "14px",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '2px'
              }}>
                {artistNames}
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
                  {t.features.genre && (
                    <>
                      <span>Genre: {t.features.genre}</span>
                      <span>•</span>
                    </>
                  )}
                  {t.features.tempo && (
                    <>
                      <span>Tempo: {Math.round(t.features.tempo)} BPM</span>
                      <span>•</span>
                    </>
                  )}
                  <span>{t.features.hasLyrics ? 'Vocal' : 'Instrumental'}</span>
                </div>
              )}

              {/* Audio preview */}
              {previewUrl && (
                <audio
                  src={previewUrl}
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
            {spotifyUrl && (
              <a
                href={spotifyUrl}
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
            )}
          </article>
        );
      })}
    </div>
  );
}