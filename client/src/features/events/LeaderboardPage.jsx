import { useApi } from '../../api/useApi';
import { useAuth } from '../../context/AuthContext';
import { Async } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';

export default function LeaderboardPage() {
  const q = useApi('/leaderboard');
  const { user } = useAuth();
  usePageTitle('Общий рейтинг');
  return (
    <>
      <h1>Общий рейтинг</h1>
      <p className="muted">Сумма очков по всем событиям. В зачёт идут только события, в которых администратор уже закрыл изменение карточек.</p>
      <Async query={q}>{(board) => !board.length
        ? <p className="muted">Пока нет ни одного завершённого события.</p>
        : (
          <ol className="board wide">
            {board.map((r) => (
              <li key={r.id} className={r.id === user.id ? 'me' : ''}>
                <span>{r.rank}. {r.username} <small className="muted">· событий: {r.events}</small></span>
                <span className="num">{r.score}</span>
              </li>
            ))}
          </ol>
        )}</Async>
    </>
  );
}
