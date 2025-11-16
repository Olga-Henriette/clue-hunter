export const GAME_CONSTANTS = {
    // ------------------
    // Configuration de la Session
    // ------------------
    MAX_PLAYERS: 8,
    QUESTION_TIME_LIMIT_S: 30, // Durée totale d'une question
    
    // ------------------
    // Timing des Transitions (Temps en secondes)
    // ------------------
    PRE_GAME_COUNTDOWN_S: 3, // Avant la première question / après le lobby
    TRANSITION_COUNTDOWN_S: 3, // Entre correction et nouvelle question
    CORRECTION_VIEW_DURATION_S: 10, // Durée après l'animation de correction avant le classement
    SCOREBOARD_VIEW_DURATION_S: 10, // Durée d'affichage du classement (Screen 7)

    // ------------------
    // Timing des Écrans (dans PublicGame/GamePlay)
    // ------------------
    IMAGE_VISIBLE_DURATION_S: 15, // Durée pendant laquelle l'image est visible (Screen 4)
    CHRONO_CRITICAL_S: 5, // Quand le chrono devient rouge/critique

    // ------------------
    // Scoring et Pénalités
    // ------------------
    BASE_POINTS: 100,
    PENALTY_AMOUNT: 15, // Sanction
    BONUS_TIME_LIMIT_S: 10, // Si le temps restant est >= 10s (i.e. validation < 20s)
};
