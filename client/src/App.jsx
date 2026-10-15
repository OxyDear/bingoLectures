import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading, RequireAuth } from './components/ui';
import AuthPage from './features/auth/AuthPage';
import EventsPage from './features/events/EventsPage';
import EventPage from './features/events/EventPage';
import ChoosePage from './features/events/ChoosePage';
import LeaderboardPage from './features/events/LeaderboardPage';
import AdminPage from './features/admin/AdminPage';
import AdminEventPage from './features/admin/AdminEventPage';
import AdminResultsPage from './features/admin/AdminResultsPage';

// Админские страницы вынесены в отдельный чанк при росте проекта: React.lazy(() => import('./features/admin/...'))
export default function App() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={user ? '/events' : '/login'} replace />} />
        <Route path="login" element={user ? <Navigate to="/events" replace /> : <AuthPage mode="login" />} />
        <Route path="register" element={user ? <Navigate to="/events" replace /> : <AuthPage mode="register" />} />

        <Route element={<RequireAuth />}>
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="events/:id/choose" element={<ChoosePage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
        </Route>

        <Route element={<RequireAuth admin />}>
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin/events/:id" element={<AdminEventPage />} />
          <Route path="admin/events/:id/results" element={<AdminResultsPage />} />
        </Route>

        <Route path="*" element={<p className="muted">Страница не найдена</p>} />
      </Route>
    </Routes>
  );
}
