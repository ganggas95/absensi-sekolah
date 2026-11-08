import { useEffect, useState } from "react";
import type { ScheduleEvent } from "../types";

type ScheduleTimeWarningProps = {
  schedule: ScheduleEvent;
  exam?: boolean;
};

function currentMakassarTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function timeToMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export default function ScheduleTimeWarning({ schedule, exam = false }: ScheduleTimeWarningProps) {
  const [now, setNow] = useState({ date: "", minutes: -1 });

  useEffect(() => {
    setNow(currentMakassarTime());
    const timer = window.setInterval(() => setNow(currentMakassarTime()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  const matchesDate = !exam || schedule.schedule_date === now.date;
  const matchesTime = now.minutes >= 0 && start !== null && end !== null && now.minutes >= start && now.minutes <= end;
  if (matchesDate && matchesTime) return null;

  return (
    <p className="schedule-time-warning" role="status">
      Jadwal yang Anda pilih tidak sesuai dengan waktu saat ini
      {exam && schedule.schedule_date ? ` (${schedule.schedule_date})` : ""}.
      Anda tetap dapat membuka sesi absensi jika ada pertukaran jadwal.
    </p>
  );
}
