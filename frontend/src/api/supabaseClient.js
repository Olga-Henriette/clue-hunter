import { createClient } from '@supabase/supabase-js';

// Récupérer les clés depuis les variables d'environnement dans Vite (définies dans .env.local)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Peut être modifier en un système d'alerte plus sophistiqué dans un environnement de production
  throw new Error("Missing Supabase environment variables. Check your .env.local file.");
}

// Créer le client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fonction pour se désabonner de tous les canaux actifs.
 */
export const unsubscribeAllChannels = () => {
    const activeChannels = supabase.getChannels();
    activeChannels.forEach(channel => {
        // Enlever l'écoute et désabonner
        channel.unsubscribe(); 
    });
    console.log(`Supabase: Désabonné de ${activeChannels.length} canaux.`);
}

/**
 * Fonction réutilisable pour s'abonner aux événements temps réel d'une table.
 * @param {string} table - Nom de la table à écouter (ex: 'players', 'game_sessions').
 * @param {function} callback - Fonction appelée lors de la réception d'un événement.
 */
export const subscribeToTable = (table, callback) => {
    // Rendre le nom du canal unique pour garantir qu'un nouveau canal est toujours créé
    const uniqueChannelName = `${table}_channel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const channel = supabase
        .channel(uniqueChannelName) // <-- Utilisation d'un nom unique
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();
    
    return channel;
}