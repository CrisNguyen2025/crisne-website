import { useCallback, useState } from "react";
import type { RoadmapChatClient } from "../client";
import type { ConnectorId, GmailConnectorStatus } from "../types";

export function useGmailConnector(options: {
  client: RoadmapChatClient;
  canWrite: boolean;
  onOpenModal: () => void;
}) {
  const { client, canWrite, onOpenModal } = options;
  const [gmailStatus, setGmailStatus] = useState<GmailConnectorStatus | null>(null);
  const [isGmailAttached, setIsGmailAttached] = useState(false);

  const toggleGmailAttached = useCallback(() => {
    if (!canWrite) return;
    setIsGmailAttached((prev) => !prev);
  }, [canWrite]);

  const openGmailConfig = useCallback(() => {
    if (!canWrite) return;
    onOpenModal();
  }, [canWrite, onOpenModal]);

  const refreshGmailStatus = useCallback(() => {
    if (!canWrite) return;
    void client
      .getGmailConnectorStatus()
      .then((status) => setGmailStatus(status))
      .catch(() => {});
  }, [canWrite, client]);

  const resolveTurnConnectors = useCallback(
    (messageText: string, explicit?: ConnectorId[]): ConnectorId[] | undefined => {
      if (explicit) return explicit.length ? explicit : undefined;
      if (!canWrite) return undefined;
      if (isGmailAttached || /^\s*\/gmail\b/i.test(messageText)) {
        return ["gmail"];
      }
      return undefined;
    },
    [canWrite, isGmailAttached]
  );

  return {
    gmailStatus,
    setGmailStatus,
    isGmailAttached,
    setIsGmailAttached,
    toggleGmailAttached,
    openGmailConfig,
    refreshGmailStatus,
    resolveTurnConnectors,
  };
}
