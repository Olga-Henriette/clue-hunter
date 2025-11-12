import React from 'react';
import { useNavigate } from 'react-router-dom';

const WelcomeScreen = () => {
  const navigate = useNavigate();

  const handlePlayClick = () => {
    // Navigue vers la sélection de rôle (Screen B)
    navigate('/select-role'); 
  };

  return (
    <div className="screen-a">
      {/* Utilisation de balises sémantiques pour la structure */}
      <h1>Chasseur d'Indice</h1>
      {/*  (Ajouter une image du logo du jeu ici) */}
      <p>Le jeu multijoueur de connaissance générale et de rapidité.</p>
      
      {/* Bouton "Jouer" */}
      <button 
        onClick={handlePlayClick} 
        className="btn-primary" // Classe CSS à définir
      >
        Jouer
      </button>
      
      {/* Lien caché ou séparé vers l'écran public pour le second ordinateur */}
      <p style={{ marginTop: '20px' }}>
        <a href="/public" target="_blank">Écran Spectateur</a>
      </p>

    </div>
  );
};

export default WelcomeScreen;