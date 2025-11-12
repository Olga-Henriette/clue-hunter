import React from 'react';
import { MAX_PLAYERS } from '../setup/roles';

const PublicLobby = ({ players }) => {
    const readyPlayers = players.filter(p => p.is_ready);
    
    return (
        <div className="public-screen public-lobby">
            <h2>Partie en Attente...</h2>
            
            {/* Affichage de l'état des 8 rôles (Screen 2) */}
            <div className="player-status-grid">
                {players.map(player => (
                    <div key={player.role_name} className={`player-card ${player.is_ready ? 'ready' : 'waiting'}`}>
                        {/*  */}
                        <p>{player.role_name}</p>
                        <span>{player.is_ready ? 'PRÊT' : 'EN ATTENTE'}</span>
                    </div>
                ))}
            </div>

            <h3 style={{ marginTop: '30px' }}>
                {readyPlayers.length}/{MAX_PLAYERS} Joueurs Prêts
            </h3>
        </div>
    );
};

export default PublicLobby;