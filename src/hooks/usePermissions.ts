import { ADMINS } from '../sync/config';
import { useTeam } from '../sync/TeamContext';

export interface Permissions {
  /** darf direkt löschen und Löschvorschläge entscheiden */
  isAdmin: boolean;
  /** eigene Kennung im Team (null ohne Team-Sync) */
  me: string | null;
  /** mit dem Team verbunden */
  team: boolean;
}

export function usePermissions(): Permissions {
  const team = useTeam();
  const isAdmin = !team.connected || (!team.viaInvite && !!team.login && ADMINS.includes(team.login.toLowerCase()));
  return { isAdmin, me: team.login, team: team.connected };
}
