import React from 'react';
import { useNavigate } from 'react-router-dom';
import GAME_LOGO from '../../utils/roleConfig'; 


const WelcomeScreen = () => {
  const navigate = useNavigate();

  const handlePlayClick = () => {
    // Navigue vers la sélection de rôle (Screen B)
    navigate('/select-role'); 
  };

return (
    <div className="screen-a welcome-screen fullscreen"> {/* Ajout de classes de style */}
      <div className="welcome-content">
        
        {/* Logo et titre centrés en haut */}
        <header className="welcome-header">
            <h1>Chasseur d'Indice</h1>
            <img src={GAME_LOGO} alt="Logo du jeu Chasseur d'Indice" className="game-logo-medium" />
        </header>

        <p className="game-description">Le jeu multijoueur de connaissance générale, de rapidité et de memoire .</p>
        
        {/* Bouton "Jouer" */}
        <button 
          onClick={handlePlayClick} 
          className="btn-primary btn-large" // Classes de style pour un bouton principal
        >
          Jouer
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;