import { GoogleGenAI } from "@google/genai";
import { Card } from "../types";

export const getCardAdvice = async (cards: Card[]): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key is missing. Please configure the environment variable.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const cardNames = cards.map(c => c.name).join(', ');
    const prompt = `
      I have the following Pokémon TCG Pocket cards in my collection: ${cardNames}.
      
      Please suggest a simple deck strategy or synergy I could build with these cards. 
      Focus on the key "ex" cards if available. Keep the advice short, under 100 words.
      Use bullet points.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "No advice could be generated at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Sorry, I couldn't reach the AI advisor right now. Please try again later.";
  }
};
