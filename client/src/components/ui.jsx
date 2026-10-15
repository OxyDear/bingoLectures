import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Loading = () => <p className="muted">Загрузка…</p>;
export const ErrorBox = ({ error }) => <p className="flash error" role="alert">{error?.message || 'Ошибка'}</p>;

// Показывает загрузку/ошибку, иначе вызывает children(data)
export function Async({ query, children }) {
  if (query.error && !query.data) return <ErrorBox error={query.error} />;
  if (!query.data) return <Loading />;
  return children(query.data);
}

export const hotMark = (tier) => (tier?.hot ? '🔥' : '');

export function TierHeading({ tier, count }) {
  return (
    <h3 className={`tier t${tier.points}`}>
      <span className="tier-pts">{hotMark(tier)} {tier.points} очк.</span> <span>— {tier.name}</span>
      {count !== undefined && <span className="muted"> ({count})</span>}
    </h3>
  );
}

export const Tag = ({ children }) => (children ? <span className="tag">{children}</span> : null);

export function RequireAuth({ admin = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && !isAdmin) return <p className="flash error">Доступ только для администратора</p>;
  return <Outlet />;
}

export const BackLink = ({ to, children }) => <Link className="btn small ghost" to={to}>{children}</Link>;
