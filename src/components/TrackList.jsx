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
          <img
            src={t.album.images?.[0]?.url}
            alt=""
            width="56" height="56"
            style={{ borderRadius: 8, objectFit: 'cover' }}
          />
          <div>
            <div style={{ fontWeight: 800 }}>{t.name}</div>
            <div style={{ opacity: 0.75 }}>{t.artists.map((a) => a.name).join(', ')}</div>
          </div>
          <a href={t.external_urls.spotify} target="_blank" rel="noreferrer">Open</a>
        </article>
      ))}
    </div>
  );
}
