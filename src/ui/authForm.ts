const PASSWORD_MIN_LENGTH = 4;
const USERNAME_PATTERN = /^[a-zA-Z0-9._@-]{3,64}$/;

export function normalizeUsername(username: string): string {
  return username.trim();
}

export function validateAuthForm(username: string, password: string): string | null {
  if (!username && !password) return "Enter username and password.";
  if (!username) return "Enter your username.";
  if (!password) return "Enter your password.";
  if (username.length < 3) return "Username needs at least 3 characters.";
  if (username.length > 64) return "Username is too long.";
  if (!USERNAME_PATTERN.test(username)) return "Username has unsupported characters.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password needs at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function friendlyAuthMessage(message: string): string {
  const clean = message.trim();
  const lower = clean.toLowerCase();

  if (!clean) return "Sign in failed.";
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Could not reach the online workspace.";
  }
  if (lower.includes("database is not configured")) {
    return "Online workspace is not connected yet.";
  }
  if (lower.includes("account creation is closed")) {
    return "This workspace already has an account. Sign in instead.";
  }
  if (lower.includes("invalid json")) {
    return "Sign in failed. Please try again.";
  }

  return clean;
}
