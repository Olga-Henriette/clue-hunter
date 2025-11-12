import { useState, useEffect, useCallback } from 'react';
import { MAX_TIME_SECONDS } from '../features/core/scoreLogic';

const useTimer = (startTimeISO) => {
    const [timeRemaining, setTimeRemaining] = useState(MAX_TIME_SECONDS);
    const [isRunning, setIsRunning] = useState(false);
    
    // Fonction pour réinitialiser le chronomètre
    const resetTimer = useCallback((newStartTimeISO) => {
        if (!newStartTimeISO) {
            setTimeRemaining(MAX_TIME_SECONDS);
            setIsRunning(false);
            return;
        }

        const startTime = new Date(newStartTimeISO).getTime();
        const now = new Date().getTime();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, MAX_TIME_SECONDS - elapsedSeconds);
        
        setTimeRemaining(remaining);
        setIsRunning(remaining > 0);

    }, []);

    useEffect(() => {
        // Initialiser le chronomètre au chargement ou changement de question
        resetTimer(startTimeISO);

        if (!startTimeISO) return;

        let intervalId;
        
        if (isRunning) {
            intervalId = setInterval(() => {
                setTimeRemaining((prevTime) => {
                    if (prevTime <= 1) {
                        clearInterval(intervalId);
                        setIsRunning(false);
                        // Logique de temps écoulé (la partie continue, mais le scoring s'arrête)
                        return 0; 
                    }
                    return prevTime - 1;
                });
            }, 1000);
        }

        return () => clearInterval(intervalId);
    }, [startTimeISO, isRunning, resetTimer]); 

    // Permet d'arrêter le chronomètre pour la validation
    const stopTimer = () => setIsRunning(false);

    return { timeRemaining, isRunning, stopTimer, resetTimer };
};

export default useTimer;