/**
 * Cloudflare Worker for FuadCards
 * 
 * Setup Instructions:
 * 1. Create a new Worker in Cloudflare.
 * 2. Add the following Secrets in Settings -> Variables:
 *    - GEMINI_API_KEY: (Your Gemini API Key)
 *    - VITE_WORKER_AUTH_KEY: 12345
 *    - VITE_R2_PUBLIC_URL: https://pub-c78289ec134140caabd6b03a08c2fede.r2.dev
 * 3. Bind an R2 Bucket named 'MY_BUCKET' to the worker.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Auth Check
    const authKey = request.headers.get("Authorization");
    if (authKey !== env.VITE_WORKER_AUTH_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Route: Upload to R2 ---
    if (url.pathname === "/upload" && request.method === "POST") {
      try {
        const { image, fileName, contentType } = await request.json();
        
        // Convert base64 to ArrayBuffer
        const base64Data = image.split(',')[1] || image;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Upload to R2
        await env.MY_BUCKET.put(fileName, bytes, {
          httpMetadata: { contentType: contentType || 'image/png' },
        });

        const publicUrl = `${env.VITE_R2_PUBLIC_URL}/${fileName}`;
        return new Response(JSON.stringify({ url: publicUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Route: Generate Card via Gemini ---
    if (url.pathname === "/api/generate-card" && request.method === "POST") {
      try {
        const { characterName } = await request.json();

        // Call Gemini API (REST)
        // Note: Using 1.5-flash for speed/cost, but you can use 3.1-flash-image-preview if available
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are a master anime card designer.
                  1. Create a long, detailed artistic prompt for a high-quality anime character trading card of "${characterName}". 
                  Use high-key lighting, minimal black colors, and an aesthetic/pastel palette. 
                  The description should be evocative, describing the character's pose, the background, the lighting, and the overall vibe.
                  
                  2. Based on this description, determine a Power Level (between 1 and 9999) and a Strength Rating (between 1 and 1000) that accurately reflects their lore.
                  
                  Return the description and stats as a JSON string.
                  JSON format: {"description": "...", "power": 8500, "strength": 750}`
                }]
              }],
              generationConfig: {
                responseMimeType: "application/json",
              }
            }),
          }
        );

        const geminiData = await geminiResponse.json();
        if (geminiData.error) throw new Error(geminiData.error.message);
        
        const textResponse = geminiData.candidates[0].content.parts[0].text;
        const metadata = JSON.parse(textResponse);

        // For image generation in a worker, you'd typically call a separate Image API 
        // or use a multimodal model that supports image output via REST.
        // Since Gemini 3.1 Flash Image Preview is new, the REST API for image output 
        // might require specific headers or a different endpoint.
        
        return new Response(JSON.stringify({
          ...metadata,
          raw_power: metadata.power,
          prompt_text: metadata.description,
          // In a real scenario, you'd generate the image here too or return a placeholder
          imageUrl: "https://picsum.photos/seed/" + characterName + "/400/600" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
