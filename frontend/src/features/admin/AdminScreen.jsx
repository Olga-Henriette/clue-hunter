
import React, { useState, useEffect } from 'react';
import { supabase } from '../../api/supabaseClient';
import { MAX_PLAYERS } from '../setup/roles';

// Utilité pour mélanger un tableau (utilisé pour l'ordre des questions)
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

    // ------------------------------------
    // I. CHARGEMENT INITIAL DES DONNÉES
    // ------------------------------------
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            
            // 1. Charger la session actuelle
            const { data: sessionData } = await supabase
                .from('game_sessions')
                .select('*')
                .limit(1)
                .order('created_at', { ascending: false });
            setCurrentSession(sessionData?.[0] || null);

            // 2. Charger la liste des joueurs
            const { data: playersData } = await supabase
                .from('players')
                .select('*');
            setPlayers(playersData || []);

            // 3. Charger toutes les questions disponibles
            const { data: questionsData } = await supabase
                .from('questions')
                .select('id, theme_tag, answer_key');
            setAllQuestions(questionsData || []);
            
            setIsLoading(false);
        };
        fetchData();
        
        // Optionnel : s'abonner en temps réel aux joueurs pour l'affichage du Lobby
        // (Déjà fait dans PublicScreen, ici c'est pour l'interface Admin)
    }, []);

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

        // c. La fonction RPC retourne le nouvel ID de session. Nous devons le recharger.
        // Recharger toutes les données pour mettre à jour l'interface Admin
        const { data: newSession } = await supabase
             .from('game_sessions')
             .select('*')
             .eq('id', session_id)
             .single();
        
        setCurrentSession(newSession);
        
        alert("Partie lancée via RPC ! Question 1/5 Démarrée.");
        // Recharger les joueurs pour voir les scores à zéro et le last_session_id mis à jour
        // NOTE: Le RLS sur game_sessions SELECT reste 'true' pour que l'Admin (et le public) puisse lire.
        
    };

    // 2. Passer à la question suivante (ou terminer)
    const handleNextQuestion = async () => {
        if (!currentSession || currentSession.status !== 'IN_PROGRESS') return;

        const nextIndex = currentSession.current_question_index + 1;
        
        if (nextIndex >= currentSession.total_questions) {
            // FIN DE PARTIE
            const { error } = await supabase
                .from('game_sessions')
                .update({
                    status: 'FINISHED',
                    current_question_index: nextIndex
                })
                .eq('id', currentSession.id);
            
            if (!error) alert("Partie terminée ! Affichage des résultats.");
        } else {
            // QUESTION SUIVANTE
            const { error } = await supabase
                .from('game_sessions')
                .update({
                    current_question_index: nextIndex,
                    start_time: new Date().toISOString(), // Démarrer le nouveau chrono
                })
                .eq('id', currentSession.id);
            
            if (!error) alert(`Passage à la question ${nextIndex + 1}/${currentSession.total_questions}.`);
        }
        
        // Recharger les données pour mettre à jour l'affichage
        // La mise à jour en temps réel devrait aussi rafraîchir cela
        // NOTE: Ici, nous avons besoin d'un re-fetch manuel ou d'un abonnement RLS sur 'game_sessions'
    };


    // ------------------------------------
    // III. RENDU (AFFICHAGE ADMIN)
    // ------------------------------------
    
    if (isLoading) return <div>Chargement de l'interface Admin...</div>;

    const currentQuestion = currentSession?.question_order_ids ? allQuestions.find(q => q.id === currentSession.question_order_ids[currentSession.current_question_index]) : null;

    return (
        <div className="admin-screen">
            <h1>Panneau d'Administration du Jeu</h1>
            
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

            {/* 2. Commandes de Démarrage */}
            <section className="controls">
                <h3>Lancement</h3>
                {currentSession?.status === 'LOBBY' || !currentSession ? (
                    <button onClick={handleStartGame} disabled={players.length === 0} className="btn-success">
                        Démarrer la Partie ({players.length} joueurs)
                    </button>
                ) : (
                    <>
                        <button onClick={handleNextQuestion} disabled={currentSession.status === 'FINISHED'} className="btn-warning">
                            {currentSession.current_question_index + 1 < currentSession.total_questions 
                                ? "Question Suivante" 
                                : "Terminer la Partie"}
                        </button>
                        <button 
                            onClick={() => {/* Implémenter la suppression des sessions ici */}} 
                            className="btn-danger"
                            style={{ marginLeft: '10px' }}
                        >
                            Arrêter & Réinitialiser
                        </button>
                    </>
                )}
            </section>

            {/* 3. Aperçu du Lobby */}
            <section className="lobby-preview">
                <h3>Joueurs Actifs ({players.length})</h3>
                <ul>
                    {players.map(p => (
                        <li key={p.id}>
                            {p.role_name} | Score: {p.current_score} | Prêt: {p.is_ready ? 'Oui' : 'Non'}
                        </li>
                    ))}
                </ul>
                <p>Total questions disponibles dans la DB: {allQuestions.length}</p>
            </section>
        </div>
    );
};

export default AdminScreen;