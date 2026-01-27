import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Splash from "./pages/Splash";
import AppPage from "./pages/AppPage";
import SharePage from "./pages/SharePage";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/app/:planId" element={<AppPage />} />
          <Route path="/share/:shareId" element={<SharePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
