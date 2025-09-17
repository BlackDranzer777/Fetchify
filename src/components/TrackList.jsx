export default function TrackList({ tracks = [] }) {
  if (!tracks.length) return null;

  return (
    <div style={{ marginTop: 20 }}>
      {tracks.map((t) => (
        <article
          key={t.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '56px 1fr auto',
            gap: 12,
            alignItems: 'center',
            padding: '10px 12px',
            border: '3px solid #111',
            borderRadius: 14,
            background: '#fff',
            marginBottom: 10,
            boxShadow: '6px 8px 0 #111',
          }}
        >
          {/* Album art */}
          <img
            src={t.album.images?.[0]?.url}
            alt={`${t.name} album cover`}
            width="56" height="56"
            style={{ borderRadius: 8, objectFit: 'cover' }}
          />

          {/* Song info */}
          <div>
            <div style={{ fontWeight: 800 }}>{t.name}</div>
            <div style={{ opacity: 0.75, fontSize: "0.9em" }}>
              {t.artists.map((a) => a.name).join(', ')}
            </div>
            {t.preview_url && (
              <audio
                src={t.preview_url}
                controls
                style={{ marginTop: 6, width: "100%" }}
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
              padding: "6px 12px",
              border: "2px solid #1DB954",
              borderRadius: 8,
            }}
          >
            Open
          </a>
        </article>
      ))}
    </div>
  );
}
