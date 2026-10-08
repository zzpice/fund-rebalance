import {
  FUNDS,
  VERSION,
  buildBands,
  parseWanAmount,
  snapshot
} from "./portfolio.js";
import { createRebalancePlan } from "./rebalance.js";
import { formatCurrency, formatPercent, formatSignedPoints, formatWan } from "./format.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const FUND_COLORS = ["var(--fund-1)", "var(--fund-2)", "var(--fund-3)", "var(--fund-4)"];
const VIEW_TITLES = Object.freeze({
  workspace: "工作台",
  plan: "执行方案",
  rules: "规则"
});
const viewScroll = { workspace: 0, plan: 0, rules: 0 };

let activePlan = null;
let activeView = "workspace";
let copyResetTimer = null;

renderFunds();
renderAllocationBase();
renderBands();
bindEvents();
updateLiveState();
registerServiceWorker();
const wideWorkspace = window.matchMedia("(min-width: 1100px)");
wideWorkspace.addEventListener("change", syncWorkspaceLayout);
syncWorkspaceLayout();

function renderFunds() {
  $("#holdingsBody").innerHTML = FUNDS.map((fund, index) => `
    <tr style="--fund-color:${FUND_COLORS[index]}">
      <td>
        <a class="fund-name" href="${fund.url}" target="_blank" rel="noopener noreferrer" title="${fund.fullName}">
          <strong>${fund.name}</strong><span>${fund.code} · ${fund.category}<small class="fund-target">目标 ${formatPercent(fund.targetBps / 10_000)}</small></span>
        </a>
      </td>
      <td class="numeric mono target-cell">${formatPercent(fund.targetBps / 10_000)}</td>
      <td class="numeric">
        <label class="sr-only" for="holding-${index}">${fund.name}当前持仓（万）</label>
        <div class="table-input"><input id="holding-${index}" class="holding-input" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="0.0000" /><span>万</span></div>
      </td>
      <td class="numeric mono" data-weight="${index}">—</td>
      <td><span class="state-pill is-pending" data-state="${index}">—</span></td>
    </tr>
  `).join("");
}

function renderAllocationBase() {
  const targetWeights = FUNDS.map(fund => fund.targetBps / 10_000);
  $("#targetRing").style.setProperty("--ring-gradient", allocationGradient(targetWeights));
  $("#allocationLegend").innerHTML = FUNDS.map((fund, index) => `
    <div class="allocation-item" data-allocation-item="${index}">
      <i style="--fund-color:${FUND_COLORS[index]}"></i>
      <span><strong>${fund.code}</strong><small>${fund.name}</small></span>
      <span class="allocation-values"><b data-allocation-current="${index}">—</b><small>目标 ${formatPercent(targetWeights[index])}</small></span>
    </div>
  `).join("");
}

function renderBands() {
  const total = 1_000_000;
  const bands = buildBands(total);
  $("#bandsList").innerHTML = FUNDS.map((fund, index) => {
    const band = bands[index];
    return `
      <div class="band-row">
        <div class="band-name"><strong>${fund.name}</strong><span>${fund.code}</span></div>
        <div class="band-track" aria-label="${fund.name}触发区间与 80% 回调区间">
          <span class="band-safe" style="left:${band.lowWeight * 100}%;width:${band.tolerance * 200}%"></span>
          <i style="left:${band.targetWeight * 100}%"></i>
        </div>
        <div class="band-values"><b>${formatPercent(band.targetWeight)}</b><span>触发 ${formatPercent(band.lowWeight)} – ${formatPercent(band.highWeight)} · 回调 ${formatPercent(band.reentryLowWeight)} – ${formatPercent(band.reentryHighWeight)}</span></div>
      </div>
    `;
  }).join("");
}

