import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

// Never print a secret or place one in command-line arguments or repository files.
const project = "hjhkccbktkscwtgzxjfq";
const name = "KOTONOHA_KEY_ENCRYPTION_SECRET";
const listed = spawnSync(
  "supabase",
  ["secrets", "list", "--project-ref", project, "--output", "json"],
  { encoding: "utf8" },
);
if (listed.status !== 0)
  throw new Error("Could not inspect secret names; no changes made.");
const entries = JSON.parse(listed.stdout);
if (!Array.isArray(entries))
  throw new Error("Unexpected secrets list; no changes made.");
if (entries.some((entry) => entry.name === name)) {
  console.log("Dedicated encryption secret already exists; unchanged.");
} else {
  const result = spawnSync(
    "supabase",
    ["secrets", "set", "--project-ref", project, "--env-file", "/dev/stdin"],
    {
      input: `${name}=${randomBytes(32).toString("base64")}\n`,
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(
      "Secret setup failed; inspect the dedicated secret name in the dashboard.",
    );
  console.log(
    "Created dedicated encryption secret. Existing secrets unchanged.",
  );
}
