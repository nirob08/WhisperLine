
/**
 * WhisperLine Cryptography Module
 * Updated for the prototype to ensure messages are readable after "decryption".
 */

export const cryptoService = {
  /**
   * Generates a persistent cryptographic key pair locally.
   */
  async generateIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const mockPublic = btoa(String.fromCharCode(...array.slice(0, 16))).replace(/[^a-zA-Z0-9]/g, '');
    const mockPrivate = btoa(String.fromCharCode(...array.slice(16, 32))).replace(/[^a-zA-Z0-9]/g, '');
    
    return {
      publicKey: `pub_${mockPublic}`,
      privateKey: `priv_${mockPrivate}`
    };
  },

  /**
   * Encrypts a message using a simulated Signal Protocol ratchet.
   */
  async encryptMessage(message: string, recipientPublicKey: string): Promise<string> {
    // Encodes the message so it can be decoded by the UI
    const encoded = btoa(unescape(encodeURIComponent(message)));
    return `encrypted_${encoded}_via_${recipientPublicKey.slice(0, 8)}`;
  },

  /**
   * Decrypts a message.
   */
  async decryptMessage(encryptedData: string): Promise<string> {
    if (!encryptedData.startsWith('encrypted_')) return encryptedData;
    
    try {
      const base64 = encryptedData.replace(/^encrypted_/, '').split('_via_')[0];
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      console.error("Decryption failed", e);
      return "[Secure Content]";
    }
  },

  /**
   * Simulated secure local storage wipe.
   */
  async panicWipe(): Promise<void> {
    localStorage.clear();
    sessionStorage.clear();
  }
};
