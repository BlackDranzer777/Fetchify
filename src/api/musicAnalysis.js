export async function getMBIDFromISRC(isrc) {
  const res = await fetch(
    `/.netlify/functions/musicProxy?path=/ws/2/recording?query=isrc:${isrc}&fmt=json`
  );
  if (!res.ok) throw new Error("MusicBrainz ISRC lookup failed");
  const data = await res.json();
  return data.recordings?.[0]?.id || null;
}

export async function getABFeatures(mbid) {
  const res = await fetch(
    `/.netlify/functions/acousticProxy?path=/api/v1/${mbid}/high-level?map_classes=true&fmt=json`
  );
  if (!res.ok) throw new Error("AcousticBrainz feature fetch failed");
  return res.json();
}

export async function getSimilarMBIDs(mbid, limit = 25) {
  const res = await fetch(
    `/.netlify/functions/acousticProxy?path=/api/v1/similarity/moods?recording_ids=${mbid}&n_neighbours=${limit}&remove_dups=all&fmt=json`
  );
  if (!res.ok) throw new Error("AcousticBrainz similarity fetch failed");
  return res.json();
}
