// frontend/src/features/public/PublicGame.jsx (Écrans 5 et 7)
import React from 'react';
import PublicScoreboard from './PublicScoreboard'; // À créer

const PublicGame = ({ players, currentSession }) => {
    // La logique avancée gérera les transitions Screen 3 (Flou), 5 (Score Notifs), 7 (Jeu)

    // Affichage temporaire de la question et du classement (Screen 7 principal)
    
    // Logique pour trouver la question actuelle
    const currentQuestionIndex = currentSession?.current_question_index || 0;
    const totalQuestions = currentSession?.total_questions || 0;
    
    return (
        <div className="public-screen public-game">
            
            {/* Progression i/n (Barre de Progression) */}
            <h3>Question {currentQuestionIndex + 1} / {totalQuestions}</h3>
            
            {/* L'affichage de la question actuelle nécessitera de charger la question via l'ID */}
            <div className="question-placeholder">
                {/*  */}
                <p>Chargement de la question...</p>
            </div>

            {/* Tableau des Scores (Screen 5/7) */}
            <PublicScoreboard players={players} />

            {/* Chronomètre (Affichage du temps restant) */}
            {/* Le chronomètre devra être implémenté dans un hook réutilisable */}
            <div className="timer-display">
                ⏳ Temps Restant : XXs
            </div>

        </div>
    );
};

export default PublicGame;