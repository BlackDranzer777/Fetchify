// netlify/functions/acousticProxy.js
export async function handler(event) {
  const { path } = event.queryStringParameters;
  if (!path) {
    return { statusCode: 400, body: "Missing path" };
  }

  const url = `https://acousticbrainz.org${path}`;
  try {
    const res = await fetch(url);
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
}
