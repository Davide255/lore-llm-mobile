import { CloudKnowledgeBaseClient } from './cloud/cloud-client';
import type { KnowledgeBaseClient } from './client';

export * from './types';
export type { KnowledgeBaseClient, ServerEvent } from './client';
export { AGENT_KIND_LIST } from './cloud/agents';

const cloud = new CloudKnowledgeBaseClient();

/** The single client instance used by the app: the signed-in user's space on the Lore server. */
export const kb: KnowledgeBaseClient = cloud;

/** Point the client at the signed-in user's space (null after sign-out). */
export const setKnowledgeBaseUser = (id: string | null) => cloud.setUser(id);
