import { BrowserRouter, Routes, Route } from "react-router-dom";
import Splash from "./pages/Splash";
import AppPage from "./pages/AppPage";
import SharePage from "./pages/SharePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/app/:planId" element={<AppPage />} />
        <Route path="/share/:shareId" element={<SharePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
