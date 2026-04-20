
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function AppShell({ title, subtitle, children, actions }) {
  const { logout, user } = useAuth();
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Think Unlimited.</div>
          <p className="brand-subtext">Collaborative AI Editor</p>
        </div>

        <nav className="sidebar-nav">
          <Link
            className={`nav-link ${
              location.pathname.startsWith("/dashboard") ? "active" : ""
            }`}
            to="/dashboard"
          >
            Dashboard
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div className="user-name">{user?.name || "User"}</div>
              {user?.username ? <div className="username-pill">@{user.username}</div> : null}
              <div className="user-email">{user?.email || ""}</div>
            </div>
          </div>

          <button className="ghost-button full-width" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>

          {actions ? <div className="page-actions">{actions}</div> : null}
        </header>

        {children}
      </main>
    </div>
  );
}

export default AppShell;
