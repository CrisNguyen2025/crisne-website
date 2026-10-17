export interface FriendlyError {
    /** Shown to the reader in Vietnamese. Never contains URLs, ports or stack details. */
    text: string;
    /** Whether sending the same question again can plausibly succeed. */
    retryable: boolean;
}
/**
 * Turn a transport or server error into a sentence a reader can act on.
 * The raw message is for the developer console only.
 */
export declare function friendlyError(err: unknown): FriendlyError;
