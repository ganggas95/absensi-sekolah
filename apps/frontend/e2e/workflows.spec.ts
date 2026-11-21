import { expect, test } from "@playwright/test";

async function loginAs(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
  url: RegExp,
) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("navigation")).toBeVisible();
}

async function login(page: import("@playwright/test").Page) {
  await loginAs(page, "e2e-admin", "e2e-admin-pass", /\/admin$/);
}

const authHeaders = (token: string) => ({ Authorization: "Bearer " + token });

test.beforeEach(async ({ page }) => login(page));

test("creates a subject and student and verifies both persist after reload", async ({ page }) => {
  const suffix = Date.now().toString().slice(-7);

  await page.goto("/management/subjects");
  await page.getByRole("button", { name: "Tambah Mata Pelajaran" }).click();
  await page.getByPlaceholder("Kode, contoh: MTK").fill(`E${suffix}`);
  await page.getByPlaceholder("Nama Mata Pelajaran").fill(`E2E Pelajaran ${suffix}`);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`E2E Pelajaran ${suffix}`)).toBeVisible();
  await page.locator("tbody tr").filter({ hasText: `E2E Pelajaran ${suffix}` })
    .getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("Nama Mata Pelajaran").fill(`E2E Pelajaran Updated ${suffix}`);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`E2E Pelajaran Updated ${suffix}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`E2E Pelajaran Updated ${suffix}`)).toBeVisible();

  await page.goto("/management/students");
  await page.getByRole("button", { name: "Tambah Siswa" }).click();
  await page.getByPlaceholder("NISN (opsional)").fill(`E2E-${suffix}`);
  await page.getByPlaceholder("Nama lengkap").fill(`Siswa E2E ${suffix}`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  const cropDialog = page.getByRole("heading", { name: "Sesuaikan foto siswa" })
    .locator("xpath=ancestor::dialog[1]");
  await expect(cropDialog).toBeVisible();
  await expect(cropDialog.getByText("Foto tidak dapat dibuka")).toBeVisible();
  await cropDialog.getByRole("button", { name: "Batal" }).click();
  const studentDialog = page.getByRole("dialog", { name: "Tambah Siswa" });
  await studentDialog.locator("form select").nth(0).selectOption("L");
  await studentDialog.locator("form select").nth(1).selectOption({ label: "E2E Kelas 7A" });
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Siswa E2E ${suffix}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Siswa E2E ${suffix}`)).toBeVisible();
});

