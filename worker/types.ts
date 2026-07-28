export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUDIENCE: string;
  OWNER_EMAIL: string;
  ALLOWED_ORIGINS: string;
}

export interface AuthenticatedRequest extends Request {
  ownerEmail?: string;
}
