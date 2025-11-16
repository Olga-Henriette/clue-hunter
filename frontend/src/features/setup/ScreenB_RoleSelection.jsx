import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, subscribeToTable } from '../../api/supabaseClient';
import { ROLES, MAX_PLAYERS } from './roles';
import GAME_LOGO from '../../utils/roleConfig'; 


const RoleSelectionScreen = () => {
  const navigate = useNavigate();
  const [availableRoles, setAvailableRoles] = useState(ROLES);
  const [selectedRole, setSelectedRole] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // ------------------------------------
  // I. GESTION DU TEMPS RÉEL 
  // ------------------------------------

  // Fonction pour mettre à jour la liste des rôles disponibles
  const updateAvailableRoles = useCallback((currentPlayers) => {
      const reservedRoles = currentPlayers.map(p => p.role_name);
      const newAvailable = ROLES.map(role => ({
        ...role,
        isTaken: reservedRoles.includes(role.ROLE_NAME),
      }));
      setAvailableRoles(newAvailable);

      // Vérifier si le jeu est plein 
      // if (currentPlayers.length >= MAX_PLAYERS) { } 
  }, [setAvailableRoles]); // Dépend de setAvailableRoles 

  // Fonction pour charger et mettre à jour l'état (Rendue stable par useCallback)
  const fetchAndSetRoles = useCallback(async () => {
      const { data: currentPlayers, error } = await supabase
          .from('players')
          .select('role_name, is_ready');
          
      if (error) {
          console.error("Error fetching players:", error.message);
          return;
      }
      updateAvailableRoles(currentPlayers || []);
  }, [updateAvailableRoles]); // Dépend de updateAvailableRoles


  useEffect(() => {
      let playersChannel;
      
      // 1. Chargement initial
      fetchAndSetRoles();

      // 2. S'abonner aux changements pour les mises à jour en temps réel
      playersChannel = subscribeToTable('players', (payload) => {
          console.log('SelectRole: Realtime Roles Update');
          // Rappelle la fonction de chargement et mise à jour lors de tout changement (insertion/suppression)
          fetchAndSetRoles(); 
      });

      // Nettoyage de l'abonnement
      return () => {
          if (playersChannel) {
              playersChannel.unsubscribe();
          }
      };
  }, [fetchAndSetRoles]); // Dépend de la fonction useCallback fetchAndSetRoles

  // ------------------------------------
  // II. AUTHENTIFICATION ET INSERTION (SCREEN C LOGIC)
  // ------------------------------------

  const handleRoleSelect = (role) => {
    if (role.isTaken) return;
    setSelectedRole(role);
    setModalOpen(true); // Ouvre le panneau de validation (Screen C)
  };

  const handleConfirm = async () => {
    if (!selectedRole) return;

    setModalOpen(false);
    
    try {
      // 1. Tentative de SIGN-IN ANONYME pour obtenir un 'auth.uid()'
      // Le uid est nécessaire pour les règles RLS INSERT et UPDATE
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      
      if (authError) throw authError;

      // Récupérer l'ID de l'utilisateur anonyme créé
      const player_id = authData.user.id;
      
      // 2. INSERTION du profil dans la table 'players' (Le RLS vérifie si id = auth.uid())
      const { error: insertError } = await supabase
        .from('players')
        .insert([
          {
            id: player_id,
            role_name: selectedRole.ROLE_NAME,
            avatar_url: selectedRole.AVATAR_URL,
            is_ready: true, 
            // last_session_id sera inséré plus tard par le serveur lors du lancement de la partie
          },
        ]);

      if (insertError) {
        // Cela peut arriver si l'utilisateur est trop lent et que le rôle a été pris par un autre
        alert(`Erreur: Rôle ${selectedRole.DISPLAY_NAME} déjà pris. Veuillez réessayer.`);
        console.error(insertError);
        return;
      }

      // Si l'insertion réussit, naviguer vers le Lobby (Screen D)
      navigate('/lobby', { state: { role: selectedRole } });

    } catch (error) {
      alert(`Une erreur critique est survenue: ${error.message}`);
    }
  };

  const handleCancel = () => {
    setModalOpen(false);
    setSelectedRole(null);
  };
  
  // ------------------------------------
  // III. RENDU DES ÉCRANS B et C
  // ------------------------------------
  
  return (
    <div className="screen-b-selection">
      <header className="role-selection-header">
        <img src={GAME_LOGO} alt="Logo du jeu" className="game-logo-medium" />
        <h2>Chasseur d'Indice</h2>
      </header>

      <div className="role-grid">
        {availableRoles.map((role) => (
          <button
            key={role.ROLE_NAME}
            onClick={() => handleRoleSelect(role)}
            disabled={role.isTaken}
            className={`role-button ${role.isTaken ? 'is-taken' : ''}`}
          >
            {/*  (Remplacez par l'image de l'avatar) */}
            {role.DISPLAY_NAME}
          </button>
        ))}
      </div>

      {/* Panneau de Validation (Screen C) */}
      {modalOpen && selectedRole && (
        <div className="validation-modal">
          <div className="modal-content">
            <p>
              {selectedRole.ROLE_NAME === 'PERSONNEL'
                ? "Vous êtes Personnel ?"
                : `Vous êtes dans la mention ${selectedRole.DISPLAY_NAME} ?`}
            </p>
            <div className="modal-actions">
              <button onClick={handleConfirm} className="btn-yes">OUI</button>
              <button onClick={() => setModalOpen(false)} className="btn-no">NON</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleSelectionScreen;