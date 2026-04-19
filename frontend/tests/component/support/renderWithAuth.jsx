import React from "react";
import { render } from "@testing-library/react";
import { AuthProvider } from "../../../src/context/AuthContext";

export function renderWithAuth(ui, { token = "", user = null } = {}) {
  if (token) {
    localStorage.setItem("access_token", token);
  }

  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
  }

  return render(<AuthProvider>{ui}</AuthProvider>);
}
