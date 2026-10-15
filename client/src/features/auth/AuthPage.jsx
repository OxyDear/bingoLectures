import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageTitle } from '../../lib/hooks';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  usePageTitle(isLogin ? 'Вход' : 'Регистрация');

  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try { await (isLogin ? login : register)(body); } // после успеха App сам уводит на /events
    catch (err) { notify('error', err.message); setBusy(false); }
  }

  return (
    <section className="auth">
      <h1>{isLogin ? 'Вход' : 'Регистрация'}</h1>
      <form onSubmit={submit}>
        <label>Имя пользователя<input name="username" required maxLength={30} autoComplete="username" /></label>
        <label>Пароль<input type="password" name="password" required minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? 'current-password' : 'new-password'} /></label>
        <button className="btn" disabled={busy}>{isLogin ? 'Войти' : 'Создать аккаунт'}</button>
      </form>
      <p className="muted">
        {isLogin ? <>Нет аккаунта? <Link to="/register">Зарегистрируйтесь</Link></> : <>Уже есть аккаунт? <Link to="/login">Войдите</Link></>}
      </p>
    </section>
  );
}
