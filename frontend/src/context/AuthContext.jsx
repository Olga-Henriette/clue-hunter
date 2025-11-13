import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Vérifier la session actuelle au montage
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 2. S'abonner aux changements d'état d'authentification (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setUser(session?.user ?? null);
                setLoading(false);
            }
        );

        // Nettoyage de l'abonnement
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const value = {
        user,
        userId: user?.id,
        loading,
        isAuthenticated: !!user,
        // Exposer les fonctions d'auth si besoin, mais nous gérons sign-in dans Screen B
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};