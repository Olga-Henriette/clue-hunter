
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
 * Fonction réutilisable pour s'abonner aux événements temps réel d'une table.
 * @param {string} table - Nom de la table à écouter (ex: 'players', 'game_sessions').
 * @param {function} callback - Fonction appelée lors de la réception d'un événement.
 */
export const subscribeToTable = (table, callback) => {
    // S'abonner à toutes les modifications (*), toutes les colonnes (*)
    const channel = supabase
        .channel(`${table}_channel`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table },
            (payload) => {
                // On passe la charge utile (payload) à la fonction de rappel
                callback(payload);
            }
        )
        .subscribe();
    
    return channel;
}