import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route for Card Generation
  app.post("/api/generate-card", async (req, res) => {
    const { characterName } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key not configured on server." });
    }

    if (!characterName) {
      return res.status(400).json({ error: "Character name is required." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              text: `You are a master anime card designer.
              1. Create a long, detailed artistic prompt for a high-quality anime character trading card of "${characterName}". 
              Use high-key lighting, minimal black colors, and an aesthetic/pastel palette. 
              The description should be evocative, describing the character's pose, the background, the lighting, and the overall vibe.
              
              2. Based on this description, determine a Power Level (between 1 and 9999) and a Strength Rating (between 1 and 1000) that accurately reflects their lore.
              
              Return the description and stats as a JSON string in the text part, and also generate the image.
              JSON format: {"description": "...", "power": 8500, "strength": 750}`
            }
          ]
        },
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        }
      });

      let imageUrl = '';
      let metadata = { description: '', power: 1000, strength: 500 };

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          try {
            const cleanText = part.text.replace(/```json|```/g, '').trim();
            metadata = JSON.parse(cleanText);
          } catch (e) {
            console.error("Failed to parse metadata", e);
          }
        }
      }

      if (!imageUrl) throw new Error("No image generated");

      res.json({
        imageUrl,
        raw_power: metadata.power || 1000,
        strength: metadata.strength || 500,
        prompt_text: metadata.description || `A high-quality, aesthetic anime trading card of ${characterName}.`
      });
    } catch (error: any) {
      console.error("Gemini Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate card." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
