import React, { useState, useEffect } from 'react';
import './CountdownScreen.css'; 

const CountdownScreen = ({ initialCount = 3, onCountdownEnd }) => {
    const [count, setCount] = useState(initialCount);

    useEffect(() => {
        // Si le compte est déjà terminé (par exemple si initialCount est 0), on ne fait rien
        if (count === 0) {
            onCountdownEnd();
            return;
        }

        // Démarrer le compte à rebours
        const timer = setTimeout(() => {
            setCount(count - 1);
        }, 1000);

        // Nettoyage : arrêter le timer si le composant est démonté
        return () => clearTimeout(timer);
    }, [count, onCountdownEnd]);

    // Rendu en plein écran avec une animation simple
    return (
        <div className="countdown-overlay">
            <div key={count} className="countdown-number">
                {count > 0 ? count : 'GO!'}
            </div>
        </div>
    );
};

export default CountdownScreen;