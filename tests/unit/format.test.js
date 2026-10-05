import test from "node:test";
import assert from "node:assert/strict";
import { formatSignedPoints } from "../../src/format.js";

test("偏离以百分点展示，舍入为零时不保留正负号", () => {
  assert.equal(formatSignedPoints(-0.000033333333), "0.00");
  assert.equal(formatSignedPoints(0.000033333333), "0.00");
  assert.equal(formatSignedPoints(-0.05), "−5.00");
  assert.equal(formatSignedPoints(0.05), "+5.00");
  assert.equal(formatSignedPoints(NaN), "—");
  assert.equal(formatSignedPoints(Infinity), "—");
});
