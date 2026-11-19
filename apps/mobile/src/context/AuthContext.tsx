import React, { createContext, useContext, useEffect, useState } from "react";
import {
  api,
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  saveAuthSession,
} from "../api/client";
import { User } from "../types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getStoredToken();
        const storedUser = await getStoredUser();

        if (storedToken && storedUser) {
          if (storedUser.role === "GURU") {
            setToken(storedToken);
            setUser(storedUser);
          } else {
            await clearAuthSession();
          }
        }
      } catch (err) {
        console.warn("Failed to load auth session:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const data = await api.login(username, password);

    if (data.user.role !== "GURU") {
      throw new Error(
        "Akses ditolak: Aplikasi mobile ini khusus untuk Guru. Akun Anda terdaftar sebagai " +
          data.user.role
      );
    }

    if (!data.user.is_active) {
      throw new Error("Akun Anda tidak aktif. Silakan hubungi Administrator.");
    }

    await saveAuthSession(data.access_token, data.user);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await clearAuthSession();
    setToken(null);
    setUser(null);
  };

  const updateUser = async (updatedUser: User) => {
    setUser(updatedUser);
    if (token) {
      await saveAuthSession(token, updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
