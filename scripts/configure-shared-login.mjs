import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Credentials arrive on stdin; never put them in source, process args, or logs.
if (
  readFileSync(
    new URL("../supabase/.temp/project-ref", import.meta.url),
    "utf8",
  ).trim() !== "hjhkccbktkscwtgzxjfq"
) {
  throw new Error("Unexpected linked project; no changes made.");
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const line = await new Promise((resolve, reject) => {
  let input = "";
  process.stdin.on("data", (chunk) => {
    input += chunk.toString();
    if (input.includes("\u0003")) {
      reject(new Error("Cancelled"));
      return;
    }
    if (input.includes("\n") || input.includes("\r")) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(input.trim());
    }
  });
  process.stdin.on("end", () => resolve(input.trim()));
});
const { loginId, password } = JSON.parse(line);
if (
  typeof loginId !== "string" ||
  !/^[a-zA-Z0-9_-]{1,100}$/.test(loginId) ||
  typeof password !== "string" ||
  password.length < 8 ||
  Buffer.byteLength(password) > 72
)
  throw new Error("Invalid credentials input.");
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sql = `begin;
update kotonoha.access_config set login_id=${quote(loginId)}, password_hash=extensions.crypt(${quote(password)}, extensions.gen_salt('bf', 11)) where singleton;
delete from kotonoha.sessions;
delete from kotonoha.login_attempts;
commit;
select 'shared login configured; existing Auth unchanged' as result;`;
const result = spawnSync(
  "supabase",
  ["db", "query", "--linked", "--file", "/dev/stdin"],
  { input: sql, encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error("Shared-login configuration failed. No credentials printed.");
console.log(
  "Shared-login password hash configured. Existing Supabase Auth unchanged.",
);
