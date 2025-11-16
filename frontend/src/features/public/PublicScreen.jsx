import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';

import CountdownScreen from '../../views/shared/CountdownScreen'; // Écran Compte à rebours
import CorrectionScreen from '../../views/shared/CorrectionScreen'; // Écran 6
import ScoreboardScreen from '../../views/shared/ScoreboardScreen'; // Écran 7 
import PublicResults from '../../views/shared/PublicResults'; // Écran 8

import PublicLobby from './PublicLobby'; // Écran 2
import PublicGame from './PublicGame';   // Écran 5/7

import PublicWelcomeScreen from './PublicWelcomeScreen'; // Écran 1

const GAME_SUB_STATUS = {
    QUESTION: 'QUESTION',
    PRE_CORRECTION_COUNTDOWN: 'PRE_CORRECTION_COUNTDOWN',
    CORRECTION: 'CORRECTION',
    SCOREBOARD: 'SCOREBOARD',
    NEXT_ROUND_COUNTDOWN: 'NEXT_ROUND_COUNTDOWN',
};

const PublicScreen = () => {
    const [gameStatus, setGameStatus] = useState('LOADING');
    const [players, setPlayers] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);

    const [subStatus, setSubStatus] = useState(GAME_SUB_STATUS.QUESTION);

    const [currentQuestionData, setCurrentQuestionData] = useState(null); // AJOUT

    // Fonction pour charger toutes les données de jeu nécessaires
    const fetchGameData = useCallback (async () => {
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

        if (session && session.status === 'IN_PROGRESS') {
        const questionIndex = session.current_question_index;
        const questionId = session.question_order_ids?.[questionIndex];

            if (questionId) {
                const { data: qData, error: qError } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('id', questionId)
                    .single();

                if (!qError && qData) {
                    setCurrentQuestionData(qData);
                } else if (qError) {
                    console.error("Error fetching current question for public screen:", qError);
                }
            }
        }

        // 2. Charger les joueurs actifs
        const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('role_name, current_score, is_ready');
        
        if (!playersError && playersData) {
            // Trier les joueurs par score (du plus haut au plus bas) pour le classement
            const sortedPlayers = playersData.sort((a, b) => b.current_score - a.current_score);
            setPlayers(sortedPlayers);
        }
    }, []); // vide car il ne dépend que de supabase

    // ------------------------------------
    // TEMPS RÉEL
    // ------------------------------------
    useEffect(() => {
        // Appelez fetchGameData ici.
        fetchGameData();

        // 1. S'abonner aux changements de score/statut des joueurs
        const playersChannel = supabase
            .channel('players-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
                console.log('Public: Realtime Players Update');
                // Au lieu de recharger TOUT, ne mettons à jour que les joueurs.
                // Cela réduira l'impact, mais fetchGameData reste nécessaire
                // pour gérer les transitions de session et question.
                fetchGameData(); 
            })
            .subscribe();

        // 2. S'abonner aux changements d'état de la session (Lobby -> Game -> Finished)
        const sessionChannel = supabase
            .channel('session-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, (payload) => {
                console.log('Public: Realtime Session Update');
                fetchGameData();
            })
            .subscribe();

        // Nettoyage des abonnements
        return () => {
            playersChannel.unsubscribe();
            sessionChannel.unsubscribe();
        };

    }, [fetchGameData]); 
    // si fetchGameData est correctement
    // encapsulé dans useCallback([]), le retirer est la manière de briser le cycle.


    // --- LOGIQUE DE FLUX ET DE TRANSITION ---

    // 1. Déclenche la phase de correction (après fin de chrono ou 8 validations)
    const startCorrectionFlow = () => {
        // Seulement si nous sommes encore en mode question
        if (subStatus === GAME_SUB_STATUS.QUESTION) {
            setSubStatus(GAME_SUB_STATUS.PRE_CORRECTION_COUNTDOWN);
        }
    };

    // 2. Gestion des transitions automatiques après chaque écran
    const handleNextTransition = (currentStep) => {
        switch (currentStep) {
            case GAME_SUB_STATUS.PRE_CORRECTION_COUNTDOWN:
                // Après le premier countdown, on passe à la correction
                setSubStatus(GAME_SUB_STATUS.CORRECTION);
                break;
            case GAME_SUB_STATUS.CORRECTION:
                // Après la correction (animation), on passe au classement
                setSubStatus(GAME_SUB_STATUS.SCOREBOARD);
                break;
            case GAME_SUB_STATUS.SCOREBOARD:
                // Vérifier si c'est la fin du jeu avant de passer au countdown
                if (currentSession.current_question_index + 1 >= currentSession.total_questions) {
                    // Si c'est la dernière question, le statut doit devenir 'FINISHED'
                    // L'Admin est censé le faire, mais ici, on peut anticiper la redirection.
                    setGameStatus('FINISHED');
                } else {
                    // Sinon, on passe au countdown pour la prochaine question
                    setSubStatus(GAME_SUB_STATUS.NEXT_ROUND_COUNTDOWN);
                }
                break;
            case GAME_SUB_STATUS.NEXT_ROUND_COUNTDOWN:
                // Après le countdown de la prochaine question, on revient à la question
                // L'Admin/l'Action RPC doit déjà avoir incrémenté current_question_index
                setSubStatus(GAME_SUB_STATUS.QUESTION);
                break;
            default:
                setSubStatus(GAME_SUB_STATUS.QUESTION);
        }
    };

    // ------------------------------------
    // RENDU DYNAMIQUE
    // ------------------------------------
    const commonProps = { players, currentSession, fetchGameData, setSubStatus };

    switch (gameStatus) {
        case 'LOADING':
            return <div>Chargement de la partie publique...</div>;
        case 'NO_SESSION':
            // Si pas de session, mais des joueurs sont là, on affiche le PublicLobby (Screen 2)
            if (players.length > 0) {
                 return <PublicLobby {...commonProps} />; // Affiche Lobby Public
            }
            return <PublicWelcomeScreen />; // Sinon, Écran 1

        case 'LOBBY': // Screen 2
            return <PublicLobby {...commonProps} />;
            
        case 'IN_PROGRESS': // Screen 5 (Scoreboard) et 7 (Question)
            // Le rendu dépend du sous-statut
            switch (subStatus) {
                case GAME_SUB_STATUS.QUESTION:
                    // Écran 4 (Image seule) -> Écran 5 (Chrono/Scoreboard)
                    // PublicGame devra implémenter la logique interne de transition entre 4 et 5
                    return (
                        <PublicGame 
                            {...commonProps} 
                            currentQuestionData={currentQuestionData} 
                            startCorrectionFlow={startCorrectionFlow} 
                        />
                    );

                case GAME_SUB_STATUS.PRE_CORRECTION_COUNTDOWN:
                    // Compte à rebours avant la correction (3, 2, 1)
                    return (
                        <CountdownScreen 
                            duration={3} 
                            message="Correction dans..."
                            onCountdownEnd={() => handleNextTransition(GAME_SUB_STATUS.PRE_CORRECTION_COUNTDOWN)}
                        />
                    );

                case GAME_SUB_STATUS.CORRECTION:
                    // Écran 6: Correction
                    // NOTE: Nous devons passer l'objet question complet (non implémenté ici)
                    return (
                        <CorrectionScreen 
                            question={currentQuestionData} // PLACEHOLDER: Doit être l'objet complet
                            session={currentSession}
                            onCorrectionEnd={() => handleNextTransition(GAME_SUB_STATUS.CORRECTION)}
                        />
                    );

                case GAME_SUB_STATUS.SCOREBOARD:
                    // Écran 7: Classement
                    return (
                        <ScoreboardScreen 
                            session={currentSession}
                            onNextTransition={() => handleNextTransition(GAME_SUB_STATUS.SCOREBOARD)}
                        />
                    );
                
                case GAME_SUB_STATUS.NEXT_ROUND_COUNTDOWN:
                    // Compte à rebours avant la prochaine question
                    return (
                        <CountdownScreen 
                            duration={3} 
                            message="Prochaine question dans..."
                            onCountdownEnd={() => handleNextTransition(GAME_SUB_STATUS.NEXT_ROUND_COUNTDOWN)}
                        />
                    );

                default:
                    return <div>Erreur de flux de jeu.</div>;
            }

        case 'FINISHED': // Screen 8
            // L'écran final affiche le classement final
            return <PublicResults {...commonProps} />;

        case 'ERROR':
        default:
            return <div>Erreur de connexion aux données de jeu.</div>;
    }
};

export default PublicScreen;