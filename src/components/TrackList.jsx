export default function TrackList({ tracks = [] }) {
  if (!tracks.length) return null;

  return (
    <div style={{ 
      marginTop: 20, 
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <h3 style={{ 
        textAlign: 'center', 
        marginBottom: '16px',
        fontWeight: 800,
        color: '#111',
        margin: '0 0 16px 0'
      }}>
        Similar Tracks ({tracks.length}/5)
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
          <div
            key={t.id}
            style={{
              border: '3px solid #111',
              borderRadius: 14,
              background: '#fff',
              marginBottom: 12,
              boxShadow: '6px 8px 0 #111',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
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
              padding: '3px 6px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              border: '2px solid #111',
              zIndex: 1
            }}>
              {Math.round(parseFloat(similarity) * 100)}%
            </div>

            {/* Main content area */}
            <div style={{
              display: 'flex',
              padding: '12px',
              gap: '12px',
              alignItems: 'flex-start',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {/* Album art */}
              <div style={{ flexShrink: 0 }}>
                {albumImage ? (
                  <img
                    src={albumImage}
                    alt={`${trackName} album cover`}
                    style={{ 
                      width: 48, 
                      height: 48, 
                      borderRadius: 6, 
                      objectFit: 'cover',
                      border: '2px solid #111'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 6, 
                    backgroundColor: '#eee',
                    border: '2px solid #111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    No Image
                  </div>
                )}
              </div>

              {/* Song info - takes remaining space */}
              <div style={{ 
                flex: 1, 
                minWidth: 0,
                width: '100%',
                paddingRight: '50px' // Space for similarity badge
              }}>
                {/* Track name */}
                <div style={{ 
                  fontWeight: 800, 
                  fontSize: '15px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '2px',
                  lineHeight: '1.2'
                }}>
                  {trackName}
                </div>
                
                {/* Artist name */}
                <div style={{ 
                  opacity: 0.75, 
                  fontSize: "13px",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '6px',
                  lineHeight: '1.2'
                }}>
                  {artistNames}
                </div>

                {/* Feature info */}
                {t.features && (
                  <div style={{
                    fontSize: '10px',
                    color: '#666',
                    marginBottom: '8px',
                    lineHeight: '1.2'
                  }}>
                    <span style={{ marginRight: '8px' }}>
                      {t.features.genre || 'Unknown'}
                    </span>
                    {t.features.tempo && (
                      <span style={{ marginRight: '8px' }}>
                        {Math.round(t.features.tempo)} BPM
                      </span>
                    )}
                    <span>
                      {t.features.hasLyrics ? 'Vocal' : 'Instrumental'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom section for audio and link */}
            <div style={{
              padding: '0 12px 12px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {/* Audio preview */}
              {previewUrl && (
                <audio
                  src={previewUrl}
                  controls
                  style={{ 
                    width: '100%',
                    height: '32px',
                    maxWidth: '100%'
                  }}
                />
              )}

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
                    borderRadius: 6,
                    fontSize: '12px',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box'
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
                  Open in Spotify
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}