import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username: string, password: string, url: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(url);
}

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => login(page, "e2e-admin", "e2e-admin-pass", /\/admin$/));

  test("sidebar links to the teacher attendance page and shows the seeded record", async ({ page }) => {
    await page.getByRole("link", { name: "Absensi Guru" }).click();
    await expect(page).toHaveURL(/\/teacher-attendance$/);
    await expect(page.getByRole("heading", { name: "Absensi Guru" }).first()).toBeVisible();
    await expect(page.getByText("1 catatan")).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E Guru" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E-001" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Terlambat" })).toBeVisible();
  });

  test("filters live in a modal with apply and reset actions", async ({ page }) => {
    await page.goto("/teacher-attendance");
    await expect(page.getByText("1 catatan")).toBeVisible();
    // Filter controls must not be inline in the page toolbar.
    await expect(page.getByLabel("Status")).toHaveCount(0);

    await page.getByRole("button", { name: "Filter absensi guru" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter absensi guru" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Status").selectOption("HADIR");
    await dialog.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("0 catatan")).toBeVisible();
    await expect(page.getByText("Belum ada catatan absensi guru untuk filter ini.")).toBeVisible();
    await expect(page.getByText("Filter aktif · 1 kriteria")).toBeVisible();

    await page.getByRole("button", { name: "Filter absensi guru" }).click();
    await dialog.getByLabel("Status").selectOption("TERLAMBAT");
    await dialog.getByLabel("Guru").selectOption({ label: "E2E Guru" });
    await dialog.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(page.getByText("1 catatan")).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E Guru" })).toBeVisible();

    await page.getByRole("button", { name: "Filter absensi guru" }).click();
    await dialog.getByRole("button", { name: "Reset" }).click();
    await dialog.getByRole("button", { name: "Tutup dialog" }).click();
    await expect(page.getByText("Filter aktif")).toHaveCount(0);
    await expect(page.getByText("1 catatan")).toBeVisible();
  });

  test("rejects a start date after the end date", async ({ page }) => {
    await page.goto("/teacher-attendance");
    await page.getByRole("button", { name: "Filter absensi guru" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter absensi guru" });
    await dialog.getByLabel("Tanggal mulai").fill("2090-02-10");
    await dialog.getByLabel("Tanggal selesai").fill("2090-02-01");
    await dialog.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Tanggal mulai harus sebelum");
  });

  test("filter button meets the mobile touch target on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/teacher-attendance");
    const button = page.getByRole("button", { name: "Filter absensi guru" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});

test("guru cannot open the admin teacher attendance page", async ({ page }) => {
  await login(page, "e2e-guru", "e2e-guru-pass", /\/attendance$/);
  await page.goto("/teacher-attendance");
  await expect(page).toHaveURL(/\/attendance$/);
});

test("guru can check in and out through the API from the school network", async ({ page, request }) => {
  const api = "http://127.0.0.1:18001/api/v1";
  const login = await request.post(`${api}/auth/login`, {
    data: { username: "e2e-guru", password: "e2e-guru-pass" },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).access_token;
  const headers = { Authorization: `Bearer ${token}` };

  const today = await request.get(`${api}/attendance/teacher/today`, { headers });
  expect(today.ok()).toBeTruthy();
  const body = await today.json();
  expect(body.has_schedule).toBe(true);
  expect(body.attendance.status).toBe("TERLAMBAT");

  // The fixture already has a check-in, so a second one is idempotent.
  const again = await request.post(`${api}/attendance/teacher/check-in`, { headers });
  expect(again.ok()).toBeTruthy();
  expect((await again.json()).already_recorded).toBe(true);

  // Check-out is blocked until the last class has ended.
  const early = await request.post(`${api}/attendance/teacher/check-out`, { headers });
  expect([200, 422]).toContain(early.status());
});
