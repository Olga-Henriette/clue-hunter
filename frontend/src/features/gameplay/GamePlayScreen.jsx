import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import useTimer from '../../hooks/useTimer'; 
import { PENALTY_AMOUNT } from '../core/scoreLogic'; 

// État initial de la partie
const INITIAL_GAME_STATE = {
    currentQuestion: null,
    currentSession: null,
    answerInput: '',
    isAnswerLocked: false, // Vrai si la réponse a été soumise (bonne ou mauvaise)
    penaltyCount: 0,
};

const GamePlayScreen = () => {
    const [gameState, setGameState] = useState(INITIAL_GAME_STATE);
    const [message, setMessage] = useState('');
    const userId = supabase.auth.user()?.id;

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
                // Réinitialiser les états pour la nouvelle question
                setMessage('');
                return {
                    currentQuestion,
                    currentSession,
                    answerInput: '',
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
        
    }, [fetchCurrentQuestion, userId]);

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
    const handleInput = (char) => {
        if (gameState.isAnswerLocked || !isRunning) return;

        const newAnswer = gameState.answerInput + char;
        setGameState(prevState => ({ ...prevState, answerInput: newAnswer }));
    };

    // LOGIQUE CRITIQUE : PÉNALITÉ INSTANTANÉE (-15)
    const handlePenaltyCheck = useCallback(async (currentAnswerKey) => {
        // La condition est que la réponse complète doit correspondre à la réponse clé
        if (!currentAnswerKey) return;

        // Si la réponse n'est pas correcte
        if (gameState.answerInput.length === currentAnswerKey.length && gameState.answerInput !== currentAnswerKey) {
            
            // 1. Déclencher la pénalité sur le backend (APPEL RPC SÉCURISÉ)
            const { error: rpcError } = await supabase.rpc('submit_player_answer', {
                player_uuid: userId,
                session_uuid: gameState.currentSession.id,
                action: 'APPLY_PENALTY', // Enum défini dans la DB
                penalty_count: 1, // On compte 1 pénalité à la fois
            });

            if (rpcError) {
                console.error("Erreur RPC Pénalité:", rpcError);
                setMessage("Erreur de pénalité.");
                return;
            }

            // 2. Mettre à jour l'état local du joueur
            setGameState(prevState => ({ 
                ...prevState, 
                penaltyCount: prevState.penaltyCount + 1,
                answerInput: '', // Effacer la réponse pour rejouer
            }));
            
            setMessage(`Mauvaise réponse ! Pénalité de -${PENALTY_AMOUNT} points.`);
            setTimeout(() => setMessage(''), 3000); // Effacer le message après 3s

        } else if (gameState.answerInput.length > currentAnswerKey.length) {
            // Empêcher de taper au-delà de la longueur
             setGameState(prevState => ({ ...prevState, answerInput: currentAnswerKey }));
        }
    }, [gameState.answerInput, gameState.currentSession?.id, userId]);


    useEffect(() => {
        if (gameState.isAnswerLocked || !gameState.currentQuestion || !isRunning) return;
        
        // Exécuter le check de pénalité chaque fois que l'input change
        handlePenaltyCheck(gameState.currentQuestion.answer_key);
        
    }, [gameState.answerInput, gameState.isAnswerLocked, gameState.currentQuestion, isRunning, handlePenaltyCheck]);


    // LOGIQUE CRITIQUE : VALIDATION (Screen E action)
    const handleValidate = async () => {
        if (!gameState.currentQuestion || gameState.isAnswerLocked || !isRunning) return;

        const currentAnswerKey = gameState.currentQuestion.answer_key;
        
        // Vérification : A-t-il rempli la bonne réponse? (Seule condition pour valider)
        if (gameState.answerInput === currentAnswerKey) {
            stopTimer(); // Arrêter le chronomètre
            setGameState(prevState => ({ ...prevState, isAnswerLocked: true })); // Bloquer l'input

            // 1. Déclencher le SCORING sur le backend (APPEL RPC SÉCURISÉ)
            const { error: rpcError } = await supabase.rpc('submit_player_answer', {
                player_uuid: userId,
                session_uuid: gameState.currentSession.id,
                action: 'SUBMIT_CORRECT', // Enum défini dans la DB
                time_remaining: timeRemaining,
                penalty_count: gameState.penaltyCount, // Envoyer le compte de pénalité pour calcul
            });

            if (rpcError) {
                console.error("Erreur RPC Score:", rpcError);
                setMessage("Erreur de validation du score. Contactez l'admin.");
            } else {
                setMessage("✅ Réponse correcte et score validé ! En attente de la prochaine question.");
            }
        } else {
            // S'il clique sur valider sans la bonne réponse
            setMessage("Veuillez entrer la réponse correcte complète pour valider.");
        }
    };
    
    // ------------------------------------
    // III. RENDU DES COMPOSANTS
    // ------------------------------------

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
    const isValidationDisabled = gameState.isAnswerLocked || !isRunning || gameState.answerInput.length !== currentQuestion.answer_key.length;
    const answerLetters = currentQuestion.answer_key.split('');
    const availableLetters = currentQuestion.letter_pool.toUpperCase().split(''); // Utiliser le pool de lettres

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
                {currentQuestion.images_url.map((url, index) => (
                    // Utiliser le Supabase Storage URL
                    <img key={index} src={url} alt={`Indice ${index + 1}`} style={{ maxWidth: '100px', margin: '5px' }} />
                ))}
            </div>

            {/* 3. Zone de Réponse (Affichage de la réponse masquée/saisie) */}
            <div className="answer-box">
                {answerLetters.map((_, index) => (
                    <span key={index} className="answer-slot">
                        {gameState.answerInput[index] || '_'}
                    </span>
                ))}
            </div>

            {/* Message de statut/pénalité */}
            {message && <p className={`status-message ${message.includes('Mauvaise') ? 'error' : 'success'}`}>{message}</p>}
            
            {/* 4. Clavier personnalisé (Screen E) */}
            <div className="custom-keyboard">
                {availableLetters.map((letter, index) => (
                    <button 
                        key={index} 
                        onClick={() => handleInput(letter)}
                        disabled={gameState.isAnswerLocked || !isRunning || gameState.answerInput.length >= currentQuestion.answer_key.length}
                        className="keyboard-btn"
                    >
                        {letter}
                    </button>
                ))}
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