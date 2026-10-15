import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

// Замена серверному flash: сообщение показывается несколько секунд и переживает навигацию
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const notify = useCallback((type, text) => {
    clearTimeout(timer.current);
    setToast({ type, text });
    timer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={{ toast, notify }}>{children}</ToastContext.Provider>;
}
