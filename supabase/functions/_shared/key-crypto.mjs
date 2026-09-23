const encoder = new TextEncoder();
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function encryptApiKey(plain, ownerId, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(ownerId) },
    key,
    encoder.encode(plain),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptApiKey(ciphertext, ownerId, secret) {
  const [version, iv, value] = ciphertext.split(".");
  if (version !== "v1" || !iv || !value)
    throw new Error("Invalid key envelope");
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
      additionalData: encoder.encode(ownerId),
    },
    key,
    fromBase64(value),
  );
  return new TextDecoder().decode(plain);
}