function bindEvents() {
  document.querySelectorAll(".holding-input, #cashFlowInput").forEach(input => {
    input.addEventListener("input", () => {
      handleInputChange(input);
    });
  });

  document.querySelectorAll(".holding-input").forEach((input, index) => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const next = index + 1 < FUNDS.length ? $(`#holding-${index + 1}`) : $("#cashFlowInput");
      next.focus();
      next.select();
    });
  });
  $("#cashFlowInput").addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    generatePlan();
  });

  $$("[data-return-edit]").forEach(button => button.addEventListener("click", () => { setView("workspace"); $("#holding-0").focus(); }));
  $$("[data-flow-mode]").forEach(button => button.addEventListener("click", () => {
    const input = $("#cashFlowInput");
    const value = Math.abs(Number(input.value));
    input.value = button.dataset.flowMode === "none" ? "0" : (button.dataset.flowMode === "withdraw" ? "-" : "+") + String(Number.isFinite(value) ? value : 0);
    handleInputChange(input);
    $$("[data-flow-mode]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    input.focus(); input.setSelectionRange(button.dataset.flowMode === "none" ? 0 : 1,input.value.length);
  }));
  $("#generateButton").addEventListener("click", generatePlan);
  $("#bulkToggle").addEventListener("click", toggleBulkPanel);
  $("#bulkApply").addEventListener("click", applyBulkHoldings);
  $("#bulkCancel").addEventListener("click", closeBulkPanel);
  $("#bulkHoldingsInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) applyBulkHoldings();
    if (event.key === "Escape") {
      event.preventDefault();
      closeBulkPanel();
    }
  });
  $("#clearButton").addEventListener("click", clearInputs);
  $("#copyButton").addEventListener("click", copyPlan);
  $$("[data-refresh-version]").forEach(button => button.addEventListener("click", () => refreshVersion(button)));
  $$("[data-view-nav]").forEach(button => button.addEventListener("click", () => setView(button.dataset.viewNav)));
}

function handleInputChange(input) {
  input.removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  updateLiveState();
  const value = $("#cashFlowInput").value.trim();
  const mode = value.startsWith("-") ? "withdraw" : value.startsWith("+") || Number(value) > 0 ? "add" : "none";
  $$("[data-flow-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.flowMode === mode)));
}

function toggleBulkPanel() {
  const panel = $("#bulkPanel");
  const nextOpen = panel.hidden;
  if (!nextOpen) return closeBulkPanel();
  panel.hidden = false;
  $("#bulkToggle").setAttribute("aria-expanded", "true");
  $("#bulkHoldingsInput").focus();
  $("#bulkHoldingsInput").select();
}

function closeBulkPanel({ returnFocus = true } = {}) {
  $("#bulkPanel").hidden = true;
  $("#bulkToggle").setAttribute("aria-expanded", "false");
  $("#bulkHoldingsInput").removeAttribute("aria-invalid");
  if (returnFocus) $("#bulkToggle").focus();
}

function applyBulkHoldings() {
  const input = $("#bulkHoldingsInput");
  const values = input.value.trim().split(/[\s,，/、;；]+/).filter(Boolean);
  if (values.length !== FUNDS.length) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", `需要 ${FUNDS.length} 项，已识别 ${values.length} 项。`);
    return;
  }

  try {
    values.forEach((value, index) => parseWanAmount(value, { label: `${FUNDS[index].code} 当前持仓` }));
  } catch (error) {
    input.setAttribute("aria-invalid", "true");
    showBanner("error", error.message || "金额格式有误。");
    return;
  }

  values.forEach((value, index) => {
    const holding = $(`#holding-${index}`);
    holding.value = value;
    holding.removeAttribute("aria-invalid");
  });
  closeBulkPanel({ returnFocus: false });
  invalidatePlan();
  updateLiveState();
  showBanner("success", `✓ 已填入 ${FUNDS.length} 项`);
  $("#cashFlowInput").focus();
}

function syncWorkspaceLayout() {
  const isWide = wideWorkspace.matches;
  document.body.dataset.view = activeView;
  $$("[data-view-panel]").forEach(panel => {
    panel.hidden = panel.dataset.viewPanel === "rules" ? activeView !== "rules" : activeView === "rules" || (!isWide && panel.dataset.viewPanel !== activeView);
  });
  $("[data-snapshot]").hidden = activeView === "rules" || (!isWide && activeView === "plan");
  $(".workspace-heading").hidden = activeView === "rules" || (!isWide && activeView === "plan");
}

