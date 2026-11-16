import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLocalUrl } from "../scripts/local-db-safety.mjs";

test("database runner rejects remote, production and development destinations for tests", () => {
  const testUrl = "postgresql://cabanias_local:synthetic@127.0.0.1:54330/cabanias_test?schema=public";
  assert.equal(assertLocalUrl(testUrl, "test").database, "cabanias_test");
  for (const value of [undefined, "", testUrl.replace("127.0.0.1", "database.example.com"),
    testUrl.replace("54330", "5432"), testUrl.replace("cabanias_test", "production"),
    testUrl.replace("cabanias_local", "postgres"), testUrl + "&host=remote.example.com",
    testUrl.replace("public", "other"),
    "postgresql://cabanias_local:synthetic@127.0.0.1:54329/cabanias_dev?schema=public"]) {
    assert.throws(() => assertLocalUrl(value, "test"));
  }
});
