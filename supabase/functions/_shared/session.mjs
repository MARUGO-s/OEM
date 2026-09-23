export async function hashToken(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createToken() {
  return `ktn_${Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validTokenFormat(value) {
  return typeof value === "string" && /^ktn_[0-9a-f]{64}$/.test(value);
}
