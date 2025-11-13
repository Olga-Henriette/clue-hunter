import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { MAX_PLAYERS } from '../setup/roles';

// Utilité pour mélanger un tableau (utilisé pour l'ordre des questions)
const shuffleArray = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // Utilisation de la syntaxe de décomposition pour échanger les éléments
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

    // ------------------------------------
    // I. CHARGEMENT INITIAL DES DONNÉES (Rendu réutilisable avec useCallback)
    // ------------------------------------
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
    }, []); // fetchData n'a pas de dépendances externes et ne se recrée que si les dépendances changent (ici jamais)

    useEffect(() => {
        fetchData();
    }, [fetchData]); // Dépend de fetchData, mais fetchData est stabilisé par useCallback

    // ------------------------------------
    // II. ACTIONS D'ADMINISTRATION
    // ------------------------------------
    
    // 1. Initialiser/Démarrer la partie
    const handleStartGame = async () => {
        if (allQuestions.length < TOTAL_QUESTIONS_TO_ASK) {
            alert(`Erreur: Seulement ${allQuestions.length} questions disponibles. Ajoutez-en plus.`);
            return;
        }

        if (players.length === 0) {
            alert("Erreur: Aucun joueur n'est inscrit dans le lobby.");
            return;
        }

        // a. Sélectionner aléatoirement 5 questions
        const shuffledQuestions = shuffleArray([...allQuestions]);
        const selectedQuestionIds = shuffledQuestions
            .slice(0, TOTAL_QUESTIONS_TO_ASK)
            .map(q => q.id);

        // Liste des ID des joueurs connectés
        const playerIds = players.map(p => p.id);

        // b. APPEL RPC SÉCURISÉ pour créer la session et lier les joueurs
        const { data: session_id, error: rpcError } = await supabase.rpc('start_new_game', {
            question_ids: selectedQuestionIds,
            total_questions_count: TOTAL_QUESTIONS_TO_ASK,
            current_players_ids: playerIds,
        });

        if (rpcError) {
            console.error("Erreur RPC Lancement:", rpcError);
            alert(`Erreur lors du lancement via RPC: ${rpcError.message}`);
            return;
        }

        // c. Recharger toutes les données pour mettre à jour l'interface Admin
        await fetchData();
        
        alert("Partie lancée via RPC ! Question 1/5 Démarrée.");
    };

    // 2. Passer à la question suivante (ou terminer)
    const handleNextQuestion = async () => {
        if (!currentSession || currentSession.status !== 'IN_PROGRESS') return;

        const nextIndex = currentSession.current_question_index + 1;
        let error = null;
        let message = '';

        if (nextIndex >= currentSession.total_questions) {
            // FIN DE PARTIE
            ({ error } = await supabase
                .from('game_sessions')
                .update({ status: 'FINISHED', current_question_index: nextIndex })
                .eq('id', currentSession.id));
            message = "Partie terminée ! Affichage des résultats.";

        } else {
            // QUESTION SUIVANTE
            ({ error } = await supabase
                .from('game_sessions')
                .update({ 
                    current_question_index: nextIndex,
                    start_time: new Date().toISOString(), // Démarrer le nouveau chrono
                })
                .eq('id', currentSession.id));
            message = `Passage à la question ${nextIndex + 1}/${currentSession.total_questions}.`;
        }
        
        if (!error) {
            await fetchData(); // Forcer le rechargement
            alert(message);
        } else {
            console.error("Erreur progression:", error);
            alert(`Erreur lors de la progression: ${error.message}`);
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

        alert("Jeu et profils joueurs réinitialisés. Le lobby est vide.");
        await fetchData(); // <Forcer le rechargement
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
                            onClick={handleResetGame} // Utilise la fonction RPC de réinitialisation
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