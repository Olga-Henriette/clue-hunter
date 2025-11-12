import { BrowserRouter, Routes, Route } from 'react-router-dom';
// Importez les composants 
import WelcomeScreen from './features/setup/ScreenA_Welcome'; 
import RoleSelectionScreen from './features/setup/ScreenB_RoleSelection';
import LobbyScreen from './features/setup/ScreenD_Lobby';
import PublicScreen from './features/public/PublicScreen'; 
import GamePlayScreen from './features/gameplay/GamePlayScreen';
import AdminScreen from './features/admin/AdminScreen';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
          {/* Routes du Joueur (Lobby et Jeu) */}
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/select-role" element={<RoleSelectionScreen />} />
          <Route path="/lobby" element={<LobbyScreen />} />
          <Route path="/game" element={<GamePlayScreen />} />

          {/* Route de l'Écran Public (Spectateur) */}
          <Route path="/public" element={<PublicScreen />} />

          {/* ROUTE ADMIN SÉCURISÉE (par l'URL simple pour l'instant) */}
          <Route path="/admin" element={<AdminScreen />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;