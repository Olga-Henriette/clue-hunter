import React, { useEffect, useState } from 'react';
import { getRoleImage, getRoleDisplayName } from '../../utils/roleConfig';
import { GAME_CONSTANTS } from '../../utils/gameConfig'; 
import { MAX_PLAYERS } from '../setup/roles';

const PublicLobby = ({ players, currentSession }) => {
    const maxPlayers = MAX_PLAYERS;
    // Remplir le tableau pour garantir 8 positions pour l'affichage
    const displayPlayers = Array(maxPlayers).fill(null).map((_, index) => players[index] || { 
        id: `empty-${index}`, 
        role_name: 'ATTENTE', 
        is_ready: false,
        displayName: 'En Attente',
        current_score: 0 
    });

    return (
        <div className="public-screen lobby-screen fullscreen">
            
            {/* Header */}
            <div className="lobby-header">
                 <img src={getRoleImage('GAME_LOGO_KEY')} alt="Logo" className="lobby-logo" />
                 <h1>Jeu de Rôle : Attente des Joueurs ({players.length}/{maxPlayers})</h1>
            </div>

            {/* Grille des Profils (2 lignes de 4) */}
            <div className="player-grid">
                {displayPlayers.map((player, index) => (
                    <div 
                        key={player.id} 
                        className={`player-slot ${player.is_ready ? 'ready' : 'waiting'} ${index === 0 ? 'first-player' : ''}`}
                    >
                        {player.is_ready ? (
                            <div className="profile-ready">
                                <img src={getRoleImage(player.role_name)} alt={`Logo ${player.role_name}`} className="player-logo-large" />
                                <span className="player-role-name">{getRoleDisplayName(player.role_name)}</span>
                            </div>
                        ) : (
                             <div className="profile-waiting">
                                 <span className="placeholder-icon">?</span>
                                 <span className="placeholder-text">Place Libre</span>
                             </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Texte d'attente */}
            {players.length < maxPlayers && (
                <p className="waiting-message">
                    En attente de **{maxPlayers - players.length}** joueur(s) pour démarrer.
                </p>
            )}
        </div>
    );
};
export default PublicLobby;