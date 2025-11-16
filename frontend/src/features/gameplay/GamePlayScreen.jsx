import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import useTimer from '../../hooks/useTimer'; 
import { PENALTY_AMOUNT } from '../core/scoreLogic'; 
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getRoleImage } from '../../utils/roleConfig';
import WHAT_LOGO from '../../assets/what.png';

import CountdownScreen from '../../views/shared/CountdownScreen';
import CorrectionScreen from '../../views/shared/CorrectionScreen';
import ScoreboardScreen from '../../views/shared/ScoreboardScreen';

// État initial de la partie
const INITIAL_GAME_STATE = {
    currentQuestion: null,
    currentSession: null,
    answerArray: [],
    isAnswerLocked: false, // Vrai si la réponse a été soumise (bonne ou mauvaise)
    penaltyCount: 0,
};


const shuffleArray = (array) => {
    // Crée une copie pour ne pas modifier l'original
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap
    }
    return shuffled;
};

// Fonction utilitaire pour sélectionner X éléments aléatoires (sans remplacement)
const selectRandom = (array, count) => {
    if (array.length <= count) return shuffleArray(array);
    
    // Mélange le tableau et prend les 'count' premiers éléments
    return shuffleArray(array).slice(0, count);
};

const GamePlayScreen = () => {
    const [gameState, setGameState] = useState(INITIAL_GAME_STATE);
    const [message, setMessage] = useState('');
    const { userId, loading } = useAuth();
    const navigate = useNavigate();

    const [playerScore, setPlayerScore] = useState(0);
    const [playerRole, setPlayerRole] = useState(null);

    const [isImageVisible, setIsImageVisible] = useState(true);
    const [transitionStatus, setTransitionStatus] = useState(null);

    const [currentView, setCurrentView] = useState('GAME_PLAY');

    // Suivre la position du curseur pour l'édition.
    const [cursorPosition, setCursorPosition] = useState(0);

    // Utilisation du chronomètre basé sur le temps de début de la session
    const { timeRemaining, isRunning, stopTimer, resetTimer } = useTimer(
        gameState.currentSession?.start_time
    );

    // ------------------------------------
    // I. LOGIQUE DE CHARGEMENT ET TEMPS RÉEL
    // ------------------------------------

    const fetchCurrentQuestion = useCallback(async (session) => {
        if (!session || session.status !== 'IN_PROGRESS' || session.current_question_index >= session.question_order_ids.length) {
            // Fin de partie ou session non valide
            return null;
        }

        const currentQuestionId = session.question_order_ids[session.current_question_index];

        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .eq('id', currentQuestionId)
            .single();

        if (error) {
            console.error("Error fetching current question:", error);
            return null;
        }
        
        return data;
    }, []);

    const fetchGameUpdates = useCallback(async () => {
        if (!userId) return;

        // Vérifier si le joueur existe (si l'Admin l'a réinitialisé)
        const { data: playerProfile, error: playerError } = await supabase
            .from('players')
            .select('id')
            .eq('id', userId)
            .single();

        if (playerError || !playerProfile) {
            // Le profil a été supprimé par l'Admin -> Redirection forcée
            navigate('/select-role'); // <-- Naviguer directement vers la sélection de rôle
            return;
        }

        // 1. Récupérer la session active
        const { data: sessionData } = await supabase
            .from('game_sessions')
            .select('*')
            .limit(1)
            .order('created_at', { ascending: false });
            
        const currentSession = sessionData?.[0] || null;

        // 2. Si la session existe, charger la question
        const currentQuestion = await fetchCurrentQuestion(currentSession);

        // 3. Réinitialiser ou mettre à jour l'état si la question a changé
        setGameState(prevState => {
            const isNewQuestion = prevState.currentQuestion?.id !== currentQuestion?.id;
            
            if (isNewQuestion) {

                // === LOGIQUE D'ALÉATOIRE ===
                let selectedImages = [];
                let shuffledLetterPool = [];

                if (currentQuestion) {
                    // 1. Sélectionner EXACTEMENT 3 images aléatoirement
                    // Supposons que currentQuestion.images_url est un tableau d'URLs
                    selectedImages = selectRandom(currentQuestion.images_url || [], 3); 
                    
                    // 2. Mélanger le pool de lettres
                    shuffledLetterPool = shuffleArray(currentQuestion.letter_pool.toUpperCase().split(''));
                    
                    // Mettre à jour la question avec les données aléatoires pour le rendu
                    currentQuestion.images_url_display = selectedImages;
                    currentQuestion.letter_pool_display = shuffledLetterPool;
                }

                // Créer un tableau vide de la bonne longueur pour la nouvelle question
                const answerLength = currentQuestion ? currentQuestion.answer_key.length : 0;
                
                // Réinitialiser les états pour la nouvelle question
                setMessage('');
                setCursorPosition(0);
                return {
                    currentQuestion, // Contient maintenant images_url_display et letter_pool_display
                    currentSession,
                    answerArray: Array(answerLength).fill(''), 
                    isAnswerLocked: false,
                    penaltyCount: 0,
                };
            }
            // Mettre à jour seulement la session si la question est la même
            return {
                ...prevState,
                currentSession,
            };
        });
        
    }, [fetchCurrentQuestion, userId, navigate]);

    useEffect(() => {
        fetchGameUpdates();

        // Abonnement temps réel à la session (pour les transitions Admin)
        const sessionChannel = subscribeToTable('game_sessions', (payload) => {
            console.log('Game session updated via Admin.');
            fetchGameUpdates();
        });

        return () => {
            sessionChannel.unsubscribe();
        };
    }, [fetchGameUpdates]);

    // ------------------------------------
    // II. LOGIQUE DE JEU (PÉNALITÉ & VALIDATION)
    // ------------------------------------

    // Gère la saisie utilisateur (Screen E)
    /*
    const handleInput = (char) => {
        if (gameState.isAnswerLocked || !isRunning) return;

        const newAnswer = gameState.answerInput + char;
        setGameState(prevState => ({ ...prevState, answerInput: newAnswer }));
    };
    */

    // PÉNALITÉ INSTANTANÉE (-15)
    const handlePenaltyCheck = useCallback(async (currentAnswerKey) => {
        // La condition est que la réponse complète doit correspondre à la réponse clé
        if (!currentAnswerKey) return;

        const currentAnswerInput = gameState.answerArray.join(''); // Créer la chaîne à partir du tableau
        
        // Si la réponse n'est pas correcte ET que le joueur a rempli toutes les cases
        if (currentAnswerInput.length === currentAnswerKey.length && currentAnswerInput !== currentAnswerKey) {
            
            // 1. Déclencher la pénalité sur le backend (APPEL RPC SÉCURISÉ)
            /* 
            const { error: rpcError } = await supabase.rpc('submit_player_answer', {
                player_uuid: userId,
                session_uuid: gameState.currentSession.id,
                action: 'APPLY_PENALTY',
                penalty_count: 1, 
            });

            if (rpcError) {
                console.error("Erreur RPC Pénalité:", rpcError);
                setMessage("Erreur de pénalité.");
                return;
            }
            */ 

            // 2. Mettre à jour l'état local du joueur
            const answerLength = currentAnswerKey.length;
            setGameState(prevState => ({ 
                ...prevState, 
                penaltyCount: prevState.penaltyCount + 1,
                answerArray: Array(answerLength).fill(''), // Effacer le tableau pour rejouer
            }));
            setCursorPosition(0); // Réinitialiser le curseur

            setMessage(`-${PENALTY_AMOUNT}`);
            setTimeout(() => setMessage(''), 3000); 

        } // Nous n'avons plus besoin de la vérification de longueur, car le tableau est de longueur fixe.
    }, [gameState.answerArray]); 

    useEffect(() => {
        if (gameState.isAnswerLocked || !gameState.currentQuestion || !isRunning) return;
        
        // Exécuter le check de pénalité chaque fois que l'input change
        handlePenaltyCheck(gameState.currentQuestion.answer_key);
        
    }, [gameState.answerArray, gameState.isAnswerLocked, gameState.currentQuestion, isRunning, handlePenaltyCheck]); 


    // Gère l'entrée clavier (pour la saisie, la suppression et le curseur)
    const handleKeyDown = useCallback((event) => {
        if (gameState.isAnswerLocked || !isRunning || !gameState.currentQuestion) return;

        const currentAnswerKeyLength = gameState.currentQuestion.answer_key.length;
        const key = event.key.toUpperCase();
        const currentAnswerArray = [...gameState.answerArray]; 

        // Déterminer la première case vide (pour la saisie) et la dernière case remplie (pour la suppression)
        const firstEmptyIndex = currentAnswerArray.findIndex(char => char === '');
        const nextInsertionIndex = firstEmptyIndex === -1 ? currentAnswerKeyLength : firstEmptyIndex;

        // ----------------------------------------------------
        // 1. GESTION DE L'INSERTION (Lettre/Chiffre)
        // ----------------------------------------------------
        const inputChar = event.key.length === 1 ? event.key.toUpperCase() : null;
        const isAllowedChar = inputChar && /^[A-Z0-9ÈÉÊÄËÏÖÜÀÁÂÃÇÑÕÚÛÝ]$/.test(inputChar);

        if (isAllowedChar) {
            event.preventDefault();

            // Si on insère à la prochaine case disponible (nextInsertionIndex)
            if (nextInsertionIndex < currentAnswerKeyLength) {
                currentAnswerArray[nextInsertionIndex] = key;

                setGameState(prevState => ({ ...prevState, answerArray: currentAnswerArray }));

                // Déplacer le curseur à la nouvelle première case vide
                setCursorPosition(nextInsertionIndex + 1); 
            }
        } 
 

        // ----------------------------------------------------
        // 2. GESTION DE LA SUPPRESSION (Backspace/Delete)
        // ----------------------------------------------------
        else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault(); 

            let indexToClear = -1;

            // CAS 1: Suppression ciblée (mode édition) : Supprime à la position actuelle du curseur (cliqué ou déplacé)
            // On vérifie si la position du curseur est DANS la grille et qu'il y a quelque chose à effacer.
            if (cursorPosition < currentAnswerKeyLength && currentAnswerArray[cursorPosition] !== '') {
                indexToClear = cursorPosition;
            } else {
                // CAS 2: Suppression séquentielle (mode saisie rapide) : Cherche la dernière case remplie avant la position du curseur
                // Pour une suppression de droite à gauche cohérente
                // Parcourir de l'index du curseur vers la gauche
                for (let i = cursorPosition - 1; i >= 0; i--) {
                    if (currentAnswerArray[i] !== '') {
                        indexToClear = i;
                        break;
                    }
                }
            }
            
            if (indexToClear !== -1) {
                currentAnswerArray[indexToClear] = ''; // Supprimer la lettre
                setGameState(prevState => ({ ...prevState, answerArray: currentAnswerArray }));
                
                // Mettre le curseur sur la case nouvellement vide pour la prochaine saisie/suppression
                setCursorPosition(indexToClear); 
            }
        }
 
        // ----------------------------------------------------
        // 3. GESTION DES FLÈCHES (Édition manuelle)
        // ----------------------------------------------------
        else if (event.key === 'ArrowLeft' && cursorPosition > 0) {
            event.preventDefault(); 
            setCursorPosition(prev => prev - 1); 
        } 
        else if (event.key === 'ArrowRight' && cursorPosition < currentAnswerKeyLength) {
            event.preventDefault(); 
            setCursorPosition(prev => prev + 1); 
        }
    }, [gameState.isAnswerLocked, isRunning, gameState.currentQuestion, gameState.answerArray, cursorPosition]);

    // Attacher/Détacher l'écouteur d'événement au document
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]); 

    /*
    // Réinitialiser le curseur lorsque l'input est vidé par la pénalité
    useEffect(() => {
        if (gameState.answerInput === '') {
            setCursorPosition(0);
        }
    }, [gameState.answerInput]);
    */
   // Positionner le curseur automatiquement sur la première case vide
    useEffect(() => {
        if (!gameState.currentQuestion) return;

        // 1. Trouver le premier index vide
        const firstEmptyIndex = gameState.answerArray.findIndex(char => char === '');
        
        // 2. Déterminer la prochaine position d'insertion
        // Si aucune case n'est vide (firstEmptyIndex === -1), le curseur va à la fin (longueur totale).
        // Sinon, il va à la première case vide.
        const nextPosition = firstEmptyIndex === -1 
            ? gameState.currentQuestion.answer_key.length 
            : firstEmptyIndex;
        
        // 3. Mettre à jour la position du curseur si elle est différente de l'actuelle
        if (cursorPosition !== nextPosition) {
            setCursorPosition(nextPosition);
        }
    }, [gameState.answerArray, gameState.currentQuestion, cursorPosition]); // Dépendance à cursorPosition pour éviter la boucle infinie

    
    // LOGIQUE CRITIQUE : CHRONO, AFFICHAGE D'IMAGE ET TRANSITION
    useEffect(() => {
        // 1. Définir une limite de temps sûre (60s par défaut si non défini)
        const timeLimit = gameState.currentSession?.time_limit ?? 30;
        
        if (!gameState.currentSession) return;
        
        // Si la session est passée à 'FINISHED' (par le serveur), on déclenche la vue finale
        if (gameState.currentSession.status === 'FINISHED') {
            setCurrentView('FINAL_RESULT');
            stopTimer();
            return;
        }
        
        // Si le jeu est en cours et que le chrono est à zéro, on passe à la correction
        if (isRunning && timeRemaining === 0) {
            stopTimer(); 
            setGameState(prevState => ({ ...prevState, isAnswerLocked: true })); 
            setTransitionStatus('PREPARING_CORRECTION'); 
            return;
        }

        // --- LOGIQUE DU MASQUE ---
        // L'image est cachée si 15 secondes se sont écoulées
        // Temps écoulé = timeLimit - timeRemaining
        const elapsedTime = timeLimit - timeRemaining; 
        
        if (isRunning) {
            if (elapsedTime >= 15) {
                // Cacher l'image après 15s écoulées
                setIsImageVisible(false);
            } else {
                // L'image est visible pendant les 15 premières secondes
                setIsImageVisible(true);
            }
        }
        // Si isRunning est false (par validation), on ne change plus l'état du masque.
        
    }, [timeRemaining, isRunning, gameState.currentSession, stopTimer]);
        
    // LOGIQUE DE TRANSITION : Attente de 3 secondes avant la vue de Correction
    useEffect(() => {
        // Déclenché par la validation réussie ou la fin du chrono
        if (transitionStatus === 'WAITING_PLAYERS' || transitionStatus === 'PREPARING_CORRECTION') {
            
            // Logique d'attente de 3 secondes
            const timer = setTimeout(() => {
                // Après l'attente, on passe au compte à rebours pour la correction
                setCurrentView('CORRECTION_COUNTDOWN'); 
                // Réinitialiser le statut de transition
                setTransitionStatus(null);
                
            }, 3000); 

            return () => clearTimeout(timer);
        }
    }, [transitionStatus]);


    // VALIDATION (Screen E action)
    const handleValidate = async () => {
        if (!gameState.currentQuestion || gameState.isAnswerLocked || !isRunning) return;

        const currentAnswerKey = gameState.currentQuestion.answer_key;
        const currentAnswerInput = gameState.answerArray.join(''); // Créer la chaîne à partir du tableau
        
        // Vérification : A-t-il rempli la bonne réponse?
        if (currentAnswerInput === currentAnswerKey) {
            stopTimer(); 
            setGameState(prevState => ({ ...prevState, isAnswerLocked: true })); 

            // 1. Déclencher le SCORING sur le backend (APPEL RPC SÉCURISÉ)
            const { error: rpcError } = await supabase.rpc('submit_player_answer', {
                player_uuid: userId,
                session_uuid: gameState.currentSession.id,
                action: 'SUBMIT_ANSWER', // Action pour soumettre la réponse finale
                penalty_count: gameState.penaltyCount, // Envoyer le nombre total de pénalités subies
                time_remaining: timeRemaining,
            });

            if (rpcError) {
                console.error("Erreur RPC de soumission de réponse:", rpcError);
                setMessage("Erreur lors de la soumission finale.");
                // Optionnel : Réactiver l'input si l'erreur est critique
                // setGameState(prevState => ({ ...prevState, isAnswerLocked: false })); 
                return;
            }
            
            // Afficher le message de succès et le score final
            const finalScore = 100 - (gameState.penaltyCount * PENALTY_AMOUNT);
            
            setMessage(`Réponse correcte ! Score final pour cette question: ${finalScore} points.`);
            // Le message reste affiché jusqu'à la prochaine question

            // Afficher la notification de bonus
            let bonusMessage = '';
            if ((gameState.currentSession.time_limit - timeRemaining) <= 20) {
                bonusMessage = " (+ Bonus de Rapidité)";
            }

            setMessage(`Bravo! Réponse correcte ! Score: ${finalScore} points${bonusMessage}.`);
            
            // Lancer l'état d'attente après validation
            setTransitionStatus('WAITING_PLAYERS');

        } else {
            // S'il clique sur valider sans la bonne réponse
            setMessage("Veuillez entrer la réponse correcte complète pour valider.");
        }
    };
    
    // ------------------------------------
    // III. RENDU DES COMPOSANTS
    // ------------------------------------

    // Récupération du score et du rôle pour l'affichage
    useEffect(() => {
        if (!userId) return;

        const fetchPlayerProfile = async () => {
            const { data, error } = await supabase
                .from('players')
                .select('current_score, role_name') // Récupérer le score et le rôle
                .eq('id', userId)
                .single();

            if (data) {
                setPlayerScore(data.current_score);
                setPlayerRole(data.role_name);
            }
            if (error) {
                console.error("Error fetching player profile:", error);
            }
        };

        // Écouter les changements de score en temps réel
        const playerChannel = subscribeToTable('players', (payload) => {
            // Mettre à jour si l'événement concerne l'utilisateur actuel
            if (payload.new.id === userId) {
                setPlayerScore(payload.new.current_score);
                setPlayerRole(payload.new.role_name);
            }
        });

        fetchPlayerProfile();

        return () => {
            playerChannel.unsubscribe();
        };
    }, [userId]);

    // ... (votre code juste avant la ligne 407 'if (loading) return...')

    if (loading || !userId) return <div>Chargement...</div>;

    // --- VUES DES TRANSITIONS ---

    switch (currentView) {
        
        case 'CORRECTION_COUNTDOWN':
            return (
                <CountdownScreen 
                    initialCount={5} // Compte à rebours de 5 secondes avant la correction
                    onCountdownEnd={() => setCurrentView('CORRECTION')} 
                    message="Préparation de la Correction..."
                />
            );
            
        case 'CORRECTION':
            return (
                <CorrectionScreen 
                    question={gameState.currentQuestion} 
                    session={gameState.currentSession} 
                    onCorrectionEnd={() => setCurrentView('SCOREBOARD')} // Passe au classement après l'animation
                />
            );
            
        case 'SCOREBOARD':
            // Vérifier si c'est la dernière question (i=n)
            const isFinalQuestion = gameState.currentSession.current_question_index + 1 >= gameState.currentSession.total_questions;
            
            return (
                <ScoreboardScreen 
                    session={gameState.currentSession} 
                    onNextTransition={() => {
                        if (isFinalQuestion) {
                            setCurrentView('FINAL_RESULT'); // Passer au résultat final
                        } else {
                            setCurrentView('NEXT_QUESTION_COUNTDOWN'); // Préparer la question suivante
                        }
                    }} 
                />
            );
            
        case 'NEXT_QUESTION_COUNTDOWN':
            // Compte à rebours avant le début du jeu (3, 2, 1, GO!)
            // Après le compte à rebours, on retourne au GAME_PLAY et on met à jour la question (via fetchGameUpdates)
            return (
                <CountdownScreen 
                    initialCount={3} 
                    onCountdownEnd={() => {
                        setCurrentView('GAME_PLAY');
                        // Forcer la mise à jour pour charger la nouvelle question/session si l'Admin a déjà avancé
                        fetchGameUpdates(); 
                    }} 
                    message="Prochaine Question dans..."
                />
            );

        case 'FINAL_RESULT':
            // TODO: Créer le composant FinalResultScreen (Screen F)
            return (
                <div className="fullscreen final-result-screen">
                    <h1>🏆 RÉSULTATS FINAUX 🏆</h1>
                    <p>Le jeu est terminé. Affichage des résultats finaux (Screen F) ici.</p>
                </div>
            );


        case 'GAME_PLAY':
        default:
            // Rendu du jeu normal (votre code JSX actuel de GamePlayScreen)
            
            if (!gameState.currentQuestion || gameState.currentSession?.status === 'LOBBY') {
                 // Si la session est en LOBBY ou la question n'est pas chargée, afficher un message d'attente
                 return (
                    <div className="game-status-message fullscreen">
                        <h2>En Attente du Lancement</h2>
                        <p>Veuillez attendre que l'administrateur démarre la partie.</p>
                        <button onClick={() => navigate('/lobby')}>Retour au Lobby</button>
                    </div>
                );
            }
            
            // --- DÉBUT DU RENDU GAME_PLAY (votre JSX actuel) ---
            
            // ... (Réutiliser toutes les variables de calcul comme isCorrectAnswer, answerLetters, etc.)
            const currentQuestion = gameState.currentQuestion;
            const currentAnswerKey = currentQuestion.answer_key;
            const currentAnswerInput = gameState.answerArray.join('');
            const isCorrectAnswer = currentAnswerInput === currentAnswerKey
            const isValidationDisabled = gameState.isAnswerLocked || !isRunning || !isCorrectAnswer; 
            const answerLetters = currentAnswerKey.split(''); 
            const isWaitingAfterValidation = transitionStatus === 'WAITING_PLAYERS' && gameState.isAnswerLocked;


            return (
                <div className="screen-e-gameplay fullscreen">
                    
                    {/* Boîte de notification qui reste si le joueur a validé */}
                    {isWaitingAfterValidation && (
                        <div className="notification-box-locked">
                            <p className="status-notification success" style={{position: 'static', transform: 'none', animation: 'none'}}>
                                Réponse validée. Attente des autres joueurs...
                            </p>
                        </div>
                    )}

                    {/* Notification qui dure 3s (pour la pénalité instantanée) */}
                    {message && message.includes('-') && (
                        // Utiliser la notification-box-locked pour la pénalité est visuellement plus fort
                        <div className="notification-box-locked penalty-fade">
                            <p className={`status-notification error`} style={{position: 'static', transform: 'none', animation: 'none'}}>{message} points</p>
                        </div>
                    )}


                    {/* 1. Entête & Chrono */}
                    <div className="game-header">
                        <div className="player-info">
                            {playerRole && (
                                <img 
                                    src={getRoleImage(playerRole)} 
                                    alt={`Logo ${playerRole}`} 
                                    className="player-logo-small"
                                />
                            )}
                            <span className="player-score">Score: {playerScore}</span>
                        </div>

                        {/* Chrono en haut au milieu */}
                        <div className={`timer ${timeRemaining <= 5 ? 'critical' : ''}`}>
                            {timeRemaining} 
                        </div>

                        {/* i/n en haut à droite */}
                        <h3>Question {gameState.currentSession.current_question_index + 1} / {gameState.currentSession.total_questions}</h3>
                    </div>
                    
                    {/* 2. Indice Image */}
                    <div className="clue-images">
                        {/* Utiliser images_url_display (toujours 3 éléments) */}
                        {Array.isArray(currentQuestion.images_url_display) && currentQuestion.images_url_display.map((url, index) => (
                            <React.Fragment key={index}>
                                {isImageVisible ? (
                                    // Affiche l'image réelle si visible
                                    <img 
                                        src={url} 
                                        alt={`Indice ${index + 1}`} 
                                        className="clue-image-visible"
                                    />
                                ) : (
                                    // Affiche le masque pour chaque emplacement si masqué
                                    <div className="clue-image-masked">
                                        <img src={WHAT_LOGO} alt="Jeu Masqué" className="game-logo-medium masked" /> 
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* 3. Zone de Réponse (Affichage de la réponse masquée/saisie) */}
                    <div className="answer-box">
                        {answerLetters.map((_, index) => (
                            <span 
                                key={index} 
                                // Désactiver l'édition si le joueur a déjà validé
                                onClick={() => !gameState.isAnswerLocked && setCursorPosition(index)}
                                className={`answer-slot ${index === cursorPosition ? 'cursor' : ''} ${gameState.isAnswerLocked ? 'locked' : ''}`} 
                            >
                                {gameState.answerArray[index] || '_'}
                            </span>
                        ))}
                    </div>

                    {/* 4. Affichage des lettres disponibles (Letter Pool) */}
                    <div className="letter-pool-display single-line">
                        <div className="available-letters-box">
                            <div className="letter-line">
                                {/* Utiliser le tableau aléatoire stocké */}
                                {currentQuestion.letter_pool_display.map((letter, index) => (
                                    <span key={`letter-${index}`} className="letter-display-chip">
                                        {letter}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    {/* 5. Bouton de Validation (Bas Droite) */}
                    <div className="game-actions">
                        <button 
                            onClick={handleValidate} 
                            disabled={isValidationDisabled || isWaitingAfterValidation} 
                            className="btn-validate"
                        >
                            {isCorrectAnswer ? 'VALIDER LA RÉPONSE' : 'SAISIR LA RÉPONSE COMPLÈTE'}
                        </button>
                    </div>
                    
                </div>
            );
    }
};

export default GamePlayScreen;