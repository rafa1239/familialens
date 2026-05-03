import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "../store";
import {
  friendlyAuthMessage,
  normalizeUsername,
  validateAuthForm
} from "./authForm";

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
  const [localError, setLocalError] = useState("");
  const [hideCloudError, setHideCloudError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const effectiveMode = canRegister ? mode : "login";
  const cloudError =
    cloudSync.kind === "error" && !hideCloudError
      ? friendlyAuthMessage(cloudSync.message)
      : "";
  const errorMessage = localError || cloudError;

  useEffect(() => {
    if (!canRegister) setMode("login");
  }, [canRegister]);

  useEffect(() => {
    if (cloudError && password) {
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  }, [cloudError, password]);

  const clearErrorsForEdit = () => {
    setLocalError("");
    setHideCloudError(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanUsername = normalizeUsername(username);
    const validationError = validateAuthForm(cleanUsername, password);
    if (validationError) {
      setLocalError(validationError);
      setHideCloudError(true);
      return;
    }

    setBusy(true);
    setLocalError("");
    setHideCloudError(false);
    try {
      if (effectiveMode === "register") {
        await register(cleanUsername, password);
      } else {
        await login(cleanUsername, password);
      }
    } finally {
      setBusy(false);
    }
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
            onChange={(event) => {
              setUsername(event.target.value);
              clearErrorsForEdit();
            }}
            aria-invalid={!!errorMessage}
            aria-describedby={errorMessage ? "auth-error" : undefined}
            autoCapitalize="none"
            autoComplete="username"
            autoFocus
            spellCheck={false}
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearErrorsForEdit();
            }}
            aria-invalid={!!errorMessage}
            aria-describedby={errorMessage ? "auth-error" : undefined}
            autoComplete={effectiveMode === "register" ? "new-password" : "current-password"}
          />
        </label>

        {errorMessage && (
          <p id="auth-error" className="auth-error" role="alert" aria-live="polite">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          className="primary auth-submit"
          disabled={busy}
        >
          {busy
            ? effectiveMode === "register"
              ? "Creating..."
              : "Signing in..."
            : effectiveMode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
    </div>
  );
}
