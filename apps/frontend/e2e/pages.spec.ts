import { expect, test } from "@playwright/test";

const protectedPages = [
  ["/admin", "Dashboard"],
  ["/attendance", "Absensi Harian"],
  ["/exam-attendance", "Absensi Ujian"],
  ["/cards", "Kartu Pelajar"],
  ["/exam-cards", "Kartu Ujian"],
  ["/reports", "Laporan"],
  ["/management/academic-years", "Tahun Ajaran"],
  ["/management/users", "User"],
  ["/management/teachers", "Guru"],
  ["/management/subjects", "Mata Pelajaran"],
  ["/management/rombels", "Rombel"],
  ["/management/students", "Siswa"],
  ["/schedules/subjects", "Jadwal Mapel"],
  ["/schedules/exam-periods", "Periode Ujian"],
  ["/schedules/exams", "Jadwal Ujian"],
  ["/schedules/breaks", "Jadwal Istirahat"],
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("e2e-admin");
  await page.getByLabel("Password", { exact: true }).fill("e2e-admin-pass");
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("navigation")).toBeVisible();
});

for (const [path, title] of protectedPages) {
  test(`${path} renders its module`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
  });
}

test("weekly schedule grid shows its page title and header", async ({ page }) => {
  await page.goto("/schedules/weekly");
  await expect(page.getByRole("banner").getByRole("heading", { name: "Grid Jadwal" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Grid Jadwal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter jadwal mingguan" })).toBeVisible();
  await expect(page.locator(".weekly-day-card")).toHaveCount(6);
});

test("unknown route shows the not-found page", async ({ page }) => {
  await page.goto("/e2e-not-a-route");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("mobile navigation opens, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const menuButton = page.getByRole("button", { name: "Buka menu" });
  const bounds = await menuButton.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await menuButton.click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "Data Jadwal" }).click();
  await page.getByRole("link", { name: "Periode Ujian" }).click();
  await expect(page).toHaveURL(/\/schedules\/exam-periods$/);
  await expect(page.getByRole("heading", { name: "Periode Ujian" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Buka menu" })).toBeVisible();
});
