import React from 'react';

const PublicScoreboard = ({ players }) => {
    
    return (
        <div className="scoreboard-table">
            <h4>Classement Actuel</h4>
            <table>
                <thead>
                    <tr>
                        <th>Rang</th>
                        <th>Rôle</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((player, index) => (
                        <tr key={player.role_name}>
                            <td>{index + 1}</td>
                            <td>{player.role_name}</td>
                            <td>{player.current_score}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PublicScoreboard;