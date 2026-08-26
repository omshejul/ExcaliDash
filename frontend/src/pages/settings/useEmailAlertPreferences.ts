import { useEffect, useState } from "react";
import * as api from "../../api";

type EmailPreference =
  | "emailShareInvitations"
  | "emailCollaborationJoins";

export const useEmailAlertPreferences = (enabled: boolean, userId?: string) => {
  const [preferences, setPreferences] = useState({
    emailShareInvitations: true,
    emailCollaborationJoins: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getUserPreferences()
      .then((stored) => {
        setPreferences({
          emailShareInvitations: stored.emailShareInvitations !== false,
          emailCollaborationJoins: stored.emailCollaborationJoins !== false,
        });
      })
      .catch(() => setError("Could not load email alert settings."))
      .finally(() => setLoading(false));
  }, [enabled, userId]);

  const toggle = async (key: EmailPreference) => {
    const previous = preferences[key];
    const next = !previous;
    setPreferences((current) => ({ ...current, [key]: next }));
    setError(null);
    try {
      await api.updateUserPreferences({ [key]: next });
    } catch {
      setPreferences((current) => ({ ...current, [key]: previous }));
      setError("Could not save email alert settings.");
    }
  };

  return { preferences, loading, error, toggle };
};
