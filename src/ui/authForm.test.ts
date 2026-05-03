import { describe, expect, it } from "vitest";
import {
  friendlyAuthMessage,
  normalizeUsername,
  validateAuthForm
} from "./authForm";

describe("auth form helpers", () => {
  it("normalizes usernames", () => {
    expect(normalizeUsername("  rafa1239  ")).toBe("rafa1239");
  });

  it("validates required fields", () => {
    expect(validateAuthForm("", "")).toBe("Enter username and password.");
    expect(validateAuthForm("rafa1239", "")).toBe("Enter your password.");
    expect(validateAuthForm("", "1239")).toBe("Enter your username.");
  });

  it("validates username and password tolerance", () => {
    expect(validateAuthForm("ra", "1239")).toBe("Username needs at least 3 characters.");
    expect(validateAuthForm("rafa 1239", "1239")).toBe("Username has unsupported characters.");
    expect(validateAuthForm("rafa1239", "123")).toBe("Password needs at least 4 characters.");
    expect(validateAuthForm("rafa1239", "1239")).toBeNull();
  });

  it("keeps auth errors terse and useful", () => {
    expect(friendlyAuthMessage("Account creation is closed.")).toBe(
      "This workspace already has an account. Sign in instead."
    );
    expect(friendlyAuthMessage("Online database is not configured yet.")).toBe(
      "Online workspace is not connected yet."
    );
    expect(friendlyAuthMessage("Username or password is wrong.")).toBe(
      "Username or password is wrong."
    );
  });
});
