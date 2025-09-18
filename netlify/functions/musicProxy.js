export async function handler(event) {
  let { path } = event.queryStringParameters;
  if (!path) {
    return { statusCode: 400, body: "Missing path" };
  }

  // Decode just in case Netlify double-encodes
  path = decodeURIComponent(path);

  // Ensure fmt=json
  if (!path.includes("fmt=json")) {
    path += path.includes("?") ? "&fmt=json" : "?fmt=json";
  }

  const url = `https://musicbrainz.org${path}`;
  console.log("Proxying to:", url);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Fetchify/1.0 (contact@yourapp.com)", // required by MB
      },
    });

    if (res.status === 503) {
      return { statusCode: 503, body: "MusicBrainz rate limit hit, try again later" };
    }

    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.toString()}` };
  }
}
