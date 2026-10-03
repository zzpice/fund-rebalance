# zp-folio · 债基再平衡助手

[![Tests](https://github.com/zzpice/zp-folio/actions/workflows/test.yml/badge.svg)](https://github.com/zzpice/zp-folio/actions/workflows/test.yml)

一个轻量、静态、本地计算的人民币债券基金再平衡工具。输入当前持仓和资金变动后，生成金额守恒、尽量少交易、容易执行的调整方案。

👉 [在线使用](https://zzpice.github.io/zp-folio/) · [GitHub 仓库](https://github.com/zzpice/zp-folio)

## 组合

| 基金 | 代码 | 目标比例 |
| --- | --- | ---: |
| 景顺长城景盛双息 A | 002065 | 50.00% |
| 易方达增强回报 A | 110017 | 33.33% |
| 广发纯债 A | 270048 | 12.50% |
| 长城短债 A | 007194 | 4.17% |

目标比例固定，是长期资产配置锚点。取现属于独立的流动性管理场景：优先消耗短债和纯债，必要时再动用固收增强，并允许取现后暂时偏离再平衡区间。

## 核心规则

- **5 / 25 触发**：单项容差取 5 个百分点与目标权重的 25% 中较小者；只有严格越界才触发内部再平衡。
- **80% 回调**：触发后，全部基金进入“目标 ± 80% × 外层容差”的回调区间，用于减少刚调整完又再次触发的情况。
- **最小换手**：在金额守恒且全部进入回调区间的前提下，使内部换手最小；若存在多个同样最小的解，按剩余目标偏离（缺口或超额）同比例配平。
- **新增资金**：优先按目标缺口补低配；资金流后仍越界时，才进行内部转换。
- **取出资金**：执行独立的流动性政策。如提款前已有高配，优先利用提款纠偏；其余按短债 → 纯债 → 固收增强取出。本次不追加内部转换，取现后组合允许暂时偏离再平衡区间。
- **无状态**：每次只根据当前持仓和本次资金变动计算，不记录历史原因。

所有金额按整数 CNY 计算，并保证最终持仓、交易净额与资金变动严格配平。

## v2.2 交互

- 双环配置图同时展示当前比例与固定目标比例。
- 支持一次粘贴 4 项持仓，减少重复输入。
- 执行清单优先展示真实买卖，无需操作的基金默认折叠。

## 使用与开发

项目不使用前端框架或构建步骤，可直接部署到 GitHub Pages，并支持 PWA。

```bash
git clone https://github.com/zzpice/zp-folio.git
cd zp-folio
npm ci
npx playwright install --with-deps chromium
npm test
npm run dev
```

开发服务默认运行于 `http://127.0.0.1:4173/`。完整测试覆盖单元测试、浏览器交互，以及根路径和 `/zp-folio/` 子路径下的 PWA 资源、更新和离线使用。

持仓不会上传、写入数据库或保存在浏览器中；只有外观偏好会保存在本机。

## GitHub Pages 与仓库改名

仓库名为 `zp-folio`，默认在线地址为 `https://zzpice.github.io/zp-folio/`。在 GitHub 仓库 **Settings → General → Repository name** 中完成改名，并在 **Settings → Pages** 中确认从 `main` 分支的 `/ (root)` 发布；现有测试工作流不承担 Pages 部署。更新仓库 **About → Website** 为新的在线地址，随后确认 Pages 构建成功和 Actions 测试通过。

页面资源、模块导入、Service Worker 注册及缓存资源都使用相对路径；manifest 的 `id`、`start_url`、`scope` 均保持 `./`，无需写死仓库路径，也不需要构建步骤或新增部署工作流。

新 Service Worker 使用 `zp-folio-v<版本>` 缓存，只清理本项目的过期缓存。保留 `rmb-rebalancer-` 和 `bond-rebalancer-` 前缀用于删除历史缓存；主题设置继续使用 `rmb-rebalancer-theme`，以保留同一站点来源下的已有外观偏好。

GitHub 仓库旧链接会重定向，但旧 GitHub Pages 地址不会自动重定向。请更新书签；已经安装的旧 PWA 仍指向旧路径，需要从新地址重新安装。本地已有克隆可在 GitHub 完成改名后执行：

```bash
git remote set-url origin https://github.com/zzpice/zp-folio.git
```

当前版本：**v2.2.0**

## License

本项目使用 [MIT License](./LICENSE)。

## Disclaimer

本工具仅用于个人资产配置计算，不构成投资建议。
