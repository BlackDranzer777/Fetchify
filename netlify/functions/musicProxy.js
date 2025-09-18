// netlify/functions/musicProxy.js
export async function handler(event) {
  let { path } = event.queryStringParameters;
  if (!path) {
    return { statusCode: 400, body: "Missing path" };
  }

  // decode what frontend encoded
  path = decodeURIComponent(path);

  // Ensure fmt=json is present
  if (!path.includes("fmt=json")) {
    path += path.includes("?") ? "&fmt=json" : "?fmt=json";
  }

  const url = `https://musicbrainz.org${path}`;
  console.log("Proxying to MusicBrainz:", url);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Fetchify/1.0 (contact@yourapp.com)", // required by MB
      },
    });

    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.toString()}` };
  }
}
