export default {
  fetch(request: Request): Response {
    return new Response("Hello Cloudflare Worker 👋", {
      headers: { "content-type": "text/plain" },
    });
  },
};
