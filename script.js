const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const wikiBtn = document.getElementById("wikiBtn");

// Constantes pour l'API Gemini
const API_MODEL = "gemini-2.5-flash-preview-09-2025";
const API_KEY = "AIzaSyCDuEbX3MX9rWaV0HdHWEqn9efqV-fHx0Y"; // L'environnement Canvas fournira cette clé au runtime

// Fonction utilitaire pour fetch avec backoff exponentiel (gestion des erreurs/limites de taux)
async function exponentialBackoffFetch(url, options, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;

            if (response.status === 429 || response.status >= 500) {
                // Rate limit ou erreur serveur, on attend avant de réessayer
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Erreur non-retryable
                console.error("API error:", response.status, await response.text());
                throw new Error(`API failed with status ${response.status}`);
            }
        } catch (error) {
            if (attempt === maxRetries - 1) {
                console.error("Max retries reached. Failing.", error);
                throw error;
            }
        }
    }
}

// Afficher un message
function addMessage(content, type) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", type);
    messageDiv.innerHTML = content;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Animation typing dots
function showTyping() {
    const typingDiv = document.createElement("div");
    typingDiv.id = "typing";
    typingDiv.classList.add("message", "ai-message");
    typingDiv.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return typingDiv;
}

// Effet d’écriture pour le message IA
async function typeMessage(content, type) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", type);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Délai d'écriture pour l'effet visuel
    for (let i = 0; i < content.length; i++) {
        messageDiv.innerHTML += content[i];
        chatBox.scrollTop = chatBox.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, content[i] === '.' ? 100 : 25)); // Ajout d'une petite pause
    }
}


// Générer réponse IA (via Gemini ou commande)
async function generateAIResponse(text) {
    const lowerText = text.toLowerCase().trim();

    // 1. Gestion des commandes (ex: /help, /wiki <terme>)
    if (lowerText === "/help") {
        return "Commandes disponibles : /help, /wiki <terme>. Pour le reste, tu peux discuter !";
    }

    if (lowerText.startsWith("/wiki ")) {
        const query = lowerText.substring(6).trim();
        // searchWikipedia est async, on attend le résultat
        const wikiResult = await searchWikipedia(query);
        return wikiResult || `Impossible de trouver une page Wikipédia pour "${query}".`;
    }

    // 2. Générer la réponse via l'API Gemini
    const systemPrompt = "Tu es un assistant IA amical et concis, conçu pour le chat en français. Réponds aux questions de manière utile et engageante, en utilisant des emojis si approprié.";

    const payload = {
        contents: [{ parts: [{ text: text }] }],
        // On utilise Google Search pour ancrer la réponse sur des informations récentes
        tools: [{ "google_search": {} }], 
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    // Pour les requêtes non-anglaises, on ajoute des requêtes en anglais pour améliorer les résultats de recherche
    if (!text.match(/^[a-zA-Z0-9\s.,?!'"]+$/)) {
        payload.tools = [{ 
            "google_search": {
                queries: [text, "french chat assistant response"]
            }
        }];
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${API_KEY}`;

    try {
        const response = await exponentialBackoffFetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Extraction des sources (facultatif mais bonne pratique)
        const sources = result.candidates?.[0]?.groundingMetadata?.groundingAttributions || [];
        let sourceText = "";
        if (sources.length > 0) {
            sourceText = "\n\n(Sources: " + sources.map(s => s.web?.title || s.uri).filter(Boolean).join(", ") + ")";
        }

        if (generatedText) {
            return generatedText + sourceText;
        } else {
            console.error("Gemini API returned no text:", result);
            return "Je n'ai pas pu générer de réponse pour cette requête. Peut-être essayer différemment ?";
        }

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API Gemini:", error);
        return "Désolé, une erreur de communication avec l'IA est survenue. Peux-tu réessayer dans un instant ?";
    }
}


// Requête Wikipédia
async function searchWikipedia(query) {
    // Utilise l'API Wikipédia en français
    const apiUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.extract) {
        // Tronque le texte si trop long
        return data.extract.length > 400
            ? data.extract.slice(0, 400) + "… (plus sur Wikipédia)"
            : data.extract;
    }
    return null;
}

// Envoyer message
async function sendMessage() {
    const input = userInput.value.trim();
    if (!input) return;

    addMessage(`👤 ${input}`, "user-message");
    userInput.value = "";

    const typingDiv = showTyping();
    // generateAIResponse est maintenant async et utilise l'API
    const response = await generateAIResponse(input);
    typingDiv.remove();

    await typeMessage(`🤖 ${response}`, "ai-message");
}

// Événements
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Message de bienvenue au chargement
window.onload = () => {
    addMessage("🤖 Bonjour ! Je suis ton assistant de chat IA propulsé par Gemini. Pose-moi une question ou utilise /help.", "ai-message");
};


