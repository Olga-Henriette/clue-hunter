import React, { useState, useEffect } from 'react';
import useTimer from '../../hooks/useTimer';
import ScoreboardDisplay from '../../views/shared/ScoreboardScreen'; 
import { getRoleImage } from '../../utils/roleConfig';
import { GAME_CONSTANTS } from '../../utils/gameConfig';

const PublicGame = ({ players, currentSession, currentQuestionData, startCorrectionFlow }) => {
    // La logique avancée gérera les transitions Screen 3 (Flou), 5 (Score Notifs), 7 (Jeu)

    // Affichage temporaire de la question et du classement (Screen 7 principal)
    
    const { timeRemaining } = useTimer(
        currentSession?.start_time, 
        GAME_CONSTANTS.QUESTION_TIME_LIMIT_S 
    );  

    // État pour gérer la transition Screen 4 (Image Visible) -> Screen 5 (Image Masquée)
    const [isImageHidden, setIsImageHidden] = useState(false);
    
    const [isCorrectionTriggered, setIsCorrectionTriggered] = useState(false);

    // Logique pour trouver le nombre de joueurs prêts
    const readyPlayersCount = players.filter(p => p.is_ready).length;
    const allPlayersReady = players.length > 0 && readyPlayersCount >= players.length; // Tous les joueurs ont validé

    // --- LOGIQUE DE DÉCLENCHEMENT DE LA CORRECTION ---
    useEffect(() => {

        // Si la correction a déjà été déclenchée (verrouillée), on sort immédiatement
        if (isCorrectionTriggered) {
            return;
        }
        
        // Condition 1: Le chrono est terminé
        if (timeRemaining <= 0) {
            console.log("Chrono terminé. Démarrage de la correction.");
            setIsCorrectionTriggered(true);
            startCorrectionFlow();
            return;
        }

        // Condition 2: Tous les joueurs ont validé
        if (allPlayersReady) {
            console.log("Tous les joueurs ont validé. Démarrage de la correction.");
            setIsCorrectionTriggered(true)
            startCorrectionFlow();
            return;
        }

        // Condition 3: Transition de l'image (Screen 4 -> Screen 5)
        if (timeRemaining <= (GAME_CONSTANTS.QUESTION_TIME_LIMIT_S - GAME_CONSTANTS.IMAGE_VISIBLE_DURATION_S) && !isImageHidden) {
            setIsImageHidden(true); // Masquer l'image après 15 secondes
        }
        
    // Le tableau de dépendances doit inclure les valeurs qui déclenchent cette logique
    }, [timeRemaining, allPlayersReady, startCorrectionFlow, isImageHidden, players.length, isCorrectionTriggered]); 

    // Logique pour trouver la question actuelle
    const currentQuestion = currentQuestionData; 
    const currentQuestionIndex = currentSession?.current_question_index || 0;
    const totalQuestions = currentSession?.total_questions || 0;
    
    return (
        <div className="public-screen public-game">
            
            <div className="game-header-public">
                {/* Progression i/n */}
                <h3 className="question-index-display">Question **{currentQuestionIndex + 1}** / **{totalQuestions}**</h3>
                
                {/* Chronomètre (Screen 5) */}
                <div className={`timer-display ${timeRemaining <= 5 ? 'critical' : ''}`}>
                    ⏳ Temps Restant : **{timeRemaining}**s
                </div>
            </div>

            {/* Zone de l'Image (Screen 4/5) */}
            <div className="question-image-area">
                {currentQuestion && currentQuestion.images_url && Array.isArray(currentQuestion.images_url) && (
                    <div className={`clue-images-container ${isImageHidden ? 'hidden' : ''}`}>
                        {currentQuestion.images_url.map((url, index) => (
                            <img key={index} src={url} alt={`Indice ${index + 1}`} className="clue-image" />
                        ))}
                    </div>
                )}
                
                {/* Face cachée (Utiliser le logo du jeu) */}
                {isImageHidden && (
                    <div className="face-cachee">
                        <img src={getRoleImage('GAME_LOGO_KEY')} alt="Logo du jeu" />
                        <p>Image masquée. Concentrez-vous sur la saisie.</p>
                    </div>
                )}
            </div>

            {/* 8 Profils avec Scores (Screen 5) */}
            <div className="players-scores-display">
                {players.map((player) => (
                    <div key={player.id} className={`player-chip ${player.is_ready ? 'ready' : ''}`}>
                        <img 
                            src={getRoleImage(player.role_name)} 
                            alt={`Logo ${player.role_name}`} 
                            className="player-logo" 
                        />
                        <span className="player-score">{player.current_score} pts</span>
                        {/* Implémenter ici l'affichage des notifications en temps réel (-15, bonus) si elles sont gérées par Realtime */}
                        {/* Par simplicité, nous affichons seulement 'Ready' */}
                        {player.is_ready && <span className="ready-indicator">✅ Validé</span>}
                    </div>
                ))}
            </div>
            
            {/* L'ancien PublicScoreboard est maintenant intégré dans le flux via PublicScreen */}

        </div>
    );
};

export default PublicGame;