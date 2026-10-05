export function formatCurrency(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : value < 0 ? "−" : "";
  const amount = Math.abs(Math.round(value)).toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  });
  return `${sign}¥${amount}`;
}

export function formatWan(value) {
  if (!Number.isFinite(value)) return "—";
  const wan = value / 10_000;
  return `${wan.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} 万`;
}

export function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;
}

export function formatSignedPoints(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const points = Number((value * 100).toFixed(digits));
  const prefix = points > 0 ? "+" : points < 0 ? "−" : "";
  return prefix + Math.abs(points).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}
