import assert from "node:assert/strict";

// Interactive input is not echoed, and credentials/tokens are never logged.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = await new Promise((resolve) => {
  let text = "";
  process.stdin.on("data", (chunk) => {
    text += chunk.toString();
    if (text.includes("\n") || text.includes("\r")) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(text.trim());
    }
  });
  process.stdin.on("end", () => resolve(text.trim()));
});
const credentials = JSON.parse(input);
const base =
  "https://hjhkccbktkscwtgzxjfq.supabase.co/functions/v1/kotonoha-api";
const tokens = [];
let createdId;
async function call(route, token, init = {}) {
  return fetch(`${base}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://marugo-s.github.io",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
try {
  assert.equal((await call("/meetings")).status, 401);
  assert.equal(
    (
      await call("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({
          ...credentials,
          password: `${credentials.password}-incorrect`,
        }),
      })
    ).status,
    401,
  );
  for (let i = 0; i < 2; i++) {
    const response = await call("/auth/login", null, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    assert.equal(response.status, 200, "shared login must succeed");
    const session = await response.json();
    tokens.push(session.token);
    assert.ok(Date.parse(session.expiresAt) > Date.now());
  }
  assert.notEqual(
    tokens[0],
    tokens[1],
    "separate logins issue separate sessions",
  );
  const before = await (await call("/meetings", tokens[0])).json();
  if (!before.some((meeting) => meeting.isDemo)) {
    const response = await call("/demo", tokens[0], { method: "POST" });
    assert.equal(response.status, 201);
    const meeting = await response.json();
    createdId = meeting.id;
  }
  const a = await (await call("/meetings", tokens[0])).json();
  const b = await (await call("/meetings", tokens[1])).json();
  assert.deepEqual(
    a.map((m) => m.id).sort(),
    b.map((m) => m.id).sort(),
    "both sessions see identical meetings",
  );
  if (createdId) {
    assert.ok(
      b.some((m) => m.id === createdId),
      "second login sees first login recording",
    );
    const response = await call(`/meetings/${createdId}`, tokens[1], {
      method: "PATCH",
      body: JSON.stringify({ markdown: "共有確認用の一時テスト" }),
    });
    assert.equal(response.status, 200);
    assert.equal(
      (await (await call(`/meetings/${createdId}`, tokens[0])).json()).markdown,
      "共有確認用の一時テスト",
    );
    assert.equal(
      (await call(`/meetings/${createdId}`, tokens[0], { method: "DELETE" }))
        .status,
      204,
    );
    assert.ok(
      !(await (await call("/meetings", tokens[1])).json()).some(
        (m) => m.id === createdId,
      ),
    );
    createdId = null;
  }
  assert.equal(
    (await call("/auth/logout", tokens[0], { method: "POST" })).status,
    204,
  );
  assert.equal((await call("/meetings", tokens[0])).status, 401);
  assert.equal((await call("/meetings", tokens[1])).status, 200);
  console.log(
    "PASS: fixed credentials, rejected invalid login, separate sessions, shared list/edit/delete, and independent logout. No OpenAI requests made.",
  );
} finally {
  if (createdId && tokens[0])
    await call(`/meetings/${createdId}`, tokens[0], { method: "DELETE" });
  for (const token of tokens)
    await call("/auth/logout", token, { method: "POST" });
}
