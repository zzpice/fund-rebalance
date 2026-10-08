import { test, expect } from "@playwright/test";

test("PWA 外壳、模块与在线更新可用", async ({ page, request, baseURL, browserName, context }) => {
  const assets = [
    "./LICENSE",
    "./manifest.webmanifest",
    "./manifest-dark.webmanifest",
    "./src/theme.js",
    "./service-worker.js",
    "./styles/app.css",
    "./src/app.js",
    "./src/portfolio.js",
    "./src/rebalance.js",
    "./src/format.js"
  ];
  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.ok(), asset).toBe(true);
  }

  const manifestResponse = await request.get("./manifest.webmanifest");
  const manifest = await manifestResponse.json();
  const appURL = new URL("./", baseURL).href;
  for (const key of ["start_url", "scope"]) {
    expect(new URL(manifest[key], manifestResponse.url()).href, key).toBe(appURL);
  }
  expect(new URL(manifest.id, new URL(appURL).origin).href).toBe(new URL("/zp-folio/", appURL).href);
  for (const icon of manifest.icons) {
    const asset = new URL(icon.src, manifestResponse.url()).href;
    const response = await request.get(asset);
    expect(response.ok(), asset).toBe(true);
  }

  const cacheName = `zp-folio-v${manifest.version}`;

  await page.goto("./");
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    const parsed = await session.send("Page.getAppManifest");
    expect(parsed.manifest.id).toBe(new URL("/zp-folio/", appURL).href);
    await session.detach();
  }
  const iconURLs = [...new Set(manifest.icons.map(icon => new URL(icon.src, appURL).href))];
  iconURLs.push(new URL("./icons/apple-touch-icon.png", appURL).href);
  await page.evaluate(async urls => {
    for (const url of urls) {
      const icon = new Image();
      icon.src = url;
      await icon.decode();
      if (!icon.naturalWidth || !icon.naturalHeight) throw new Error(`图标无法解码：${url}`);
    }
  }, iconURLs);
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, active: Boolean(ready.active), scriptURL: ready.active?.scriptURL };
  });
  expect(registration.active).toBe(true);
  expect(registration.scope).toBe(appURL);
  expect(registration.scriptURL).toBe(new URL("./service-worker.js", appURL).href);
  expect(await page.evaluate(() => caches.keys())).toContain(cacheName);

  // A newer network module must not replace only part of the installed generation.
  await page.route('**/src/app.js', route => route.fulfill({
    contentType:'application/javascript', body:"throw new Error('mixed generation');"
  }));
  await page.reload();
  await expect(page.locator(".holding-input")).toHaveCount(4);
  const cachedApp = await page.evaluate(async cacheName => {
    const cache = await caches.open(cacheName);
    const response = await cache.match(new URL("./src/app.js", location.href).href);
    return response?.text();
  }, cacheName);
  expect(cachedApp).toContain("from \"./portfolio.js\"");
});

test("Service Worker 清理过期缓存，保留当前与无关缓存", async ({ page, request }) => {
  const manifest = await (await request.get("./manifest.webmanifest")).json();
  const currentCache = `zp-folio-v${manifest.version}`;
  const staleCaches = ["zp-folio-v0.0.0"];
  const unrelatedCache = "another-app-v1";

  await page.goto("./");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.evaluate(async cacheNames => {
    await Promise.all(cacheNames.map(cacheName => caches.open(cacheName)));
  }, [...staleCaches, unrelatedCache]);

  const before = await page.evaluate(() => caches.keys());
  staleCaches.forEach(cacheName => expect(before).toContain(cacheName));

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error("Service Worker 未注册");
    await registration.unregister();
  });

  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(
    expect.not.arrayContaining(staleCaches)
  );
  expect(await page.evaluate(() => caches.keys())).toEqual(
    expect.arrayContaining([currentCache, unrelatedCache])
  );
});

test("PWA 离线可计算，更新失败保留方案，联网后可刷新版本", async ({ page, context, browserName }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  await context.setOffline(true);
  // Playwright WebKit rejects offline navigation before dispatching to a Service Worker.
  // Chromium covers offline startup; WebKit still exercises computation and failed refresh offline.
  if (browserName !== "webkit") await page.reload();
  await expect(page.locator(".holding-input")).toHaveCount(4);
  await expect(page.locator(".app-header")).toHaveCSS("position", "sticky");
  for (const [index, value] of ["50", "33.33", "12.5", "4.17"].entries()) {
    await page.locator(`#holding-${index}`).fill(value);
  }
  await page.getByRole("button", { name: "生成方案" }).click();
  await expect(page.locator("#decisionTitle")).toHaveText("无需调整");
  await expect(page.locator("#internalTurnover")).toHaveText("¥0");

  await page.locator("[data-refresh-version]").click();
  await expect(page.locator("#statusBanner")).toContainText("本次输入与方案已保留");
  await expect(page.locator("#statusBanner")).toBeInViewport();
  await expect(page.locator("#holding-0")).toHaveValue("50");
  await expect(page.locator("#planContent")).toBeVisible();
  await expect(page.locator("[data-refresh-version]")).toBeEnabled();

  await context.setOffline(false);
  await page.locator("[data-refresh-version]").click();
  await expect(page.locator("#holding-0")).toHaveValue("");
  await expect(page.locator(".holding-input")).toHaveCount(4);
});

test("主题偏好使用新键并在刷新后保留", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    if (localStorage.getItem("zp-folio-theme") === null) {
      localStorage.setItem("zp-folio-theme", "dark");
    }
  });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#themeColor")).toHaveAttribute("content", "#121619");
  await page.locator(".theme-menu summary").click();
  await page.getByRole("radio", {name:"浅色",exact:true}).check();
  expect(await page.evaluate(() => localStorage.getItem("zp-folio-theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