function setView(view) {
  if (!VIEW_TITLES[view]) return;
  const same = view === activeView;
  if (!same) viewScroll[activeView] = window.scrollY;
  activeView = view;
  syncWorkspaceLayout();
  $$("[data-view-nav]").forEach(button => {
    const isActive = button.dataset.viewNav === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#appBarTitle").textContent = VIEW_TITLES[view];
  requestAnimationFrame(() => {
    if (!wideWorkspace.matches || view === "rules") window.scrollTo(0, viewScroll[view]);
    else if (view === "plan") $("#planHeading").scrollIntoView({block:"nearest"});
  });
}

function readHoldings() {
  return FUNDS.map((fund, index) => {
    const input = `#holding-${index}`;
    try {
      return parseWanAmount($(input).value, { label: `${fund.code} 当前持仓` });
    } catch (error) {
      error.field = input;
      throw error;
    }
  });
}

function readFlow() {
  try {
    return parseWanAmount($("#cashFlowInput").value, {
      label: "资金变动",
      allowNegative: true
    });
  } catch (error) {
    error.field = "#cashFlowInput";
    throw error;
  }
}

function readForm() {
  return { holdings: readHoldings(), flow: readFlow() };
}

function updateLiveState() {
  let current;
  try {
    current = snapshot(readHoldings());
  } catch {
    resetLiveState();
    return;
  }

  $("#currentTotal").textContent = formatWan(current.total);
  try {
    const flow = readFlow();
    const after = current.total + flow;
    if (after <= 0) throw new Error();
    $("#afterTotal").textContent = formatWan(after);
    $("#flowSummary").textContent = flowLabel(flow);
  } catch {
    $("#afterTotal").textContent = "—";
    $("#flowSummary").textContent = "检查资金变动";
  }

  const largest = current.rows
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];
  $("#maxDeviation").textContent = formatSignedPoints(largest.deviation);
  $("#deviationFund").textContent = `${FUNDS[largest.index].code} 相对目标`;
  $("#portfolioStatus").textContent = current.breached ? "越界" : "区间内";
  $("#portfolioStatus").className = `kpi-value kpi-status ${current.breached ? "warning" : "positive"}`;
  $("#statusDetail").textContent = current.breached ? "生成方案查看调整" : "当前持仓在区间内";

  updateAllocation(current);

  current.rows.forEach((row, index) => {
    $(`[data-weight="${index}"]`).textContent = formatPercent(row.weight);
    const state = $(`[data-state="${index}"]`);
    state.textContent = row.breached ? (row.deviation > 0 ? "高配 ↑" : "低配 ↓") : "区间内";
    state.className = `state-pill ${row.breached ? "is-breach" : "is-safe"}`;
  });
}

function resetLiveState() {
  $("#currentTotal").textContent = "—";
  $("#afterTotal").textContent = "—";
  $("#maxDeviation").textContent = "—";
  $("#flowSummary").textContent = "—";
  $("#deviationFund").textContent = "相对目标";
  $("#portfolioStatus").textContent = "等待输入";
  $("#portfolioStatus").className = "kpi-value kpi-status";
  $("#statusDetail").textContent = "填写全部持仓";
  resetAllocation();
  FUNDS.forEach((_, index) => {
    $(`[data-weight="${index}"]`).textContent = "—";
    const state = $(`[data-state="${index}"]`);
    state.textContent = "—";
    state.className = "state-pill is-pending";
  });
}

function updateAllocation(current) {
  const weights = current.rows.map(row => row.weight);
  $("#currentRing").style.setProperty("--ring-gradient", allocationGradient(weights));
  $("#currentRing").classList.add("is-ready");
  $("#chartTotal").textContent = formatWan(current.total);
  $("#chartState").textContent = current.breached ? "越界" : "区间内";
  $("#chartState").className = current.breached ? "warning" : "positive";
  $("#allocationChart").setAttribute(
    "aria-label",
    `当前总额${formatWan(current.total)}，${current.breached ? "存在越界" : "全部在区间内"}。${FUNDS.map((fund, index) => `${fund.code} ${formatPercent(weights[index])}`).join("，")}`
  );

  current.rows.forEach((row, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = formatPercent(row.weight);
    const item = $(`[data-allocation-item="${index}"]`);
    item.dataset.tone = row.breached ? (row.deviation > 0 ? "high" : "low") : "safe";
  });
}

function resetAllocation() {
  const ring = $("#currentRing");
  if (!ring) return;
  ring.style.setProperty("--ring-gradient", "conic-gradient(var(--surface-mid) 0 100%)");
  ring.classList.remove("is-ready");
  $("#chartTotal").textContent = "—";
  $("#chartState").textContent = "等待输入";
  $("#chartState").className = "";
  $("#allocationChart").setAttribute("aria-label", "等待输入当前持仓");
  FUNDS.forEach((_, index) => {
    $(`[data-allocation-current="${index}"]`).textContent = "—";
    delete $(`[data-allocation-item="${index}"]`).dataset.tone;
  });
}

function allocationGradient(weights) {
  let cursor = 0;
  const stops = weights.map((weight, index) => {
    const start = cursor;
    cursor += weight * 100;
    return `${FUND_COLORS[index]} ${start.toFixed(4)}% ${cursor.toFixed(4)}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

function generatePlan() {
  let input;
  try {
    input = readForm();
    const plan = createRebalancePlan(input);
    activePlan = plan;
    renderPlan(plan);
    hideBanner();
    viewScroll.plan = 0;
    setView("plan");
    requestAnimationFrame(() => $("#planHeading").focus({ preventScroll: true }));
  } catch (error) {
    if (!error.field && input && input.holdings.reduce((total,amount) => total + amount,0) + input.flow <= 0) error.field = input.flow < 0 ? "#cashFlowInput" : "#holding-0";
    invalidatePlan();
    showBanner("error", error.message || "无法生成方案，请检查输入。");
    if (error.field) {
      markInvalid(error.field);
      $(error.field)?.focus();
    }
  }
}

function renderPlan(plan) {
  $("#planEmpty").hidden = true;
  $("#planContent").hidden = false;
  $("#copyButton").disabled = false;

  const decision = decisionCopy(plan);
  $("#decisionTitle").textContent = decision.title;
  $("#decisionText").textContent = decision.text;
  $("#decisionBadge").textContent = decision.badge;
  $("#decisionCard").dataset.mode = plan.mode;
  $("#decisionCard").dataset.state = decision.state;
  $("#buyTotal").textContent = formatCurrency(plan.buyTotal);
  $("#sellTotal").textContent = formatCurrency(plan.sellTotal);
  $("#internalTurnover").textContent = formatCurrency(plan.internalTurnover);
  const finalBreachCodes = plan.finalBreaches
    .map((breached, index) => breached ? FUNDS[index].code : null)
    .filter(Boolean);
  $("#finalStatus").textContent = finalBreachCodes.length ? `${finalBreachCodes.length} 项越界` : "区间内";
  $("#finalStatus").className = `kpi-value kpi-status ${finalBreachCodes.length ? "warning" : "positive"}`;
  $("#finalStatusDetail").textContent = finalBreachCodes.length
    ? finalBreachCodes.join("、")
    : "全部在区间内";
  $("#tradeCount").textContent = `${plan.tradeCount} 笔`;

  const activeIndexes = plan.trades.map((trade, index) => trade ? index : null).filter(index => index !== null);
  const unchangedIndexes = plan.trades.map((trade, index) => trade ? null : index).filter(index => index !== null);
  $("#executionBody").innerHTML = activeIndexes.map(index => renderTradeRow(plan, index)).join("");
  $("#activeTradesTable").hidden = activeIndexes.length === 0;
  $("#noTrades").hidden = activeIndexes.length !== 0;
  $("#unchangedTrades").hidden = unchangedIndexes.length === 0;
  $("#unchangedTrades").open = false;
  $("#unchangedSummary").textContent = `${unchangedIndexes.length} 项保持`;
  $("#unchangedList").innerHTML = unchangedIndexes.map(index => `
    <div class="unchanged-item" data-testid="unchanged-item">
      <span><i style="--fund-color:${FUND_COLORS[index]}"></i><b>${FUNDS[index].code}</b>${FUNDS[index].name}</span>
      <span>${formatCurrency(plan.final[index])} · ${formatPercent(plan.weights[index])}</span>
    </div>
  `).join("");

  $("#comparisonList").innerHTML = FUNDS.map((fund, index) => {
    const before = plan.holdings[index] / plan.currentTotal;
    const after = plan.weights[index];
    const target = fund.targetBps / 10_000;
    return `
      <div class="comparison-row">
        <div class="comparison-head"><strong>${fund.name}</strong><span>目标 ${formatPercent(target)}</span></div>
        <div class="compare-line"><span>调整前</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="before-bar" style="width:${Math.min(100, before * 100)}%"></b></div><em>${formatPercent(before)}</em></div>
        <div class="compare-line"><span>调整后</span><div class="compare-track"><i class="target-line" style="left:${target * 100}%"></i><b class="after-bar" style="width:${Math.min(100, after * 100)}%"></b></div><em>${formatPercent(after)}</em></div>
      </div>
    `;
  }).join("");

  const breachNames = plan.breaches
    .map((breached, index) => breached ? FUNDS[index].code : null)
    .filter(Boolean);
  $("#calculationList").innerHTML = `
    <div><dt>当前总额</dt><dd>${formatCurrency(plan.currentTotal)}</dd></div>
    <div><dt>资金变动</dt><dd>${formatCurrency(plan.flow, { signed: true })}</dd></div>
    <div><dt>资金变动后越界项</dt><dd>${breachNames.length ? breachNames.join("、") : "—"}</dd></div>
    <div><dt>内部转换</dt><dd>${formatCurrency(plan.internalTurnover)}</dd></div>
    <div><dt>调整后总额</dt><dd>${formatCurrency(plan.finalTotal)}</dd></div>
    <div><dt>金额守恒</dt><dd>买入 − 卖出 = ${formatCurrency(plan.flow, { signed: true })}</dd></div>
  `;
}

function renderTradeRow(plan, index) {
  const fund = FUNDS[index];
  const trade = plan.trades[index];
  const action = trade > 0 ? "买入" : "卖出";
  const tone = trade > 0 ? "positive" : "negative";
  return `
    <tr data-testid="execution-row" data-tone="${tone}">
      <td><span class="fund-name result-fund"><strong>${fund.name}</strong><span>${fund.code}</span></span></td>
      <td><span class="action-pill ${tone}"><i aria-hidden="true">${trade > 0 ? "↗" : "↘"}</i>${action}</span></td>
      <td class="numeric mono trade-amount ${tone}" data-label="执行金额">${formatCurrency(Math.abs(trade))}</td>
      <td class="numeric mono trade-final" data-label="调整后持仓">${formatCurrency(plan.final[index])}</td>
      <td class="numeric mono trade-weight" data-label="调整后比例">${formatPercent(plan.weights[index])}</td>
      <td class="reason-cell">${tradeReason(plan, index)}</td>
    </tr>
  `;
}

function decisionCopy(plan) {
  if (plan.mode === "internal") {
    const codes = plan.breaches.map((value, index) => value ? FUNDS[index].code : null).filter(Boolean);
    return {
      title: plan.flow ? "资金变动 + 内部转换" : "内部转换",
      text: `${codes.join("、")} 越过触发区间；全部回调至目标 ± 80% × 容差，内部换手最小。`,
      badge: "需转换",
      state: "safe"
    };
  }
  if (plan.mode === "flow") {
    return plan.flow > 0 ? {
      title: "仅分配新增资金",
      text: "按目标缺口补低配；未触发内部转换。",
      badge: "仅新增",
      state: "safe"
    } : withdrawalDecisionCopy(plan);
  }
  return {
    title: "无需调整",
    text: "当前持仓均在触发区间内，无需交易。",
    badge: "保持",
    state: "safe"
  };
}

function withdrawalDecisionCopy(plan) {
  const codes = plan.finalBreaches
    .map((breached, index) => breached ? FUNDS[index].code : null)
    .filter(Boolean);
  return {
    title: "仅执行取出",
    text: codes.length
      ? `取出后 ${codes.join("、")} 仍越界；本次不追加内部转换。`
      : "取出后全部在区间内，无需内部转换。",
    badge: codes.length ? "取出后越界" : "仅取出",
    state: codes.length ? "warning" : "safe"
  };
}

function tradeReason(plan, index) {
  const flowPart = plan.flowTrades[index];
  const internalPart = plan.internalTrades[index];
  if (flowPart && internalPart) return "资金流 + 回调";
  if (internalPart) return plan.breaches[index] ? "80% 回调" : "回调配平";
  if (flowPart) return plan.flow > 0 ? "补目标缺口" : "按取出顺序";
  return "保持";
}

function clearInputs() {
  $$("[data-flow-mode]").forEach(button => button.setAttribute("aria-pressed",String(button.dataset.flowMode === "none")));
  $$(".holding-input").forEach(input => {
    input.value = "";
    input.removeAttribute("aria-invalid");
  });
  $("#cashFlowInput").value = "0";
  $("#cashFlowInput").removeAttribute("aria-invalid");
  hideBanner();
  invalidatePlan();
  closeBulkPanel({ returnFocus: false });
  $("#bulkHoldingsInput").value = "";
  updateLiveState();
  $("#planEmptyTitle").textContent = "方案将在这里生成";
  $("#planEmptyText").textContent = "填写四项持仓与本次资金变动，即可得到逐项执行金额。";
  $$("[data-flow-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.flowMode === "none")));
  $("#holding-0").focus();
}

function invalidatePlan() {
  if (activePlan) {
    $("#planEmptyTitle").textContent = "输入已修改，重新生成方案";
    $("#planEmptyText").textContent = "上次方案已失效。确认新的持仓与资金变动后，点击“生成方案”。";
  }
  activePlan = null;
  $("#planContent").hidden = true;
  $("#planEmpty").hidden = false;
  $("#copyButton").disabled = true;
  $("#copyButton").textContent = "复制";
  $("#manualCopy").hidden = true;
}

async function copyPlan() {
  if (!activePlan) return;
  const text = buildCopyText(activePlan);
  try {
    await navigator.clipboard.writeText(text);
    showCopyFeedback("已复制");
  } catch {
    const area = $("#manualCopy");
    area.value = text;
    area.hidden = false;
    area.focus();
    area.select();
    showCopyFeedback("手动复制");
  }
}

function buildCopyText(plan) {
  const decision = decisionCopy(plan);
  const lines = [
    `zp-folio · 执行方案 v${VERSION}`,
    `当前总额：${formatCurrency(plan.currentTotal)}`,
    `资金变动：${formatCurrency(plan.flow, { signed: true })}`,
    `调整后总额：${formatCurrency(plan.finalTotal)}`,
    "",
    decision.title,
    decision.text,
    ""
  ];
  const activeTrades = plan.trades.map((trade, index) => ({ trade, index })).filter(item => item.trade);
  if (!activeTrades.length) lines.push("无需交易");
  activeTrades.forEach(({ trade, index }) => {
    const action = trade > 0 ? `买入 ${formatCurrency(trade)}` : `卖出 ${formatCurrency(-trade)}`;
    lines.push(`${FUNDS[index].code} ${FUNDS[index].name}：${action}`);
  });
  const unchangedCount = FUNDS.length - activeTrades.length;
  if (activeTrades.length && unchangedCount) lines.push(`其余 ${unchangedCount} 项保持`);
  lines.push("", `内部转换：${formatCurrency(plan.internalTurnover)}`);
  lines.push("仅供参考；未计入费用及净值变化。");
  return lines.join("\n");
}

function showCopyFeedback(text) {
  clearTimeout(copyResetTimer);
  $("#copyButton").textContent = text;
  copyResetTimer = setTimeout(() => { $("#copyButton").textContent = "复制"; }, 1600);
}

function showBanner(type, message) {
  const banner = $("#statusBanner");
  banner.className = `status-banner is-${type}`;
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner() {
  $("#statusBanner").hidden = true;
}

function markInvalid(selector) {
  $(selector)?.setAttribute("aria-invalid", "true");
}

function flowLabel(flow) {
  if (flow > 0) return `＋${formatWan(flow)}`;
  if (flow < 0) return `−${formatWan(-flow)}`;
  return "无变动";
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {});
    });
  }
}

async function refreshVersion(button) {
  if (!navigator.onLine) {
    showBanner("error", "当前处于离线状态，无法检查更新。本次输入与方案已保留。");
    return;
  }
  button.disabled = true;
  const label = button.querySelector("span:last-child");
  if (label) label.textContent = "刷新中";
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("./")
        || await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      await registration.update();
      const waiting = registration.waiting;
      if (waiting) {
        const reload = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        waiting.postMessage({ type: "SKIP_WAITING" });
        await Promise.race([reload, new Promise(resolve => setTimeout(resolve, 1800))]);
      }
    }
  } catch {
    showBanner("error", "未能检查更新，请检查网络后重试。本次输入与方案已保留。");
    return;
  } finally {
    button.disabled = false;
    if (label) label.textContent = "刷新";
  }
  window.location.reload();
}
