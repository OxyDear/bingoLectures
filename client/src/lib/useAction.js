import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';

// Выполняет изменяющий запрос: показывает ошибку/успех тостом и перезагружает данные страницы
export function useAction(reload) {
  const { notify } = useToast();
  return useCallback(async (fn, okText) => {
    try {
      const result = await fn();
      if (okText) notify('ok', okText);
      reload?.();
      return result ?? true;
    } catch (e) {
      notify('error', e.message);
      return false;
    }
  }, [notify, reload]);
}
