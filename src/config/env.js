/**
 * Application Environment Configuration
 * 
 * Centralized module for accessing environment variables across the app.
 * Can be imported into any component or service:
 * `import { env } from '../config/env';`
 */

export const env = {
  // Firebase Configuration
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
  },

  // Gemini AI Keys
  gemini: {
    sttApiKey: import.meta.env.VITE_STT_API_KEY || import.meta.env.VITE_ASSISTANT_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '',
    assistantApiKey: import.meta.env.VITE_ASSISTANT_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '',
    managerApiKey: import.meta.env.VITE_MANAGER_API_KEY || import.meta.env.VITE_ASSISTANT_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '',
    receiptScannerApiKey: import.meta.env.VITE_RECEIPT_SCANNER_API_KEY || import.meta.env.VITE_MANAGER_API_KEY || import.meta.env.VITE_ASSISTANT_API_KEY || '',
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  },

  // ElevenLabs Voice & Audio
  elevenLabs: {
    apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY || '',
    agentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID || '',
  },

  // OpenAI Key
  openai: {
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  },

  // AWS Infrastructure Endpoints
  aws: {
    httpEndpoint: import.meta.env.VITE_AWS_HTTP_ENDPOINT || '',
    wsEndpoint: import.meta.env.VITE_AWS_WS_ENDPOINT || '',
  },

  // API Base URL
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
};

export default env;
