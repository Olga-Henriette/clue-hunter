import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { MAX_PLAYERS } from './roles';
import { useAuth } from '../../context/AuthContext';

const LobbyScreen = () => {
    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);
    const [isGameRunning, setIsGameRunning] = useState(false); 
    const { userId } = useAuth(); // Récupérer l'ID de l'utilisateur anonyme

    // Fonction de vérification du statut de la session et de la navigation
    const checkGameStatus = useCallback(async () => {
        // Pour la simplicité, nous prenons toujours la session la plus récente
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
            // Redirection vers l'écran de jeu
            navigate('/game'); 
        } else {
            setIsGameRunning(false);
        }
    }, [navigate]);

    // ------------------------------------
    // I. LOGIQUE EN TEMPS RÉEL (JOUEURS & STATUT DE JEU)
    // ------------------------------------
    useEffect(() => {
        let playersChannel;
        let gameSessionChannel;
        
        const fetchPlayers = async () => {
            const { data, error } = await supabase
                .from('players')
                .select('id, role_name, is_ready, current_score'); // Ajout de l'ID du joueur pour identification
            
            if (!error && data) {
                setPlayers(data);
            }
        };

        // 1. Abonnement aux joueurs (pour mettre à jour la liste des participants)
        playersChannel = subscribeToTable('players', (payload) => {
            console.log('Realtime player update:', payload);
            fetchPlayers();
        });

        // 2. Abonnement à la session (pour la transition vers '/game')
        // Lorsque l'Admin clique sur "Démarrer la Partie", le statut passe à 'IN_PROGRESS'.
        gameSessionChannel = subscribeToTable('game_sessions', (payload) => {
            console.log('Realtime session update:', payload);
            checkGameStatus();
        });

        fetchPlayers();
        checkGameStatus(); // Vérification initiale

        // Nettoyage des abonnements
        return () => {
            if (playersChannel) playersChannel.unsubscribe();
            if (gameSessionChannel) gameSessionChannel.unsubscribe();
        };
    }, [checkGameStatus]); // checkGameStatus est une dépendance stabilisée par useCallback

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
    
    // Si le jeu est lancé, on ne doit pas rendre le Lobby. La redirection est gérée dans useEffect.
    if (isGameRunning) {
        // Affiche un message minimal en attendant la redirection
        return <div>Lancement de la partie...</div>; 
    }

    // Le Lobby est actif
    return (
        <div className="screen-d-lobby">
            <h2>Lobby d'Attente - {players.length}/{MAX_PLAYERS} Joueurs</h2>
            
            <div className="player-list">
                {players.map((player) => (
                    // Utilisation de player.id pour vérifier si c'est le joueur actuel
                    <div 
                        key={player.role_name} 
                        className={`player-item ${player.is_ready ? 'ready' : 'waiting'} ${player.id === userId ? 'me' : ''}`}
                    >
                        {player.role_name} {player.is_ready ? '✅' : '⏳'}
                    </div>
                ))}
            </div>

            {/* Le jeu est prêt à être lancé par l'Admin */}
            <p>En attente du lancement de la partie par l'administrateur.</p>

            {/* Bouton de Déconnexion (Seule action possible pour le joueur) */}
            <button 
                onClick={handleDisconnect} 
                className="btn-danger" 
            >
                Déconnexion
            </button>
        </div>
    );
};

export default LobbyScreen;