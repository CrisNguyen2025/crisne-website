import type { PageContext } from '../types';
import type { ChatMessage } from './types';
export declare const WELCOME_MESSAGE_ID = "welcome-msg";
export interface WelcomeSuggestion {
    label: string;
    prompt: string;
}
/**
 * One example per thing the assistant does. Each prompt is sent verbatim when tapped,
 * so it must read as a complete request the server can act on.
 */
export declare function getWelcomeSuggestions(context?: PageContext, canWrite?: boolean): WelcomeSuggestion[];
export declare function buildWelcomeMessage(context?: PageContext, canWrite?: boolean): ChatMessage;
