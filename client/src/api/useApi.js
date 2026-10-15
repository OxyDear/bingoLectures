import { useCallback, useEffect, useState } from 'react';
import { api } from './http';

// GET-запрос с состояниями loading/error и ручным reload().
// Когда понадобятся кэш и оптимистичные обновления — заменяется на TanStack Query без правки страниц.
export function useApi(path) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ path, data: null, error: null, loading: true });

  useEffect(() => {
    let off = false;
    // При смене адреса старые данные сбрасываются, при reload() — остаются на экране до прихода новых
    setState((s) => (s.path === path ? { ...s, loading: true, error: null } : { path, data: null, error: null, loading: true }));
    api(path).then(
      (data) => !off && setState({ path, data, error: null, loading: false }),
      (error) => !off && setState({ path, data: null, error, loading: false })
    );
    return () => { off = true; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
