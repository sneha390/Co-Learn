import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { RecoilRoot } from 'recoil';
import Register from "./pages/Register";
import CodeEditor from "./pages/CodeEditor";
import LearningRoom from "./pages/LearningRoom";
import ChooseModule from "./pages/ChooseModule";
import ProtectedRouter from "./middleWare/ProtectedRouter";

const App = () => {
  return (
    // Wrap the entire application with RecoilRoot to enable Recoil state management
    <RecoilRoot>
      <Router>
        <Routes>
          {/* The landing/register page will handle both root and room-specific URLs */}
          <Route path="/:roomId" element={<Register />} />
          <Route path="/" element={<Register />} />

          {/* The protected route for your existing code editor component */}
          <Route 
            path="/code/:roomId" 
            element={
              <ProtectedRouter>
                <CodeEditor />
              </ProtectedRouter>
            } 
          />
          <Route
            path="/learn/:roomId/choose"
            element={
              <ProtectedRouter>
                <ChooseModule />
              </ProtectedRouter>
            }
          />
          <Route
            path="/learn/:roomId"
            element={
              <ProtectedRouter>
                <LearningRoom />
              </ProtectedRouter>
            }
          />
        </Routes>
      </Router>
    </RecoilRoot>
  );
};

export default App;
