// Constantes pour la logique de score 
export const BASE_SCORE = 100;
export const PENALTY_AMOUNT = 15;
export const MAX_TIME_SECONDS = 30; // Durée totale d'une question
export const BONUS_CUTOFF_SECONDS = 10; // Temps restant minimum pour obtenir un bonus (30s - 20s = 10s)

/**
 * Calcule le bonus de rapidité basé sur le temps restant.
 * Le bonus est appliqué si le joueur répond en moins de 20 secondes (temps restant > 10s).
 *
 * @param {number} timeRemaining - Le temps restant au chronomètre (entre 0 et 30).
 * @returns {number} Le montant du bonus (+0 à +50).
 */
export const calculateSpeedBonus = (timeRemaining) => {
    if (timeRemaining >= BONUS_CUTOFF_SECONDS) {
        // Bonus = 2 * Temps Restant (maximum 2 * 25s = 50 points si fini en 5s)
        return Math.floor(timeRemaining * 2); 
    }
    return 0; 
};

/**
 * Calcule le score final d'une partie.
 * * @param {number} timeRemaining - Le temps restant lors de la soumission de la bonne réponse.
 * @param {number} penaltyCount - Le nombre de pénalités instantanées (-15) reçues.
 * @returns {number} Le score total (incluant la base, le bonus et les pénalités) pour cette partie.
 */
export const calculateFinalScore = (timeRemaining, penaltyCount) => {
    const bonus = calculateSpeedBonus(timeRemaining);
    const totalPenalty = penaltyCount * PENALTY_AMOUNT;
    
    // Le score est appliqué uniquement si le joueur a trouvé la bonne réponse
    const score = BASE_SCORE + bonus - totalPenalty;
    
    return score;
};