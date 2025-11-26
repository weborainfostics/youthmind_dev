const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const fetch = require("node-fetch");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// FIX: Use the stable model. "2.5" does not exist publicly yet.
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Helper to call Gemini
async function callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`Gemini API Error: ${response.status}`, errText);
        throw new Error(`Gemini API Error: ${response.statusText}`);
    }

   const result = await response.json();
    try {
        let rawText = result.candidates[0].content.parts[0].text;
        // FIX: Clean markdown formatting (```json ... ```) before parsing to prevent crashes
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(rawText);
    } catch (e) {
        console.error("JSON Parse Error", e);
        console.error("Raw Text:", result.candidates[0]?.content?.parts[0]?.text);
        throw new Error("Failed to parse AI response as JSON");
    }
}

// ---------------------------------------------------------
// FUNCTION 1: Chat Response (The Brain)
// ---------------------------------------------------------
exports.generateAIResponse = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { text, chatHistory, moodHierarchy } = request.data;
    const apiKey = GEMINI_API_KEY.value();

    // === YOUR EXACT REQUESTED PROMPT ===
    const systemPrompt = `You are YouthMind, a smart, empathetic mental health companion.
    
    CRITICAL INSTRUCTION: You must output ONLY valid JSON.
    
    Analyze the user's message and return a JSON object with this structure:
    {
      "reply": "Your warm, supportive response here.",
      "detected_mood": "Main mood from the list below, or null if neutral/casual.",
      "detected_sub_mood": "Specific sub-mood from the list below, or null.",
      "distress_level": Integer 0 to 10 (0=calm, 10=crisis),
      "distress_type": "One of ['None', 'Anxiety', 'Loneliness', 'Anger', 'Sadness', 'Crisis', 'SelfHarm']"
    }

    VALID MOOD HIERARCHY:
    ${moodHierarchy}

    Guidelines:
    1. **Mood Detection:** ONLY return a mood if the user explicitly expresses an emotion. For greetings like "Hi", set "detected_mood": null.
    2. **Distress Scale (0-10):** - 0-3: Normal/Casual.
       - 4-7: Mild/Moderate (Sad, Anxious, Lonely).
       - 8-10: EXTREME (Suicidal thoughts, Self-harm, explicitly saying "I want to die", "I can't go on").
    3. **Distress Type:** If level is 8-10, set distress_type to 'Crisis' or 'SelfHarm'.
    4. **Response:** - If Level 8-10: Be very brief, validating, and urge professional help.
       - If Level 0-7: Be your warm, chatty, Desi best friend.

    Chat History: ${JSON.stringify(chatHistory)}
    User Input: ${text}
    `;

    try {
        const aiResponse = await callGemini(systemPrompt, apiKey);
        return aiResponse;
    } catch (error) {
        console.error("Chat Error", error);
        throw new HttpsError("internal", "AI failed to respond.");
    }
});

// ---------------------------------------------------------
// FUNCTION 2: Quiz Generation
// ---------------------------------------------------------
exports.generateQuiz = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");
    
    const apiKey = GEMINI_API_KEY.value();
    const prompt = `Generate 5 creative, funny, but insightful multiple-choice questions for a student's mental health check-in quiz. 
    Output ONLY valid JSON: { "quiz": [{ "question": "...", "options": ["A","B","C"], "scores": [2,1,0] }] }`;

    try {
        const data = await callGemini(prompt, apiKey);
        return data.quiz; 
    } catch (error) {
        throw new HttpsError("internal", "Failed to generate quiz.");
    }
});

// ---------------------------------------------------------
// FUNCTION 3: Weekly Report Insight
// ---------------------------------------------------------
exports.generateWeeklyInsight = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in.");
    
    const { moodData, avgRatings, steps } = request.data;
    const apiKey = GEMINI_API_KEY.value();

    const prompt = `Generate a warm weekly mental health summary (JSON).
    Data: Moods: ${JSON.stringify(moodData)}, Ratings: ${JSON.stringify(avgRatings)}, Steps: ${steps}.
    Output JSON: { "insight": "Your paragraph here." }`;

    try {
        const data = await callGemini(prompt, apiKey);
        return data.insight;
    } catch (error) {
        throw new HttpsError("internal", "Failed to generate report.");
    }
});
