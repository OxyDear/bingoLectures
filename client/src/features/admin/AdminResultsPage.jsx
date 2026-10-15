import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/http';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../context/AuthContext';
import { useAction } from '../../lib/useAction';
import { Async, BackLink, Tag, TierHeading } from '../../components/ui';
import { groupByTier, usePageTitle } from '../../lib/hooks';

export default function AdminResultsPage() {
  const { id } = useParams();
  const q = useApi(`/admin/events/${id}`);
  usePageTitle(q.data && `Результаты — ${q.data.event.title}`);
  return <Async query={q}>{(d) => <ResultsForm key={id} d={d} reload={q.reload} />}</Async>;
}

function ResultsForm({ d, reload }) {
  const { event, picks, people } = d;
  const { tiers } = useAuth();
  const act = useAction(reload);
  // Редактируемое состояние формы: id -> значение
  const [pickState, setPickState] = useState(() => Object.fromEntries(picks.map((p) => [p.id, { result: p.result || '', explanation: p.explanation }])));
  const [pts, setPts] = useState(() => Object.fromEntries(people.map((x) => [x.id, x.points === null ? '' : String(x.points)])));
  const setPick = (id, patch) => setPickState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const submit = (e) => {
    e.preventDefault();
    return act(() => api(`/admin/events/${event.id}/results`, {
      method: 'PUT',
      body: {
        picks: picks.map((p) => ({ id: p.id, result: pickState[p.id].result || null, explanation: pickState[p.id].explanation })),
        people: people.map((x) => ({ id: x.id, points: pts[x.id] }))
      }
    }), 'Результаты сохранены');
  };

  return (
    <>
      <div className="head-row">
        <h1>Результаты: {event.title}</h1>
        <BackLink to={`/admin/events/${event.id}`}>← К событию</BackLink>
      </div>
      <p className="muted">Игроки увидят результаты только после того, как вы закроете изменение карточек.
        Сейчас: <strong>{event.status === 'open' ? 'изменение открыто, результаты скрыты' : 'изменение закрыто, результаты видны'}</strong>.</p>

      {!picks.length && !people.length ? <p className="muted">В событии пока нет пиков.</p> : (
        <form onSubmit={submit}>
          {people.length > 0 && (
            <>
              <h3 className="tier"><span className="tier-pts">🎡 Пик на человека</span> <span>— очки за каждого</span></h3>
              <div className="admin-picks">
                {people.map((x) => (
                  <div className="ap res-row" key={x.id}>
                    <p><strong>{x.name}</strong></p>
                    <label className="narrow2">Очки<input type="number" min="0" max="100" step="1" placeholder="—"
                      value={pts[x.id]} onChange={(e) => setPts((s) => ({ ...s, [x.id]: e.target.value }))} /></label>
                  </div>
                ))}
              </div>
            </>
          )}

          {groupByTier(picks, tiers).map(({ tier, items }) => (
            <div key={tier.points}>
              <TierHeading tier={tier} />
              <div className="admin-picks">
                {items.map((p) => (
                  <div className="ap res-row" key={p.id}>
                    <p>{p.title} <Tag>{p.category}</Tag></p>
                    <div className="inline">
                      <label>Результат
                        <select value={pickState[p.id].result} onChange={(e) => setPick(p.id, { result: e.target.value })}>
                          <option value="">Не определён</option>
                          <option value="correct">Сбылся</option>
                          <option value="incorrect">Не сбылся</option>
                        </select>
                      </label>
                      <label className="grow">Пояснение
                        <input maxLength={300} placeholder="Когда и как это произошло" value={pickState[p.id].explanation}
                          onChange={(e) => setPick(p.id, { explanation: e.target.value })} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bar"><span className="muted">Сохраняются все результаты сразу</span><button className="btn">Сохранить результаты</button></div>
        </form>
      )}
    </>
  );
}
