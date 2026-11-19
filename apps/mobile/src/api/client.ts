import axios, { AxiosInstance } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import {
  DailyAttendance,
  LoginResponse,
  MyProfile,
  MyProfileUpdate,
  Rombel,
  ScheduleEvent,
  Student,
  TeacherAttendance,
  TeacherDashboardStats,
  TeacherToday,
  User,
} from "../types";

const STORAGE_SERVER_KEY = "@absensi_server_url";
const STORAGE_TOKEN_KEY = "@absensi_auth_token";
const STORAGE_USER_KEY = "@absensi_auth_user";

export const apiClient: AxiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Configure baseURL dynamically
export async function setApiBaseUrl(serverUrl: string) {
  const clean = serverUrl.trim().replace(/\/+$/, "");
  apiClient.defaults.baseURL = `${clean}/api/v1`;
  await AsyncStorage.setItem(STORAGE_SERVER_KEY, clean);
}

// Attach stored token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Server di Docker Desktop tidak melihat IP asli perangkat, jadi laporkan
  // IP WiFi perangkat untuk pengecekan jaringan sekolah pada absensi guru.
  if (config.url?.includes("/attendance/teacher/") && config.headers) {
    try {
      const ip = await Network.getIpAddressAsync();
      if (ip && ip !== "0.0.0.0") config.headers["X-Device-Ip"] = ip;
    } catch {
      // Tanpa IP perangkat, server memakai alamat yang dilihatnya sendiri.
    }
  }
  return config;
});

// Storage helper functions
export async function getStoredServerUrl(): Promise<string | null> {
  return await AsyncStorage.getItem(STORAGE_SERVER_KEY);
}

export async function clearStoredServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_SERVER_KEY);
}

export async function getStoredToken(): Promise<string | null> {
  return await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(STORAGE_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveAuthSession(
  token: string,
  user: User
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_TOKEN_KEY, token);
  await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

export async function clearAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
  await AsyncStorage.removeItem(STORAGE_USER_KEY);
}

// API methods
export const api = {
  // Auth
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>("/auth/login", {
      username,
      password,
    });
    return res.data;
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>("/auth/me");
    return res.data;
  },

  getMyProfile: async (): Promise<MyProfile> => {
    const res = await apiClient.get<MyProfile>("/auth/me/profile");
    return res.data;
  },

  updateMyProfile: async (payload: MyProfileUpdate): Promise<MyProfile> => {
    const res = await apiClient.patch<MyProfile>("/auth/me/profile", payload);
    return res.data;
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    await apiClient.post("/auth/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  // Schedules & Attendance
  getDailySchedules: async (): Promise<ScheduleEvent[]> => {
    const res = await apiClient.get<ScheduleEvent[]>("/attendance/daily/schedules");
    return res.data;
  },

  getTeacherDashboardStats: async (): Promise<TeacherDashboardStats> => {
    const res = await apiClient.get<TeacherDashboardStats>(
      "/attendance/teacher/dashboard-stats"
    );
    return res.data;
  },

  getTeacherToday: async (): Promise<TeacherToday> => {
    const res = await apiClient.get<TeacherToday>("/attendance/teacher/today");
    return res.data;
  },

  teacherCheckIn: async (): Promise<TeacherAttendance> => {
    const res = await apiClient.post<TeacherAttendance>(
      "/attendance/teacher/check-in"
    );
    return res.data;
  },

  teacherCheckOut: async (): Promise<TeacherAttendance> => {
    const res = await apiClient.post<TeacherAttendance>(
      "/attendance/teacher/check-out"
    );
    return res.data;
  },

  getStudentsByRombel: async (rombelId: string): Promise<Student[]> => {
    const res = await apiClient.get<Student[]>("/management/students", {
      params: { rombel_id: rombelId },
    });
    return res.data;
  },

  getRombels: async (): Promise<Rombel[]> => {
    const res = await apiClient.get<Rombel[]>("/management/rombels");
    return res.data;
  },

  getDailyAttendanceLogs: async (date?: string): Promise<DailyAttendance[]> => {
    const res = await apiClient.get<DailyAttendance[]>("/attendance/daily", {
      params: date ? { attendance_date: date } : undefined,
    });
    return res.data;
  },

  recordAttendance: async (payload: {
    schedule_event_id: string;
    id_siswa?: string;
    student_id?: string;
    nisn?: string;
    status?: string;
    check_in?: boolean;
    notes?: string;
  }): Promise<DailyAttendance> => {
    const res = await apiClient.post<DailyAttendance>(
      "/attendance/daily/record",
      payload
    );
    return res.data;
  },
};

export function extractApiError(err: unknown, fallback: string): string {
  const detail = (err as any)?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = String(detail[0]?.msg || "").replace(/^Value error, /, "");
    if (msg) return msg;
  }
  if ((err as any)?.code === "ECONNABORTED" || !(err as any)?.response) {
    return "Tidak dapat terhubung ke server. Pastikan perangkat terhubung ke WiFi sekolah.";
  }
  return fallback;
}
