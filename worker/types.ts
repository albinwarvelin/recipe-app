export interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUDIENCE: string;
  OWNER_EMAIL: string;
  ALLOWED_ORIGINS: string;
}

export interface AuthIdentity {
  email: string;
  subject: string;
  audience: string[];
}
