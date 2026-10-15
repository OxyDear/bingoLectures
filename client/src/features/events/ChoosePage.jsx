import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/http';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Async, TierHeading, Tag, hotMark } from '../../components/ui';
import { groupByTier, usePageTitle } from '../../lib/hooks';
import Roulette from './Roulette';

export default function ChoosePage() {
  const { id } = useParams();
  const q = useApi(`/events/${id}/choose`);
  const navigate = useNavigate();
  const { notify } = useToast();
  usePageTitle(q.data?.event.title);

  // Приём закрыт (403) — возвращаем на страницу события, как раньше делал серверный редирект
  useEffect(() => {
    if (q.error?.status === 403) { notify('error', q.error.message); navigate(`/events/${id}`, { replace: true }); }
  }, [q.error, id, navigate, notify]);

  return <Async query={q}>{(d) => <ChooseForm key={id} d={d} />}</Async>;
}

function ChooseForm({ d }) {
  const { tiers, tierOf } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() => new Set(d.mine));
  const [spunIndex, setSpunIndex] = useState(d.spunIndex);
  const [saving, setSaving] = useState(false);

  const needSpin = d.people.length > 0;
  const full = selected.size >= d.need;
  const toggle = (pickId) => setSelected((s) => { const next = new Set(s); next.has(pickId) ? next.delete(pickId) : next.add(pickId); return next; });
  const canSave = selected.size === d.need && (!needSpin || spunIndex >= 0);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/events/${d.event.id}/card`, { method: 'PUT', body: { picks: [...selected] } });
      notify('ok', 'Карточка сохранена');
      navigate(`/events/${d.event.id}`);
    } catch (err) {
      notify('error', err.message); setSaving(false);
    }
  }

  return (
    <>
      <h1>{d.event.title}</h1>
      {!d.picks.length ? <p className="muted">Администратор ещё не добавил пики. Загляните позже.</p> : (
        <>
          <p className="muted">
            Выберите пиков: {d.need}, которые, по-вашему, сбудутся. Очки указаны на каждом пике.
            {needSpin && ' Девятый пик — особый: «Пик на человека», его выбирает рулетка.'}
          </p>
          <form onSubmit={save}>
            {needSpin && <Roulette eventId={d.event.id} names={d.people} spunIndex={spunIndex} onSpun={setSpunIndex} />}

            {groupByTier(d.picks, tiers).map(({ tier, items }) => (
              <div key={tier.points}>
                <TierHeading tier={tier} />
                <div className="picks">
                  {items.map((p) => {
                    const checked = selected.has(p.id);
                    return (
                      <label className={`pick ${tier.hot ? 'hot' : ''}`} key={p.id}>
                        <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(p.id)} />
                        <span className="pts">{hotMark(tierOf(p.points))} {p.points} очк.</span>
                        <span className="t">{p.title}</span>
                        <Tag>{p.category}</Tag>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="bar">
              <span aria-live="polite">
                Выбрано {selected.size} из {d.need}{needSpin && (spunIndex >= 0 ? ' · рулетка сыграна' : ' · крутите рулетку')}
              </span>
              <button className="btn" disabled={!canSave || saving}>Сохранить карточку</button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