test("creates year, user, teacher profile, and rombel", async ({ page }) => {
  const suffix = Date.now().toString().slice(-7);
  const yearName = "2077/2078";

  await page.goto("/management/academic-years");
  await page.getByRole("button", { name: "Tambah Tahun Ajaran" }).click();
  await page.getByPlaceholder("Contoh: 2025/2026").fill(yearName);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(yearName)).toBeVisible();

  await page.goto("/management/users");
  await page.getByRole("button", { name: "Tambah User" }).click();
  await page.getByPlaceholder("Username").fill(`e2e-${suffix}`);
  await page.getByPlaceholder("Nama lengkap").fill(`Guru E2E ${suffix}`);
  await page.getByPlaceholder("Password", { exact: true }).fill("teacher-e2e-pass");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`e2e-${suffix}`)).toBeVisible();

  await page.goto("/management/teachers");
  await page.getByRole("button", { name: "Tambah Guru" }).click();
  const teacherDialog = page.getByRole("dialog", { name: "Tambah Guru" });
  await teacherDialog.locator("form select").nth(0).selectOption({ label: `Guru E2E ${suffix} (e2e-${suffix})` });
  await page.getByPlaceholder("NIP (opsional)").fill(`NIP-${suffix}`);
  await teacherDialog.locator("form select[multiple]").selectOption({ label: "E2E-MTK — E2E Matematika" });
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: `Guru E2E ${suffix}` })).toBeVisible();

  await page.goto("/management/rombels");
  await page.getByRole("button", { name: "Tambah Rombel" }).click();
  await page.getByPlaceholder("Nama rombel").fill(`Rombel E2E ${suffix}`);
  const rombelDialog = page.getByRole("dialog", { name: "Tambah Rombel" });
  await rombelDialog.locator("form select").nth(0).selectOption({ label: yearName });
  await rombelDialog.locator("form select").nth(1).selectOption({ label: `Guru E2E ${suffix}` });
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Rombel E2E ${suffix}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Rombel E2E ${suffix}`)).toBeVisible();
});

test("searches and filters every Master Data module", async ({ page }) => {
  const modules = [
    { path: "/management/academic-years", title: "Tahun Ajaran", search: "2098/2099", field: "Status", value: "true" },
    { path: "/management/users", title: "User", search: "e2e-admin", field: "Role", value: "ADMIN" },
    { path: "/management/teachers", title: "Guru", search: "E2E Guru", field: "Status", value: "true" },
    { path: "/management/subjects", title: "Mata Pelajaran", search: "E2E-MTK", field: "Status", value: "true" },
    { path: "/management/rombels", title: "Rombel", search: "E2E Kelas 7A", field: "Tahun ajaran", value: "2098/2099" },
    { path: "/management/students", title: "Siswa", search: "E2E Siswa", field: "Jenis kelamin", value: "L" },
  ];

  for (const module of modules) {
    await page.goto(module.path);
    const searchTerms: string[] = [];
    const trackSearch = (request: import("@playwright/test").Request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname.endsWith(`/api/v1${module.path}`)) {
        const term = url.searchParams.get("q");
        if (term) searchTerms.push(term);
      }
    };
    page.on("request", trackSearch);
    const searchResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && new URL(response.url()).pathname.endsWith(`/api/v1${module.path}`)
      && new URL(response.url()).searchParams.get("q") === module.search,
    );
    await page.getByRole("searchbox", { name: `Cari ${module.title}` })
      .pressSequentially(module.search, { delay: 20 });
    const searchResponse = await searchResponsePromise;
    await page.waitForTimeout(350);
    page.off("request", trackSearch);
    expect(searchTerms).toEqual([module.search]);
    const searchUrl = new URL(searchResponse.url());
    expect(searchUrl.searchParams.get("q")).toBe(module.search);
    expect((await searchResponse.json()).total).toBeGreaterThan(0);
    await expect(page.locator("tbody tr").filter({ hasText: module.search })).toBeVisible();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    const filterDialog = page.getByRole("dialog", { name: `Filter ${module.title}` });
    await expect(filterDialog).toBeVisible();
    const filterField = filterDialog.getByRole("combobox", { name: module.field });
    const filterValue = module.field === "Tahun ajaran"
      ? await filterField.locator("option").filter({ hasText: module.value }).getAttribute("value")
      : module.value;
    expect(filterValue).toBeTruthy();
    await filterField.selectOption(filterValue!);
    const filterParameter = module.field === "Tahun ajaran" ? "academic_year_id"
      : module.field === "Jenis kelamin" ? "gender"
        : module.field === "Status" ? "is_active" : module.field.toLowerCase();
    const filterResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET"
        && url.pathname.endsWith(`/api/v1${module.path}`)
        && url.searchParams.get(filterParameter) === filterValue;
    });
    await filterDialog.getByRole("button", { name: "Terapkan filter" }).click();
    const filterResponse = await filterResponsePromise;
    const filterUrl = new URL(filterResponse.url());
    expect(filterUrl.searchParams.get(filterParameter)).toBe(filterValue);
    expect((await filterResponse.json()).total).toBeGreaterThan(0);
    await expect(filterDialog).toHaveCount(0);
    await expect(page.locator("tbody tr").filter({ hasText: module.search })).toBeVisible();
  }
});

test("paginates Master Data with a selectable page size", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  const suffix = Date.now().toString();
  for (let index = 0; index < 11; index += 1) {
    const response = await page.request.post("http://127.0.0.1:18001/api/v1/management/subjects", {
      headers: { Authorization: `Bearer ${token}` },
      data: { code: `PAGE-${suffix}-${index}`, name: `Pagination ${suffix} ${index}` },
    });
    expect(response.status()).toBe(201);
  }

  const firstPageResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/management/subjects") && response.url().includes("page=1"),
  );
  await page.goto("/management/subjects");
  const firstPageResponse = await firstPageResponsePromise;
  const firstPage = await firstPageResponse.json();
  expect(firstPage.items).toHaveLength(10);
  expect(firstPage.total).toBeGreaterThan(10);
  const tableRows = page.locator("tbody tr");
  await expect(tableRows).toHaveCount(10);
  const secondPageResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/management/subjects") && response.url().includes("page=2"),
  );
  await page.getByRole("button", { name: "Berikutnya" }).click();
  const secondPage = await secondPageResponsePromise.then((response) => response.json());
  expect(secondPage.items).toHaveLength(firstPage.total - 10);
  await expect(page.locator("tbody")).toContainText(`Pagination ${suffix}`);
  const resizedPageResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/management/subjects") && response.url().includes("limit=25"),
  );
  await page.getByLabel("Baris per halaman").selectOption("25");
  const resizedPage = await resizedPageResponsePromise.then((response) => response.json());
  expect(resizedPage.items).toHaveLength(resizedPage.total);
  expect(await tableRows.count()).toBe(resizedPage.total);
});

test("creates an exam period and an exam schedule", async ({ page }) => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 10);
  const dateValue = (value: Date) => {
    const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
  };

  await page.goto("/schedules/exam-periods");
  await page.getByRole("button", { name: "Tambah periode" }).click();
  await page.locator("dialog form select").nth(0).selectOption({ label: "2098/2099" });
  await page.locator("dialog form select").nth(1).selectOption("MID_SEMESTER");
  await page.getByLabel("Tanggal mulai").fill(dateValue(start));
  await page.getByLabel("Tanggal selesai").fill(dateValue(end));
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Periode ujian berhasil disimpan.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mid Semester" })).toBeVisible();

  await page.goto("/schedules/exams");
  await page.getByRole("button", { name: "Tambah jadwal" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Tambah Jadwal Ujian" });
  await scheduleDialog.getByRole("combobox").nth(0).selectOption({ label: "2098/2099" });
  const examPeriodValue = await scheduleDialog.getByRole("combobox").nth(1)
    .locator("option").filter({ hasText: "Semester Ganjil" }).getAttribute("value");
  expect(examPeriodValue).toBeTruthy();
  await scheduleDialog.getByRole("combobox").nth(1).selectOption(examPeriodValue!);
  await scheduleDialog.getByRole("combobox").nth(2).selectOption({ label: "E2E Kelas 7A" });
  await scheduleDialog.getByRole("combobox").nth(3).selectOption({ label: "E2E-MTK — E2E Matematika" });
  await scheduleDialog.getByRole("combobox").nth(4).selectOption({ label: "E2E Guru" });
  await scheduleDialog.locator('input[type="date"]').fill(dateValue(start));
  await scheduleDialog.locator('input[type="time"]').nth(0).fill("15:00");
  await scheduleDialog.locator('input[type="time"]').nth(1).fill("15:30");
  await scheduleDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Jadwal berhasil disimpan.")).toBeVisible();
  await expect(page.locator("tbody")).toContainText("E2E Matematika");
});

test("creates a routine subject schedule", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("Admin access token is missing.");
  const yearsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/academic-years", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(yearsResponse.status()).toBe(200);
  const years = await yearsResponse.json();
  const year = years.find((item: { year_name: string }) => item.year_name === "2098/2099");
  expect(year).toBeTruthy();
  const extraRombelResponse = await page.request.post("http://127.0.0.1:18001/api/v1/management/rombels", {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `E2E Kelas Gabungan ${Date.now()}`, academic_year_id: year.id },
  });
  expect(extraRombelResponse.status()).toBe(201);
  const extraRombel = await extraRombelResponse.json();

  await page.goto("/schedules/subjects");
  await page.getByRole("button", { name: "Tambah jadwal" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Tambah Jadwal Mapel" });
  await scheduleDialog.getByRole("combobox").nth(0).selectOption({ label: "2098/2099" });
  await scheduleDialog.getByPlaceholder("Judul jadwal").fill("E2E Jadwal KBM tambahan");
  await scheduleDialog.getByRole("checkbox", { name: "E2E Kelas 7A" }).check();
  const extraRombelName = extraRombel.name as string;
  await scheduleDialog.getByRole("checkbox", { name: extraRombelName }).check();
  await scheduleDialog.getByRole("combobox").nth(1).selectOption({ label: "E2E-MTK — E2E Matematika" });
  await scheduleDialog.getByRole("combobox").nth(2).selectOption({ label: "E2E Guru" });
  await scheduleDialog.getByRole("combobox").nth(3).selectOption("0");
  await scheduleDialog.locator('input[type="time"]').nth(0).fill("20:00");
  await scheduleDialog.locator('input[type="time"]').nth(1).fill("20:30");
  const createSchedule = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/api/v1/schedules/events"),
  );
  await scheduleDialog.getByRole("button", { name: "Simpan" }).click();
  const createdSchedule = await createSchedule.then((response) => response.json());
  await expect(page.getByText("Jadwal berhasil disimpan.")).toBeVisible();
  await expect(page.locator("tbody")).toContainText("E2E Jadwal KBM tambahan");
  await expect(page.locator("tbody")).toContainText(extraRombelName);
  expect(createdSchedule.rombel_ids).toHaveLength(2);
});

test("shows subject and break times together in the weekly grid", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("Admin access token is missing.");
  const headers = authHeaders(token);
  const create = async (path: string, data: Record<string, string | number | boolean | string[] | number[]>) => {
    const response = await page.request.post(`http://127.0.0.1:18001/api/v1${path}`, {
      headers,
      data,
    });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const yearsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/academic-years", { headers });
  const years = await yearsResponse.json();
  const year = years.find((item: { year_name: string }) => item.year_name === "2098/2099");
  const teachersResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/teachers", { headers });
  const subjectsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/subjects", { headers });
  const teacher = (await teachersResponse.json()).find((item: { full_name: string }) => item.full_name === "E2E Guru");
  const subject = (await subjectsResponse.json()).find((item: { code: string }) => item.code === "E2E-MTK");
  expect(year).toBeTruthy();
  expect(teacher).toBeTruthy();
  expect(subject).toBeTruthy();
  const rombel = await create("/management/rombels", {
    name: `Grid E2E ${Date.now()}`,
    academic_year_id: year.id,
  });
  await create("/schedules/events", {
    event_type: "KBM",
    title: "Grid E2E Matematika",
    academic_year_id: year.id,
    rombel_id: rombel.id,
    subject_id: subject.id,
    teacher_id: teacher.id,
    day_of_week: 0,
    start_time: "08:00:00",
    end_time: "08:35:00",
  });
  await create("/schedules/breaks", {
    day_of_weeks: [0, 1, 2, 3, 5],
    start_time: "12:20:00",
    end_time: "12:40:00",
  });
  await create("/schedules/breaks", {
    day_of_weeks: [4],
    start_time: "12:00:00",
    end_time: "12:20:00",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/schedules/weekly");
  await page.getByRole("button", { name: "Filter jadwal mingguan" }).click();
  const filters = page.getByRole("dialog", { name: "Filter jadwal mingguan" });
  await filters.getByLabel("Tahun ajaran").selectOption(year.id);
  await filters.getByLabel("Rombel").selectOption(rombel.id);
  const scheduleResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/schedules/events")
    && response.url().includes(`rombel_id=${rombel.id}`),
  );
  await filters.getByRole("button", { name: "Terapkan" }).click();
  await scheduleResponse;

  const monday = page.getByRole("region", { name: "Jadwal Senin" });
  const friday = page.getByRole("region", { name: "Jadwal Jumat" });
  await expect(monday).toContainText("E2E Matematika");
  await expect(monday).toContainText("12:20–12:40");
  await expect(friday).toContainText("12:00–12:20");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("groups weekdays with matching break times and keeps Friday separate", async ({ page }) => {
  await page.goto("/schedules/breaks");
  await page.getByRole("button", { name: "Tambah jadwal" }).click();
  const firstDialog = page.getByRole("dialog", { name: "Tambah Jadwal Istirahat" });
  for (const day of ["Senin", "Selasa", "Rabu", "Kamis", "Sabtu"]) {
    await firstDialog.getByRole("checkbox", { name: day }).check();
  }
  await firstDialog.getByLabel("Mulai istirahat").fill("10:20");
  await firstDialog.getByLabel("Selesai istirahat").fill("10:40");
  await firstDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(firstDialog).toBeHidden();
  const sharedBreak = page.locator("tbody tr").filter({ hasText: "10:20:00–10:40:00" });
  await expect(sharedBreak).toContainText("Senin, Selasa, Rabu, Kamis, Sabtu");

  await page.getByRole("button", { name: "Tambah jadwal" }).click();
  const fridayDialog = page.getByRole("dialog", { name: "Tambah Jadwal Istirahat" });
  await fridayDialog.getByRole("checkbox", { name: "Jumat" }).check();
  await fridayDialog.getByLabel("Mulai istirahat").fill("10:00");
  await fridayDialog.getByLabel("Selesai istirahat").fill("10:20");
  await fridayDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "10:00:00–10:20:00" }))
    .toContainText("Jumat");
});

