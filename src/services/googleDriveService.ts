import { CollectionState } from "../types";

const CLIENT_ID = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const FILENAME = 'pocketdex_data.json';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let tokenClient: any;
let gisInited = false;

const waitFor = (fn: () => boolean, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Timeout waiting for Google scripts'));
      setTimeout(tick, 100);
    };
    tick();
  });

export const driveService = {
  isConfigured: () => !!CLIENT_ID,

  // Initialize GAPI and GIS (requires Google scripts in index.html)
  init: async (onInitComplete: (err?: Error) => void) => {
    if (!CLIENT_ID) {
      console.warn("Google Client ID not found in environment variables.");
      onInitComplete();
      return;
    }

    try {
      await waitFor(() => typeof (window as any).gapi !== 'undefined', 8000);
      await waitFor(() => typeof (window as any).google?.accounts !== 'undefined', 8000);
    } catch (e) {
      console.error('Google scripts did not load', e);
      onInitComplete(new Error('Google sign-in scripts did not load. Reload the page or check your connection and ad blockers.'));
      return;
    }

    try {
      const gapiLoadPromise = new Promise<void>((resolve, reject) => {
        (window as any).gapi.load('client', async () => {
          try {
            await (window as any).gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      const gisLoadPromise = new Promise<void>((resolve, reject) => {
        try {
          tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '',
          });
          gisInited = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      await Promise.all([gapiLoadPromise, gisLoadPromise]);
      onInitComplete();
    } catch (e) {
      console.error('Google Drive init failed', e);
      onInitComplete(e instanceof Error ? e : new Error(String(e)));
    }
  },

  // Trigger Login Flow
  login: (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!gisInited) return reject("Google services not initialized");
      
      tokenClient.callback = async (resp: any) => {
        if (resp.error) {
          reject(resp);
        }
        resolve(resp.access_token);
      };

      // Prompt the user to select an account if not already signed in
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  },

  // Get User Profile Info (using the People API or simpler Oauth endpoint)
  getUserInfo: async (accessToken: string) => {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.json();
  },

  // Search for our specific file in the hidden AppData folder
  findFile: async () => {
    try {
      const response = await window.gapi.client.drive.files.list({
        spaces: 'appDataFolder',
        q: `name = '${FILENAME}' and trashed = false`,
        fields: 'files(id, name)',
      });
      const files = response.result.files;
      if (files && files.length > 0) {
        return files[0].id;
      }
      return null;
    } catch (e) {
      console.error("Error finding file", e);
      return null;
    }
  },

  // Download content
  loadData: async (): Promise<CollectionState | null> => {
    const fileId = await driveService.findFile();
    if (!fileId) return null;

    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });
      return response.result as CollectionState;
    } catch (e) {
      console.error("Error loading file", e);
      return null;
    }
  },

  // Upload/Update content
  saveData: async (data: CollectionState) => {
    const fileContent = JSON.stringify(data);
    const fileId = await driveService.findFile();

    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
      name: FILENAME,
      mimeType: 'application/json',
      parents: ['appDataFolder'], // Critical: Save to hidden folder
    };

    const accessToken = window.gapi.auth.getToken().access_token;
    
    // Using fetch for multipart upload as gapi client is sometimes tricky with media uploads
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (fileId) {
      // Update existing
      url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    await fetch(url, {
      method: method,
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });
  },
};