import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { MAX_PLAYERS } from './roles';
import { useAuth } from '../../context/AuthContext';
import CountdownScreen from '../../views/shared/CountdownScreen'; 
import { ROLE_CONFIG, getRoleDisplayName, getRoleImage } from '../../utils/roleConfig';
import LOGOUT_ICON from '../../assets/logout.png';

// Fonction utilitaire shuffleArray (à définir à l'extérieur de LobbyScreen ou à l'importer)
const shuffleArray = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
};

const LobbyScreen = () => {
    const navigate = useNavigate();
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [players, setPlayers] = useState([]);
    const [isGameRunning, setIsGameRunning] = useState(false);
    const [showCountdown, setShowCountdown] = useState(false); // État pour le compte à rebours
    const { userId } = useAuth();

    // Récupérer les questions pour le lancement (doit être fait par le joueur lanceur)
    const fetchQuestions = async () => {
        const { data: questionsData, error } = await supabase
            .from('questions')
            .select('id, theme_tag, answer_key');
        
        if (error) {
            console.error("Erreur chargement questions:", error);
            return [];
        }
        return questionsData || [];
    };
    
    // Logique de Lancement du Jeu (appelé après le compte à rebours)
    const handleLaunchGame = useCallback(async () => {
        // 1. Charger et sélectionner les questions
        const allQuestions = await fetchQuestions();
        const TOTAL_QUESTIONS_TO_ASK = 5; 

        if (allQuestions.length < TOTAL_QUESTIONS_TO_ASK) {
            console.error("Erreur: Pas assez de questions pour lancer.");
            return;
        }
        const shuffleArray = (array) => { /* ... fonction shuffleArray ... */ return array; };
        const shuffledQuestions = shuffleArray([...allQuestions]);
        const selectedQuestionIds = shuffledQuestions
            .slice(0, TOTAL_QUESTIONS_TO_ASK)
            .map(q => q.id);

        const playerIds = players.map(p => p.id);
        
        // 2. Appel RPC pour créer la session
        const { error: rpcError } = await supabase.rpc('start_new_game', {
            question_ids: selectedQuestionIds,
            total_questions_count: TOTAL_QUESTIONS_TO_ASK,
            current_players_ids: playerIds,
        });

        if (rpcError) {
            console.error("Erreur RPC Lancement:", rpcError);
            alert(`Erreur lors du lancement automatique: ${rpcError.message}`);
        }
        
        // Le Realtime GameSession va ensuite rediriger tous les joueurs vers /game
    }, [players]);


    // Vérification du statut de la session et de la navigation (inchangé)
    const checkGameStatus = useCallback(async () => {
        const { data: sessionData, error: sessionError } = await supabase
            .from('game_sessions')
            .select('status')
            .limit(1)
            .order('created_at', { ascending: false });

        const status = sessionData?.[0]?.status;

        if (sessionError) {
            console.error("Error fetching game session status:", sessionError);
            return;
        }

        if (status === 'IN_PROGRESS') {
            setIsGameRunning(true);
            navigate('/game'); 
        } else {
            setIsGameRunning(false);
        }
    }, [navigate]);


    // LOGIQUE DE L'ABONNEMENT ET DU LANCEMENT AUTOMATIQUE
    useEffect(() => {
        let playersChannel;
        let gameSessionChannel;
        
        const fetchPlayers = async () => {
            const { data, error } = await supabase
                .from('players')
                .select('id, role_name, is_ready, current_score');
            
            if (!error && data) {
                setPlayers(data);
                
                // Vérifier si le profil du joueur existe toujours
                const currentPlayerProfile = data.find(p => p.id === userId);
                if (userId && !currentPlayerProfile && isGameRunning) {
                     // Si le joueur est déconnecté de force ou profil supprimé
                     navigate('/select-role');
                     return;
                }

                // LOGIQUE D'AUTO-LANCEMENT DU JEU
                const allReady = data.length === MAX_PLAYERS && data.every(p => p.is_ready);
                
                // Si 8 joueurs sont prêts, le jeu n'a pas commencé, et aucun compte à rebours n'est en cours
                if (allReady && !isGameRunning && !showCountdown) {
                    
                    // L'Admin doit être l'utilisateur actuellement connecté pour lancer (ID doit correspondre à celui qui est sur /admin)
                    // PENDANT LA TRANSITION, nous allons laisser TOUT LE MONDE essayer de lancer le compte à rebours.
                    // Seul l'Admin, qui est le seul à pouvoir appeler le RPC (car SECURITY DEFINER), réussira.

                    // S'assurer que le jeu n'est pas DÉJÀ en cours (vérification supplémentaire)
                    const { data: sessionData } = await supabase
                         .from('game_sessions')
                         .select('status')
                         .limit(1)
                         .order('created_at', { ascending: false });

                    if (sessionData?.[0]?.status !== 'IN_PROGRESS') {
                        // Si le jeu n'est pas déjà lancé, déclencher le compte à rebours pour tout le monde
                        // L'appel RPC ne réussira que si le joueur est l'Admin
                        setShowCountdown(true); 
                    }
                }
            }
        };

        playersChannel = subscribeToTable('players', (payload) => {
            fetchPlayers();
        });

        gameSessionChannel = subscribeToTable('game_sessions', (payload) => {
            checkGameStatus();
        });

        fetchPlayers();
        checkGameStatus();

        return () => {
            if (playersChannel) playersChannel.unsubscribe();
            if (gameSessionChannel) gameSessionChannel.unsubscribe();
        };
    }, [checkGameStatus, isGameRunning, showCountdown, userId]);


    // Déclenchement du RPC après la fin du compte à rebours
    const onCountdownEnd = () => {
        // Une fois le compte à rebours terminé, la personne qui a déclenché le timer lance le jeu
        setShowCountdown(false);
        handleLaunchGame();
    };


    // Fonction qui lance la déconnexion APRÈS la confirmation
    const handleConfirmDisconnect = async () => {
    setShowConfirmModal(false); // Ferme le modal immédiatement
    if (!userId) {
        navigate('/');
        return;
    }

    try {
        // 1. Supprimer le profil du joueur dans la table 'players'
        const { error: deleteError } = await supabase
            .from('players')
            .delete()
            .eq('id', userId);

        if (deleteError) throw deleteError;

        // 2. Déconnecter l'utilisateur anonyme de Supabase Auth
        await supabase.auth.signOut();

        // 3. Rediriger vers l'écran de rôle
        alert("Déconnexion réussie. Votre rôle est libéré.");
        navigate('/select-role');

    } catch (error) {
        console.error("Erreur lors de la déconnexion ou de la suppression du profil:", error.message);
        alert("Erreur lors de la déconnexion. Veuillez réessayer.");
    }
};

// Fonction appelée par le bouton (ouvre le modal)
const handleDisconnectClick = () => {
    setShowConfirmModal(true); 
};


    // ------------------------------------
    // III. RENDU (SCREEN D)
    // ------------------------------------
    
    const myPlayer = players.find(player => player.id === userId);
    const opponents = players.filter(player => player.id !== userId);
    const allReady = players.length === MAX_PLAYERS && players.every(p => p.is_ready);

    // Afficher le compte à rebours en priorité si nécessaire
    if (showCountdown) {
        return <CountdownScreen initialCount={3} onCountdownEnd={onCountdownEnd} />;
    }

    if (isGameRunning) {
        return <div>Lancement de la partie...</div>; 
    }
    
    // Rendu du Lobby
    return (
        <div className="lobby-container fullscreen"> 
            
            {/* Icône de Déconnexion en Haut à Droite (Positionnement CSS) */}
            <button 
                onClick={handleDisconnectClick} 
                className="btn-icon-disconnect" 
                title="Déconnexion (Annuler le rôle)"
            >
                 <img src={LOGOUT_ICON} alt="Déconnexion" className="disconnect-icon" />
            </button>
            
            <div className="lobby-content-grid">
                
                {/* 1. Colonne Gauche: Adversaires (Verticalement) */}
                <div className="opponents-list-column">
                    <h3 className="column-title-opponents">Adversaires ({opponents.length} / {MAX_PLAYERS - 1})</h3>
                    <div className="opponents-list">
                        {/* Boucle pour les 7 slots adverses */}
                        {Array(MAX_PLAYERS - 1).fill(null).map((_, index) => {
                            const player = opponents[index];
                            const isSlotTaken = !!player;
                            
                            // Affichage pour un joueur présent
                            if (isSlotTaken) {
                                const displayName = getRoleDisplayName(player.role_name);
                                const roleImage = getRoleImage(player.role_name);
                                
                                return (
                                    <div 
                                        key={player.id} 
                                        className={`opponent-item active ${player.is_ready ? 'ready' : 'waiting'}`}
                                    >
                                        <img src={roleImage} alt={displayName} className="opponent-logo" />
                                        <div className="opponent-details">
                                            <span className="opponent-role-name">{displayName}</span>
                                            <span className="opponent-status">{player.is_ready ? 'PRÊT' : 'ATTENTE'}</span>
                                        </div>
                                    </div>
                                );
                            }

                            // Affichage pour un slot libre
                            return (
                                <div key={`slot-${index}`} className="opponent-item slot-empty">
                                    <div className="opponent-logo empty">?</div>
                                    <div className="opponent-details">
                                        <span className="opponent-role-name">Emplacement Libre</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Colonne Droite: Joueur Actuel (Grand et Centré) */}
                <div className="my-player-column">
                    {myPlayer ? (
                        <div className="my-player-card">
                            <img 
                                src={getRoleImage(myPlayer.role_name)} 
                                alt={getRoleDisplayName(myPlayer.role_name)} 
                                className="my-player-logo-large"
                            />
                            <p className="my-player-role-display">
                                {getRoleDisplayName(myPlayer.role_name).toUpperCase()}
                            </p>
                        </div>
                    ) : (
                        <div className="my-player-card missing">
                            <p>Profil introuvable. Veuillez vous reconnecter.</p>
                        </div>
                    )}

                    {/* 3. Loading Bar en Bas (Attente) */}
                    <div className="waiting-indicator-bottom">
                        {allReady ? (
                            <div className="full-message">
                                LANCEMENT AUTOMATIQUE DANS QUELQUES SECONDES...
                            </div>
                        ) : (
                            <div className="loading-status">
                                <div className="waiting-spinner"></div>
                                <p>En attente de {MAX_PLAYERS - players.length} joueur(s) supplémentaire(s)...</p>
                                <div className="progress-bar-container">
                                    {/* Largeur de la barre de progression basée sur le pourcentage de joueurs */}
                                    <div 
                                        className="progress-bar" 
                                        style={{ width: `${(players.length / MAX_PLAYERS) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}

                    </div>

                </div>

            </div> 
                {showConfirmModal && (
                    <div className="validation-modal"> {/* Réutilisation de la classe de Screen B */}
                        <div className="modal-content lobby-confirm-modal"> {/* Nouvelle classe pour le contenu spécifique */}
                            <p>
                                Êtes-vous sûr de vouloir vous déconnecter ?<br/>
                            </p>
                            <div className="modal-actions">
                                {/* Utilisation de handleConfirmDisconnect et handleCancel */}
                                <button onClick={handleConfirmDisconnect} className="btn-yes">OUI</button>
                                <button onClick={() => setShowConfirmModal(false)} className="btn-no">NON</button>
                            </div>
                        </div>
                    </div>
                )}           
        </div>
    );
};

export default LobbyScreen;

