import React, { useState, useEffect, useCallback } from 'react';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { getRoleImage, getRoleDisplayName } from '../../utils/roleConfig'; 

const ScoreboardScreen = ({ session, onNextTransition }) => {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- LOGIQUE DE CHARGEMENT ET MISE À JOUR EN TEMPS RÉEL ---
    const fetchPlayers = useCallback(async () => {
        if (!session) return;

        // Récupérer tous les joueurs de la session en cours, triés par score décroissant
        const { data: playersData, error } = await supabase
            .from('players')
            .select('id, role_name, current_score')
            .eq('last_session_id', session.id)
            .order('current_score', { ascending: false }); // Classement par score

        if (error) {
            console.error("Erreur lors de la récupération des joueurs pour le classement:", error);
            setLoading(false);
            return;
        }

        setPlayers(playersData || []);
        setLoading(false);
    }, [session]);


    useEffect(() => {
        if (!session) return;
        
        fetchPlayers();

        // Abonnement temps réel à la table 'players' pour les mises à jour de score
        const playerChannel = subscribeToTable('players', (payload) => {
            // Mettre à jour la liste complète chaque fois qu'un score change
            fetchPlayers(); 
        });

        // Déclencher la transition automatique après X secondes (ex: 8 secondes)
        const transitionTimer = setTimeout(() => {
            if (onNextTransition) {
                onNextTransition();
            }
        }, 8000); 

        return () => {
            playerChannel.unsubscribe();
            clearTimeout(transitionTimer);
        };
    }, [session, fetchPlayers, onNextTransition]);


    // --- RENDU ---
    if (loading) return <div className="fullscreen">Chargement du classement...</div>;
    if (!session) return <div className="fullscreen">En attente des données de session...</div>;

    const totalQuestions = session.total_questions;
    const currentQuestionIndex = session.current_question_index;
    const progressPercentage = Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100);
    const winner = players.length > 0 ? players[0] : null;

    return (
        <div className="scoreboard-screen fullscreen">
            
            <div className="game-header">
                <h1>🏆 Classement Actuel 🏆</h1>
            </div>

            {/* Vainqueur / Graphique d'Évolution */}
            <div className="winner-display">
                {winner && (
                    <div className="first-place">
                        <img 
                            src={getRoleImage(winner.role)} 
                            alt={`Logo ${getRoleDisplayName(winner.role)}`} 
                            className="winner-logo"
                        />
                        <h2>Premier : **{getRoleDisplayName(winner.role)}** avec {winner.current_score} points!</h2>
                        <p>Félicitations !</p>
                    </div>
                )}
                {/*  */}
                {/* Ici, on intégrerait un graphique d'évolution si nous en avions un. */}
            </div>

            {/* Tableau du Classement */}
            <div className="ranking-table">
                <table>
                    <thead>
                        <tr>
                            <th>Rang</th>
                            <th>Rôle</th>
                            <th>Score Total</th>
                            <th>Position</th> {/* Ajout de la colonne Position pour le tri */}
                        </tr>
                    </thead>
                    <tbody>
                        {players.map((player, index) => (
                            <tr key={player.id} className={index === 0 ? 'first-place-row' : ''}>
                                <td>**{index + 1}**</td>
                                <td className="player-role-cell">
                                    <img src={getRoleImage(player.role_name)} alt="" style={{ width: '30px', height: '30px', marginRight: '10px', borderRadius: '50%' }} />
                                    {getRoleDisplayName(player.role_name)}
                                </td>
                                <td>{player.current_score}</td>
                                {/* Position (1ère, 2ème, etc.) - Utiliser index + 1 */}
                                <td className="player-rank-position">{index + 1}{index === 0 ? 'er' : 'e'}</td> 
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- GRAPHIC D'ÉVOLUTION (Screen 7) --- */}
            <div className="score-evolution-chart">
                <h3>Évolution des Scores (Question 1 à {currentQuestionIndex + 1})</h3>
                <div className="chart-container">
                    {/* Placeholder pour la courbe d'évolution */}
                    <div className="placeholder-chart">
                        <p>Courbe d'évolution pour chaque joueur. (Implémentation graphique à venir.)</p>                        
                    </div>
                </div>
            </div>
            
            {/* Barre de Progression (i/n en pourcentage) */}
            <div className="progress-bar-section">
                <h3>Progression de la Partie</h3>
                <div className="progress-bar-container">
                    <div 
                        className="progress-bar" 
                        style={{ width: `${progressPercentage}%` }}
                    >
                        {progressPercentage}%
                    </div>
                </div>
                <p>Question **{currentQuestionIndex + 1}** sur **{totalQuestions}**</p>
            </div>
        </div>
    );
};

export default ScoreboardScreen;