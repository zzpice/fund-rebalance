import {test, expect} from '@playwright/test';

async function choose(page, mode) {
  const menu = page.locator('.theme-menu');
  if (!await menu.evaluate(el => el.open)) await menu.locator('summary').click();
  await menu.locator(`[value="${mode}"]`).check();
}

test('三种外观响应系统、保存覆盖、跨标签页同步并恢复系统', async ({page, context}) => {
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'system');
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({colorScheme});
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
  }
  await choose(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const tab = await context.newPage();
  await tab.emulateMedia({colorScheme:'dark'});
  await tab.goto('/');
  await expect(tab.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
  await choose(tab, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(tab.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(tab.locator('#themeColor')).toHaveAttribute('content', '#f6f7f8');
  await choose(tab, 'system');
  await expect(tab.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('fund-rebalance-theme'))).toBeNull();
  await tab.close();
  await choose(page, 'dark');
  const dark = await page.evaluate(async () => await (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  await choose(page, 'light');
  const light = await page.evaluate(async () => await (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  expect(dark.theme_color).toBe('#121619');
  expect(dark.background_color).toBe('#121619');
  for (const key of ['id','scope','start_url','icons']) expect(dark[key]).toEqual(light[key]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator('.theme-menu summary')).toBeFocused();
});

test('存储不可用仍可切换并恢复系统', async ({page}) => {
  await page.emulateMedia({colorScheme:'dark'});
  await page.addInitScript(() => {
    for (const name of ['getItem','setItem','removeItem']) Storage.prototype[name] = () => { throw new DOMException('Unavailable', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await choose(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choose(page, 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('非法旧主题值回退到系统', async ({page}) => {
  await page.emulateMedia({colorScheme:'dark'});
  await page.addInitScript(() => localStorage.setItem('fund-rebalance-theme','invalid'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
