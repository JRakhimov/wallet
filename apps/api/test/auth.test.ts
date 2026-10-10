import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { readConfig } from "../src/config/app-config";
import { verifyTelegram } from "../src/auth/telegram-init-data";

const local = {
  NODE_ENV: "development",
  AUTH_MODE: "dev",
  HOST: "127.0.0.1",
  APP_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://wallet:password@localhost:54329/wallet",
};
function signedInitData(userId: number, token: string, time: number) {
  const params = new URLSearchParams({
    auth_date: String(time),
    user: JSON.stringify({ id: userId, first_name: "Owner" }),
  });
  const data = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(data).digest("hex"));
  return params.toString();
}
test("dev auth is enabled only by AUTH_MODE=dev in development", () => {
  assert.equal(readConfig(local).dev, true);
  assert.throws(
    () => readConfig({ ...local, NODE_ENV: "production" }),
    /requires NODE_ENV=development/,
  );
  assert.throws(
    () => readConfig({ ...local, NODE_ENV: undefined }),
    /requires NODE_ENV=development/,
  );
  const production = {
    ...local,
    NODE_ENV: "production",
    AUTH_MODE: "telegram",
    APP_ORIGIN: "https://wallet.example",
    BOT_TOKEN: "123:token",
    OWNER_TELEGRAM_ID: "123",
  };
  assert.equal(readConfig(production).dev, false);
  assert.throws(
    () => readConfig({ ...production, MINI_APP_URL: "http://wallet.example" }),
    /HTTPS MINI_APP_URL/,
  );
});
test("Telegram signature and freshness are required, and the signed user is returned", () => {
  const now = Date.now(),
    token = "123456:secret";
  const valid = signedInitData(123456, token, Math.floor(now / 1000));
  assert.equal(verifyTelegram(valid, token, now).id, 123456);
  assert.throws(() => verifyTelegram(valid, "wrong-token", now));
  assert.throws(() =>
    verifyTelegram(signedInitData(123456, token, Math.floor(now / 1000) - 400), token, now),
  );
  assert.throws(() => verifyTelegram(valid.replace("123456", "123457"), token, now));
  assert.throws(() => verifyTelegram(valid + "&user=%7B%22id%22%3A123456%7D", token, now));
});
