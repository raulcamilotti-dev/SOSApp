// /core/auth/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { AuthUser } from './auth.types';
import { saveUser, getUser, clearUser } from './auth.storage';

type AuthContextData = {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔁 Recupera sessão ao abrir o app
  useEffect(() => {
    async function loadUser() {
      const storedUser = await getUser();
      if (storedUser) {
        setUser(storedUser);
      }
      setLoading(false);
    }

    loadUser();
  }, []);

  async function login(userData: AuthUser) {
    setUser(userData);
    await saveUser(userData);
  }

  async function logout() {
    setUser(null);
    await clearUser();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
