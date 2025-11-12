import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { MAX_PLAYERS } from './roles';

const LobbyScreen = () => {
    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);
    const [isGameReady, setIsGameReady] = useState(false);
    const userId = supabase.auth.user()?.id; // Récupérer l'ID de l'utilisateur anonyme

    // ------------------------------------
    // I. LOGIQUE EN TEMPS RÉEL (JOUEURS & STATUT DE JEU)
    // ------------------------------------
    useEffect(() => {
        let playersChannel;
        let gameSessionChannel;
        
        const fetchPlayers = async () => {
            const { data, error } = await supabase
                .from('players')
                .select('role_name, is_ready, current_score');
            
            if (!error && data) {
                setPlayers(data);
                // Vérifier si le jeu est prêt à démarrer (ex: 8 joueurs prêts ou admin lance)
                if (data.length === MAX_PLAYERS && data.every(p => p.is_ready)) {
                    // Logic: L'admin ou le serveur doit changer le statut de la partie dans 'game_sessions'
                    // Pour cette étape, nous allons juste écouter la table 'players'
                    // NOTE: Le lancement réel sera géré par un administrateur sur un écran séparé.
                    // Pour le test, on pourrait simuler le lancement si 8 joueurs sont prêts.
                    // setIsGameReady(true); 
                }
            }
        };

        // Abonnement aux changements dans la table 'players'
        playersChannel = subscribeToTable('players', (payload) => {
            console.log('Realtime player update:', payload);
            fetchPlayers(); // Recharger les données pour la simplicité
        });

        // Tâches supplémentaires :
        // 1. S'abonner à 'game_sessions' pour la transition vers '/game'.

        fetchPlayers();

        // Nettoyage des abonnements
        return () => {
            if (playersChannel) playersChannel.unsubscribe();
            if (gameSessionChannel) gameSessionChannel.unsubscribe();
        };
    }, []);

    // ------------------------------------
    // II. GESTION DE LA DÉCONNEXION (SCREEN D ACTION)
    // ------------------------------------

    const handleDisconnect = async () => {
        if (!userId) {
            navigate('/');
            return;
        }

        try {
            // 1. Supprimer le profil du joueur dans la table 'players'
            // Le RLS UPDATE policy permet à l'utilisateur de modifier SES PROPRES données.
            const { error: deleteError } = await supabase
                .from('players')
                .delete()
                .eq('id', userId);
            
            if (deleteError) throw deleteError;
            
            // 2. Déconnecter l'utilisateur anonyme de Supabase Auth
            const { error: signOutError } = await supabase.auth.signOut();

            if (signOutError) throw signOutError;

            // 3. Rediriger vers l'écran de bienvenue
            alert("Déconnexion réussie.");
            navigate('/');

        } catch (error) {
            console.error("Erreur lors de la déconnexion ou de la suppression du profil:", error.message);
            alert("Erreur lors de la déconnexion. Veuillez réessayer.");
        }
    };

    // ------------------------------------
    // III. RENDU (SCREEN D)
    // ------------------------------------
    
    return (
        <div className="screen-d-lobby">
            <h2>Lobby d'Attente - {players.length}/{MAX_PLAYERS} Joueurs</h2>
            
            <div className="player-list">
                {players.map((player) => (
                    <div 
                        key={player.role_name} 
                        className={`player-item ${player.is_ready ? 'ready' : 'waiting'} ${player.id === userId ? 'me' : ''}`}
                    >
                        {player.role_name} {player.is_ready ? '✅' : '⏳'}
                    </div>
                ))}
            </div>

            {isGameReady ? (
                <p>Le jeu est prêt à commencer ! Attente du lancement de l'administrateur...</p>
            ) : (
                <p>En attente des autres joueurs ou du lancement de la partie.</p>
            )}

            {/* Bouton de Déconnexion (Seule action possible pour le joueur) */}
            <button 
                onClick={handleDisconnect} 
                className="btn-danger" // Classe CSS pour le danger (rouge)
            >
                Déconnexion
            </button>
        </div>
    );
};

export default LobbyScreen;