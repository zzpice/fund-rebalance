# 仓库协作约定

- 默认直接在 `main` 修改、提交并推送；只有仓库保护规则要求时才使用分支和 Pull Request。
- 这是固定四基金、固定规则的本地优先再平衡工具，不自行泛化为通用投资平台。
- 计算逻辑必须保持整数金额守恒；修改 `src/portfolio.js` 或 `src/rebalance.js` 时必须同步补充或更新测试。
- 提交前运行 `npm test`，版本相关改动须保持页面、package、manifest、模块与 Service Worker 一致。
- GitHub Release 标题统一使用英文，格式为 `vX.Y.Z — English Title`；Release Notes 正文可以使用中文。
- 不增加后端、登录、云同步、行情接口或远程持久化，除非用户明确要求。
- `styles/design.css` 是 ZZP 公共视觉变量的本地副本，原文件与规范在 `zzp-home`；修改公共变量时同轮同步相关网页，保留项目专用布局、数据与存储边界。
