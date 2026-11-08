import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "e2e-admin", password = "e2e-admin-pass") {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("root entry offers login and attendance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Absensi Siswa SMPI" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Buka absensi" })).toHaveAttribute("href", "/attendance");
});

test("rejects invalid credentials without leaving login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("invalid-e2e-user");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page.locator(".login-error")).toContainText("Username atau password salah");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin login reaches protected dashboard and can log out", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("guru sees attendance navigation and is redirected away from admin pages", async ({ page }) => {
  await login(page, "e2e-guru", "e2e-guru-pass");
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByRole("heading", { name: "Absensi Harian" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Master Data" })).toHaveCount(0);
  await page.goto("/cards");
  await expect(page).toHaveURL(/\/attendance$/);
});

test("management entry redirects to the academic year resource", async ({ page }) => {
  await login(page);
  await page.goto("/management");
  await expect(page).toHaveURL(/\/management\/academic-years$/);
  await expect(page.getByRole("heading", { name: "Tahun Ajaran" }).first()).toBeVisible();
});

test("invalid saved access token is cleared and redirects to login", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("access_token", "invalid-e2e-token"));
  await page.goto("/attendance");
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("access_token"))).toBeNull();
});
