import { expect, test, type Download } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "e2e-admin", password = "e2e-admin-pass") {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(username === "e2e-guru" ? /\/attendance$/ : /\/admin$/);
}

async function verifyDownload(download: Download, format: "pdf" | "xlsx", type: string) {
  expect(download.suggestedFilename()).toBe(`laporan-absensi-${type}.${format}`);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const content = Buffer.concat(chunks);
  if (format === "pdf") expect(content.subarray(0, 5).toString()).toBe("%PDF-");
  else expect(content.subarray(0, 2).toString()).toBe("PK");
}

test.beforeEach(async ({ page }) => login(page));

test("filters and downloads daily, KBM, and exam reports as PDF and Excel", async ({ page }) => {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Laporan" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Laporan" })).toBeVisible();

  await page.getByRole("button", { name: "Filter laporan" }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filter laporan" });
  await expect(filterDialog).toBeVisible();
  await filterDialog.getByLabel("Tanggal mulai").fill(date);
  await filterDialog.getByLabel("Tanggal selesai").fill(date);
  await filterDialog.getByLabel("Rombel").selectOption({ label: "E2E Kelas 7A" });
  await filterDialog.getByLabel("Status").selectOption("HADIR");
  await filterDialog.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(filterDialog).toBeHidden();
  await expect(page.getByText("1 catatan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Report Siswa" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hadir" })).toBeVisible();
  for (const format of ["pdf", "xlsx"] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: format === "pdf" ? "Unduh PDF" : "Unduh Excel" }).click();
    await verifyDownload(await download, format, "daily");
  }

  await page.getByRole("button", { name: "Filter laporan" }).click();
  const classDialog = page.getByRole("dialog", { name: "Filter laporan" });
  await classDialog.getByLabel("Jenis laporan").selectOption("class");
  await classDialog.getByLabel("Tanggal mulai").fill(date);
  await classDialog.getByLabel("Tanggal selesai").fill(date);
  await classDialog.getByLabel("Rombel").selectOption({ label: "E2E Kelas 7A" });
  await classDialog.getByLabel("Mata pelajaran").selectOption({ label: "E2E Matematika" });
  await classDialog.getByLabel("Sesi").selectOption({ label: "E2E KBM" });
  await classDialog.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(page.getByText("1 catatan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E KBM" })).toBeVisible();
  for (const format of ["pdf", "xlsx"] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: format === "pdf" ? "Unduh PDF" : "Unduh Excel" }).click();
    await verifyDownload(await download, format, "class");
  }

  await page.getByRole("button", { name: "Filter laporan" }).click();
  const examDialog = page.getByRole("dialog", { name: "Filter laporan" });
  await examDialog.getByLabel("Jenis laporan").selectOption("exam");
  await examDialog.getByLabel("Tanggal mulai").fill(date);
  await examDialog.getByLabel("Tanggal selesai").fill(date);
  const periodId = await examDialog.getByLabel("Periode ujian").locator("option")
    .filter({ hasText: "GANJIL" }).first().getAttribute("value");
  expect(periodId).toBeTruthy();
  await examDialog.getByLabel("Periode ujian").selectOption(periodId!);
  await examDialog.getByLabel("Rombel").selectOption({ label: "E2E Kelas 7A" });
  await examDialog.getByLabel("Cari siswa").fill("E2E Report");
  await examDialog.getByLabel("Siswa", { exact: true }).selectOption({ label: "E2E Report Siswa" });
  await examDialog.getByLabel("Mata pelajaran").selectOption({ label: "E2E Matematika" });
  await examDialog.getByLabel("Sesi").selectOption({ label: "E2E Ujian Matematika" });
  await examDialog.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(page.getByText("1 catatan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Ujian Matematika" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Izin" })).toBeVisible();
  for (const format of ["pdf", "xlsx"] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: format === "pdf" ? "Unduh PDF" : "Unduh Excel" }).click();
    await verifyDownload(await download, format, "exam");
  }
});

test("validates date ranges and restricts reports to admins", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports");
  await page.getByRole("button", { name: "Filter laporan" }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filter laporan" });
  await expect(filterDialog).toBeVisible();
  const applyBounds = await filterDialog.getByRole("button", { name: "Terapkan filter" }).boundingBox();
  expect(applyBounds?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await filterDialog.getByLabel("Tanggal mulai").fill("2026-02-02");
  await filterDialog.getByLabel("Tanggal selesai").fill("2026-02-01");
  await filterDialog.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(filterDialog.locator(".reports-error")).toContainText("Tanggal mulai harus sebelum");

  await login(page, "e2e-guru", "e2e-guru-pass");
  await expect(page).toHaveURL(/\/attendance$/);
});
