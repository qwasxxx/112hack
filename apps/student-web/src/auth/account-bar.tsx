import type { Session } from './accounts';
import { ROLE_LABEL } from './accounts';

type Props = {
  user: Session;
  onLogout: () => void;
};

export function AccountBar(props: Props) {
  return (
    <div className="operator">
      <span className="operator-role">{ROLE_LABEL[props.user.role]}</span>
      <span>{props.user.name}</span>
      <button type="button" className="link" onClick={props.onLogout}>
        Выйти
      </button>
    </div>
  );
}
