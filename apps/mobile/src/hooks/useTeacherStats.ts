import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { TeacherDashboardStats } from "../types";

export const TEACHER_STATS_KEY = ["teacher-dashboard-stats"];

// Dipakai tab Home dan KBM; React Query berbagi satu request untuk kedua tab.
export function useTeacherStats() {
  return useQuery<TeacherDashboardStats>({
    queryKey: TEACHER_STATS_KEY,
    queryFn: () => api.getTeacherDashboardStats(),
    refetchInterval: 30000,
  });
}
