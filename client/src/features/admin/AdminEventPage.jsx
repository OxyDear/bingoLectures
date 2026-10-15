import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/http';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAction } from '../../lib/useAction';
import { Async, Tag, TierHeading } from '../../components/ui';
import { groupByTier, usePageTitle } from '../../lib/hooks';

export default function AdminEventPage() {
  const { id } = useParams();
  const q = useApi(`/admin/events/${id}`);
  usePageTitle(q.data?.event.title);
  return <Async query={q}>{(d) => <Details d={d} reload={q.reload} />}</Async>;
}

const evPath = (ev, tail = '') => `/admin/events/${ev.id}${tail}`;

function Details({ d, reload }) {
  const { event, picks, people } = d;
  const act = useAction(reload);
  const { notify } = useToast();
  const navigate = useNavigate();
  const open = event.status === 'open';

  async function removeEvent() {
    if (!window.confirm('Удалить событие и все карточки?')) return;
    if (await act(() => api(evPath(event), { method: 'DELETE' }))) { notify('ok', 'Событие удалено'); navigate('/admin'); }
  }
  const toggleStatus = () => act(() => api(evPath(event, '/status'), { method: 'PUT', body: { status: open ? 'closed' : 'open' } }),
    open ? 'Изменение карточек закрыто. Игроки видят результаты и таблицу лидеров.'
      : 'Изменение карточек снова открыто. Результаты скрыты от игроков.');

  return (
    <>
      <div className="head-row">
        <h1>{event.title}</h1>
        <div className="actions">
          <Link className="btn small" to={`/admin/events/${event.id}/results`}>Результаты пиков</Link>
          <button className="btn small danger" onClick={removeEvent}>Удалить событие</button>
        </div>
      </div>

      <section className={`lock ${event.status}`}>
        <div>
          <strong>{open ? '🔓 Игроки могут менять свои карточки' : '🔒 Изменение карточек закрыто'}</strong>
          <p className="muted">{open
            ? 'Результаты и таблица лидеров скрыты от игроков. После закрытия карточки изменить будет нельзя, а результаты откроются.'
            : 'Игроки видят результаты и таблицу лидеров. Если снова открыть изменение, результаты опять будут скрыты.'}</p>
        </div>
        <button className="btn" onClick={toggleStatus}>{open ? 'Закрыть изменение карточек' : 'Открыть изменение карточек'}</button>
      </section>

      <AddPick event={event} act={act} />
      <People event={event} people={people} act={act} />
      <ImportExport event={event} reload={reload} />
      <PickList picks={picks} act={act} />
    </>
  );
}

function AddPick({ event, act }) {
  const { tiers } = useAuth();
  async function submit(e) {
    const form = e.currentTarget; e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await act(() => api(evPath(event, '/picks'), { method: 'POST', body }))) form.reset();
  }
  return (
    <>
      <h2>Добавить пик</h2>
      <form className="inline" onSubmit={submit}>
        <label className="grow">Что должно произойти<input name="title" required maxLength={200} placeholder="Две или более машин безопасности" /></label>
        <label>Категория<input name="category" maxLength={40} placeholder="Гонка" /></label>
        <label>Очки<select name="points" defaultValue={3}>
          {tiers.map((t) => <option key={t.points} value={t.points}>{t.points} — {t.name}</option>)}
        </select></label>
        <button className="btn">Добавить пик</button>
      </form>
    </>
  );
}

function People({ event, people, act }) {
  async function submit(e) {
    const form = e.currentTarget; e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await act(() => api(evPath(event, '/people'), { method: 'POST', body }))) form.reset();
  }
  const remove = (x) => window.confirm(`Удалить «${x.name}»? Игрокам, которым он выпал, придётся крутить рулетку заново.`)
    && act(() => api(`/admin/people/${x.id}`, { method: 'DELETE' }));
  return (
    <>
      <h2>Люди для «Пика на человека»</h2>
      <p className="muted">Если добавлен хотя бы один человек, в карточке будет 8 обычных пиков и один особый: игрок крутит рулетку, и она выбирает одного из этих людей. Очки за человека вы задаёте на странице «Результаты пиков». Добавляйте людей до того, как игроки соберут карточки.</p>
      <form className="inline" onSubmit={submit}>
        <label className="grow">Имя<input name="name" required maxLength={60} placeholder="Например: Лэндо Норрис" /></label>
        <button className="btn">Добавить человека</button>
      </form>
      {people.length ? (
        <div className="people">
          {people.map((x) => (
            <span className="chip" key={x.id}>{x.name}
              <button className="chip-x" aria-label={`Удалить ${x.name}`} onClick={() => remove(x)}>×</button>
            </span>
          ))}
        </div>
      ) : <p className="muted">Пока никого нет — пик на человека в карточке не появится.</p>}
    </>
  );
}

function ImportExport({ event, reload }) {
  const { tiers } = useAuth();
  const [json, setJson] = useState('');
  const [replace, setReplace] = useState(false);
  const { notify } = useToast();

  async function submit(e) {
    e.preventDefault();
    if (replace && !window.confirm('Все текущие пики события и выбранные игроками карточки будут удалены. Продолжить?')) return;
    try {
      const r = await api(evPath(event, '/import'), { method: 'POST', body: { json, replace } });
      notify(r.ok ? 'ok' : 'error', r.message);
      if (r.ok) setJson('');
    } catch (err) { notify('error', err.message); }
    reload();
  }

  return (
    <>
      <h2>Экспорт и импорт</h2>
      <p className="muted">Скачайте пики события в JSON-файл или загрузите их из файла. Формат: <code>{'{ "picks": [ { "title": "…", "category": "…", "points": 3 } ], "people": [ { "name": "…" } ] }'}</code>. Очки пика — только {tiers.map((t) => t.points).join(', ')}. Поле <code>people</code> необязательно. Можно также загрузить просто массив пиков или массив строк.</p>
      <p><a className="btn small ghost" href={`/api${evPath(event, '/export')}`} download>Скачать пики (JSON)</a></p>
      <form className="import" onSubmit={submit}>
        <label>Файл .json<input type="file" accept=".json,application/json"
          onChange={async (e) => { const f = e.target.files[0]; if (f) setJson(await f.text()); }} /></label>
        <label>…или вставьте JSON<textarea rows={6} required value={json} onChange={(e) => setJson(e.target.value)}
          placeholder='{"picks":[{"title":"Две или более машин безопасности","category":"Гонка","points":3}]}' /></label>
        <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Заменить существующие (иначе новые будут добавлены, дубликаты пропущены)</label>
        <button className="btn">Загрузить</button>
      </form>
    </>
  );
}

function PickList({ picks, act }) {
  const { tiers } = useAuth();
  const remove = (p) => window.confirm('Удалить пик?') && act(() => api(`/admin/picks/${p.id}`, { method: 'DELETE' }));
  return (
    <>
      <h2>Пики ({picks.length})</h2>
      {!picks.length && <p className="muted">Добавьте минимум 9 пиков (8, если есть пик на человека), чтобы игроки могли собрать карточку.</p>}
      {groupByTier(picks, tiers).map(({ tier, items }) => (
        <div key={tier.points}>
          <TierHeading tier={tier} count={items.length} />
          <div className="admin-picks">
            {items.map((p) => (
              <div className="ap row" key={p.id}>
                <p>{p.title} <Tag>{p.category}</Tag></p>
                <button className="link danger-text" onClick={() => remove(p)}>Удалить</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