test("takes attendance for students in every rombel of a shared schedule", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("Admin access token is missing.");
  const headers = authHeaders(token);
  const create = async (path: string, data: Record<string, string | number | boolean | string[]>) => {
    const response = await page.request.post(`http://127.0.0.1:18001/api/v1${path}`, {
      headers,
      data,
    });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const suffix = Date.now().toString().slice(-6);
  const yearsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/academic-years", { headers });
  const years = await yearsResponse.json();
  const year = years.find((item: { year_name: string }) => item.year_name === "2098/2099");
  const subjectsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/subjects", { headers });
  const subjects = await subjectsResponse.json();
  const subject = subjects.find((item: { code: string }) => item.code === "E2E-MTK");
  expect(year).toBeTruthy();
  expect(subject).toBeTruthy();

  const user = await create("/management/users", {
    username: `shared-${suffix}`,
    password: "shared-teacher-pass",
    full_name: `Guru Gabungan ${suffix}`,
    role: "GURU",
  });
  const teacher = await create("/management/teachers", { user_id: user.id });
  const assignedTeacher = await page.request.put(
    `http://127.0.0.1:18001/api/v1/management/teachers/${teacher.id}/subjects`,
    { headers, data: { subject_ids: [subject.id] } },
  );
  expect(assignedTeacher.status()).toBe(200);
  const firstRombel = await create("/management/rombels", {
    name: `Gabungan A ${suffix}`,
    academic_year_id: year.id,
  });
  const secondRombel = await create("/management/rombels", {
    name: `Gabungan B ${suffix}`,
    academic_year_id: year.id,
  });
  const firstStudent = await create("/management/students", {
    full_name: `Siswa Gabungan A ${suffix}`,
    rombel_id: firstRombel.id,
  });
  const secondStudent = await create("/management/students", {
    full_name: `Siswa Gabungan B ${suffix}`,
    rombel_id: secondRombel.id,
  });
  const today = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    weekday: "short",
  }).format(today);
  const dayOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  expect(dayOfWeek).toBeGreaterThanOrEqual(0);
  const schedule = await create("/schedules/events", {
    event_type: "KBM",
    title: `E2E Olahraga Gabungan ${suffix}`,
    academic_year_id: year.id,
    rombel_id: firstRombel.id,
    rombel_ids: [firstRombel.id, secondRombel.id],
    subject_id: subject.id,
    teacher_id: teacher.id,
    day_of_week: String(dayOfWeek),
    start_time: "09:00:00",
    end_time: "10:00:00",
  });
  expect(schedule.rombel_ids).toHaveLength(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/attendance");
  await page.getByRole("button", { name: new RegExp(`E2E Olahraga Gabungan ${suffix}`) }).click();
  await expect(page.getByText(`${firstRombel.name}, ${secondRombel.name}`).first()).toBeVisible();
  await expect(page.getByText(firstStudent.full_name)).toBeVisible();
  await expect(page.getByText(secondStudent.full_name)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  for (const student of [firstStudent, secondStudent]) {
    const response = page.waitForResponse((result) =>
      result.request().method() === "POST" && result.url().endsWith("/api/v1/attendance/daily/record"),
    );
    await page.getByRole("row").filter({ hasText: student.full_name })
      .getByRole("button", { name: "Hadir", exact: true }).click();
    expect((await response).status()).toBe(200);
  }
});

