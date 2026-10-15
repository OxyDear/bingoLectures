import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/http';
import { useApi } from '../../api/useApi';
import { useAction } from '../../lib/useAction';
import { Async } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';

export default function AdminPage() {
  const q = useApi('/admin/events');
  const act = useAction();
  const navigate = useNavigate();
  usePageTitle('Админка');

  async function create(e) {
    e.preventDefault();
    const title = new FormData(e.currentTarget).get('title');
    const ev = await act(() => api('/admin/events', { method: 'POST', body: { title } }));
    if (ev?.id) navigate(`/admin/events/${ev.id}`);
  }

  return (
    <>
      <h1>Админка</h1>
      <form className="inline" onSubmit={create}>
        <label className="grow">Новое событие<input name="title" required maxLength={120} placeholder="Например: Гран-при Сингапура" /></label>
        <button className="btn">Создать событие</button>
      </form>
      <Async query={q}>{(events) => (
        <ul className="list">
          {events.map((e) => (
            <li className="row" key={e.id}>
              <div>
                <Link className="big" to={`/admin/events/${e.id}`}>{e.title}</Link>
                <p className="muted">Пиков: {e.total}. {e.status === 'open' ? 'Приём открыт' : 'Приём закрыт'}</p>
              </div>
              <Link className="btn small ghost" to={`/admin/events/${e.id}`}>Управлять</Link>
            </li>
          ))}
        </ul>
      )}</Async>
    </>
  );
}
