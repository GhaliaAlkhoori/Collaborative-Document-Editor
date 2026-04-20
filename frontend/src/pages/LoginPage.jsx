
import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await api.post("/api/v1/auth/login", form);
      const pendingShareToken = localStorage.getItem("pending_share_token");

      login(
        {
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token,
        },
        {
          user_id: res.data.user_id,
          name: res.data.name,
          username: res.data.username,
          email: form.email,
        }
      );

      window.location.href = pendingShareToken ? `/share/${pendingShareToken}` : "/dashboard";
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f6f4f7",
        padding: "24px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "430px",
          background: "#ffffff",
          borderRadius: "24px",
          padding: "32px",
          boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
          border: "1px solid #ece7ef",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: "999px",
            background: "#f1ebff",
            color: "#5b3fd1",
            fontWeight: "700",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          AI1220 Assignment 2
        </div>

        <h1
          style={{
            margin: "0 0 10px",
            fontSize: "40px",
            lineHeight: "1.1",
            color: "#1e1723",
          }}
        >
          Welcome back
        </h1>

        <p
          style={{
            margin: "0 0 24px",
            color: "#6d6272",
            lineHeight: "1.6",
            fontSize: "15px",
          }}
        >
          Sign in to access your collaborative documents and AI writing tools.
        </p>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                color: "#1e1723",
              }}
            >
              Email
            </label>
            <input
              aria-label="Email"
              name="email"
              value={form.email}
              onChange={handleChange}
              type="email"
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #ddd6e3",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                color: "#1e1723",
              }}
            >
              Password
            </label>
            <input
              aria-label="Password"
              name="password"
              value={form.password}
              onChange={handleChange}
              type="password"
              placeholder="Enter your password"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #ddd6e3",
              }}
            />
          </div>

          {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}

          <button
            type="submit"
            style={{
              marginTop: "8px",
              padding: "14px 18px",
              borderRadius: "14px",
              border: "none",
              background: "#5b3fd1",
              color: "white",
              fontWeight: "700",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Login
          </button>
        </form>

        <p
          style={{
            marginTop: "18px",
            color: "#6d6272",
            fontSize: "14px",
          }}
        >
          Don’t have an account?{" "}
          <a href="/register" style={{ color: "#5b3fd1", fontWeight: "700" }}>
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
