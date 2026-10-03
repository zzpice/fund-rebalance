# zp-folio

[![Tests](https://github.com/zzpice/zp-folio/actions/workflows/test.yml/badge.svg)](https://github.com/zzpice/zp-folio/actions/workflows/test.yml)

本地计算的组合调整工具：填写持仓与资金变动 → 生成执行清单。支持批量输入、配置图和方案复制。

👉 [在线使用](https://zzpice.github.io/zp-folio/) · [GitHub 仓库](https://github.com/zzpice/zp-folio)

## 组合

| 基金 | 代码 | 目标比例 |
| --- | --- | ---: |
| 景顺长城景盛双息 A | 002065 | 50.00% |
| 易方达增强回报 A | 110017 | 33.33% |
| 广发纯债 A | 270048 | 12.50% |
| 长城短债 A | 007194 | 4.17% |

目标比例固定。金额以“万”输入，最多 4 位小数；结果以 `¥` 展示，精确到整数。

## 规则

- **触发**：容差 = min(5 个百分点, 目标 × 25%)；边界不触发。
- **回调**：越界 → 全部进入“目标 ± 80% × 容差”，内部换手最小；最小解不唯一时，按剩余目标缺口或超额同比例配平。
- **＋新增**：按目标缺口补低配；仍越界 → 内部转换。
- **−取出**：先纠正原有高配；再按 007194 → 270048 取出，剩余由 002065 / 110017 按持仓比例分配。不追加内部转换，允许暂时越界。
- **守恒**：调整后总额 = 当前总额 + 资金变动；买入 − 卖出 = 资金变动。

每次独立计算，仅使用当前持仓与本次资金变动。

## 使用与开发

静态页面，无需构建。支持 GitHub Pages 与 PWA。

```bash
git clone https://github.com/zzpice/zp-folio.git
cd zp-folio
npm ci
npx playwright install --with-deps chromium
npm test
npm run dev
```

开发地址：`http://127.0.0.1:4173/`。测试覆盖计算规则、浏览器交互，以及根路径和 `/zp-folio/` 下的 PWA 更新与离线使用。

持仓不上传、不保存；本机仅保存主题偏好。

## PWA 与缓存

资源和 Service Worker 使用相对路径；manifest 的 `id`、`start_url`、`scope` 均为 `./`。

缓存：`zp-folio-v<版本>`，仅清理同前缀的过期版本。主题键：`zp-folio-theme`。

当前版本：**v2.2.0**

[MIT License](./LICENSE)。仅供配置计算，不构成投资建议。
