import { Link } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { Async } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';

export default function EventsPage() {
  const q = useApi('/events');
  usePageTitle('События');
  return (
    <>
      <h1>События</h1>
      <Async query={q}>{(events) => (
        <>
          {!events.length && <p className="muted">Событий пока нет. Администратор добавит первое.</p>}
          <ul className="list">
            {events.map((e) => (
              <li className="row" key={e.id}>
                <div>
                  <Link className="big" to={`/events/${e.id}`}>{e.title}</Link>
                  <p className="muted">Пиков: {e.total}. {e.status === 'open' ? 'Приём карточек открыт' : 'Приём закрыт'}</p>
                </div>
                <Link className="btn small" to={`/events/${e.id}`}>{e.mine ? 'Моя карточка' : e.status === 'open' ? 'Выбрать пики' : 'Смотреть'}</Link>
              </li>
            ))}
          </ul>
        </>
      )}</Async>
    </>
  );
}
