import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { MAX_PLAYERS } from '../setup/roles';

// Utilité pour mélanger un tableau
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

const TOTAL_QUESTIONS_TO_ASK = 5; // 5 questions par partie

const AdminScreen = () => {
    const [players, setPlayers] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);
    const [allQuestions, setAllQuestions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fonction de chargement de données (stabilisée par useCallback)
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        
        // 1. Charger la session actuelle
        const { data: sessionData, error: sessionError } = await supabase
            .from('game_sessions')
            .select('*')
            .limit(1)
            .order('created_at', { ascending: false });

        if (sessionError) console.error("Error fetching session:", sessionError);

        const currentSessionData = sessionData?.[0] || null;
        setCurrentSession(currentSessionData);

        // 2. Charger la liste des joueurs
        const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('*');
        
        if (playersError) console.error("Error fetching players:", playersError);
        setPlayers(playersData || []);

        // 3. Charger toutes les questions disponibles
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('id, theme_tag, answer_key');
        
        if (questionsError) console.error("Error fetching questions:", questionsError);
        setAllQuestions(questionsData || []);
        
        setIsLoading(false);
    }, []);

    useEffect(() => {
        let playersChannel;
        let gameSessionChannel;
        
        // 1. Abonnement aux joueurs (pour la liste du lobby dans l'admin)
        playersChannel = subscribeToTable('players', (payload) => {
            console.log('Admin: Realtime player update');
            fetchData();
        });

        // 2. Abonnement à la session (pour le statut et la question actuelle)
        gameSessionChannel = subscribeToTable('game_sessions', (payload) => {
            console.log('Admin: Realtime session update');
            fetchData();
        });

        fetchData(); // Premier chargement

        // Nettoyage
        return () => {
            if (playersChannel) playersChannel.unsubscribe();
            if (gameSessionChannel) gameSessionChannel.unsubscribe();
        };
    }, [fetchData]);

    // ------------------------------------
    // II. ACTIONS D'ADMINISTRATION
    // ------------------------------------
    
    // 1. Initialiser/Démarrer la partie
    const handleStartGame = async () => {
        // VÉRIFICATION D'ÉTAT SIMPLE
        if (currentSession && currentSession.status === 'IN_PROGRESS') {
             alert("La partie est déjà en cours.");
             return;
        }

        if (allQuestions.length < TOTAL_QUESTIONS_TO_ASK) {
            alert(`Erreur: Seulement ${allQuestions.length} questions disponibles. Ajoutez-en plus.`);
            return;
        }

        if (players.length === 0) {
            alert("Erreur: Aucun joueur n'est inscrit dans le lobby.");
            return;
        }
        
        const shuffledQuestions = shuffleArray([...allQuestions]);
        const selectedQuestionIds = shuffledQuestions
            .slice(0, TOTAL_QUESTIONS_TO_ASK)
            .map(q => q.id);
        const playerIds = players.map(p => p.id);

        const { error: rpcError } = await supabase.rpc('start_new_game', {
            question_ids: selectedQuestionIds,
            total_questions_count: TOTAL_QUESTIONS_TO_ASK,
            current_players_ids: playerIds,
        });

        if (rpcError) {
            console.error("Erreur RPC Lancement:", rpcError);
            alert(`Erreur lors du lancement via RPC: ${rpcError.message}`);
            return;
        }
        
        // CRITIQUE : Recharger les données pour mettre à jour l'interface
        await fetchData(); 
        alert("Partie lancée via RPC ! Question 1/5 Démarrée.");
    };

    // 2. Passer à la question suivante (ou terminer)
    const handleNextQuestion = async () => {
        if (!currentSession || currentSession.status !== 'IN_PROGRESS') return;

        const nextIndex = currentSession.current_question_index + 1;
        const totalQuestions = currentSession.total_questions;
        let message = '';

        if (nextIndex >= totalQuestions) {
            // FIN DE PARTIE : Le RPC gère déjà le passage au statut 'FINISHED'
            message = "Partie terminée ! Affichage des résultats.";
        } else {
            // QUESTION SUIVANTE
            message = `Passage à la question ${nextIndex + 1}/${totalQuestions}.`;
        }

        // Appel du RPC sécurisé pour avancer la session
        const { error: rpcError } = await supabase.rpc('advance_to_next_question', {
            session_id: currentSession.id,
        });
        
        if (!rpcError) {
            // CRITIQUE : Recharger les données pour mettre à jour l'interface
            await fetchData(); 
            alert(message);
        } else {
            console.error("Erreur RPC progression:", rpcError);
            alert(`Erreur lors de la progression (RPC): ${rpcError.message}. Vérifiez les logs Supabase.`);
        }
    };

    // 3. Arrêter et Réinitialiser le jeu
    const handleResetGame = async () => {
        if (!confirm("Êtes-vous sûr de vouloir ARRÊTER la partie et RÉINITIALISER TOUS les profils joueurs ?")) return;

        const { error: rpcError } = await supabase.rpc('reset_game_data');
        
        if (rpcError) {
            console.error("Erreur RPC Réinitialisation:", rpcError);
            alert(`Erreur de réinitialisation: ${rpcError.message}`);
            return;
        }

        // Si l'appel RPC réussit (le serveur s'est occupé de tout)
        alert("Jeu et profils joueurs réinitialisés. Le lobby est vide.");
        
        // Recharger les données pour mettre à jour l'Admin
        await fetchData(); 
        
        // Optionnel : s'assurer que la session est bien effacée de l'état local
        setCurrentSession(null); 
    };


    // ------------------------------------
    // III. RENDU (AFFICHAGE ADMIN)
    // ------------------------------------
    
    if (isLoading) return <div>Chargement de l'interface Admin...</div>;

    const currentQuestion = currentSession?.question_order_ids 
        ? allQuestions.find(q => q.id === currentSession.question_order_ids[currentSession.current_question_index]) 
        : null;

    return (
        <div className="admin-screen">
            <h1>Panneau d'Administration du Jeu</h1>
            
            <hr/>
            {/* 1. État de la Session */}
            <section className="session-status">
                <h2>Statut Actuel: **{currentSession?.status || 'Aucune Session'}**</h2>
                {currentSession && (
                    <p>Question: {currentSession.current_question_index + 1} / {currentSession.total_questions}</p>
                )}
                {currentQuestion && (
                    <p>Réponse attendue: **{currentQuestion.answer_key}**</p>
                )}
            </section>

            <hr/>
            {/* 2. Commandes de Démarrage */}
            <section className="controls">
                <h3>Lancement</h3>
                {currentSession?.status === 'LOBBY' || !currentSession || currentSession?.status === 'FINISHED' ? (
                    <button onClick={handleStartGame} disabled={players.length === 0 || currentSession?.status === 'IN_PROGRESS'} className="btn-success">
                        Démarrer la Partie ({players.length} joueurs)
                    </button>
                ) : (
                    <>
                        <button onClick={handleNextQuestion} className="btn-warning">
                            {currentSession.current_question_index + 1 < currentSession.total_questions 
                                ? "Question Suivante" 
                                : "Terminer la Partie"}
                        </button>
                        <button 
                            onClick={handleResetGame}
                            className="btn-danger"
                            style={{ marginLeft: '10px' }}
                        >
                            Arrêter & Réinitialiser
                        </button>
                    </>
                )}
            </section>

            <hr/>
            {/* 3. Aperçu du Lobby */}
            <section className="lobby-preview">
                <h3>Joueurs Actifs ({players.length})</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {players.map(p => (
                        <li key={p.id} style={{ marginBottom: '5px' }}>
                            **{p.role_name}** | Score: {p.current_score} | Prêt: {p.is_ready ? 'Oui' : 'Non'}
                        </li>
                    ))}
                </ul>
                <p>Total questions disponibles dans la DB: **{allQuestions.length}**</p>
            </section>
        </div>
    );
};

export default AdminScreen;