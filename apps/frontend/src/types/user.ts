export type Role = "ADMIN" | "GURU";

export type User = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};
