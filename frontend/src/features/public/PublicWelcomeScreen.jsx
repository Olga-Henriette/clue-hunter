// src/features/public/PublicWelcomeScreen.jsx
import React from 'react';
import GAME_LOGO from '../../utils/roleConfig'; // Import du logo

const PublicWelcomeScreen = () => {
    return (
        <div className="public-screen welcome-screen fullscreen">
            {/* Contenu - Haut, Milieu, Bas */}
            <h1 className="game-title">Jeu de Rôle Interdisciplinaire</h1>
            <div className="logo-container">
                <img src={GAME_LOGO} alt="Logo du jeu" className="main-logo" />
            </div>
            <p className="game-description">
                Choisissez votre rôle parmi les 8 disciplines et lancez-vous dans le défi de la connaissance ! 
                Attente de la première connexion pour démarrer.
            </p>
        </div>
    );
};
export default PublicWelcomeScreen;