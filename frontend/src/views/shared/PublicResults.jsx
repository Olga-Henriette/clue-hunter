import React from 'react';
import PublicScoreboard from './CorrectionScreen';

const PublicResults = ({ players }) => {
    // Les joueurs sont déjà triés par score dans PublicScreen.jsx
    
    return (
        <div className="public-screen public-results">
            <h2>🏆 RÉSULTATS FINAUX 🏆</h2>
            
            {/* Affichage du Vainqueur */}
            {players.length > 0 && (
                <div className="winner-display">
                    <h1>Félicitations au {players[0].role_name} !</h1>
                    <p>Score Final : {players[0].current_score}</p>
                </div>
            )}
            
            {/* Classement complet */}
            <PublicScoreboard players={players} />

        </div>
    );
};

export default PublicResults;