test("filters subject and exam schedules in a modal", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("Admin access token is missing.");
  const headers = authHeaders(token);
  const create = async (path: string, data: Record<string, string | number | boolean | string[]>) => {
    const response = await page.request.post(`http://127.0.0.1:18001/api/v1${path}`, {
      headers,
      data,
    });
    expect(response.status()).toBe(201);
    return response.json();
  };

  const suffix = Date.now().toString().slice(-6);
  const yearName = `2099/${suffix}`;
  const year = await create("/management/academic-years", { year_name: yearName });
  const rombelName = `Filter E2E ${suffix}`;
  const rombel = await create("/management/rombels", {
    name: rombelName,
    academic_year_id: year.id,
  });
  const teachersResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/teachers", { headers });
  const subjectsResponse = await page.request.get("http://127.0.0.1:18001/api/v1/management/subjects", { headers });
  expect(teachersResponse.status()).toBe(200);
  expect(subjectsResponse.status()).toBe(200);
  const teachers = await teachersResponse.json();
  const subjects = await subjectsResponse.json();
  const teacher = teachers.find((item: { full_name: string }) => item.full_name === "E2E Guru");
  const subject = subjects.find((item: { code: string }) => item.code === "E2E-MTK");
  expect(teacher).toBeTruthy();
  expect(subject).toBeTruthy();

  const examDate = "2099-01-05";
  const examPeriod = await create("/schedules/exam-periods", {
    academic_year_id: year.id,
    period_type: "GANJIL",
    start_date: "2099-01-01",
    end_date: "2099-01-31",
  });
  const scheduleFields = {
    academic_year_id: year.id,
    rombel_id: rombel.id,
    subject_id: subject.id,
    teacher_id: teacher.id,
    start_time: "08:00:00",
    end_time: "09:00:00",
  };
  for (let index = 0; index < 11; index += 1) {
    const startHour = String(7 + index).padStart(2, "0");
    const endHour = String(8 + index).padStart(2, "0");
    await create("/schedules/events", {
      ...scheduleFields,
      event_type: "KBM",
      title: `Filter KBM ${suffix} ${index}`,
      day_of_week: 1,
      start_time: `${startHour}:00:00`,
      end_time: `${endHour}:00:00`,
    });
  }
  await create("/schedules/events", {
    ...scheduleFields,
    event_type: "EXAM",
    title: `Filter Ujian ${suffix}`,
    exam_period_id: examPeriod.id,
    schedule_date: examDate,
  });

  const verifyFilters = async (path: string, title: string, day: number, expectedRows: number) => {
    await page.goto(path);
    const openFilters = async () => {
      await page.getByRole("button", { name: `Filter ${title}` }).click();
      return page.getByRole("dialog", { name: `Filter ${title}` });
    };
    const verifyAppliedFilter = async (field: string, value: string, expectedRows: number) => {
      const dialog = await openFilters();
      await dialog.getByLabel(field).selectOption(value);
      const filteredRequest = page.waitForRequest((request) =>
        request.url().includes("/api/v1/schedules/events")
        && request.url().includes(`${field === "Hari" ? "day_of_week" : field === "Rombel" ? "rombel_id" : "academic_year_id"}=${value}`),
      );
      await dialog.getByRole("button", { name: "Terapkan filter" }).click();
      await filteredRequest;
      await expect(dialog).toBeHidden();
      await expect(page.locator("tbody tr")).toHaveCount(Math.min(expectedRows, 10));
      await expect(page.getByText(`Halaman 1 dari ${Math.ceil(expectedRows / 10)}`)).toBeVisible();
      if (expectedRows > 10) {
        await page.getByRole("button", { name: "Berikutnya" }).click();
        await expect(page.locator("tbody tr")).toHaveCount(expectedRows - 10);
        await page.getByRole("button", { name: "Sebelumnya" }).click();
        await expect(page.locator("tbody tr")).toHaveCount(10);
      }
      const resetDialog = await openFilters();
      await resetDialog.getByRole("button", { name: "Reset" }).click();
      await expect(resetDialog).toBeHidden();
    };

    await verifyAppliedFilter("Tahun ajaran", year.id, expectedRows);
    await verifyAppliedFilter("Rombel", rombel.id, expectedRows);
    await verifyAppliedFilter("Hari", String(day), expectedRows);

    const dialog = await openFilters();
    await dialog.getByLabel("Tahun ajaran").selectOption(year.id);
    await dialog.getByLabel("Rombel").selectOption(rombel.id);
    await dialog.getByLabel("Hari").selectOption(String(day));
    await dialog.getByRole("button", { name: "Terapkan filter" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("tbody tr")).toHaveCount(Math.min(expectedRows, 10));
    const resetDialog = await openFilters();
    await resetDialog.getByRole("button", { name: "Reset" }).click();
    await expect(resetDialog).toBeHidden();
    await expect(page.getByText("Filter aktif")).toHaveCount(0);
  };

  await verifyFilters("/schedules/subjects", "Jadwal Mapel", 1, 11);
  const examWeekday = (new Date(`${examDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  await verifyFilters("/schedules/exams", "Jadwal Ujian", examWeekday, 1);
});

test("records daily and exam attendance through the staff pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/attendance");
  await page.getByRole("button", { name: /E2E KBM/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  const dailyRecordResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/attendance/daily/record"),
  );
  await page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("button", { name: "Hadir", exact: true }).click();
  expect((await dailyRecordResponse).status()).toBe(200);
  await expect(page.locator(".inline-message")).toContainText("E2E Siswa berhasil tercatat hadir.");
  await expect(page.getByRole("cell", { name: "Siswa: E2E Siswa", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("cell", { name: /^Waktu absensi:/ })).toContainText(/\d{2}\.\d{2}/);
  await page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("button", { name: "Hadir", exact: true }).click();
  await expect(page.locator(".inline-message")).toContainText("E2E Siswa sudah tercatat pada sesi ini.");

  await page.goto("/admin");
  await expect(page.getByRole("cell", { name: /E2E Siswa/ })).toBeVisible();

  await page.goto("/exam-attendance");
  const eventValue = await page.getByLabel("Pilih sesi ujian")
    .locator("option").filter({ hasText: "E2E Ujian Matematika" }).getAttribute("value");
  expect(eventValue).toBeTruthy();
  await page.getByLabel("Pilih sesi ujian").selectOption(eventValue!);
  await expect(page.getByText("E2E Siswa").first()).toBeVisible();
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  await page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("button", { name: "Hadir", exact: true }).click();
  await expect(page.getByText("HADIR").first()).toBeVisible();
});

test("keeps attendance sessions separate for different teachers on the same rombel and day", async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("Admin access token is missing.");
  const headers = authHeaders(token);
  const create = async (path: string, data: Record<string, string | number | boolean | string[]>) => {
    const response = await page.request.post(`http://127.0.0.1:18001/api/v1${path}`, {
      headers,
      data,
    });
    expect(response.status()).toBe(201);
    return response.json();
  };

  const suffix = Date.now().toString().slice(-6);
  const years = await (await page.request.get("http://127.0.0.1:18001/api/v1/management/academic-years", { headers })).json();
  const year = years.find((item: { is_active: boolean }) => item.is_active);
  expect(year).toBeTruthy();
  const subjects = await (await page.request.get("http://127.0.0.1:18001/api/v1/management/subjects", { headers })).json();
  const subject = subjects.find((item: { code: string }) => item.code === "E2E-MTK");
  expect(subject).toBeTruthy();
  const teachers = await (await page.request.get("http://127.0.0.1:18001/api/v1/management/teachers", { headers })).json();
  const firstTeacher = teachers.find((item: { full_name: string }) => item.full_name === "E2E Guru");
  expect(firstTeacher).toBeTruthy();

  const rombel = await create("/management/rombels", {
    name: `Sesi Rombel ${suffix}`,
    academic_year_id: year.id,
  });
  const student = await create("/management/students", {
    full_name: `Sesi Siswa ${suffix}`,
    rombel_id: rombel.id,
  });
  const secondUsername = `sesi-${suffix}`;
  const secondUser = await create("/management/users", {
    username: secondUsername,
    password: "sesi-teacher-pass",
    full_name: `Guru Sesi ${suffix}`,
    role: "GURU",
  });
  const secondTeacher = await create("/management/teachers", { user_id: secondUser.id });
  const assigned = await page.request.put(
    `http://127.0.0.1:18001/api/v1/management/teachers/${secondTeacher.id}/subjects`,
    { headers, data: { subject_ids: [subject.id] } },
  );
  expect(assigned.status()).toBe(200);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    weekday: "short",
  }).format(new Date());
  const dayOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const scheduleFields = {
    event_type: "KBM",
    academic_year_id: year.id,
    rombel_id: rombel.id,
    subject_id: subject.id,
    day_of_week: dayOfWeek,
  };
  const firstScheduleTitle = `Sesi Pagi ${suffix}`;
  const secondScheduleTitle = `Sesi Siang ${suffix}`;
  await create("/schedules/events", {
    ...scheduleFields,
    title: firstScheduleTitle,
    teacher_id: firstTeacher.id,
    start_time: "11:00:00",
    end_time: "12:00:00",
  });
  await create("/schedules/events", {
    ...scheduleFields,
    title: secondScheduleTitle,
    teacher_id: secondTeacher.id,
    start_time: "13:00:00",
    end_time: "14:00:00",
  });

  const sessionLogRows = () => page.locator(".panel")
    .filter({ hasText: "Log absensi sesi ini" })
    .locator("tbody tr");

  // First teacher opens the session, records the student, and reloads.
  await loginAs(page, "e2e-guru", "e2e-guru-pass", /\/attendance$/);
  await page.goto("/attendance");
  await page.getByRole("button", { name: new RegExp(firstScheduleTitle) }).click();
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  await expect(page.getByText("Sesi absensi dibuka dan tersimpan.")).toBeVisible();
  const firstRecord = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/api/v1/attendance/daily/record"),
  );
  await page.getByRole("row").filter({ hasText: student.full_name })
    .getByRole("button", { name: "Hadir", exact: true }).click();
  expect((await firstRecord).status()).toBe(200);
  await expect(sessionLogRows()).toHaveCount(1);
  await expect(sessionLogRows().first()).toContainText(student.full_name);
  await page.reload();
  await page.getByRole("button", { name: new RegExp(firstScheduleTitle) }).click();
  await expect(page.getByRole("button", { name: "Tutup sesi absensi" })).toBeVisible();
  await expect(sessionLogRows()).toHaveCount(1);

  // The second teacher must not inherit the first teacher's session or records.
  await loginAs(page, secondUsername, "sesi-teacher-pass", /\/attendance$/);
  await page.goto("/attendance");
  await page.getByRole("button", { name: new RegExp(secondScheduleTitle) }).click();
  await expect(page.getByText("Belum ada sesi absensi untuk jadwal ini.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutup sesi absensi" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  await expect(page.getByText("Belum ada catatan pada sesi ini.")).toBeVisible();
  const secondRecord = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/api/v1/attendance/daily/record"),
  );
  await page.getByRole("row").filter({ hasText: student.full_name })
    .getByRole("button", { name: "Hadir", exact: true }).click();
  expect((await secondRecord).status()).toBe(200);
  await expect(page.locator(".inline-message")).toContainText(student.full_name);
  await expect(page.locator(".inline-message")).not.toContainText("sudah tercatat");
  await page.reload();
  await page.getByRole("button", { name: new RegExp(secondScheduleTitle) }).click();
  await expect(page.getByRole("button", { name: "Tutup sesi absensi" })).toBeVisible();
  await expect(sessionLogRows()).toHaveCount(1);
  await expect(sessionLogRows().first()).toContainText(student.full_name);
});

