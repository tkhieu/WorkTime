export interface User {
  user_id: number;
  github_username: string;
  github_avatar_url: string | null;
  email: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  handleOAuthCallback: (code: string, codeVerifier: string) => Promise<void>;
}
