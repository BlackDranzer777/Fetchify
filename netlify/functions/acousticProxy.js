// netlify/functions/acousticProxy.js
export async function handler(event) {
  let { path } = event.queryStringParameters;
  if (!path) {
    return { statusCode: 400, body: "Missing path" };
  }

  // Ensure fmt=json is appended
  if (!path.includes("fmt=json")) {
    path += path.includes("?") ? "&fmt=json" : "?fmt=json";
  }

  const url = `https://acousticbrainz.org${path}`;
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "text/plain";
    const body = await res.text();

    return {
      statusCode: res.status,
      headers: { "Content-Type": contentType },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
}
