
/**
 * Constantes pour les rôles (Status) du jeu.
 * Elles définissent le nom et l'URL de l'avatar par défaut.
 * La clé (ROLE_NAME) doit être en majuscule pour la cohérence.
 */
export const ROLES = [
    {
        ROLE_NAME: 'DROIT',
        DISPLAY_NAME: 'Droit',
        AVATAR_URL: '/assets/avatars/droit.png', // URL à stocker dans Supabase Storage
    },
    {
        ROLE_NAME: 'NURS',
        DISPLAY_NAME: 'Nurs',
        AVATAR_URL: '/assets/avatars/nurs.png',
    },
    {
        ROLE_NAME: 'THEOLOGIE',
        DISPLAY_NAME: 'Théologie',
        AVATAR_URL: '/assets/avatars/theologie.png',
    },
    {
        ROLE_NAME: 'INFORMATIQUE',
        DISPLAY_NAME: 'Informatique',
        AVATAR_URL: '/assets/avatars/informatique.png',
    },
    {
        ROLE_NAME: 'LANGUE_ANGLAISE',
        DISPLAY_NAME: 'Langue Anglaise',
        AVATAR_URL: '/assets/avatars/anglais.png',
    },
    {
        ROLE_NAME: 'COMMUNICATION',
        DISPLAY_NAME: 'Communication',
        AVATAR_URL: '/assets/avatars/communication.png',
    },
    {
        ROLE_NAME: 'GESTION',
        DISPLAY_NAME: 'Gestion',
        AVATAR_URL: '/assets/avatars/gestion.png',
    },
    {
        ROLE_NAME: 'PERSONNEL',
        DISPLAY_NAME: 'Personnel',
        AVATAR_URL: '/assets/avatars/personnel.png',
    },
];

export const MAX_PLAYERS = 8;