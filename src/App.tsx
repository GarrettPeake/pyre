import { BrowserRouter, Routes, Route } from "react-router-dom";
import Splash from "./pages/Splash";
import AppPage from "./pages/AppPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/app/:planId" element={<AppPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
