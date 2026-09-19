export function authConfig() {
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32) throw new Error("Authentication is not configured");
  const url = new URL(baseURL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("Authentication URL must be an HTTPS origin (HTTP is allowed only on loopback)");
  }
  return { baseURL: url.origin, secret };
}