test("shows a clear error when today's attendance schedules fail to load", async ({ page }) => {
  await page.route("**/api/v1/attendance/daily/schedules**", (route) => {
    const corsHeaders = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 503,
        headers: corsHeaders,
        contentType: "application/json",
        body: '{"detail":"test error"}',
      });
    }
    return route.continue();
  });
  await page.goto("/attendance");
  await expect(page.getByText("Jadwal absensi gagal dimuat.")).toBeVisible({ timeout: 15_000 });
});

test("previews and downloads student and exam cards", async ({ page }) => {
  await page.goto("/cards");
  await page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("button", { name: "Pratinjau", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Siswa" })).toBeVisible();
  const studentQr = await page.locator(".student-card-qr").getAttribute("src");
  expect(studentQr).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(Buffer.from(studentQr!.split(",")[1], "base64").toString()).toContain("data:image/png;base64,");
  const studentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF satuan" }).click();
  expect((await studentDownload).suggestedFilename()).toMatch(/\.pdf$/);

  await page.goto("/exam-cards");
  await page.getByLabel("Tahun ajaran").selectOption({ label: "2098/2099" });
  const periodValue = await page.getByLabel("Jenis ujian")
    .locator("option").filter({ hasText: "Semester Ganjil" }).getAttribute("value");
  expect(periodValue).toBeTruthy();
  await page.getByLabel("Jenis ujian").selectOption(periodValue!);
  await page.getByLabel("Rombel").selectOption({ label: "E2E Kelas 7A" });
  await page.getByRole("row").filter({ hasText: "E2E Siswa" })
    .getByRole("button", { name: "Pratinjau", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Siswa" })).toBeVisible();
  const examQr = await page.locator(".student-card-qr").getAttribute("src");
  expect(examQr).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(Buffer.from(examQr!.split(",")[1], "base64").toString()).toContain("data:image/png;base64,");
  const examDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF satuan" }).click();
  expect((await examDownload).suggestedFilename()).toMatch(/\.pdf$/);
});

test("attendance scanner presents a closable camera-permission dialog", async ({ page }) => {
  await page.context().grantPermissions(["camera"]).catch(() => undefined);
  await page.goto("/exam-attendance");
  const eventValue = await page.getByLabel("Pilih sesi ujian")
    .locator("option").filter({ hasText: "E2E Ujian Matematika" }).getAttribute("value");
  expect(eventValue).toBeTruthy();
  await page.getByLabel("Pilih sesi ujian").selectOption(eventValue!);
  await expect(page.getByText("E2E Siswa").first()).toBeVisible();
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  await page.getByRole("button", { name: "Scan kartu ujian" }).click();
  await expect(page.getByRole("dialog", { name: "Scan QR / Barcode" })).toBeVisible();
  await page.getByRole("button", { name: "Tutup scanner" }).click();
  await expect(page.getByRole("dialog", { name: "Scan QR / Barcode" })).toHaveCount(0);
});

test("attendance scanner explains HTTPS requirement when browser context is insecure", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  });
  await page.goto("/exam-attendance");
  const eventValue = await page.getByLabel("Pilih sesi ujian")
    .locator("option").filter({ hasText: "E2E Ujian Matematika" }).getAttribute("value");
  expect(eventValue).toBeTruthy();
  await page.getByLabel("Pilih sesi ujian").selectOption(eventValue!);
  await expect(page.getByText("E2E Siswa").first()).toBeVisible();
  await page.getByRole("button", { name: "Buka sesi absensi" }).click();
  await page.getByRole("button", { name: "Scan kartu ujian" }).click();
  await expect(page.locator(".scanner-error[role='alert']")).toContainText("HTTPS");
  await expect(page.locator(".scanner-error[role='alert']")).toContainText("NISN secara manual");
});
