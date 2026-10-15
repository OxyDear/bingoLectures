import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { toast } = useToast();
  return (
    <>
      <header className="top">
        <Link className="logo" to="/">Синий флаг</Link>
        <nav>
          {user ? (
            <>
              <Link to="/events">События</Link>
              <Link to="/leaderboard">Рейтинг</Link>
              {isAdmin && <Link to="/admin">Админка</Link>}
              <button className="link" onClick={logout}>Выйти ({user.username})</button>
            </>
          ) : (
            <><Link to="/login">Войти</Link><Link to="/register">Регистрация</Link></>
          )}
        </nav>
      </header>
      <main>
        {toast && <p className={`flash ${toast.type}`} role="status">{toast.text}</p>}
        <Outlet />
      </main>
    </>
  );
}
