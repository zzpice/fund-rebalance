import test from "node:test";
import assert from "node:assert/strict";

import { FUNDS, sum } from "../../src/portfolio.js";
import { createRebalancePlan } from "../../src/rebalance.js";

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function randomInt(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

test("接近安全整数上限时临时回调金额也保持精确守恒", () => {
  const random = mulberry32(0x5a17c0de);
  const exactSum = values => values.reduce((total, value) => total + BigInt(value), 0n);
  for (let index = 0; index < 1000; index++) {
    const total = Number.MAX_SAFE_INTEGER - index;
    const cuts = [0, total, ...Array.from({length:FUNDS.length - 1}, () => randomInt(random, total))].sort((a,b) => a-b);
    const holdings = cuts.slice(1).map((value, i) => value - cuts[i]);
    const plan = createRebalancePlan({holdings});
    assert.equal(exactSum(plan.final), BigInt(total));
    assert.equal(exactSum(plan.trades), 0n);
    assert.equal(exactSum(plan.internalTrades), 0n);
  }
});

test("固定种子的随机组合始终满足再平衡核心不变量", () => {
  const random = mulberry32(0x5a17c0de);

  for (let caseIndex = 0; caseIndex < 3000; caseIndex += 1) {
    const holdings = FUNDS.map(() => randomInt(random, 2_000_001));
    if (sum(holdings) === 0) holdings[randomInt(random, holdings.length)] = 1;

    const currentTotal = sum(holdings);
    const mode = randomInt(random, 3);
    let flow = 0;

    if (mode === 1) {
      flow = randomInt(random, 1_000_001);
    } else if (mode === 2 && currentTotal > 1) {
      flow = -(1 + randomInt(random, currentTotal - 1));
    }

    const plan = createRebalancePlan({ holdings, flow });

    assert.equal(plan.finalTotal, currentTotal + flow, `case ${caseIndex}: final total`);
    assert.equal(sum(plan.final), plan.finalTotal, `case ${caseIndex}: holdings conservation`);
    assert.equal(sum(plan.trades), flow, `case ${caseIndex}: trade conservation`);
    assert.equal(sum(plan.internalTrades), 0, `case ${caseIndex}: internal conversion conservation`);
    assert.equal(plan.buyTotal - plan.sellTotal, flow, `case ${caseIndex}: buy/sell conservation`);
    assert.equal(
      plan.tradeCount,
      plan.trades.filter(amount => amount !== 0).length,
      `case ${caseIndex}: trade count`
    );

    plan.final.forEach((amount, index) => {
      assert.ok(amount >= 0, `case ${caseIndex}: non-negative holding ${index}`);
      assert.equal(
        holdings[index] + plan.trades[index],
        amount,
        `case ${caseIndex}: holding/trade identity ${index}`
      );
    });

    plan.postFlow.forEach((amount, index) => {
      assert.ok(amount >= 0, `case ${caseIndex}: post-flow holding ${index}`);
    });

    if (flow < 0) {
      assert.deepEqual(
        plan.internalTrades,
        holdings.map(() => 0),
        `case ${caseIndex}: withdrawal must not create internal conversion`
      );
      assert.deepEqual(
        plan.final,
        plan.postFlow,
        `case ${caseIndex}: withdrawal final state must equal post-flow state`
      );
      continue;
    }

    plan.final.forEach((amount, index) => {
      assert.ok(
        amount >= plan.bands[index].low && amount <= plan.bands[index].high,
        `case ${caseIndex}: final holding ${index} inside trigger band`
      );
    });

    if (plan.breaches.some(Boolean)) {
      plan.final.forEach((amount, index) => {
        assert.ok(
          amount >= plan.bands[index].reentryLow
            && amount <= plan.bands[index].reentryHigh,
          `case ${caseIndex}: final holding ${index} inside reentry band`
        );
      });
    }
  }
});
