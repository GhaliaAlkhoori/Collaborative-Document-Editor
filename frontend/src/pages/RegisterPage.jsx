
import { useState } from "react";
import api from "../api/client";

function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      await api.post("/api/v1/auth/register", form);
      setMessage("Account created successfully. Redirecting to login...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.detail || "Registration failed.");
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
          Create account
        </div>

        <h1
          style={{
            margin: "0 0 10px",
            fontSize: "40px",
            lineHeight: "1.1",
            color: "#1e1723",
          }}
        >
          Get started
        </h1>

        <p
          style={{
            margin: "0 0 24px",
            color: "#6d6272",
            lineHeight: "1.6",
            fontSize: "15px",
          }}
        >
          Create your account to start collaborating and using AI features.
        </p>

        <form onSubmit={handleRegister} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={{ fontWeight: "600" }}>Full Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              type="text"
              placeholder="Your name"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid #ddd6e3",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: "600" }}>Email</label>
            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              type="email"
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid #ddd6e3",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: "600" }}>Password</label>
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              type="password"
              placeholder="Minimum 8 characters"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid #ddd6e3",
              }}
            />
          </div>

          {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}
          {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}

          <button
            type="submit"
            style={{
              marginTop: "8px",
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              background: "#5b3fd1",
              color: "white",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Register
          </button>
        </form>

        <p style={{ marginTop: "16px", color: "#6d6272" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#5b3fd1", fontWeight: "700" }}>
            Login
          </a>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;