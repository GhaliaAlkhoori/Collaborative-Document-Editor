
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import EditorPage from "./pages/EditorPage";

function App() {
  const path = window.location.pathname;
  const token = localStorage.getItem("access_token");

  if (path === "/login" || path === "/") {
    return <LoginPage />;
  }

  if (path === "/register") {
    return <RegisterPage />;
  }

  if (!token) {
    window.history.replaceState({}, "", "/login");
    return <LoginPage />;
  }

  if (path === "/dashboard") {
    return <DashboardPage />;
  }

  if (path.startsWith("/documents/")) {
    return <EditorPage />;
  }

  return (
    <div style={{ padding: "40px", fontSize: "32px", color: "black" }}>
      Page not found
    </div>
  );
}

export default App;