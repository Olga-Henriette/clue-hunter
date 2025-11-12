import React, { useState, useEffect } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';

// Composants du public 
import PublicLobby from './PublicLobby'; // Écran 2
import PublicGame from './PublicGame';   // Écran 5/7
import PublicResults from './PublicResults'; // Écran 8

const PublicScreen = () => {
    const [gameStatus, setGameStatus] = useState('LOADING');
    const [players, setPlayers] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);

    // Fonction pour charger toutes les données de jeu nécessaires
    const fetchGameData = async () => {
        // 1. Chercher la session de jeu active
        // NOTE: Pour la première version, nous supposons qu'il n'y a qu'une seule session active
        const { data: sessionData, error: sessionError } = await supabase
            .from('game_sessions')
            .select('*')
            .limit(1)
            .order('created_at', { ascending: false });

        if (sessionError) {
            console.error("Error fetching game session:", sessionError.message);
            setGameStatus('ERROR');
            return;
        }

        const session = sessionData?.[0];
        setCurrentSession(session || null);
        setGameStatus(session ? session.status : 'NO_SESSION');

        // 2. Charger les joueurs actifs
        const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('role_name, current_score, is_ready');
        
        if (!playersError && playersData) {
            // Trier les joueurs par score (du plus haut au plus bas) pour le classement
            const sortedPlayers = playersData.sort((a, b) => b.current_score - a.current_score);
            setPlayers(sortedPlayers);
        }
    };

    // ------------------------------------
    // TEMPS RÉEL
    // ------------------------------------
    useEffect(() => {
        // Charger les données initiales
        fetchGameData();

        // 1. S'abonner aux changements de score/statut des joueurs
        const playersChannel = subscribeToTable('players', (payload) => {
            console.log('Public: Realtime Players Update');
            // Recharger toutes les données pour mettre à jour les scores et le classement
            fetchGameData();
        });

        // 2. S'abonner aux changements d'état de la session (Lobby -> Game -> Finished)
        const sessionChannel = subscribeToTable('game_sessions', (payload) => {
            console.log('Public: Realtime Session Update');
            fetchGameData();
        });

        // Nettoyage des abonnements
        return () => {
            playersChannel.unsubscribe();
            sessionChannel.unsubscribe();
        };
    }, []);

    // ------------------------------------
    // RENDU DYNAMIQUE
    // ------------------------------------
    const commonProps = { players, currentSession, fetchGameData };

    switch (gameStatus) {
        case 'LOADING':
        case 'NO_SESSION':
            return <div>En attente du lancement d'une nouvelle partie...</div>;

        case 'LOBBY': // Screen 2
            return <PublicLobby {...commonProps} />;
            
        case 'IN_PROGRESS': // Screen 5 (Scoreboard) et 7 (Question)
            // L'écran de jeu gère l'affichage de la question et des scores
            return <PublicGame {...commonProps} />;

        case 'FINISHED': // Screen 8
            // L'écran final affiche le classement final
            return <PublicResults {...commonProps} />;

        case 'ERROR':
        default:
            return <div>Erreur de connexion aux données de jeu.</div>;
    }
};

export default PublicScreen;