// netlify/functions/recommendations.js
import fetch from "node-fetch";

export async function handler(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Serverless function works!" }),
    headers: { "Content-Type": "application/json" },
  };
}
