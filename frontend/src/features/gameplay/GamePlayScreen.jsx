import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import useTimer from '../../hooks/useTimer'; 
import { PENALTY_AMOUNT } from '../core/scoreLogic'; 
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// État initial de la partie
const INITIAL_GAME_STATE = {
    currentQuestion: null,
    currentSession: null,
    answerArray: [],
    isAnswerLocked: false, // Vrai si la réponse a été soumise (bonne ou mauvaise)
    penaltyCount: 0,
};

const GamePlayScreen = () => {
    const [gameState, setGameState] = useState(INITIAL_GAME_STATE);
    const [message, setMessage] = useState('');
    const { userId, loading } = useAuth();
    const navigate = useNavigate();

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
            console.log("Profil supprimé, redirection vers le choix de rôle.");
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
                // Créer un tableau vide de la bonne longueur pour la nouvelle question
                const answerLength = currentQuestion ? currentQuestion.answer_key.length : 0;
                
                // Réinitialiser les états pour la nouvelle question
                setMessage('');
                setCursorPosition(0);
                return {
                    currentQuestion,
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

    // LOGIQUE CRITIQUE : PÉNALITÉ INSTANTANÉE (-15)
    const handlePenaltyCheck = useCallback(async (currentAnswerKey) => {
        // La condition est que la réponse complète doit correspondre à la réponse clé
        if (!currentAnswerKey) return;

        const currentAnswerInput = gameState.answerArray.join(''); // Créer la chaîne à partir du tableau
        
        // Si la réponse n'est pas correcte ET que le joueur a rempli toutes les cases
        if (currentAnswerInput.length === currentAnswerKey.length && currentAnswerInput !== currentAnswerKey) {
            
            // 1. Déclencher la pénalité sur le backend (APPEL RPC SÉCURISÉ)
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

            // 2. Mettre à jour l'état local du joueur
            const answerLength = currentAnswerKey.length;
            setGameState(prevState => ({ 
                ...prevState, 
                penaltyCount: prevState.penaltyCount + 1,
                answerArray: Array(answerLength).fill(''), // Effacer le tableau pour rejouer
            }));
            setCursorPosition(0); // Réinitialiser le curseur

            setMessage(`Mauvaise réponse ! Pénalité de -${PENALTY_AMOUNT} points.`);
            setTimeout(() => setMessage(''), 3000); 

        } // Nous n'avons plus besoin de la vérification de longueur, car le tableau est de longueur fixe.
    }, [gameState.answerArray, gameState.currentSession?.id, userId]); 

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

    // LOGIQUE CRITIQUE : VALIDATION (Screen E action)
    const handleValidate = async () => {
        if (!gameState.currentQuestion || gameState.isAnswerLocked || !isRunning) return;

        const currentAnswerKey = gameState.currentQuestion.answer_key;
        const currentAnswerInput = gameState.answerArray.join(''); // Créer la chaîne à partir du tableau
        
        // Vérification : A-t-il rempli la bonne réponse?
        if (currentAnswerInput === currentAnswerKey) {
            stopTimer(); 
            setGameState(prevState => ({ ...prevState, isAnswerLocked: true })); 

            // 1. Déclencher le SCORING sur le backend (APPEL RPC SÉCURISÉ)
            // ... (Le code RPC reste le même)

        } else {
            // S'il clique sur valider sans la bonne réponse
            setMessage("Veuillez entrer la réponse correcte complète pour valider.");
        }
    };
    
    // ------------------------------------
    // III. RENDU DES COMPOSANTS
    // ------------------------------------

    if (loading) return <div>Chargement de l'authentification...</div>;

    if (!userId || gameState.currentSession?.status === 'LOBBY' || gameState.currentSession?.status === 'FINISHED') {
        // Rediriger ou afficher un message si le jeu n'est pas en cours
        return (
            <div className="game-status-message">
                <h2>{gameState.currentSession?.status === 'FINISHED' ? 'Partie Terminée' : 'En Attente du Lancement'}</h2>
                <p>Votre statut est {gameState.currentSession?.status}. Veuillez attendre que l'administrateur démarre ou passe à la prochaine étape.</p>
                <button onClick={() => window.location.href = '/lobby'}>Retour au Lobby</button>
            </div>
        );
    }
    
    if (!gameState.currentQuestion) return <div>Chargement de la question...</div>;

    const currentQuestion = gameState.currentQuestion;
    //const isValidationDisabled = gameState.isAnswerLocked || !isRunning || gameState.answerInput.length !== currentQuestion.answer_key.length;
    //const answerLetters = currentQuestion.answer_key.split('');
    // const availableLetters = currentQuestion.letter_pool.toUpperCase().split(''); // Utiliser le pool de lettres
   
    // 1. Déclarer currentAnswerKey en premier
    const currentAnswerKey = currentQuestion.answer_key;

    // 2. Utiliser currentAnswerKey pour le reste
    const currentAnswerInput = gameState.answerArray.join('');

    // La validation est activée si la réponse est correcte
    const isCorrectAnswer = currentAnswerInput === currentAnswerKey
    const isValidationDisabled = gameState.isAnswerLocked || !isRunning || !isCorrectAnswer; 
    
    const answerLetters = currentAnswerKey.split(''); // Utiliser l'Answer Key pour la structure
    
    // Préparation du Letter Pool pour le rendu sur deux lignes ---
    const allAvailableLetters = currentQuestion.letter_pool.toUpperCase().split('');
    const MAX_LETTERS_PER_LINE = 10;
    
    const firstLineLetters = allAvailableLetters.slice(0, MAX_LETTERS_PER_LINE);
    const secondLineLetters = allAvailableLetters.slice(MAX_LETTERS_PER_LINE, 2 * MAX_LETTERS_PER_LINE);

    return (
        <div className="screen-e-gameplay">
            
            {/* 1. Entête & Chrono */}
            <div className="game-header">
                <h3>Question {gameState.currentSession.current_question_index + 1} / {gameState.currentSession.total_questions}</h3>
                <div className={`timer ${timeRemaining <= 5 ? 'critical' : ''}`}>
                    ⏳ {timeRemaining} secondes restantes
                </div>
            </div>
            
            {/* 2. Indice Image */}
            <div className="clue-images">
                {/* Vérifier si images_url est un tableau avant d'appeler map */}
                {Array.isArray(currentQuestion.images_url) && currentQuestion.images_url.map((url, index) => (
                    // La vérification de l'URL est correcte
                    <img key={index} src={url} alt={`Indice ${index + 1}`} style={{ maxWidth: '100px', margin: '5px' }} />
                ))}
            </div>

            {/* 3. Zone de Réponse (Affichage de la réponse masquée/saisie) */}
            <div className="answer-box">
                {answerLetters.map((_, index) => (
                    <span 
                        key={index} 
                        // AJOUT : Affiche le curseur sur la bonne case (clignotant via CSS)
                        // Le curseur est affiché à l'index où l'utilisateur va taper.
                        className={`answer-slot ${index === cursorPosition ? 'cursor' : ''}`} 
                        // Permet de cliquer sur la case pour déplacer le curseur
                        onClick={() => setCursorPosition(index)}
                    >
                        {gameState.answerArray[index] || '_'} {/* Affiche le caractère du tableau ou '_' */}
                    </span>
                ))}
                {/* Suppression du span 'end-cursor' car le curseur peut aller jusqu'au dernier index du tableau (length-1). */}
                {/* On gère l'avancée du curseur dans handleKeyDown */}
            </div>

            {/* Message de statut/pénalité */}
            {message && <p className={`status-message ${message.includes('Mauvaise') ? 'error' : 'success'}`}>{message}</p>}
                   
            {/* 4. Affichage des lettres disponibles (NON CLICABLE) */}
            <div className="letter-pool-display">
                <p>Lettres disponibles :</p>
                <div className="available-letters-box">
                    {/* Première ligne de lettres */}
                    <div className="letter-line">
                        {firstLineLetters.map((letter, index) => (
                            <span key={`line1-${index}`} className="letter-display-chip">
                                {letter}
                            </span>
                        ))}
                    </div>
                    
                    {/* Deuxième ligne de lettres (si elle existe) */}
                    {secondLineLetters.length > 0 && (
                        <div className="letter-line second-line">
                            {secondLineLetters.map((letter, index) => (
                                <span key={`line2-${index}`} className="letter-display-chip">
                                    {letter}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div> 
            
            {/* 5. Bouton de Validation */}
            <div className="game-actions">
                <button 
                    onClick={handleValidate} 
                    disabled={isValidationDisabled} 
                    className="btn-validate"
                >
                    Valider (Score: {100 - (gameState.penaltyCount * PENALTY_AMOUNT)})
                </button>
                <p>Pénalités subies : **{gameState.penaltyCount}** (-{gameState.penaltyCount * PENALTY_AMOUNT} points)</p>
            </div>

        </div>
    );
};

export default GamePlayScreen;