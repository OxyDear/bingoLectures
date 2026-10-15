import { Link, Navigate, useParams } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../context/AuthContext';
import { Async, Tag, hotMark } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';

const cellClass = (result) => (result === 'correct' ? 'foil' : result === 'incorrect' ? 'dim' : 'plain');
const personClass = (person) => {
  if (!person) return 'empty';
  const pts = person.points;
  return pts > 0 ? 'foil' : pts === 0 ? 'dim' : 'plain';
};
const personBadge = (pts) => (pts === null || pts === undefined ? 'Ждём результата' : `+${pts} очк.`);

export default function EventPage() {
  const { id } = useParams();
  const q = useApi(`/events/${id}`);
  usePageTitle(q.data?.event.title);
  return (
    <Async query={q}>{(v) => (v.event.status === 'open' && !v.hasCard
      ? <Navigate to={`/events/${id}/choose`} replace />
      : <EventBody v={v} />)}</Async>
  );
}

function EventBody({ v }) {
  const { user, tierOf } = useAuth();
  const { event, cards, person, hasPeople, slots, board, me } = v;
  const closed = event.status === 'closed';
  const total = Math.max(cards.length, slots);

  return (
    <>
      <div className="head-row">
        <h1>{event.title}</h1>
        {!closed && <Link className="btn small ghost" to={`/events/${event.id}/choose`}>Изменить карточку</Link>}
      </div>

      {closed ? (
        <section className="band">
          {me
            ? <div className="rank"><span className="num">Место {me.rank}</span><span className="top-pill">Лучшие {me.top}%</span></div>
            : <div className="rank"><span className="num">Без карточки</span></div>}
          <div className="score"><span className="muted-ink">Очки</span><span className="num big-num">{me ? me.score : 0}</span></div>
        </section>
      ) : (
        <>
          <p className="flash">Приём изменений открыт. Результаты и таблица лидеров появятся, когда администратор закроет изменение карточек.</p>
          {hasPeople && !person && (
            <p className="flash">В этом событии есть «Пик на человека». <Link to={`/events/${event.id}/choose`}>Обновите карточку</Link> и прокрутите рулетку.</p>
          )}
        </>
      )}

      <div className="grid">
        {Array.from({ length: total }, (_, i) => {
          const p = cards[i];
          if (!p) return <div className="cell empty" key={`e${i}`} />;
          return (
            <div className={`cell ${cellClass(p.result)}`} key={p.id}>
              <div className="cell-top">
                <span>{hotMark(tierOf(p.points))} {p.points} очк.</span>
                <span>{p.result === 'correct' ? '✓' : p.result === 'incorrect' ? '✕' : '…'}</span>
              </div>
              <p className="t">{p.title}</p>
              <Tag>{p.category}</Tag>
            </div>
          );
        })}
        {hasPeople && (
          <div className={`cell ${personClass(person)}`}>
            <div className="cell-top">
              <span>🎡 Человек</span>
              <span>{person && person.points !== null ? `+${person.points}` : '…'}</span>
            </div>
            <p className="t">{person ? person.name : 'Рулетка не крутилась'}</p>
            <span className="tag">Пик на человека</span>
          </div>
        )}
      </div>

      {closed && (cards.length > 0 || person) && (
        <>
          <h2>Итоги по пикам</h2>
          <div className="recap">
            {cards.map((p) => (
              <div className={`rc ${p.result || 'wait'}`} key={p.id}>
                <div className="rc-top">
                  <span>{hotMark(tierOf(p.points))} {p.points} очк.</span>
                  <span className="badge">{p.result === 'correct' ? 'Сбылось' : p.result === 'incorrect' ? 'Не сбылось' : 'Ждём результата'}</span>
                </div>
                <p>{p.title}</p>
                <Tag>{p.category}</Tag>
                {p.explanation && <p className="expl">{p.explanation}</p>}
              </div>
            ))}
            {person && (
              <div className={`rc ${person.points > 0 ? 'correct' : person.points === 0 ? 'incorrect' : 'wait'}`}>
                <div className="rc-top"><span>🎡 Пик на человека</span><span className="badge">{personBadge(person.points)}</span></div>
                <p>{person.name}</p>
              </div>
            )}
          </div>

          <h2>Таблица лидеров</h2>
          {!board.length ? <p className="muted">Никто не собрал карточку.</p> : (
            <ol className="board">
              {board.map((r) => (
                <li key={r.id} className={r.id === user.id ? 'me' : ''}><span>{r.rank}. {r.username}</span><span className="num">{r.score}</span></li>
              ))}
            </ol>
          )}
          <p className="muted"><Link to="/leaderboard">Общий рейтинг по всем событиям →</Link></p>
        </>
      )}
    </>
  );
}
