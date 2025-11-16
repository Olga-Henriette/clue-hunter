// Importation statique de toutes les images de rôle
// C'est la meilleure pratique en React pour les assets connus
import NURS_IMG from '../assets/roles/ROLE_NURS.jpg';
import DROIT_IMG from '../assets/roles/ROLE_DROIT.jpg';
import GESTION_IMG from '../assets/roles/ROLE_GESTION.jpg';
import THEOLOGY_IMG from '../assets/roles/ROLE_THEOLOGY.jpg';
import INFO_IMG from '../assets/roles/ROLE_INFO.jpg';
import COM_IMG from '../assets/roles/ROLE_COM.jpg';
import PERSONNEL_IMG from '../assets/roles/ROLE_PERSONNEL.jpg';
import LANG_IMG from '../assets/roles/ROLE_LANG.jpg';

// Importation du logo principal
import GAME_LOGO from '../assets/game_logo.png';

// ----------------------------------------------------------------
// Configuration des Rôles
// Les clés doivent correspondre aux valeurs 'role' stockées dans la BDD (ex: 'NURS', 'DROIT', etc.)
// ----------------------------------------------------------------
export const ROLE_CONFIG = {
    // Clé dans la BDD : { Nom d'affichage, Image de l'asset }
    'NURS': { displayName: 'NURS', image: NURS_IMG },
    'DROIT': { displayName: 'DROIT', image: DROIT_IMG },
    'GESTION': { displayName: 'GESTION', image: GESTION_IMG },
    
    // CORRECTIONS :
    'THEOLOGIE': { displayName: 'THÉOLOGIE', image: THEOLOGY_IMG }, 
    'INFORMATIQUE': { displayName: 'INFORMATIQUE', image: INFO_IMG }, 
    'COMMUNICATION': { displayName: 'COMMUNICATION', image: COM_IMG }, 
    'PERSONNEL': { displayName: 'PERSONNEL', image: PERSONNEL_IMG },
    'LANGUE_ANGLAISE': { displayName: 'LANGUE ANGLAISE', image: LANG_IMG }, 
};

// ----------------------------------------------------------------
// Fonction Utilitaire pour un Accès Facile
// ----------------------------------------------------------------

/**
 * Récupère l'URL de l'image de rôle ou le logo du jeu par défaut.
 * @param {string} roleKey La clé du rôle (ex: 'INFO').
 * @returns {string} L'URL de l'image.
 */
export const getRoleImage = (roleKey) => {
    const role = ROLE_CONFIG[roleKey];
    return role ? role.image : GAME_LOGO; // Retourne l'image de rôle ou le logo par défaut
};

/**
 * Récupère le nom d'affichage du rôle.
 * @param {string} roleKey La clé du rôle.
 * @returns {string} Le nom formaté.
 */
export const getRoleDisplayName = (roleKey) => {
    const role = ROLE_CONFIG[roleKey];
    return role ? role.displayName : 'Rôle Inconnu';
};

export default GAME_LOGO; // Export par défaut pour le logo principal