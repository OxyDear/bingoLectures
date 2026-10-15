import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken, setUnauthorizedHandler } from '../api/http';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null, tiers: [] });

  const apply = useCallback((s) => {
    setCsrfToken(s.csrfToken);
    setState({ ready: true, user: s.user, tiers: s.config.tiers });
  }, []);

  const refresh = useCallback(() => api('/me').then(apply), [apply]);

  useEffect(() => {
    setUnauthorizedHandler(refresh);
    refresh().catch(() => setState((s) => ({ ...s, ready: true })));
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    isAdmin: state.user?.role === 'admin',
    // Правила очков приходят с сервера: клиент ничего не знает про «1, 3, 5, 10»
    tierOf: (points) => state.tiers.find((t) => t.points === points),
    login: (body) => api('/auth/login', { method: 'POST', body }).then(apply),
    register: (body) => api('/auth/register', { method: 'POST', body }).then(apply),
    logout: () => api('/auth/logout', { method: 'POST' }).then(refresh)
  }), [state, apply, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
