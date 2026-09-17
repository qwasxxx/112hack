import type { AdminUser, StudentProgress } from '../data/admin';
import { formatWhen } from '../data/admin';

type Props = {
  users: AdminUser[];
  progress: StudentProgress[];
};

export function TrainingPage(props: Props) {
  return (
    <div className="stack">
      <p className="notice">
        Это статистика использования, не журнал оценок. Администратор не меняет баллы и не вмешивается
        в активное занятие.
      </p>

      {props.progress.map((item) => {
        const user = props.users.find((entry) => entry.id === item.userId);
        const overall =
          item.lessonsTotal === 0 ? 0 : Math.round((item.lessonsDone / item.lessonsTotal) * 100);
        return (
          <section key={item.userId} className="panel">
            <div className="panel-head">
              <h1>{user?.name ?? item.userId}</h1>
              <p>
                Пройдено {item.lessonsDone} из {item.lessonsTotal} · последний результат {item.lastScore}% ·{' '}
                {formatWhen(item.lastAt)}
              </p>
            </div>
            <div className="meter" aria-label={`Прогресс ${overall}%`}>
              <span style={{ width: `${overall}%` }} />
            </div>
            <div className="lesson-list">
              {item.lessons.map((lesson) => (
                <div key={lesson.code} className="lesson-row">
                  <span className="mono">{lesson.code}</span>
                  <div>
                    <div>{lesson.title}</div>
                    <div className="meter">
                      <span style={{ width: `${lesson.percent}%` }} />
                    </div>
                  </div>
                  <span className="mono">{lesson.percent}%</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
