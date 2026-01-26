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
let gapiInited = false;
let gisInited = false;

export const driveService = {
  isConfigured: () => !!CLIENT_ID,

  // Initialize GAPI and GIS
  init: async (onInitComplete: () => void) => {
    if (!CLIENT_ID) {
      console.warn("Google Client ID not found in environment variables.");
      return;
    }

    const gapiLoadPromise = new Promise<void>((resolve) => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        resolve();
      });
    });

    const gisLoadPromise = new Promise<void>((resolve) => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // Defined at request time
      });
      gisInited = true;
      resolve();
    });

    await Promise.all([gapiLoadPromise, gisLoadPromise]);
    onInitComplete();
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