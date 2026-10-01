import { createContext, useContext } from 'react';

import type { SyncStatus, TeamMember } from './engine';
import type { FeedbackCategory, FeedbackIssue } from './feedback';

export interface ConnectInput {
  /** "organisation/repo" */
  repo: string;
  token: string;
  password: string;
  /** true = es gibt noch kein Team-Passwort und der Nutzer hat ein neues bestätigt */
  createPassword?: boolean;
}

export interface InviteConnectInput {
  /** Link, QR-Inhalt oder Code */
  invite: string;
  name: string;
  password: string;
  /** Name existiert schon und die Person hat bestätigt, dass sie es ist (weiteres Gerät) */
  confirmName?: boolean;
}

export type InviteConnectResult = { ok: true } | { ok: false; nameTaken: true } | { ok: false; error: string };

export type CreateInviteResult = { ok: true; url: string } | { ok: false; error: string };

export type ConnectResult = { ok: true } | { ok: false; needsNewPassword: true } | { ok: false; error: string };

export type FeedbackResult =
  | { ok: true; issue: FeedbackIssue }
  /** offline o.ä. – vorgemerkt, wird automatisch nachgesendet */
  | { ok: true; queued: true; reason: string }
  | { ok: false; error: string };

export interface TeamState {
  /** Team-Sync ist auf dieser Plattform/Seite möglich (Web-App unter eigener Adresse) */
  available: boolean;
  connected: boolean;
  /** Nutzer hat „nur auf diesem Gerät“ gewählt */
  localOnly: boolean;
  login: string | null;
  name: string | null;
  repo: string | null;
  others: TeamMember[];
  status: SyncStatus;
  /** Vorschläge, die noch auf das Senden warten */
  pendingFeedback: number;
  /** Über eine Einladung verbunden (gemeinsamer Team-Zugang, Person per Name) */
  viaInvite: boolean;
  connectWithInvite: (input: InviteConnectInput) => Promise<InviteConnectResult>;
  createInvite: (otherToken?: string) => Promise<CreateInviteResult>;
  submitFeedback: (input: { category: FeedbackCategory; text: string }) => Promise<FeedbackResult>;
  /** Eigene Vorschläge vom Daten-Repo (wirft bei Fehlern) */
  listFeedback: () => Promise<FeedbackIssue[]>;
  syncNow: () => void;
  connect: (input: ConnectInput) => Promise<ConnectResult>;
  disconnect: () => Promise<void>;
  setLocalOnly: (value: boolean) => void;
}

const idle: SyncStatus = { state: 'idle', lastSync: null, error: null };

export const NO_TEAM: TeamState = {
  available: false,
  connected: false,
  localOnly: true,
  login: null,
  name: null,
  repo: null,
  others: [],
  status: idle,
  pendingFeedback: 0,
  viaInvite: false,
  connectWithInvite: async () => ({ ok: false, error: 'Team-Sync gibt es nur in der Web-App.' }),
  createInvite: async () => ({ ok: false, error: 'Team-Sync gibt es nur in der Web-App.' }),
  submitFeedback: async () => ({ ok: false, error: 'Vorschläge können nur aus der Web-App mit Team-Sync gesendet werden.' }),
  listFeedback: async () => [],
  syncNow: () => {},
  connect: async () => ({ ok: false, error: 'Team-Sync gibt es nur in der Web-App.' }),
  disconnect: async () => {},
  setLocalOnly: () => {},
};

export const TeamContext = createContext<TeamState>(NO_TEAM);

export function useTeam(): TeamState {
  return useContext(TeamContext);
}
