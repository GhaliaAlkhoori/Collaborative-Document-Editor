import React from "react";
import { render } from "@testing-library/react";
import { AuthProvider } from "../../../src/context/AuthContext";

export function renderWithAuth(ui, { token = "", refreshToken = "", user = null } = {}) {
  if (token) {
    localStorage.setItem("access_token", token);
  }

  if (refreshToken) {
    localStorage.setItem("refresh_token", refreshToken);
  }

  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
  }

  return render(<AuthProvider>{ui}</AuthProvider>);
}
