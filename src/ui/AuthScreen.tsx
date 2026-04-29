import { useState, type FormEvent } from "react";
import { useStore } from "../store";

export function AuthScreen() {
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const canRegister = useStore((s) => s.canRegister);
  const cloudSync = useStore((s) => s.cloudSync);
  const [mode, setMode] = useState<"login" | "register">(
    canRegister ? "register" : "login"
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveMode = canRegister ? mode : "login";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    if (effectiveMode === "register") {
      await register(username, password);
    } else {
      await login(username, password);
    }
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <h1>FamiliaLens</h1>
          <span>Online workspace</span>
        </div>

        {canRegister && (
          <div className="auth-tabs">
            <button
              type="button"
              className={effectiveMode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
            <button
              type="button"
              className={effectiveMode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
          </div>
        )}

        <label className="auth-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={effectiveMode === "register" ? "new-password" : "current-password"}
          />
        </label>

        {cloudSync.kind === "error" && (
          <p className="auth-error">{cloudSync.message}</p>
        )}

        <button
          type="submit"
          className="primary auth-submit"
          disabled={busy || !username.trim() || !password}
        >
          {busy
            ? "Working..."
            : effectiveMode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
    </div>
  );
}
