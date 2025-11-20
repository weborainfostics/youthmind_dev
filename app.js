
import * as cons from "./const.js";
import * as gem from "./api.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    setPersistence,
    browserLocalPersistence,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    getAdditionalUserInfo,
    sendEmailVerification // <-- ADD THIS
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment,
    where,
    getDocs,
    deleteDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
let isTourActive = false;
let todayDayRating = null; // <-- ADD THIS
let currentTourStep = 0;
let previousBadgeCount = 0; // For badge notifications
let sleepChartData = [];
let reminders = []; // <-- ADD THIS
let reminderCheckInterval = null; // <-- ADD THIS
let isDarkMode = false;
let isAutoTTS = false; // <-- ADD THIS
let synth = window.speechSynthesis;
let voices = [];

function populateVoices() {
    voices = synth.getVoices();
}
populateVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
}
// ===== NEW Day Rating Constants =====

// ===== 1) Firebase & App State Initialization =====
const appRoot = document.getElementById('app-root');
const featureContainer = document.getElementById('app-root');
let app, db, auth;
let user = null;
let profile = null;
let todayMood = null;
let calendarMap = {};
let chartData = [];
let chatMessages = [];
let chatUnsubscribe = null;
let todaySleep = null;
let sleepCalendarMap = {};
let isBreathingExerciseActive = false;
let breathCycleCount = 0;
const MAX_BREATH_CYCLES = 5;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isListening = false;
// ===== MUSIC CATEGORIES SECTION =====
// Flexible track assignment system - easily customizable
// Simply change the start and end numbers to assign different tracks to each mood
// Example: "Very Sad": { start: 1, end: 20 } means tracks music1.mp3 to music20.mp3



// Generate music categories based on track assignments
const MUSIC_CATEGORIES = {};
Object.keys(cons.MUSIC_TRACK_ASSIGNMENTS).forEach(mood => {
    const assignment = cons.MUSIC_TRACK_ASSIGNMENTS[mood];
    const tracks = [];
    for (let i = assignment.start; i <= assignment.end; i++) {
        tracks.push(`music${i}.mp3`);
    }
    MUSIC_CATEGORIES[mood] = tracks;
});

const musicPlaylist = Array.from({ length: 20 }, (_, i) => `music${i + 1}.mp3`);
let shuffledPlaylist = [];
let currentTrackIndex = 0;
let isShuffled = true;
let currentMusicCategory = "Neutral"; // Default category
const audio = new Audio();


// User's Firebase Configuration




// ===== 2) Helpers & Constants =====



// ===== VIDEO GENRE LINKS SECTION =====
// Add your video links here for each genre


function titleCase(s) {
    if (!s) return "";
    return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function dateId(d = new Date()) {
    const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return tz.toISOString().slice(0, 10);
}
function calculateSleepScore(hoursSlept, timesAwoke) {
    let hourScore = 0;
    let awokePenalty = 0;

    // 1. Calculate score based on hours (Optimal 7-9 hours)
    if (hoursSlept >= 7 && hoursSlept <= 9) {
        hourScore = 100; // Perfect score
    } else if (hoursSlept > 9) {
        // Penalize for oversleeping
        hourScore = 100 - (hoursSlept - 9) * 10;
    } else if (hoursSlept < 7) {
        // Penalize for undersleeping
        if (hoursSlept >= 6) hourScore = 80;
        else if (hoursSlept >= 5) hourScore = 60;
        else if (hoursSlept >= 4) hourScore = 40;
        else hourScore = 20;
    }

    // 2. Calculate penalty for waking up (Optimal 0-1)
    if (timesAwoke > 1) {
        awokePenalty = (timesAwoke - 1) * 10;
    }

    // 3. Calculate final score
    const finalScore = Math.max(0, hourScore - awokePenalty); // Ensure score is not negative

    let emoji = "❓";
    if (finalScore >= 90) emoji = "✨"; // Excellent
    else if (finalScore >= 80) emoji = "😴"; // Good
    else if (finalScore >= 60) emoji = "👍"; // Fair
    else if (finalScore >= 40) emoji = "🥱"; // Poor
    else emoji = "😵"; // Very Poor

    return {
        score: finalScore,
        emoji: emoji,
        color: finalScore >= 80 ? '#22c55e' : (finalScore >= 60 ? '#eab308' : '#ef4444')
    };
}
function prepareTextForSpeech(text) {
    if (!text) return "";

    // 1. Remove Emojis (Ranges for most common emojis)
    let clean = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');

    // 2. Convert Symbols to Pauses (Punctuation)
    // Replace asterisks (*) with commas for a short pause
    clean = clean.replace(/\*/g, ','); 
    // Replace dashes (-) with commas
    clean = clean.replace(/-/g, ', '); 
    // Replace newlines with periods for a longer pause
    clean = clean.replace(/\n/g, '. '); 
    // Remove code blocks or markdown chars that sound bad
    clean = clean.replace(/`/g, ''); 
    clean = clean.replace(/#/g, ''); 

    return clean;
}
// ===== Text-to-Speech Functions =====
function speakText(text) {
    if (synth.speaking) {
        synth.cancel(); // Stop previous speech immediately
    }
    if (!text) return;

    // Clean the text first
    const textToRead = prepareTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(textToRead);
    
    // --- Voice Selection Logic (Targeting "Smooth/Sexy") ---
    // Priority 1: Google US English (Very smooth, high quality)
    // Priority 2: Microsoft Zira (Good Windows voice)
    // Priority 3: Samantha (Good Mac voice)
    // Priority 4: Google English India (Good Indian accent)
    
    const preferredVoice = 
        voices.find(v => v.name === 'Google US English') || 
        voices.find(v => v.name.includes('Zira')) || 
        voices.find(v => v.name.includes('Samantha')) ||
        voices.find(v => v.lang === 'en-IN' && v.name.includes('Google')) ||
        voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    // --- Tuning for "Sexy/Calm" Vibe ---
    utterance.pitch = 0.9; // Slightly lower pitch is more soothing
    utterance.rate = 0.95; // Slightly slower is clearer and more relaxed
    utterance.volume = 1;

    // Animation toggles (Keep existing logic)
    utterance.onstart = () => {
        const btns = document.querySelectorAll('.tts-btn');
        btns.forEach(b => {
            // Check against original text data attribute
            if (b.dataset.text && b.dataset.text.includes(text.substring(0, 20))) {
                b.classList.add('speaking');
            }
        });
    };
    utterance.onend = () => {
        document.querySelectorAll('.tts-btn').forEach(b => b.classList.remove('speaking'));
    };

    synth.speak(utterance);
}
function toggleAutoTTS() {
    isAutoTTS = !isAutoTTS;
    const statusEl = document.getElementById('tts-status');
    if (statusEl) {
        statusEl.textContent = isAutoTTS ? 'ON' : 'OFF';
        statusEl.className = isAutoTTS ? 'text-xs font-bold text-green-600 dark:text-green-400 ml-auto' : 'text-xs font-bold text-gray-500 dark:text-gray-400 ml-auto';
    }
    localStorage.setItem('youthmind_auto_tts', isAutoTTS);
}
// ===== 3) Gemini API Logic =====
async function generateReply({ text, moodScore, name, chatHistory }) {
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gem.GEMINI_API_KEY}`;    if (!gem.GEMINI_API_KEY) {
        return { text: "The chatbot is not configured. Please add a Gemini API key to the code.", crisis: false };
    }

    // --- New Mood & Sleep Description Logic ---
    const moodLabel = todayMood?.mainMood;
    const subMoodLabel = todayMood?.subMood;
    let moodDescription = "feeling neutral";
    if (moodLabel && subMoodLabel) {
        moodDescription = `feeling ${moodLabel} (specifically ${subMoodLabel})`;
    } else if (moodLabel) {
        moodDescription = `feeling ${moodLabel}`;
    }

    let sleepDescription = "We don't know how they slept last night.";
    if (todaySleep) {
        sleepDescription = `For context, they slept ${todaySleep.hoursSlept} hours, woke up ${todaySleep.timesAwoke} times, and have a sleep score of ${todaySleep.score}.`;
    }
    // --- End New Logic ---

   const systemPrompt = `You are YouthMind, a mental well-being companion for young adults in India.

You are not a therapist and not a cheerleader.
Your job is to listen deeply, validate emotions, gently help the user explore what’s going on, and offer small, realistic coping strategies—while keeping a warm, friendly, Desi best-friend vibe.

The user’s name is ${name || "Friend"}.
Today they are ${moodDescription}.
${sleepDescription}


---

Core Behavioral Rules

1. Emotional Validation First

Always begin by acknowledging what the user feels.
Use language like:

“It makes sense you’d feel that way.”

“Yeh kaafi heavy lag raha hai.”

“I can hear how tough this feels for you.”


Never minimize emotions.
Avoid: “Cheer up,” “Don’t be sad,” “No worries,” or any toxic positivity.


---

2. Gentle Exploration

Help the user understand what’s happening inside without interrogating.

Ask soft, open-ended questions like:

“Kab se aisa feel ho raha hai?”

“Is situation ka kaunsa part sabse zyada hurt karta hai?”

“What thoughts pop up for you when this happens?”


Reflect their feelings:

“So if I’m understanding right, you feel ___ when ___ happens. Did I get that?”



---

3. Focus on Underlying Needs

Try to identify needs beneath emotions—support, connection, space, rest, clarity.

Use lines like:

“Shayad tumhe is time zyada understanding ki need ho.”

“Lagta hai pain ka ek part unheard feel karna bhi hai. Does that fit?”



---

4. Coping Options, Not Commands

Offer small, realistic, optional coping ideas:

Grounding exercises

Journaling prompts

Gentle reframes

Small physical actions (breathing, water, stretch)


Always phrase as choices, not instructions.

Examples:

“Agar tum chaho toh hum ek chhota grounding exercise try kar sakte hain.”

“Some people find it helpful to write down just one thought that’s bothering them.”



---

5. Respect Their Pace

Give control back to the user:

“Do you want to go deeper into this, or should we focus on coping for right now?”

“What feels safest to talk about?”



---

6. Tone & Vibe

Default vibe:
Chatty, funny, warm, desi best-friend energy (YouthMind). Emojis allowed. Short paragraphs.

If user talks in Hinglish, reply in Hinglish.
If casual topic → short, lively replies.
If emotionally heavy → longer (max 250–300 words), gentle, grounded response.


---

7. Safety Rule

If user hints at self-harm, suicidal thoughts, or extreme distress:

Immediately pause humor

Respond with calm, mature empathy

Validate deeply

Gently encourage reaching out to a trusted person or professional

Never judge, shame, or give medical advice


Example:

“I’m really glad you shared this with me.
I’m not a professional and I can’t keep you safe in an emergency, but you deserve real support.
Can you reach out to someone you trust or a local helpline right now?”


---

8. Output Structure

A typical reply should follow this structure:

1. Validate their feeling


2. Reflect + gently explore with 1–2 questions


3. Offer a small, optional coping step / ask what direction they prefer`;

    const payload = {
        contents: [...chatHistory, { role: 'user', parts: [{ text }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API Error: ${errorBody.error.message}`);
        }
        const result = await response.json();
        const candidate = result.candidates?.[0];
        const botText = candidate?.content?.parts?.[0]?.text || "I'm not sure how to respond to that.";
        const crisisWords = ["suicide", "kill myself", "end it all", "self-harm", "cutting myself", "hopeless", "worthless", "no reason to live", "want to die", "better off dead", "end my life"];
        const isCrisis = crisisWords.some(w => text.toLowerCase().includes(w));

        return {
            text: isCrisis ? `Thank you for sharing that with me, ${name}. I'm hearing a lot of pain in your words, and I want you to know I'm here and listening. Your safety is the most important thing right now. If you're in immediate danger, please reach out to emergency services (like 112 in India) or a trusted adult. You're not alone in this. Sometimes just taking a moment to breathe can help. Can we try taking one slow, deep breath together? Inhale... and exhale.<b> check below you can talk to our counncellors, if feeling not good.` : botText,
            crisis: isCrisis
        };
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { text: "Sorry, I couldn't connect right now. Let's try again in a bit.", crisis: false };
    }
}
// ===== NEW SLEEP RENDER FUNCTIONS =====

  
function renderSleepPopupBanner() {
    const popupHTML = `
                <div id="sleep-popup-banner" class="sleep-popup fixed bottom-0 left-0 right-0 sm:bottom-20 sm:left-5 sm:right-auto sm:w-auto sm:max-w-md p-4 sm:rounded-lg shadow-2xl bg-white dark:bg-gray-800 border-t sm:border dark:border-gray-700 flex items-center justify-between pointer-events-auto z-50">
                    <div>
                        <h4 class="font-semibold text-gray-800 dark:text-gray-200">Good Morning! ☀️</h4>
                        <p class="text-sm text-gray-600 dark:text-gray-400">How did you sleep last night?</p>
                    </div>
                    <div class="flex gap-2 ml-4">
                        <button id="close-sleep-popup-btn" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Later</button>
                        <button id="start-sleep-track-btn" class="px-3 py-2 bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors flex-shrink-0">Record</button>
                    </div>
                </div>
            `;
    featureContainer.insertAdjacentHTML('beforeend', popupHTML);

    setTimeout(() => {
        const banner = document.getElementById('sleep-popup-banner');
        if (banner) banner.remove();
    }, 15000); // Auto-dismiss after 15 seconds
}

function renderSleepTrackingModal(existingData = null) {
    const hours = existingData?.hoursSlept ?? '';
    const awoke = existingData?.timesAwoke ?? '';

    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="sleep-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
                    <div class="modal-content w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Track Your Sleep</h2>
                            <button id="close-sleep-modal-btn" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                        </div>
                        <form id="sleep-track-form" class="p-6 space-y-5">
                            <div>
                                <label for="sleep-hours" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How many hours did you sleep?</label>
                                <input type="number" id="sleep-hours" name="hoursSlept" min="0" max="24" step="0.5" value="${hours}"
                                       class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" 
                                       placeholder="e.g., 7.5" required>
                            </div>
                            <div>
                                <label for="sleep-awoke" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How many times did you wake up?</label>
                                <input type="number" id="sleep-awoke" name="timesAwoke" min="0" max="20" step="1" value="${awoke}"
                                       class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" 
                                       placeholder="e.g., 2" required>
                            </div>
                            <div class="pt-2">
                                <button type="submit" class="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl">
                                    ${existingData ? 'Update Score' : 'Calculate My Sleep Score'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `)
}

function renderSleepScoreDisplay(scoreData) {
    const { score, emoji, color } = scoreData;
    // Map score (0-100) to rotation (-90deg to 90deg)
    const rotation = (score / 100) * 180 - 90;

    const modalContent = document.querySelector('#sleep-modal .modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
                <div class="p-6 text-center">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your Sleep Score</h2>
                    
                    <div class="sleep-score-gauge mx-auto mb-6">
                        <div class="sleep-score-gauge-bg"></div>
                        <div class="sleep-score-gauge-fill" id="gauge-fill"></div>
                        <div class="sleep-score-gauge-cover">
                            <div class="sleep-score-gauge-value" id="gauge-value" style="color: ${color}">${score}</div>
                            <div class="sleep-score-gauge-emoji">${emoji}</div>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 dark:text-gray-400 mb-6">
                        ${score >= 80 ? 'Excellent sleep! You should feel well-rested.' : (score >= 60 ? 'Good sleep. A solid night!' : 'Looks like a rough night. Try to rest more if you can.')}
                    </p>
                    
                    <button id="close-sleep-modal-btn" class="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-2xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Done</button>
                </div>
            `;

    // Animate the gauge
    setTimeout(() => {
        const gaugeFill = document.getElementById('gauge-fill');
        if (gaugeFill) {
            gaugeFill.style.transform = `rotate(${rotation}deg)`;
            gaugeFill.style.backgroundColor = color;
        }
    }, 100);
}

function renderSleepTrackerBox() {
    let contentHTML = '';
    if (todaySleep) {
        const { score, emoji, color } = calculateSleepScore(todaySleep.hoursSlept, todaySleep.timesAwoke);
        contentHTML = `
                    <div class="text-center">
                        <div class="text-6xl mb-3">${emoji}</div>
                        <div class="text-4xl font-bold" style="color: ${color}">${score} <span class="text-lg text-gray-500 dark:text-gray-400">/ 100</span></div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">${todaySleep.hoursSlept} hrs · ${todaySleep.timesAwoke} wake-ups</p>
                        <button id="main-sleep-track-btn" class="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Edit Today's Sleep</button>
                    </div>
                `;
    } else {
        contentHTML = `
                    <div class="text-center">
                        <div class="text-6xl mb-4">🌙</div>
                        <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">No Sleep Data</h4>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Track your sleep to see your score.</p>
                        <button id="main-sleep-track-btn" class="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl">Track Sleep</button>
                    </div>
                `;
    }

    return `
                <div id="sleep-tracker" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 300ms;">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6">Today's Sleep</h3>
                    ${contentHTML}
                </div>
            `;
}

function renderSleepChart(data) {
    return `<div class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-5 sm:p-6 h-84 slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 350ms;"><h3 class="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">Last 30 Days Sleep</h3><div class="w-full h-68 relative" id="sleep-chart-container-wrapper"></div></div>`;
}
// ===== 4) Render Functions =====
function renderLoadingScreen() {

    appRoot.innerHTML = `
                <div class="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-50 to-rose-50 dark:from-gray-900 dark:to-gray-950 p-4">
                    <div class="text-center space-y-3 scale-in">
                        <div class="flex justify-center items-center text-3xl font-bold text-gray-800 dark:text-gray-200 gap-3">
                           <svg class="w-10 h-10 text-indigo-500" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.5 16.5H14.5L12 13.25L9.5 16.5H7.5L11 12.25V7.5H13V12.25L16.5 16.5Z"/>
                            </svg>
                            <span class="text-4xl">YouthMind</span>
                        </div>
                        <div class="flex justify-center pt-2">
                            <div class="w-8 h-8 border-4 border-t-transparent border-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    </div>
                </div>`;
}
// ===== NEW SITE TOUR FUNCTIONS =====
function renderSiteTour() {
    const tourOverlay = document.createElement('div');
    tourOverlay.id = 'tour-overlay';
    tourOverlay.className = 'tour-overlay';
    document.body.appendChild(tourOverlay);

    const stepData = cons.TOUR_STEPS[currentTourStep];
    const targetElement = document.querySelector(stepData.selector);

    const stepElement = document.createElement('div');
    stepElement.id = 'tour-step-element';
    stepElement.className = 'tour-step';
    stepElement.innerHTML = `
        <h3 class="text-lg font-bold mb-2">${stepData.title}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${stepData.text}</p>
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-500">${currentTourStep + 1} / ${cons.TOUR_STEPS.length}</span>
            <div>
                ${currentTourStep > 0 ? '<button id="tour-prev-btn" class="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 mr-2">Previous</button>' : ''}
                <button id="tour-next-btn" class="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                    ${currentTourStep === cons.TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(stepElement);

    // Position step and highlight
    if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.classList.add('tour-highlight');

        const targetRect = targetElement.getBoundingClientRect();
        const stepRect = stepElement.getBoundingClientRect();

        // Position step relative to target (adjust logic as needed)
        let top = targetRect.bottom + 15;
        let left = targetRect.left + (targetRect.width / 2) - (stepRect.width / 2);

        // Adjust if out of bounds
        if (top + stepRect.height > window.innerHeight) {
            top = targetRect.top - stepRect.height - 15;
        }
        if (left < 10) left = 10;
        if (left + stepRect.width > window.innerWidth - 10) {
            left = window.innerWidth - stepRect.width - 10;
        }
        if (top < 10) top = 10; // Prevent going off top

        stepElement.style.top = `${top}px`;
        stepElement.style.left = `${left}px`;
    } else {
        // Fallback positioning if target not found (e.g., center screen)
        stepElement.style.top = '50%';
        stepElement.style.left = '50%';
        stepElement.style.transform = 'translate(-50%, -50%)';
        console.warn("Tour target element not found:", stepData.selector);
    }


    // Make visible with animation
    requestAnimationFrame(() => {
        tourOverlay.classList.add('visible');
        stepElement.classList.add('visible');
    });

    // Add listeners for buttons
    const nextBtn = document.getElementById('tour-next-btn');
    const prevBtn = document.getElementById('tour-prev-btn');
    if (nextBtn) nextBtn.addEventListener('click', nextTourStep);
    if (prevBtn) prevBtn.addEventListener('click', prevTourStep);
    // Allow clicking outside to end tour
    tourOverlay.addEventListener('click', endTour);
}

function clearTourStep() {
    const overlay = document.getElementById('tour-overlay');
    const stepElement = document.getElementById('tour-step-element');
    const highlighted = document.querySelector('.tour-highlight');

    if (overlay) overlay.remove();
    if (stepElement) stepElement.remove();
    if (highlighted) highlighted.classList.remove('tour-highlight');
}

function startTour() {
    if (isTourActive) return;
    isTourActive = true;
    currentTourStep = 0;
    renderSiteTour();
}

function nextTourStep() {
    clearTourStep();
    if (currentTourStep < cons.TOUR_STEPS.length - 1) {
        currentTourStep++;
        renderSiteTour();
    } else {
        endTour();
    }
}

function prevTourStep() {
    clearTourStep();
    if (currentTourStep > 0) {
        currentTourStep--;
        renderSiteTour();
    }
}

async function endTour() {
    if (!isTourActive) return;
    isTourActive = false;
    clearTourStep();
    // Mark tour as completed in Firestore
    if (user && !profile.hasCompletedTour) {
        try {
            const userPath = `artifacts/${cons.appId}/users/${user.uid}`;
            await updateDoc(doc(db, userPath), { hasCompletedTour: true });
            profile.hasCompletedTour = true; // Update local profile
            console.log("Tour marked as completed for user.");
        } catch (error) {
            console.error("Error marking tour as completed:", error);
        }
    }
}
// ===== END SITE TOUR FUNCTIONS =====
function renderAuthCard(error = "", notice = "", loading = false, mode = 'signin') {
    appRoot.innerHTML = `<div class="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-50 via-white to-rose-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4"><div id="auth-card" class="max-w-md w-full mx-auto bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg p-6 sm:p-8 space-y-6 fade-in"><div class="text-center"><div class="inline-flex items-center justify-center gap-3"><svg class="w-9 h-9 text-indigo-500" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.5 16.5H14.5L12 13.25L9.5 16.5H7.5L11 12.25V7.5H13V12.25L16.5 16.5Z"/></svg><h1 class="text-3xl font-bold text-gray-800 dark:text-gray-200">YouthMind</h1></div><p class="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">Your friendly pocket counsellor 💬</p></div><div class="flex justify-center gap-2 text-sm">
             
             <button id="mode-signin" class="px-4 py-1.5 rounded-full font-semibold transition-all ${mode === 'signin' ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}">Sign in</button>
             <button id="mode-signup" class="px-4 py-1.5 rounded-full font-semibold transition-all ${mode === 'signup' ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}">Sign up</button>
             
             </div><form id="auth-form" class="space-y-4">
             
             <div id="name-field-container" class="${mode === 'signup' ? '' : 'hidden'}"><input class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 transition-shadow focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" placeholder="Your name" name="name" /></div>
             
             <input class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 transition-shadow focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" type="email" placeholder="email@address.com" name="email" required /><input class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 transition-shadow focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" type="password" placeholder="password" name="password" required />${error ? `<div class="text-sm text-red-600 dark:text-red-400 text-center">${error}</div>` : ''}${notice ? `<div class="text-sm text-green-700 dark:text-green-400 text-center">${notice}</div>` : ''}
             
             <button type="submit" ${loading ? 'disabled' : ''} class="w-full bg-indigo-600 dark:bg-indigo-500 text-white font-semibold rounded-xl py-2.5 hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-[0.98] transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">${loading ? `<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Please wait...` : (mode === 'signin' ? 'Sign in' : 'Create account')}</button>
             
             </form>
             
             ${mode === 'signin' ? `
             <div id="forgot-password-container" class="text-center text-sm">
                 <button type="button" id="forgot-password-btn" class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Forgot Password?</button>
             </div>` : ''}

             <div class="flex items-center my-2">
                 <div class="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                 <span class="mx-4 text-xs font-semibold text-gray-500 dark:text-gray-400">OR</span>
                 <div class="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
             </div>

             <button id="google-signin-btn" class="w-full bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                 <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.1 6.25C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v8.51h12.8c-.57 2.73-2.2 5.08-4.79 6.69l7.7 6C42.91 38.08 46.98 32.07 46.98 24.55z"></path><path fill="#FBBC05" d="M10.66 28.72c-.76-2.29-1.19-4.74-1.19-7.22s.43-4.93 1.2-7.22l-8.1-6.25C1.03 12.07 0 17.84 0 24c0 6.16 1.03 11.93 2.56 17.28l8.1-6.56z"></path><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.7-6c-2.15 1.45-4.92 2.3-8.19 2.3-6.26 0-11.57-4.22-13.47-9.91l-8.1 6.25C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                 Sign in with Google
             </button>
             
             <div class="text-[11px] text-gray-500 dark:text-gray-400 text-center">By continuing you agree this is supportive self-care and not a substitute for professional diagnosis or treatment.</div></div></div>`;
}

function renderAppShell() {
    appRoot.innerHTML = `<div id="app-background" class="theme-bg min-h-screen text-gray-800 dark:text-gray-200"><header class="sticky top-0 backdrop-blur-lg bg-white/70 dark:bg-gray-950/70 border-b border-gray-200/80 dark:border-gray-800/80 z-20"><div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between"><div class="flex items-center gap-3"><svg class="w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.5 16.5H14.5L12 13.25L9.5 16.5H7.5L11 12.25V7.5H13V12.25L16.5 16.5Z"/></svg><h1 class="font-bold text-xl text-gray-800 dark:text-gray-100">YouthMind<br><h4>Vers_1.2</h4></h1></div><div class="flex items-center gap-2 sm:gap-4 text-sm"><div class="relative"><button id="profile-btn" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"><div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg></div><span class="hidden sm:block">Hi, ${profile?.displayName || "Friend"}</span><svg class="w-4 h-4 transition-transform duration-200" id="profile-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button><div id="profile-dropdown" class="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 opacity-0 invisible transform scale-95 transition-all duration-200 z-50"><div class="p-4 border-b dark:border-gray-700"><div class="flex items-center gap-3"><div class="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
    
    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
</div><div><h3 class="font-semibold text-gray-900 dark:text-white">${profile?.displayName || "Friend"}</h3><p class="text-sm text-gray-500 dark:text-gray-400">${profile?.email || user?.email || "user@example.com"}</p></div></div></div><div class="py-2">
    <button id="profile-view-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
        <span>Profile</span>
    </button>
    <button id="weekly-report-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2z"></path></svg>
        <span>My Mood Report</span>
    </button>
    <button id="quiz-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>Mental Health Quiz</span>
    </button>
    <button id="events-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        <span>Events</span>
    </button>
    <button id="movie-player-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        <span>Motivational Movies</span>
    </button>
    <button id="breathing-exercise-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span class="truncate">Deep Breathing & Relaxation</span>
    </button>
    <button id="about-us-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>About Us</span>
    </button>
    <button id="delete-all-chats-btn" class="w-full px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        <span>Delete All Messages</span>
    </button>
    <button id="tts-toggle-btn" class="w-full px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
        <span>Auto Text-to-Speech</span>
        <span id="tts-status" class="${isAutoTTS ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'} text-xs font-bold ml-auto">${isAutoTTS ? 'ON' : 'OFF'}</span>
    </button>
    <button id="sign-out-btn" class="w-full px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        <span>Sign out</span>
    </button>
</header><main id="main-content" class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-in"></main>
                    <footer class="max-w-6xl mx-auto px-4 sm:px-6 pb-8 text-xs text-gray-500 dark:text-gray-400 text-center space-y-4">
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-left text-gray-600 dark:text-gray-400">
                            <div class="col-span-2 md:col-span-1">
                                <h4 class="font-bold text-sm text-white dark:text-gray-200">YouthMind</h4>
                                <p class="mt-1 text-white dark:text-gray-200">Your daily companion for mental wellness.</p>
                            </div>
                            <div><h5 class="font-semibold text-white dark:text-grey-200">Benefits</h5><ul class="mt-1 space-y-1 text-white dark:text-grey-200"><li>Your Personal Buddy</li><li>A Safe Space to Share</li><li>Track Your Journey</li><li>Mindful Activities</li><li>Avoid Self-Harm Convo</li></ul></div>
                            <div><h5 class="font-semibold  text-white dark:text-grey-200">Support</h5><ul class=" text-white dark:text-grey-200 mt-1 space-y-1"><li>Not a medical device</li><li>For emergencies in India dial 112</li></ul></div>
                             <div class="col-span-2 md:col-span-2 text-right">
                                <p class="font-semibold text-white dark:text-grey-200">Created by Team Prompt-O-nauts</p>
                                <p class="font-bold text-indigo-500">Made with love, for love.</p>
                            </div>
                        </div>
                        <div class="border-t border-gray-200 dark:border-gray-800 pt-4 text-center">
                           <button id="start-tour-btn" class="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Take a Tour</button>
                           <p class="text-white dark:text-grey-200">&copy; ${new Date().getFullYear()} YouthMind. All Rights Reserved.</p>
                        </div>
                    </footer>
                </div>`;
}
function renderAboutUsModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="about-us-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
            <div class="modal-content w-full max-w-4xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700 transform transition-all duration-300 scale-95 opacity-0">
                <!-- Header -->
                <div class="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                            <svg class="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.5 16.5H14.5L12 13.25L9.5 16.5H7.5L11 12.25V7.5H13V12.25L16.5 16.5Z"/>
                            </svg>
                        </div>
                        <h2 class="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">About YouthMind</h2>
                    </div>
                    <button id="close-about-modal" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                
                <!-- Content -->
                <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <div class="space-y-8">
                        <!-- Hero Section -->
                        <div class="text-center py-4">
                            <div class="inline-flex items-center justify-center p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl mb-4">
                                <span class="text-4xl">💚</span>
                            </div>
                            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Mental Wellness Reimagined</h3>
                            <p class="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                                YouthMind is an AI-powered mental health companion designed specifically for young adults in India, 
                                providing a safe, confidential space to express feelings and access mental well-being resources.
                            </p>
                        </div>
                        
                        <!-- Inspiration -->
                        <div class="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-5 rounded-2xl border border-cyan-100 dark:border-cyan-800/50 transition-all duration-300 hover:shadow-lg">
                            <h3 class="text-lg font-semibold text-cyan-800 dark:text-cyan-200 mb-3 flex items-center gap-2">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                                Inspiration & Vision
                            </h3>
                            <p class="text-gray-700 dark:text-gray-300">
                                Created for Google's GenAI Hackathon, YouthMind addresses the growing mental health challenges 
                                faced by young adults in India. We believe AI can provide accessible, immediate support to 
                                bridge the gap in mental health resources.
                            </p>
                        </div>
                        
                        <!-- Features Grid -->
                        <div>
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                                <svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                                Premium Features
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                ${[
            'AI-powered chat companion with emotional intelligence',
            'Daily mood tracking with visual analytics',
            'Interactive mood calendar & history',
            '30-day mood trend visualization',
            'Personalized music therapy based on mood',
            'Motivational video content library',
            'Guided deep breathing exercises',
            'Mental health assessment quizzes',
            'Direct counselor connections via WhatsApp',
            'Mental wellness events calendar',
            'Achievement badges & progress tracking',
            'Privacy-first design with data encryption',
            'AI based mood adapting theme feature',
            'Sleep tracking feature',
            'Complete tour of site for better understanding'

        ].map(feature => `
                                    <div class="feature-item flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 hover:-translate-y-0.5">
                                        <span class="text-green-500 mt-0.5">✓</span>
                                        <span class="text-gray-700 dark:text-gray-300">${feature}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- Creator Section -->
                        <div class="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-5 rounded-2xl border border-purple-100 dark:border-purple-800/50">
                            <h3 class="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-4 flex items-center gap-2">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                                Created With ❤️ by Team Prompt-O-nauts
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- Creator Info -->
                                <div class="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <div class="flex-shrink-0 w-14 h-14 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">PON</div>
                                    <div>
                                        <h4 class="font-semibold text-gray-900 dark:text-white">Team Prompt-O-nauts</h4>
                                        <p class="text-sm text-gray-600 dark:text-gray-400">Full Stack Developer & UI/UX Designer</p>
                                    </div>
                                </div>
                                
                                <!-- Links -->
                                <div class="space-y-3">
                                    <a href="https://www.linkedin.com/in/mudit-vij-233482238/" target="_blank" class="social-link group flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500">
                                        <div class="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                                            <svg class="w-5 h-5 text-blue-500 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                            </svg>
                                        </div>
                                        <span class="text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">LinkedIn Profile</span>
                                    </a>
                                    
                                    <a href="mailto:muditvij29@gmail.com" class="social-link group flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-md hover:border-red-500 dark:hover:border-red-500">
                                        <div class="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center group-hover:bg-red-500 transition-colors">
                                            <svg class="w-5 h-5 text-red-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                                            </svg>
                                        </div>
                                        <span class="text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">contact@Team Prompt-O-nauts.com</span>
                                    </a>
                                    
                                    <a href="https://github.com/muditvij" target="_blank" class="social-link group flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-md hover:border-gray-800 dark:hover:border-gray-400">
                                        <div class="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center group-hover:bg-gray-800 transition-colors">
                                            <svg class="w-5 h-5 text-gray-700 dark:text-gray-200 group-hover:text-white dark:group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                            </svg>
                                        </div>
                                        <span class="text-gray-700 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">GitHub Portfolio</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Call to Action -->
                        <div class="text-center pt-4">
                         <!--   <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Experience more innovative projects</p>-->
                          <!--  <a href="https://muditvij.github.io/mutv/" target="_blank" class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
                                </svg>
                                Visit My Portfolio
                            </a>-->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `)

    // Animate modal entrance
    setTimeout(() => {
        const modal = document.querySelector('.modal-content');
        if (modal) {
            modal.classList.remove('scale-95', 'opacity-0');
            modal.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
}
function renderAppContent(loading = false) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    mainContent.innerHTML = `
                <div class="mb-6 p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-center text-indigo-800 dark:text-indigo-200 slide-up">
                    <p class="text-lg font-medium">${cons.GREETINGS(profile?.displayName || "Friend")}</p>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 mb-8">
                 <div class="lg:col-span-5 space-y-6">
                        ${loading ? renderMoodPickerSkeleton() : renderMoodPicker()}
                        ${loading ? renderNotesSkeleton() : renderNotesSection()}
                        ${loading ? renderCalendarSkeleton() : renderCalendar(calendarMap)}
                    </div>
                    
                   <div class="lg:col-span-7 space-y-6">
    
    ${loading ? renderChatSkeleton() : renderChatBox()}

    
    <div class="slide-up" style="animation-delay: 200ms;">
         ${loading ? renderReminderSkeleton() : renderReminderCard()}
    </div>
</div>
                    </div> 

              
              <!--  <div class="mb-6 slide-up" style="animation-delay: 200ms;">
                    ${loading ? renderReminderSkeleton() : renderReminderCard()}
                </div>-->
                

               
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6">
                    <div class="w-full">
                        ${loading ? renderMusicPlayerSkeleton() : renderMusicPlayer()}
                    </div>
                    
                    <div class="w-full">
                        ${loading ? renderChartSkeleton() : renderMoodChart(chartData)}
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6">
                    <div class="w-full">
                        ${loading ? renderSleepTrackerSkeleton() : renderSleepTrackerBox()}
                    </div>
                    
                    <div class="w-full">
                        ${loading ? renderSleepChartSkeleton() : renderSleepChart(sleepChartData)}
                    </div>
                </div>
                
                <div class="mt-8">
                    ${renderCounselorSection()}
                </div>
                `;
    if (!loading) {
        updateChatMessages(chatMessages, false, false);
        renderNotes();
        // Draw the new sleep chart
        drawInteractiveSleepChart(sleepChartData);

    }
}
function renderMoodPicker() {
    const mainMoods = Object.keys(cons.FEELING_WHEEL);

    // Check if a mood is already selected today
    if (todayMood && todayMood.mainMood) {
        const mood = cons.FEELING_WHEEL[todayMood.mainMood];
        const subMood = todayMood.subMood;
        return `
            <div id="mood-picker" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 slide-up w-full overflow-hidden dark:border dark:border-gray-800 text-center">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">How you're feeling today:</h3>
                <div class="text-6xl my-4">${mood.emoji}</div>
                <h2 class="text-3xl font-bold" style="color: ${mood.color}">${todayMood.mainMood}</h2>
                <p class="text-lg text-gray-600 dark:text-gray-400">(${subMood})</p>
                <button id="edit-mood-btn" class="mt-6 w-full max-w-xs mx-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Change Mood</button>
            </div>
        `;
    }

    // Render the grid if no mood is selected
    return `
        <div id="mood-picker" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 slide-up w-full overflow-hidden dark:border dark:border-gray-800 relative">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200 text-center">How are you feeling today?</h3>
            
            <div class="mood-grid-container">
                ${mainMoods.map(moodName => {
        const mood = cons.FEELING_WHEEL[moodName];
        return `
                        <button class="mood-grid-button" data-mood="${moodName}" style="--slice-bg: ${mood.color}; --slice-text: #ffffff;">
                            <div class="emoji">${mood.emoji}</div>
                            <div class="label">${moodName}</div>
                        </button>
                    `;
    }).join('')}
            </div>

            <div id="sub-mood-pop-up" class="sub-mood-wheel">
                </div>
        </div>
    `;
}
// New function to render the notes section separately
function renderNotesSection() {
    return `
        <div id="notes-section" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 50ms;">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Today's Notes</h3>
            <div class="space-y-4">
                <div id="notes-list" class="space-y-3 max-h-48 overflow-y-auto">
                    </div>
                <div class="flex flex-col sm:flex-row gap-3">
                   <input id="note-input" class="flex-1 bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-2xl p-3 text-sm focus:ring-4 focus:ring-indigo-200 focus:ring-opacity-50 dark:text-white" placeholder="Add a note for today..."/>
                   <button id="add-note-btn" class="px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl">Add Note</button>
                </div>
            </div>
        </div>
    `;
}
// New skeleton for the notes section
function renderNotesSkeleton() {
    return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-3xl shadow-xl p-6 space-y-4"><div class="skeleton h-6 w-1/3"></div><div class="skeleton h-8 w-full"></div><div class="skeleton h-12 w-full"></div></div>`;
}
// ===== NEW Reminder Functions =====
function renderReminderCard() {
    // We'll populate reminders dynamically later
    const activeRemindersHTML = reminders.length > 0
        ? reminders.map((r, index) => renderSingleReminder(r, index)).join('')
        : `<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No active reminders set.</p>`;

    return `
        <div id="reminder-card" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 w-full overflow-hidden dark:border dark:border-gray-800">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Reminders ⏰</h3>
                <button id="add-reminder-btn" class="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                </button>
            </div>
            <div id="reminder-list" class="space-y-3 max-h-40 overflow-y-auto pr-2">
                ${activeRemindersHTML}
            </div>
           
            <audio id="reminder-alarm-sound" src="alarm.mp3" preload="auto"></audio>
        </div>
    `;
}

function renderSingleReminder(reminder, index) {
    const timeFormatted = formatTimeForDisplay(reminder.time);
    let displayText = '';
    let displayEmoji = '🔔';
    let frequencyText = reminder.frequency || 'Once'; // Default display

    // Format frequency text for display
    if (reminder.frequency === 'Custom Days' && reminder.customDays) {
        frequencyText = reminder.customDays.join(', ');
    } else if (reminder.frequency && reminder.frequency !== 'Once') {
         frequencyText = reminder.frequency; // Use stored value like 'Daily', 'Every Hour' etc.
    }

    switch(reminder.type) {
        // ... (keep existing switch cases for emoji and displayText) ...
         case 'Sleep':
            displayText = 'Time for bed!';
            displayEmoji = '😴';
            break;
        case 'Water':
            displayText = 'Stay hydrated!';
            displayEmoji = '💧';
            break;
        case 'Exercise':
            displayText = 'Time to move!';
            displayEmoji = '🏋️‍♂️';
            break;
        case 'Custom':
        default:
            displayText = reminder.customText || 'Reminder';
            displayEmoji = '📌';
            break;
    }

    return `
        <div class="reminder-item flex items-center justify-between gap-3 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg fade-in">
            <div class="flex items-center gap-3 overflow-hidden">
                <span class="text-xl">${displayEmoji}</span>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">${displayText}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${timeFormatted} <span class="opacity-70">(${frequencyText})</span></p>
                </div>
            </div>
            <button data-reminder-id="${reminder.id}" class="reminder-delete-btn flex-shrink-0 w-6 h-6 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 grid place-items-center transition-colors" aria-label="Delete reminder">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
            </button>
        </div>
    `;
}

function renderAddReminderModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="add-reminder-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
            <div class="modal-content w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Set a New Reminder</h2>
                    <button id="close-add-reminder-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none" aria-label="Close">&times;</button>
                </div>
                <form id="add-reminder-form" class="p-6 space-y-5">
                  
                    <div>
                        <label for="reminder-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reminder Type</label>
                        <select id="reminder-type" name="reminderType" class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" required>
                            <option value="Water">💧 Water Intake</option>
                            <option value="Exercise">🏋️‍♂️ Exercise</option>
                            <option value="Sleep">😴 Sleep / Bedtime</option>
                            <option value="Custom">📌 Custom</option>
                        </select>
                    </div>

                    <div id="custom-text-container" class="hidden">
                        <label for="reminder-custom-text" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reminder Note</label>
                        <input type="text" id="reminder-custom-text" name="customText"
                               class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                               placeholder="e.g., Take medication">
                    </div>

                    <div>
                        <label for="reminder-time" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Time</label>
                        <input type="time" id="reminder-time" name="reminderTime"
                               class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" required>
                    </div>

                    <div id="frequency-section">
                        <label for="reminder-frequency" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frequency</label>
                        <select id="reminder-frequency" name="reminderFrequency" class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" required>
                            {/* Options will be added dynamically by JS */}
                        </select>
                    </div>

                    <div id="custom-days-container" class="hidden">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Days</label>
                        <div class="grid grid-cols-4 gap-2 text-center text-xs">
                            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
                                <div>
                                    <input type="checkbox" id="day-${day}" name="customDays" value="${day}" class="hidden peer">
                                    <label for="day-${day}" class="block py-2 px-1 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer peer-checked:bg-indigo-100 peer-checked:border-indigo-500 peer-checked:text-indigo-700 dark:peer-checked:bg-indigo-900/50 dark:peer-checked:border-indigo-500 dark:peer-checked:text-indigo-300">${day}</label>
                                </div>`).join('')}
                        </div>
                    </div>


                    <div class="pt-2">
                        <button type="submit" class="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl">
                            Set Reminder
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `);

    // --- NEW: Dynamic Frequency Options Logic ---
    const typeSelect = document.getElementById('reminder-type');
    const customTextContainer = document.getElementById('custom-text-container');
    const customTextInput = document.getElementById('reminder-custom-text');
    const frequencySelect = document.getElementById('reminder-frequency');
    const customDaysContainer = document.getElementById('custom-days-container');

    
    function updateFrequencyOptions() {
        const selectedType = typeSelect.value;
        const options = cons.frequencyOptions[selectedType] || [];
        frequencySelect.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');

        // Show/hide Custom Text based on Type
        if (selectedType === 'Custom') {
            customTextContainer.classList.remove('hidden');
            customTextInput.required = true;
        } else {
            customTextContainer.classList.add('hidden');
            customTextInput.required = false;
            customTextInput.value = '';
        }
        updateCustomDaysVisibility(); // Also update days visibility
    }

    function updateCustomDaysVisibility() {
        // Show/hide Custom Days based on Frequency selection
        if (frequencySelect.value === 'Custom Days') {
            customDaysContainer.classList.remove('hidden');
        } else {
            customDaysContainer.classList.add('hidden');
            // Uncheck all days when hiding
            document.querySelectorAll('#custom-days-container input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
    }

    typeSelect.addEventListener('change', updateFrequencyOptions);
    frequencySelect.addEventListener('change', updateCustomDaysVisibility);

    // Initialize options for the default selected type
    updateFrequencyOptions();
    // --- END NEW Logic ---
}

function renderReminderNotificationModal(reminder) {
    let displayText = '';
    let displayEmoji = '🔔';

    switch(reminder.type) {
        case 'Sleep':
            displayText = 'Time for bed!'; displayEmoji = '😴'; break;
        case 'Water':
            displayText = 'Stay hydrated!'; displayEmoji = '💧'; break;
        case 'Exercise':
            displayText = 'Time to move!'; displayEmoji = '🏋️‍♂️'; break;
        case 'Custom': default:
            displayText = reminder.customText || 'Reminder Time!'; displayEmoji = '📌'; break;
    }
    const timeFormatted = formatTimeForDisplay(reminder.time);

    // Remove existing notification modal if present
    document.getElementById('reminder-notification-modal')?.remove();

    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="reminder-notification-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-[200]">
            <div class="modal-content w-full max-w-sm bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-300 scale-95 opacity-0">
                <div class="p-8 text-center">
                    <div class="text-7xl mb-6 animate-bounce">${displayEmoji}</div>
                    <h2 class="text-3xl font-bold mb-2">${displayText}</h2>
                    <p class="text-lg opacity-80 mb-8">${timeFormatted}</p>
                    <button id="close-reminder-notification" class="w-full px-6 py-3 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-2xl hover:bg-white/30 active:scale-95 transition-all">
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    `);

    // Play sound
    const alarmSound = document.getElementById('reminder-alarm-sound');
    if (alarmSound) {
        alarmSound.currentTime = 0; // Rewind in case it's already playing
        alarmSound.play().catch(e => console.warn("Alarm sound autoplay failed:", e));
    }

    // Animate modal entrance
    setTimeout(() => {
        const modal = document.querySelector('#reminder-notification-modal .modal-content');
        if (modal) {
            modal.classList.remove('scale-95', 'opacity-0');
            modal.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
}

function renderReminderSkeleton() {
    return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-3xl shadow-xl p-6 space-y-4"><div class="skeleton h-6 w-1/3"></div><div class="skeleton h-10 w-full"></div><div class="skeleton h-10 w-full"></div></div>`;
}
// ===== NEW Day Rating & Report Functions =====


function renderEveningCheckinBanner() {
    // Check if it's evening time (6 PM to 11:59 PM)
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    // Convert to minutes since midnight for easier comparison
    const currentTimeInMinutes = currentHour * 60 + currentMinutes;
    const eveningStart = 18 * 60; // 6:00 PM = 1080 minutes
    const eveningEnd = 23 * 60 + 59; // 11:59 PM = 1439 minutes
    
    // Only show if it's evening time AND user hasn't already rated today
    if (currentTimeInMinutes >= eveningStart && currentTimeInMinutes <= eveningEnd && !todayDayRating) {
        const popupHTML = `
        <div id="evening-popup-banner" class="evening-popup fixed bottom-0 left-0 right-0 sm:bottom-20 sm:left-5 sm:right-auto sm:w-auto sm:max-w-md p-4 sm:rounded-lg shadow-2xl bg-white dark:bg-gray-800 border-t sm:border dark:border-gray-700 flex items-center justify-between pointer-events-auto z-50">
            <div>
                <h4 class="font-semibold text-gray-800 dark:text-gray-200">Good Evening! 🌙</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">How was your day?</p>
            </div>
            <div class="flex gap-2 ml-4">
                <button id="close-evening-popup-btn" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Later</button>
                <button id="start-evening-checkin-btn" class="px-3 py-2 bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors flex-shrink-0">Rate Day</button>
            </div>
        </div>
    `;
        featureContainer.insertAdjacentHTML('beforeend', popupHTML);

        setTimeout(() => {
            const banner = document.getElementById('evening-popup-banner');
            if (banner) banner.remove();
        }, 15000); // Auto-dismiss after 15 seconds
    }
}

function renderEveningCheckinModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="day-rating-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
            <div class="modal-content day-rating-modal w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden flex flex-col" style="max-height: 90vh;">
                <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Rate Your Day</h2>
                    <button id="close-day-rating-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none" aria-label="Close">&times;</button>
                </div>
                
                <form id="day-rating-form" class="flex flex-col flex-1 overflow-hidden">
                    <div id="questions-container" class="flex-1 overflow-y-auto p-6 space-y-8">
                        ${cons.DAY_RATING_QUESTIONS.map((q, index) => `
                            <div class="question-section space-y-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <h3 class="text-lg font-semibold text-center text-gray-800 dark:text-gray-200">${q.text}</h3>
                                
                                <div class="space-y-4">
                                    <div class="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 px-2">
                                        <span class="text-xs">${q.emojis[0]}</span>
                                        <span class="text-xs">${q.emojis[1]}</span>
                                        <span class="text-xs">${q.emojis[2]}</span>
                                        <span class="text-xs">${q.emojis[3]}</span>
                                        <span class="text-xs">${q.emojis[4]}</span>
                                    </div>
                                    
                                    <input type="range" 
                                           id="rating-slider-${q.id}" 
                                           name="${q.id}" 
                                           min="1" 
                                           max="5" 
                                           value="3" 
                                           class="rating-slider w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer">
                                    
                                    <div class="text-center text-4xl">
                                        <span id="rating-emoji-${q.id}" class="rating-emoji transition-transform duration-200 dark:text-white">${q.emojis[2]}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="p-6 pt-4 border-t dark:border-gray-700 flex-shrink-0">
                        <button type="submit" class="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            Submit Day Rating
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `);

    // Add listeners for sliders
    cons.DAY_RATING_QUESTIONS.forEach((q) => {
        const slider = document.getElementById(`rating-slider-${q.id}`);
        const emoji = document.getElementById(`rating-emoji-${q.id}`);
        
        if (slider && emoji) {
            slider.addEventListener('input', () => {
                const value = parseInt(slider.value, 10); // 1-5
                emoji.textContent = q.emojis[value - 1];
                emoji.style.transform = `scale(${1 + (value * 0.1)})`;
            });
        }
    });

    // Form submission - ADD THIS INSIDE THE FUNCTION
    const form = document.getElementById('day-rating-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
            `;

            try {
                const formData = new FormData(form);
                const ratingData = {
                    overall: parseInt(formData.get('overall'), 10),
                    productivity: parseInt(formData.get('productivity'), 10),
                    social: parseInt(formData.get('social'), 10),
                    selfCare: parseInt(formData.get('selfCare'), 10),
                    createdAt: serverTimestamp()
                };

                const id = dateId();
                const ratingPath = `artifacts/${cons.appId}/dayRatings/${user.uid}/days`;
                
                await setDoc(doc(db, ratingPath, id), ratingData, { merge: true });
                todayDayRating = ratingData;
                
                // Show success state
                submitBtn.innerHTML = `
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Saved Successfully!
                `;
                submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.add('bg-green-500', 'hover:bg-green-600');
                
                // Close modal after successful submission
                setTimeout(() => {
                    document.getElementById('day-rating-modal')?.remove();
                }, 1500);
                
            } catch (error) {
                console.error("Error saving day rating:", error);
                
                // Show error state
                submitBtn.innerHTML = `
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    Failed to Save
                `;
                submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.add('bg-red-500', 'hover:bg-red-600');
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                    submitBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
                    submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                }, 2000);
                
                alert("Could not save your day rating. Please try again.");
            }
        });
    }

    // Close modal listener
    const closeBtn = document.getElementById('close-day-rating-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('day-rating-modal')?.remove();
        });
    }
}
async function renderWeeklyReportModal() {
    // 1. Add D3.js script to the page if it's not already there
    if (!document.getElementById('d3-script')) {
        const script = document.createElement('script');
        script.id = 'd3-script';
        script.src = 'https://d3js.org/d3.v7.min.js';
        document.head.appendChild(script);
        // We need to wait for it to load
        await new Promise((resolve) => script.onload = resolve);
    }

    // 2. Render the modal shell
    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="weekly-report-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-[60] ">
            <div class="modal-content w-full max-w-4xl bg-white dark:bg-gray-500 rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
                <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0">
<h2 class="text-2xl font-bold text-gray-900 dark:text-black">Your Weekly Report</h2>                    <button id="close-weekly-report-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-3xl leading-none cursor-pointer">&times;</button>
                </div>
                <div id="weekly-report-content" class="overflow-y-auto flex-grow p-6 space-y-6">
                    <!-- Loading State -->
                    <div class="flex flex-col items-center justify-center h-64">
                        <div class="w-12 h-12 border-4 border-t-transparent border-indigo-500 rounded-full animate-spin"></div>
                        <p class="mt-4 text-gray-600 dark:text-gray-600">Generating your weekly insights...</p>
                    </div>
                </div>
            </div>
        </div>
    `);

    // 3. Fetch data and render content
    try {
        const reportData = await fetchWeeklyReportData();
        if (reportData.totalEntries === 0) {
            document.getElementById('weekly-report-content').innerHTML = `
                <div class="report-section text-center p-12">
                    <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300">No Data Yet!</h3>
                    <p class="text-gray-500 dark:text-gray-400 mt-2">Start tracking your mood or rating your day to see your weekly report here.</p>
                </div>
            `;
        } else {
            renderWeeklyReportContent(reportData);
        }
    } catch (error) {
        console.error("Error generating report:", error);
        document.getElementById('weekly-report-content').innerHTML = `<p class="text-red-500 p-6">Could not load report. Please try again.</p>`;
    }
}

function renderWeeklyReportContent(data) {
    const contentEl = document.getElementById('weekly-report-content');
    if (!contentEl) return;

    // Calculate average mood score
    const avgMoodScore = data.moodData.reduce((acc, d) => acc + d.score, 0) / data.moodData.length;
    const avgMood = cons.MOODS.find(m => m.score === Math.round(avgMoodScore)) || cons.MOODS[2];
    
    // Calculate average day ratings
    const avgOverall = (data.dayRatingData.reduce((acc, d) => acc + d.overall, 0) / data.dayRatingData.length).toFixed(1);
    
    contentEl.innerHTML = `
        <!-- Header -->
        <div class="report-section text-center">
            <p class="text-sm font-semibold text-indigo-500 dark:text-indigo-400">Weekly Summary</p>
<h3 class="text-3xl font-bold text-gray-900 dark:text-gray-900 mt-2">${data.moodData.length > 0 ? `You had a ${avgMood.label} week` : 'Your Week at a Glance'}</h3>            <p class="text-gray-600 dark:text-gray-400 mt-2 max-w-lg mx-auto">
                You tracked ${data.moodData.length} mood(s) and rated ${data.dayRatingData.length} day(s). Your average day rating was <span class="font-bold">${avgOverall} / 5</span>.
            </p>
        </div>

        <!-- Mood Trend Chart -->
        <div class="report-section">
            <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-900 mb-4">Weekly Mood Trend</h4>
            <div id="weekly-mood-chart" class="weekly-chart w-full h-64"></div>
        </div>
        
        <!-- Day Rating Radar Chart -->
        ${data.dayRatingData.length > 0 ? `
        <div class="report-section">
            <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-900 mb-4">Daily Averages</h4>
            <div id="weekly-radar-chart" class="radar-chart w-full h-64 flex justify-center"></div>
        </div>
        ` : ''}

        <!-- AI Insights (TODO) -->
        <div class="report-section">
            <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-900 mb-2">Key Insight</h4>
            <p class="text-gray-600 dark:text-gray-900">
                It looks like your mood was highest on <span class="font-bold">${data.highestMood.day} (${data.highestMood.label})</span>
                and lowest on <span class="font-bold">${data.lowestMood.day} (${data.lowestMood.label})</span>.
                Your productivity and social ratings seem to move together.
            </p>
        </div>
    `;

    // Call D3 functions to draw charts
    drawWeeklyMoodChart(data.moodData, '#weekly-mood-chart');
    if (data.dayRatingData.length > 0) {
        drawWeeklyActivityRadar(data.avgRatings, '#weekly-radar-chart');
    }
}

// Helper to format time (e.g., "14:30" -> "02:30 PM")
function formatTimeForDisplay(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12; // Convert hour 0 to 12
    return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
}
// Helper to get start of the week (Sunday)
function getStartOfWeek(date = new Date()) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay()); // Go back to Sunday
    d.setHours(0, 0, 0, 0); // Set to start of the day
    return d;
}
function renderBreathingModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
        <div id="breathing-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
            <div class="modal-content w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Deep Breathing Exercise</h2>
                    <button id="close-breathing-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                </div>
                <div class="p-6 text-center">
                    <div id="breathing-container" class="relative w-64 h-64 mx-auto mb-6">
                        <div id="breathing-circle" class="absolute inset-0 bg-indigo-500 rounded-full opacity-20 transform scale-50 transition-all duration-700 ease-in-out"></div>
                        <div id="breathing-text" class="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-800 dark:text-gray-200">Ready?</div>
                    </div>
                    <p id="breathing-instruction" class="text-gray-600 dark:text-gray-400 mb-6">Take a moment to relax and focus on your breathing</p>
                    <button id="start-breathing-btn" class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors">Start Breathing</button>
                    <button id="more-breathing-btn" class="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors hidden mt-3">More Breaths?</button>
                </div>
            </div>
        </div>
    `)

    // Add event listeners for the breathing modal
    document.getElementById('close-breathing-modal').addEventListener('click', closeBreathingModal);
    document.getElementById('start-breathing-btn').addEventListener('click', startBreathingExercise);
    document.getElementById('more-breathing-btn').addEventListener('click', startBreathingExercise);
}
function renderNotes() {
    const notesListEl = document.getElementById('notes-list');
    if (!notesListEl) return;
    const notes = todayMood?.notes || [];
    notesListEl.innerHTML = notes.map((note, index) => `
                <div class="note-item flex items-center gap-3 bg-gray-100 dark:bg-gray-800 p-2.5 rounded-lg fade-in">
                    <p class="text-sm flex-grow">${note}</p>
                     <button data-note-index="${index}" class="note-delete-btn flex-shrink-0 w-6 h-6 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 grid place-items-center transition-colors">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
                    </button>
                </div>
            `).join('');
}

function renderCalendar(items) {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const startDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(startDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
    const scoreToEmoji = (score) => cons.MOODS.find(m => m.score === score)?.emoji || '·';

    return `
                <div class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-6 sm:p-8 slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 100ms;">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                        <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">This Month</h3>
                        <span class="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">${now.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                    </div>
                    <div class="grid grid-cols-7 gap-2 text-center text-sm text-gray-500 dark:text-gray-400 font-bold mb-4">
                        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="py-2">${d}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-7 gap-2">
                        ${cells.map(d => {
        const id = d ? dateId(new Date(year, month, d)) : null;
        const dayData = id ? items[id] : undefined;
        const emoji = dayData?.emoji || '·';
        return `
                                <div class="h-14 rounded-xl flex items-center justify-center ${d ? 'border-2 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105 cursor-pointer' : ''}">
                                    ${d ? `<div class="flex flex-col items-center leading-tight"><span class="text-xs text-gray-400 dark:text-gray-500 mb-1 font-medium">${d}</span><span class="text-xl">${emoji}</span></div>` : ''}
                                </div>`;
    }).join('')}
                    </div>
                </div>`;
}

function renderChatBox() {
    // Define some chat starter prompts
    const starterPrompts = [
        "How can I feel more positive today?",
        "Tell me a funny joke!",
        "Feeling a bit stressed about exams...",
        "What's a good way to relax?",
        "I just want to vent for a minute.",
    ];

    return `
                 <div id="chat-box" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl flex flex-col slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 150ms; min-height: 700px; max-height: 90vh; resize: both; overflow: hidden;">
                    <div id="chat-alert-box"></div>
                    <div id="chat-messages" class="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
                        {/* */}
                        <div id="chat-starters" class="chat-starters-container">
                             <div class="text-6xl mb-6">👋</div>
                             <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Start a Conversation</h3>
                             <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Click a suggestion below or type anything!</p>
                             <div class="w-full max-w-sm">
                                ${starterPrompts.map(prompt => `
                                    <button class="chat-starter-button">${prompt}</button>
                                `).join('')}
                             </div>
                        </div>
                    </div>
                  <div class="p-4 sm:p-6 border-t-2 border-gray-200 dark:border-gray-800 flex gap-2 sm:gap-3 items-center flex-shrink-0">
                        <input id="chat-input" class="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-transparent rounded-2xl px-4 sm:px-6 py-3 text-base focus:ring-4 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white transition-all" placeholder="Say anything..." />

                        <button id="voice-input-btn" aria-label="Use voice input" class="p-3 sm:p-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 transition-all">
                            <svg class="w-5 h-5 sm:w-6 sm:h-6" id="mic-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zM4 10a1 1 0 00-1 1v1a6 6 0 1012 0v-1a1 1 0 10-2 0v1a4 4 0 11-8 0v-1a1 1 0 00-1-1z"></path>
                            </svg>
                           <svg class="w-5 h-5 sm:w-6 sm:h-6 hidden animate-pulse" id="mic-listening-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zM4 10a1 1 0 00-1 1v1a6 6 0 1012 0v-1a1 1 0 10-2 0v1a4 4 0 11-8 0v-1a1 1 0 00-1-1z"></path>
                            </svg>
                        </button>

                        <button id="chat-send-btn" aria-label="Send message" class="p-3 sm:p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg hover:shadow-xl">
                            <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>

          </button>
                    </div>
                </div>`;
}

function renderMusicPlayer() {
    const currentMoodData = cons.MOODS.find(m => m.label === currentMusicCategory);
    const trackCount = MUSIC_CATEGORIES[currentMusicCategory]?.length || 0;
    const assignment = cons.MUSIC_TRACK_ASSIGNMENTS[currentMusicCategory];

    return `
                <div id="music-player" class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-2xl shadow-lg p-4 slide-up dark:border dark:border-gray-800" style="animation-delay: 200ms;">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-12c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"></path></svg>
                            </div>
                            <div>
                                <h4 class="font-semibold text-sm">Keep Shining ✨</h4>
                                <p id="track-name" class="text-xs text-gray-500 dark:text-gray-400 music-player-track">Soothing Sounds</p>
                                <div class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                    <span class="text-lg">${currentMoodData?.emoji}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-1 sm:gap-2">
                           <button id="shuffle-btn" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${isShuffled ? 'text-indigo-500' : 'text-gray-500'}">
                               <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 3zM3.055 6.333A.75.75 0 014 7.252v5.496l1.22-.813a.75.75 0 01.96 1.154l-2.25 1.5a.75.75 0 01-.96-.002l-2.25-1.5a.75.75 0 11.96-1.152l1.22.813V7.252a.75.75 0 01.945-.919zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm-4.945-8.667a.75.75 0 01.945.919V12.75l-1.22.813a.75.75 0 11-.96-1.152l2.25-1.5a.75.75 0 01.96-.002l2.25 1.5a.75.75 0 11-.96 1.154l-1.22-.813v-5.496a.75.75 0 01-.75-.919zM16.945 6.333a.75.75 0 01.75.919v5.496l1.22-.813a.75.75 0 11.96 1.154l-2.25 1.5a.75.75 0 01-.96-.002l-2.25-1.5a.75.75 0 11.96-1.152l1.22.813V7.252a.75.75 0 01.75-.919z" clip-rule="evenodd"></path></svg>
                           </button>
                           <button id="play-pause-btn" class="p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 active:scale-95 transition-all shadow-md">
                               <svg id="play-icon" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"></path></svg>
                               <svg id="pause-icon" class="w-5 h-5 hidden" fill="currentColor" viewBox="0 0 20 20"><path d="M5.75 4.5a.75.75 0 00-.75.75v10a.75.75 0 001.5 0V5.25A.75.75 0 005.75 4.5zm8.5 0a.75.75 0 00-.75.75v10a.75.75 0 001.5 0V5.25a.75.75 0 00-.75-.75z"></path></svg>
                           </button>
                           <button id="next-btn" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500">
                               <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M15.95 10.354a.75.75 0 000-1.06l-4.5-4.5a.75.75 0 10-1.06 1.06L14.06 9.25H4.75a.75.75 0 100 1.5h9.31l-3.67 3.67a.75.75 0 101.06 1.06l4.5-4.5z" clip-rule="evenodd"></path></svg>
                           </button>
                        </div>
                    </div>
                </div>`;
}

function renderCounselorSection() {
    return `
                <div class="mt-8 text-center slide-up" style="animation-delay: 300ms;">
                     <h2 class="text-2xl font-bold tracking-tight text-white dark:text-white sm:text-3xl">Ready to talk to someone?</h2>
                     <p class="mt-4 max-w-2xl mx-auto text-lg leading-8 text-white dark:text-gray-400">
                        It's okay to not be okay. Talking about your mental health is a sign of strength, not weakness. Our professional counselors are here to provide a safe, confidential space for you to explore your feelings.
                     </p>
                </div>
                <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 slide-up" style="animation-delay: 400ms;">
                    ${cons.COUNSELORS.map(c => `
                        <div class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-2xl shadow-lg p-6 text-center dark:border dark:border-gray-800">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${c.name}</h3>
                            <p class="text-sm text-indigo-500 dark:text-indigo-400 mt-1">${c.degree}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">${c.experience} of experience</p>
                             <a href="https://wa.me/${c.whatsapp}?text=${encodeURIComponent("Hello, I'd like to connect from YouthMind.")}" target="_blank" class="mt-4 inline-block w-full bg-green-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors">
                                Connect on WhatsApp (Free)
                            </a>
                        </div>
                    `).join('')}
                </div>
            `;
}

// ===== PROFILE MODAL FUNCTIONS =====
function renderProfileModal() {
    const userBadges = getUserBadges(profile, calendarMap, chatMessages);
    const joinDate = profile?.joinedAt ? new Date(profile.joinedAt.seconds * 1000).toLocaleDateString() : 'Recently';
    const totalMoods = Object.keys(calendarMap).length;
    const streakDays = calculateStreakDays(calendarMap);

    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="profile-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
                    <div class="modal-content w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-h-[90vh] overflow-hidden">
                        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Profile</h2>
                            <button id="close-profile-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-3xl leading-none cursor-pointer">&times;</button>
                        </div>
                        <div class="overflow-y-auto max-h-[calc(90vh-120px)]">
                            <div class="p-6 space-y-6">
                                <!-- Profile Header -->
                                <div class="text-center">
                                    <div class="w-24 h-24 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
</svg>
                                    </div>
                                    <h3 class="text-2xl font-bold text-gray-900 dark:text-white">${profile?.displayName || "Friend"}</h3>
                                    <p class="text-gray-500 dark:text-gray-400">${profile?.email || user?.email || "user@example.com"}</p>
                                    <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Member since ${joinDate}</p>
                                </div>

                                <!-- Stats -->
                                <div class="grid grid-cols-3 gap-4">
                                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${totalMoods}</div>
                                        <div class="text-sm text-gray-600 dark:text-gray-400">Moods Tracked</div>
                                    </div>
                                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div class="text-2xl font-bold text-green-600 dark:text-green-400">${streakDays}</div>
                                        <div class="text-sm text-gray-600 dark:text-gray-400">Day Streak</div>
                                    </div>
                                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">${userBadges.length}</div>
                                        <div class="text-sm text-gray-600 dark:text-gray-400">Badges Earned</div>
                                    </div>
                                </div>

                                <!-- Badges Section -->
                                <div>
                                    <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Achievement Badges</h4>
                                    <div class="badge-grid">
                                        ${userBadges.map(badge => `
                                            <div class="flex flex-col items-center p-4 bg-gradient-to-br ${badge.gradient} rounded-xl text-white text-center">
                                                <div class="text-3xl mb-2">${badge.emoji}</div>
                                                <div class="font-semibold text-sm">${badge.name}</div>
                                                <div class="text-xs opacity-90 mt-1">${badge.description}</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            `)
}

function renderEditProfileModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="edit-profile-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
                    <div class="modal-content w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
                        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Edit Username</h2>
                            <button id="close-edit-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                        </div>
                        <form id="edit-profile-form" class="p-6 space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Username</label>
                                <input type="text" id="edit-display-name" value="${profile?.displayName || ''}" placeholder="Enter your username" class="w-full bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" required>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">This will be displayed in the header and profile</p>
                            </div>
                            <div class="flex gap-3 pt-4">
                                <button type="button" id="cancel-edit-btn" class="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                                <button type="submit" class="flex-1 px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            `)
}

// ===== MOVIE PLAYER FUNCTIONS =====
function renderMoviePlayerModal() {
    const randomVideoId = cons.MOTIVATIONAL_VIDEOS[Math.floor(Math.random() * cons.MOTIVATIONAL_VIDEOS.length)];

    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="movie-player-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
                    <div class="modal-content w-full max-w-6xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-h-[95vh] overflow-hidden">
                        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Motivational Movie Scenes</h2>
                            <button id="close-movie-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-3xl leading-none cursor-pointer">&times;</button>
                        </div>
                        <div class="p-6 overflow-y-auto max-h-[calc(95vh-120px)] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800">
                            <!-- Custom Movie Player -->
                            <div class="relative bg-black rounded-xl overflow-hidden shadow-2xl mb-6" style="padding-bottom: 56.25%; height: 0;">
                             <iframe id="movie-iframe"
    src="https://www.youtube.com/embed/${randomVideoId}?rel=0&modestbranding=1&autohide=1&showinfo=0&enablejsapi=1"
    class="absolute top-0 left-0 w-full h-full border-0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="no-referrer-when-downgrade"
    allowfullscreen>
</iframe>
                                <!-- Custom Overlay Controls -->
                                <div class="absolute inset-0 pointer-events-none">
                                    <div class="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm font-medium">
                                        🎬 Motivational Scene
                                    </div>
                                    <div class="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm">
                                        <button id="next-video-btn" class="pointer-events-auto hover:text-indigo-400 transition-colors">
                                            Next Scene →
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Video Info and Controls -->
                            <div class="space-y-4">
                                <div class="text-center">
                                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Inspirational Movie Moments</h3>
                                    <p class="text-gray-600 dark:text-gray-400">Get motivated with powerful scenes from Bollywood and Hollywood movies</p>
                                </div>
                                
                                <!-- Quick Access Buttons -->
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <button class="video-category-btn px-4 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-700 transition-all transform hover:scale-105" data-category="bollywood">
                                        🎭 Bollywood
                                    </button>
                                    <button class="video-category-btn px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-105" data-category="hollywood">
                                        🎬 Hollywood
                                    </button>
                                    <button class="video-category-btn px-4 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-teal-700 transition-all transform hover:scale-105" data-category="sports">
                                        ⚽ Sports
                                    </button>
                                    <button class="video-category-btn px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-violet-700 transition-all transform hover:scale-105" data-category="random">
                                        🎲 Random
                                    </button>
                                </div>
                                
                                <!-- Playlist -->
                                <div>
                                    <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Suggested Videos</h4>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800 pr-2">
                                        ${cons.MOTIVATIONAL_VIDEOS.slice(0, 8).map((videoId, index) => `
                                            <button class="video-thumbnail-btn p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-left" data-video-id="${videoId}">
                                                <div class="flex items-center gap-3">
                                                    <div class="w-16 h-12 bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                                                        <svg class="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M8 5v10l8-5-8-5z"></path>
                                                        </svg>
                                                    </div>
                                                    <div class="flex-1 min-w-0">
                                                        <div class="font-medium text-gray-900 dark:text-white text-sm">Motivational Video</div>
                                                        <div class="text-xs text-gray-500 dark:text-gray-400">Click to play</div>
                                                    </div>
                                                </div>
                                            </button>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `)
}

// ===== EVENTS MODAL FUNCTION =====
function renderEventsModal() {
    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="events-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto z-50">
                    <div class="modal-content w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-h-[90vh] overflow-hidden">
                        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Upcoming Events</h2>
                            <button id="close-events-modal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-3xl leading-none cursor-pointer">&times;</button>
                        </div>
                        <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                ${cons.EVENTS_DATA.map(event => `
                                    <div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
                                        <div class="flex items-start justify-between mb-4">
                                            <div class="flex-1">
                                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">${event.title}</h3>
                                                <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                    <div class="flex items-center gap-1">
                                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                                        </svg>
                                                        ${event.date}
                                                    </div>
                                                    <div class="flex items-center gap-1">
                                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                        </svg>
                                                        ${event.time}
                                                    </div>
                                                </div>
                                            </div>
                                            <span class="px-3 py-1 text-xs font-semibold rounded-full ${getEventTypeColor(event.type)}">${event.type}</span>
                                        </div>
                                        <p class="text-gray-700 dark:text-gray-300 mb-4">${event.description}</p>
                                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            </svg>
                                            ${event.location}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `)
}

function getEventTypeColor(type) {
    const colors = {
        wellness: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        education: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        workshop: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        support: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
    };
    return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
}

// ===== HELPER FUNCTIONS =====
function getUserBadges(currentProfile, currentCalendarMap, currentChatMessages) {
    const badges = [];
    // Ensure data exists before trying to access properties
    const totalMoods = currentCalendarMap ? Object.keys(currentCalendarMap).length : 0;
    const streakDays = currentCalendarMap ? calculateStreakDays(currentCalendarMap) : 0; // Pass map
    const totalChatMessages = currentChatMessages ? currentChatMessages.length : 0;
    const joinDate = currentProfile?.joinedAt ? new Date(currentProfile.joinedAt.seconds * 1000) : new Date();

    // Mood tracking badges
    if (totalMoods >= 1) badges.push({ name: "First Step", emoji: "👣", description: "Tracked your first mood", gradient: "from-amber-400 to-amber-600" });
    if (totalMoods >= 7) badges.push({ name: "Week Warrior", emoji: "🗓️", description: "Tracked moods for 7 days", gradient: "from-lime-400 to-lime-600" });
    if (totalMoods >= 30) badges.push({ name: "Monthly Master", emoji: "📅", description: "Tracked moods for 30 days", gradient: "from-cyan-400 to-cyan-600" });
    if (totalMoods >= 90) badges.push({ name: "Quarterly Quest", emoji: "🧭", description: "Tracked moods for 90 days", gradient: "from-blue-400 to-blue-600" });
    // Streak badges
    if (streakDays >= 3) badges.push({ name: "Streak Starter", emoji: "🔥", description: "3-day mood streak", gradient: "from-orange-400 to-orange-600" });
    if (streakDays >= 7) badges.push({ name: "Weekly Flame", emoji: "🔥", description: "7-day mood streak", gradient: "from-red-400 to-red-600" });
    if (streakDays >= 14) badges.push({ name: "Fortnight Fire", emoji: "🔥", description: "14-day mood streak", gradient: "from-rose-400 to-rose-600" });
    if (streakDays >= 30) badges.push({ name: "Monthly Blaze", emoji: "🔥", description: "30-day mood streak", gradient: "from-fuchsia-500 to-fuchsia-700" });
    // Chat badges
    if (totalChatMessages >= 1) badges.push({ name: "Ice Breaker", emoji: "💬", description: "Started your first chat", gradient: "from-sky-400 to-sky-600" });
    if (totalChatMessages >= 10) badges.push({ name: "Chatterbox", emoji: "💬", description: "Had 10+ conversations", gradient: "from-indigo-400 to-indigo-600" });
    if (totalChatMessages >= 50) badges.push({ name: "Deep Diver", emoji: "🗣️", description: "Had 50+ conversations", gradient: "from-violet-400 to-violet-600" });
    // Specific Actions
    if (profile?.usedVoiceInput) badges.push({ name: "Voice Note", emoji: "🎤", description: "Used voice input", gradient: "from-teal-400 to-teal-600" });
    if (profile?.completedQuiz) badges.push({ name: "Quiz Whiz", emoji: "🧠", description: "Completed the check-in quiz", gradient: "from-emerald-400 to-emerald-600" });
    if (profile?.usedBreathing) badges.push({ name: "Breathe Easy", emoji: "🌬️", description: "Used the breathing exercise", gradient: "from-cyan-400 to-blue-500" });
    if (profile?.trackedSleep) badges.push({ name: "Night Owl", emoji: "🦉", description: "Tracked sleep data", gradient: "from-indigo-500 to-purple-600" });

    // Consistency badge (Example: checked in most days since joining, if joined > 7 days ago)
    const daysSinceJoined = (new Date() - joinDate) / (1000 * 60 * 60 * 24);
    if (daysSinceJoined > 7 && totalMoods / daysSinceJoined > 0.7) {
        badges.push({ name: "Consistent Check-in", emoji: "✅", description: "Regularly tracking your mood", gradient: "from-green-500 to-green-700" });
    }

    return badges;
}
function calculateStreakDays(currentCalendarMap) {
    if (!currentCalendarMap) return 0; // Guard against undefined map
    let streak = 0;
    const today = new Date();

    for (let i = 0; ; i++) { // Loop indefinitely until break
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const checkDateId = dateId(checkDate); // Use dateId helper

        if (currentCalendarMap[checkDateId] !== undefined) {
            streak++;
        } else {
            // If the first day (i=0) is missing, streak is 0. Otherwise, break.
            if (i === 0 && streak === 0) return 0;
            break;
        }
    }
    return streak;
}
// ===== NEW Badge Notification Check =====
function checkAndNotifyBadgeUpdate() {
    const currentBadges = getUserBadges(profile, calendarMap, chatMessages);
    const newBadgeCount = currentBadges.length;

    if (newBadgeCount > previousBadgeCount) {
        // Find the newly earned badges (simple check for now)
        const newBadgeNames = currentBadges.slice(previousBadgeCount).map(b => b.name).join(', ');
        showNotification(`✨ New Badge Earned! Check profile.`, false, true); // Pass true for badge style
        previousBadgeCount = newBadgeCount; // Update the count
    }
}
function renderMoodChart(data) {
    return `<div class="bg-white/80 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl shadow-xl p-5 sm:p-6 h-84 slide-up w-full overflow-hidden dark:border dark:border-gray-800" style="animation-delay: 250ms;"><h3 class="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">Last 30 Days</h3><div class="w-full h-68 relative" id="chart-container-wrapper"></div></div>`;
}

function drawInteractiveChart(data) {
    const wrapper = document.getElementById('chart-container-wrapper');
    if (!wrapper || !data) return;
    wrapper.innerHTML = '';

    const tooltip = document.createElement('div');
    tooltip.className = 'absolute z-10 p-3 text-xs rounded-lg shadow-lg bg-white dark:bg-gray-800 border dark:border-gray-700 transition-all duration-200 opacity-0 pointer-events-none';
    wrapper.appendChild(tooltip);

    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const margin = { top: 12, right: 8, bottom: 25, left: 60 };
    const plotWidth = rect.width - margin.left - margin.right;
    const plotHeight = rect.height - margin.top - margin.bottom;

    const moodLabels = ["Very Sad", "Sad", "Neutral", "Happy", "Happy ++"];
    const scoreToY = (score) => plotHeight - ((cons.MOODS.findIndex(m => m.score === score)) / (cons.MOODS.length - 1) * plotHeight);

    const validData = data.map((d, i) => d.score !== null ? { ...d, index: i } : null).filter(Boolean);
    const points = validData.map(d => ({
        x: (d.index / (data.length - 1 || 1)) * plotWidth + margin.left,
        y: scoreToY(d.score) + margin.top,
        data: d
    }));

    let animationFrameId;
    let currentHoverPoint = null;

    // Main draw function
    function draw(progress = 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid lines and labels
        moodLabels.forEach((label, index) => {
            const y = plotHeight - (index / (moodLabels.length - 1)) * plotHeight + margin.top;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + plotWidth, y);
            ctx.strokeStyle = isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = isDarkMode ? '#6b7280' : '#9ca3af';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(label, margin.left - 12, y + 4);
        });

        // Draw path and gradient
        if (points.length > 1) {
            ctx.save();
            const endPoint = points[Math.floor((points.length - 1) * progress)];
            ctx.beginPath();
            ctx.rect(0, 0, endPoint.x + 5, rect.height);
            ctx.clip();

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.quadraticCurveTo(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].x, points[points.length - 1].y);

            const lineStyle = isDarkMode ? "#a78bfa" : "#4f46e5";
            ctx.strokeStyle = lineStyle;
            ctx.lineWidth = 3;
            ctx.shadowColor = isDarkMode ? 'rgba(167, 139, 250, 0.5)' : 'rgba(79, 70, 229, 0.5)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;
            ctx.stroke();

            // Reset shadow for gradient fill
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
            gradient.addColorStop(0, isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(79, 70, 229, 0.3)');
            gradient.addColorStop(1, isDarkMode ? 'rgba(139, 92, 246, 0)' : 'rgba(79, 70, 229, 0)');

            ctx.lineTo(points[points.length - 1].x, rect.height - margin.bottom);
            ctx.lineTo(points[0].x, rect.height - margin.bottom);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.restore();
        }

        // Draw points
        points.forEach((p, i) => {
            if (p.x > points[Math.floor((points.length - 1) * progress)].x) return;

            const isHovered = currentHoverPoint === p;
            const radius = isHovered ? 6 : 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isDarkMode ? '#111827' : 'white';
            ctx.fill();
            ctx.strokeStyle = cons.MOODS.find(m => m.score === p.data.score)?.color || '#4f46e5';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    let startTime = null;
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const runtime = timestamp - startTime;
        const progress = Math.min(runtime / 800, 1);
        draw(progress);
        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    animationFrameId = requestAnimationFrame(animate);

    // Mouse move for tooltips
    canvas.addEventListener('mousemove', (e) => {
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        let foundPoint = null;
        for (const p of points) {
            const dist = Math.sqrt(Math.pow(p.x - mouseX, 2) + Math.pow(p.y - mouseY, 2));
            if (dist < 10) {
                foundPoint = p;
                break;
            }
        }

        if (foundPoint && currentHoverPoint !== foundPoint) {
            currentHoverPoint = foundPoint;
            draw(1); // Redraw to show hover effect
            const mood = cons.MOODS.find(m => m.score === foundPoint.data.score);
            let notesHTML = foundPoint.data.notes?.length > 0
                ? `<ul class="mt-1 space-y-1">${foundPoint.data.notes.map(n => `<li class="list-disc ml-3.5">${n}</li>`).join('')}</ul>`
                : '<p class="opacity-70 mt-1">No notes for this day.</p>';

            tooltip.innerHTML = `<div class="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><span style="color:${mood.color}">${mood.emoji}</span>${mood.label} (${foundPoint.data.date.slice(5)})</div>${notesHTML}`;
            tooltip.style.opacity = '1';

            const tooltipRect = tooltip.getBoundingClientRect();
            let left = foundPoint.x + 15;
            let top = foundPoint.y - 15;
            if (left + tooltipRect.width > rect.width) {
                left = foundPoint.x - tooltipRect.width - 15;
            }

            tooltip.style.transform = `translate(${left}px, ${top}px)`;
            canvas.style.cursor = 'pointer';
        } else if (!foundPoint && currentHoverPoint) {
            currentHoverPoint = null;
            draw(1); // Redraw to remove hover effect
            tooltip.style.opacity = '0';
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (currentHoverPoint) {
            currentHoverPoint = null;
            draw(1);
            tooltip.style.opacity = '0';
            canvas.style.cursor = 'default';
        }
    });
}
function drawInteractiveSleepChart(data) {
    const wrapper = document.getElementById('sleep-chart-container-wrapper');
    if (!wrapper || !data) return;
    wrapper.innerHTML = '';

    const tooltip = document.createElement('div');
    tooltip.className = 'absolute z-10 p-3 text-xs rounded-lg shadow-lg bg-white dark:bg-gray-800 border dark:border-gray-700 transition-all duration-200 opacity-0 pointer-events-none';
    wrapper.appendChild(tooltip);

    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const margin = { top: 12, right: 8, bottom: 25, left: 60 };
    const plotWidth = rect.width - margin.left - margin.right;
    const plotHeight = rect.height - margin.top - margin.bottom;

    // Y-axis for Score (0-100)
    const scoreToY = (score) => plotHeight - (score / 100) * plotHeight;
    // Y-axis for Hours (0-12)
    const hoursToY = (hours) => plotHeight - (hours / 12) * plotHeight;

    const validData = data.map((d, i) => d.score !== null ? { ...d, index: i } : null).filter(Boolean);

    const scorePoints = validData.map(d => ({
        x: (d.index / (data.length - 1 || 1)) * plotWidth + margin.left,
        y: scoreToY(d.score) + margin.top,
        data: d
    }));

    const hoursPoints = validData.map(d => ({
        x: (d.index / (data.length - 1 || 1)) * plotWidth + margin.left,
        y: hoursToY(d.hoursSlept) + margin.top,
        data: d
    }));

    let animationFrameId;
    let currentHoverPoint = null;

    // Helper to draw a line
    function drawLine(points, color, shadowColor, progress) {
        if (points.length > 1) {
            ctx.save();
            const endPoint = points[Math.floor((points.length - 1) * progress)];
            ctx.beginPath();
            ctx.rect(0, 0, endPoint.x + 5, rect.height);
            ctx.clip();

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.quadraticCurveTo(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].x, points[points.length - 1].y);

            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    // Main draw function
    function draw(progress = 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid lines and labels (Hours 0-12, Score 0-100)
        // Left axis (Hours)
        for (let i = 0; i <= 12; i += 3) {
            const y = hoursToY(i) + margin.top;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + plotWidth, y);
            ctx.strokeStyle = isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = isDarkMode ? '#6b7280' : '#9ca3af';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(`${i}h`, margin.left - 12, y + 4);
        }

        // Draw Score Line (Purple)
        drawLine(scorePoints, isDarkMode ? "#a78bfa" : "#8b5cf6", isDarkMode ? 'rgba(167, 139, 250, 0.5)' : 'rgba(139, 92, 246, 0.5)', progress);

        // Draw Hours Line (Green)
        drawLine(hoursPoints, isDarkMode ? "#4ade80" : "#22c55e", isDarkMode ? 'rgba(74, 222, 128, 0.5)' : 'rgba(34, 197, 94, 0.5)', progress);

        // Draw points (for score line)
        scorePoints.forEach((p, i) => {
            if (p.x > scorePoints[Math.floor((scorePoints.length - 1) * progress)].x) return;

            const isHovered = currentHoverPoint === p;
            const radius = isHovered ? 6 : 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isDarkMode ? '#111827' : 'white';
            ctx.fill();
            const { color } = calculateSleepScore(p.data.hoursSlept, p.data.timesAwoke);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    let startTime = null;
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const runtime = timestamp - startTime;
        const progress = Math.min(runtime / 800, 1);
        draw(progress);
        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    animationFrameId = requestAnimationFrame(animate);

    // Mouse move for tooltips
    canvas.addEventListener('mousemove', (e) => {
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        let foundPoint = null;
        // Check against score points for hovering
        for (const p of scorePoints) {
            const dist = Math.sqrt(Math.pow(p.x - mouseX, 2) + Math.pow(p.y - mouseY, 2));
            if (dist < 10) {
                foundPoint = p;
                break;
            }
        }

        if (foundPoint && currentHoverPoint !== foundPoint) {
            currentHoverPoint = foundPoint;
            draw(1); // Redraw to show hover effect
            const { score, emoji } = calculateSleepScore(foundPoint.data.hoursSlept, foundPoint.data.timesAwoke);

            tooltip.innerHTML = `
                        <div class="font-bold text-gray-800 dark:text-gray-100">${foundPoint.data.date.slice(5)}</div>
                        <div class="flex items-center gap-1.5 mt-1"><span class="font-bold" style="color: ${isDarkMode ? "#a78bfa" : "#8b5cf6"}">${emoji} ${score}</span> Score</div>
                        <div class="flex items-center gap-1.5"><span class="font-bold" style="color: ${isDarkMode ? "#4ade80" : "#22c55e"}">${foundPoint.data.hoursSlept}</span> Hours</div>
                        <div class="mt-1 opacity-70">${foundPoint.data.timesAwoke} wake-ups</div>
                    `;
            tooltip.style.opacity = '1';

            const tooltipRect = tooltip.getBoundingClientRect();
            let left = foundPoint.x + 15;
            let top = foundPoint.y - 15;
            if (left + tooltipRect.width > rect.width) {
                left = foundPoint.x - tooltipRect.width - 15;
            }

            tooltip.style.transform = `translate(${left}px, ${top}px)`;
            canvas.style.cursor = 'pointer';
        } else if (!foundPoint && currentHoverPoint) {
            currentHoverPoint = null;
            draw(1); // Redraw to remove hover effect
            tooltip.style.opacity = '0';
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (currentHoverPoint) {
            currentHoverPoint = null;
            draw(1);
            tooltip.style.opacity = '0';
            canvas.style.cursor = 'default';
        }
    });
}

// ===== 4.1) Skeleton Renderers =====
function renderMoodPickerSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg p-5 space-y-4"><div class="skeleton h-6 w-3/4"></div><div class="grid grid-cols-5 gap-3">${Array(5).fill(0).map(() => `<div class="skeleton h-24"></div>`).join('')}</div><div class="skeleton h-16 w-full"></div></div>`; }
function renderCalendarSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg p-5 space-y-3"><div class="skeleton h-6 w-1/2"></div><div class="grid grid-cols-7 gap-1">${Array(35).fill(0).map(() => `<div class="skeleton h-12"></div>`).join('')}</div></div>`; }
function renderSleepTrackerSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-3xl shadow-xl p-6 space-y-4"><div class="skeleton h-6 w-1/3"></div><div class="skeleton h-24 w-1/2 mx-auto"></div><div class="skeleton h-12 w-full"></div></div>`; }
function renderSleepChartSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg p-5 h-72 space-y-3"><div class="skeleton h-6 w-1/3"></div><div class="skeleton h-full w-full"></div></div>`; }

function renderChatSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg h-[26rem] flex flex-col justify-between p-3"><div class="space-y-3"><div class="skeleton h-10 w-3/5"></div><div class="skeleton h-12 w-4/5 ml-auto"></div><div class="skeleton h-8 w-1/2"></div></div><div class="skeleton h-12 w-full"></div></div>`; }
function renderMusicPlayerSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg p-4 h-[72px]"><div class="skeleton h-full w-full"></div></div>`; }
function renderChartSkeleton() { return `<div class="bg-white/80 dark:bg-gray-900/70 rounded-2xl shadow-lg p-5 h-72 space-y-3"><div class="skeleton h-6 w-1/3"></div><div class="skeleton h-full w-full"></div></div>`; }

function updateChatMessages(messages, isTyping, showAlert) {
    const chatMessagesEl = document.getElementById('chat-messages');
    const chatAlertBoxEl = document.getElementById('chat-alert-box');
    const chatStartersEl = document.getElementById('chat-starters'); // Changed variable name
    if (!chatMessagesEl || !chatAlertBoxEl) return;

    chatAlertBoxEl.innerHTML = showAlert ? `<div class="bg-red-100 text-red-800 text-sm p-3 rounded-t-2xl font-medium fade-in dark:bg-red-900/30 dark:text-red-300">If you feel unsafe, call <b>112</b> (India). Consider speaking to a trusted person or a professional. You matter.</div>` : '';

   // Hide chat starters if there are messages or typing indicator is shown
    if (chatStartersEl) {
        if (messages.length > 0 || isTyping) {
            chatStartersEl.classList.add('hidden'); // Use hidden class for smooth transition
            chatMessagesEl.classList.remove('justify-center', 'items-center'); // Remove centering
        } else {
            chatStartersEl.classList.remove('hidden');
            chatMessagesEl.classList.add('justify-center', 'items-center'); // Add centering
        }
    }

    let messagesHtml = messages.map(m => {
        const isUser = m.sender === 'user';
        // Escape quotes for data attribute
        const safeText = m.text.replace(/"/g, '&quot;'); 
        
        return `
        <div class="chat-message-container max-w-[85%] sm:max-w-[80%] w-fit text-sm slide-up flex items-end gap-2 ${isUser ? 'ml-auto flex-row-reverse' : ''}">
            <div class="${isUser ? 'text-white bg-indigo-600 rounded-b-2xl rounded-tl-2xl shadow' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-b-2xl rounded-tr-2xl'}">
                <div class="px-3.5 py-2.5 whitespace-pre-wrap">${m.text}</div>
            </div>
            ${!isUser ? `
                <button class="tts-btn text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400" data-text="${safeText}" title="Listen">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                </button>
            ` : ''}
        </div>`;
    }).join('');
    if (isTyping) {
        messagesHtml += `<div class="max-w-[80%] w-fit text-sm bg-gray-100 dark:bg-gray-800 rounded-b-2xl rounded-tr-2xl px-3.5 py-2.5 slide-up"><div class="flex items-center gap-2 typing-indicator"><span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></span><span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></span><span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></span></div></div>`;
    }

    chatMessagesEl.innerHTML = messagesHtml;
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// ===== 5) Music Logic =====
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getCurrentPlaylist() {
    return MUSIC_CATEGORIES[currentMusicCategory] || musicPlaylist;
}

function playNextSong() {
    currentTrackIndex++;
    const playlist = isShuffled ? shuffledPlaylist : getCurrentPlaylist();
    if (currentTrackIndex >= playlist.length) {
        currentTrackIndex = 0; // Loop playlist
        if (isShuffled) { // Re-shuffle when the playlist completes
            shuffledPlaylist = shuffleArray([...getCurrentPlaylist()]);
        }
    }
    loadAndPlaySong();
}

function loadAndPlaySong() {
    const playlist = isShuffled ? shuffledPlaylist : getCurrentPlaylist();
    if (playlist.length === 0) return; // Don't play if playlist is empty
    const trackName = playlist[currentTrackIndex];
    audio.src = trackName;
}

function switchMusicCategory(category) {
    currentMusicCategory = category;
    currentTrackIndex = 0;
    shuffledPlaylist = shuffleArray([...getCurrentPlaylist()]);

    // Update the UI to reflect the new category
    const musicPlayer = document.getElementById('music-player');
    if (musicPlayer) {
        // Re-render the music player to update category display
        const musicPlayerContainer = musicPlayer.parentElement;
        const musicPlayerHTML = renderMusicPlayer();
        musicPlayerContainer.innerHTML = musicPlayerHTML;
        setupMusicEventListeners();
    }
}

function setupMusicEventListeners() {
    // This function can be used to set up any additional music-specific event listeners
    // Currently handled by the main setupEventListeners function
}

function updateMusicCategoryFromMood() {
    // Automatically switch music category based on today's mood
    if (todayMood && todayMood.score !== undefined) {
        const moodData = cons.MOODS.find(m => m.score === todayMood.score);
        if (moodData && moodData.label !== currentMusicCategory) {
            switchMusicCategory(moodData.label);
        }
    }
}

// ===== 6) Data Logic =====
async function refreshMoodData(uid) {
    if (!uid) return;
    const moodPath = `artifacts/${cons.appId}/moods/${uid}/days`;

    const id = dateId();
    const tDoc = await getDoc(doc(db, moodPath, id));
    todayMood = tDoc.exists() ? tDoc.data() : { notes: [] };

    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPromises = Array.from({ length: daysInMonth }, (_, i) => getDoc(doc(db, moodPath, dateId(new Date(year, month, i + 1)))));

    const seriesPromises = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return getDoc(doc(db, moodPath, dateId(d)));
    });

    const [monthDocs, seriesDocs] = await Promise.all([Promise.all(monthPromises), Promise.all(seriesPromises)]);

    calendarMap = {};
    monthDocs.forEach(dd => { if (dd.exists()) calendarMap[dd.id] = { score: dd.data().score, emoji: dd.data().emoji }; });
    chartData = seriesDocs.map((dd, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const data = dd.exists() ? dd.data() : {};
        return { date: dateId(d), score: data.score ?? null, notes: data.notes || [] };
    });
}
async function refreshSleepData(uid) {
    if (!uid) return;
    const sleepPath = `artifacts/${cons.appId}/sleep/${uid}/days`;

    const id = dateId();
    const tDoc = await getDoc(doc(db, sleepPath, id));
    todaySleep = tDoc.exists() ? tDoc.data() : null;

    // Fetch data for the 30-day chart
    const seriesPromises = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return getDoc(doc(db, sleepPath, dateId(d)));
    });

    const seriesDocs = await Promise.all(seriesPromises);

    sleepChartData = seriesDocs.map((dd, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const data = dd.exists() ? dd.data() : {};

        // Calculate score on the fly if it doesn't exist
        let score = data.score;
        if (data.hoursSlept !== undefined && data.timesAwoke !== undefined && data.score === undefined) {
            score = calculateSleepScore(data.hoursSlept, data.timesAwoke).score;
        }

        return {
            date: dateId(d),
            score: score ?? null,
            hoursSlept: data.hoursSlept ?? null,
            timesAwoke: data.timesAwoke ?? 0
        };
    });
}
async function handleMoodPick(mainMood, subMood) {
    const moodInfo = cons.FEELING_WHEEL[mainMood];
    if (!user || !moodInfo) return;

    // Find the corresponding base label (e.g., "Very Happy") from the original MOODS array
    // This is crucial for keeping the music player and themes working
    const baseMood = cons.MOODS.find(m => m.score === moodInfo.score);
    if (!baseMood) {
        console.error("Could not find matching base mood for score:", moodInfo.score);
        return;
    }

    const id = dateId();
    const moodPath = `artifacts/${cons.appId}/moods/${user.uid}/days`;
    const userPath = `artifacts/${cons.appId}/users/${user.uid}`;

    const moodData = {
        score: moodInfo.score,
        label: baseMood.label, // e.g., "Very Happy"
        mainMood: mainMood,    // e.g., "Happy"
        subMood: subMood,      // e.g., "Joyful"
        emoji: moodInfo.emoji, // e.g., "✨"
        createdAt: serverTimestamp()
    };

    if (!todayMood) todayMood = { notes: [] };
    // Update local todayMood object
    Object.assign(todayMood, moodData);

    // Save to Firestore
    await setDoc(doc(db, moodPath, id), moodData, { merge: true });
    await setDoc(doc(db, userPath), { lastCheckIn: id }, { merge: true });

    // Update theme
    applyMoodTheme(baseMood.label);

    // Re-render the whole app content
    await refreshMoodData(user.uid);
    renderAppContent(false);
    drawInteractiveChart(chartData);
    updateMusicCategoryFromMood();
    checkAndNotifyBadgeUpdate();
}
async function handleAddNote() {
    const noteInput = document.getElementById('note-input');
    const noteText = noteInput.value.trim();
    if (!noteText || !user) return;

    noteInput.value = '';
    const id = dateId();
    const moodPath = `artifacts/${cons.appId}/moods/${user.uid}/days`;
    const moodDocRef = doc(db, moodPath, id);

    await setDoc(moodDocRef, { notes: arrayUnion(noteText) }, { merge: true });
    if (!todayMood) todayMood = { notes: [] };
    if (!todayMood.notes) todayMood.notes = [];
    todayMood.notes.push(noteText);

    const todayInChart = chartData.find(d => d.date === id);
    if (todayInChart) todayInChart.notes.push(noteText);

    renderNotes();
}

async function handleDeleteNote(index) {
    const noteText = todayMood?.notes?.[index];
    if (!noteText || !user) return;

    const id = dateId();
    const moodPath = `artifacts/${cons.appId}/moods/${user.uid}/days`;
    const moodDocRef = doc(db, moodPath, id);

    await updateDoc(moodDocRef, { notes: arrayRemove(noteText) });
    todayMood.notes.splice(index, 1);

    const todayInChart = chartData.find(d => d.date === id);
    if (todayInChart) todayInChart.notes = todayMood.notes;

    renderNotes();
}
async function handleSleepRecordSave(hoursSlept, timesAwoke) {
    if (!user) return;

    const scoreData = calculateSleepScore(hoursSlept, timesAwoke);
    const id = dateId();
    const sleepPath = `artifacts/${cons.appId}/sleep/${user.uid}/days`;

    const sleepData = {
        hoursSlept: hoursSlept,
        timesAwoke: timesAwoke,
        score: scoreData.score,
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, sleepPath, id), sleepData, { merge: true });

        // Update local state
        todaySleep = sleepData;

        // Update chart data
        const todayInChart = sleepChartData.find(d => d.date === id);
        if (todayInChart) {
            todayInChart.score = sleepData.score;
            todayInChart.hoursSlept = sleepData.hoursSlept;
            todayInChart.timesAwoke = sleepData.timesAwoke;
        } else {
            // This case should be rare, but good to handle
            sleepChartData.push({ date: id, ...sleepData });
            if (sleepChartData.length > 30) sleepChartData.shift();
        }

        // Show the score display
        renderSleepScoreDisplay(scoreData);

        // Re-render the sleep tracker box
        const sleepBoxContainer = document.getElementById('sleep-tracker')?.parentElement;
        if (sleepBoxContainer) {
            sleepBoxContainer.innerHTML = renderSleepTrackerBox();
        }

        // Re-draw the chart
        drawInteractiveSleepChart(sleepChartData);

        if (!profile.trackedSleep) { // Mark that sleep has been tracked once
            profile.trackedSleep = true;
            // Optionally update Firestore here if needed:
            // await updateDoc(doc(db, `artifacts/${cons.appId}/users/${user.uid}`), { trackedSleep: true });
            checkAndNotifyBadgeUpdate(); // Check for badge after marking
        }

    } catch (error) {
        console.error("Error saving sleep data:", error);
        alert("Could not save your sleep data. Please try again.");
    }
}
// ===== NEW Reminder Data Functions =====
async function refreshReminders(uid) {
    if (!uid) return;
    const reminderPath = `artifacts/${cons.appId}/reminders/${uid}/activeReminders`;
    const q = query(collection(db, reminderPath), orderBy("time", "asc"));

    // Use getDocs for initial load, maybe switch to onSnapshot later if needed
    try {
        const querySnapshot = await getDocs(q);
        reminders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Fetched reminders:", reminders);
        // Update the UI after fetching
        const reminderListEl = document.getElementById('reminder-list');
        if (reminderListEl) {
             reminderListEl.innerHTML = reminders.length > 0
                ? reminders.map((r, index) => renderSingleReminder(r, index)).join('')
                : `<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No active reminders set.</p>`;
        }
    } catch (error) {
        console.error("Error fetching reminders:", error);
        reminders = []; // Clear on error
    }
}

async function handleAddReminderSave(type, customText, time, frequency, customDays) { // Added frequency, customDays
    if (!user || !type || !time || !frequency) return false; // Added frequency check

    // Validate custom text if type is Custom
    if (type === 'Custom' && !(customText && customText.trim())) {
        alert("Please enter text for your custom reminder.");
        return false;
    }
    // Validate custom days if frequency requires it
    if (frequency === 'Custom Days' && (!customDays || customDays.length === 0)) {
        alert("Please select at least one day for 'Custom Days' frequency.");
        return false;
    }

    const reminderData = {
        type: type,
        customText: type === 'Custom' ? customText : null,
        time: time, // Store as "HH:MM"
        frequency: frequency, // e.g., 'Daily', 'Every Hour', 'Custom Days'
        customDays: frequency === 'Custom Days' ? customDays : null, // Array like ['Mon', 'Wed'] or null
        createdAt: serverTimestamp(),
        // triggeredToday will be added locally when fetched
    };

    try {
        const reminderPath = `artifacts/${cons.appId}/reminders/${user.uid}/activeReminders`;
        const docRef = await addDoc(collection(db, reminderPath), reminderData);
        // Add to local array immediately for UI update
        reminders.push({ id: docRef.id, ...reminderData, triggeredToday: false }); // Add triggeredToday flag
        reminders.sort((a, b) => a.time.localeCompare(b.time)); // Keep sorted by time
        // Re-render the list
        const reminderListEl = document.getElementById('reminder-list');
        if (reminderListEl) {
             reminderListEl.innerHTML = reminders.map((r, index) => renderSingleReminder(r, index)).join('');
        }
        return true; // Indicate success
    } catch (error) {
        console.error("Error saving reminder:", error);
        alert("Could not save reminder. Please try again.");
        return false; // Indicate failure
    }
}

async function handleDeleteReminder(reminderId) {
    if (!user || !reminderId) return;

    try {
        const reminderPath = `artifacts/${cons.appId}/reminders/${user.uid}/activeReminders`;
        await deleteDoc(doc(db, reminderPath, reminderId));

        // Remove from local array
        reminders = reminders.filter(r => r.id !== reminderId);

        // Re-render the list
        const reminderListEl = document.getElementById('reminder-list');
         if (reminderListEl) {
             reminderListEl.innerHTML = reminders.length > 0
                ? reminders.map((r, index) => renderSingleReminder(r, index)).join('')
                : `<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No active reminders set.</p>`;
        }

    } catch (error) {
        console.error("Error deleting reminder:", error);
        alert("Could not delete reminder.");
    }
}
// ===== NEW Day Rating & Report Data Functions =====

async function handleEveningCheckinSubmit(form) {
    if (!user) return;
    const formData = new FormData(form);
    const ratingData = {
        overall: parseInt(formData.get('overall'), 10),
        productivity: parseInt(formData.get('productivity'), 10),
        social: parseInt(formData.get('social'), 10),
        selfCare: parseInt(formData.get('selfCare'), 10),
        createdAt: serverTimestamp()
    };

    const id = dateId();
    const ratingPath = `artifacts/${cons.appId}/dayRatings/${user.uid}/days`;
    try {
        await setDoc(doc(db, ratingPath, id), ratingData, { merge: true });
        todayDayRating = ratingData; // Update local state
        console.log("Day rating saved:", ratingData);
    } catch (error) {
        console.error("Error saving day rating:", error);
        alert("Could not save your day rating. Please try again.");
    }
}

async function fetchWeeklyReportData() {
    if (!user) return { totalEntries: 0 };

    const startOfWeek = getStartOfWeek(); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7); // Go to next Sunday
    
    // Paths
    const moodPath = `artifacts/${cons.appId}/moods/${user.uid}/days`;
    const ratingPath = `artifacts/${cons.appId}/dayRatings/${user.uid}/days`;

    // Create date IDs for the week
    const weekDateIds = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        weekDateIds.push(dateId(d));
    }

    // --- Fetch Mood Data ---
    const moodPromises = weekDateIds.map(id => getDoc(doc(db, moodPath, id)));
    const moodDocs = await Promise.all(moodPromises);
    const moodData = [];
    moodDocs.forEach((doc, i) => {
        if (doc.exists()) {
            const data = doc.data();
            moodData.push({
                day: daysOfWeek[i],
                score: data.score,
                label: data.label,
                date: doc.id
            });
        }
    });

    // --- Fetch Day Rating Data ---
    const ratingPromises = weekDateIds.map(id => getDoc(doc(db, ratingPath, id)));
    const ratingDocs = await Promise.all(ratingPromises);
    const dayRatingData = [];
    ratingDocs.forEach(doc => {
        if (doc.exists()) {
            dayRatingData.push(doc.data());
        }
    });

    // --- Calculate Averages & Insights ---
    const totalEntries = moodData.length + dayRatingData.length;
    if (totalEntries === 0) return { totalEntries: 0 };

    // Avg Ratings for Radar Chart
    const avgRatings = {
        Productivity: 0,
        Social: 0,
        'Self-Care': 0
    };
    if (dayRatingData.length > 0) {
        avgRatings.Productivity = (dayRatingData.reduce((acc, d) => acc + d.productivity, 0) / dayRatingData.length).toFixed(1);
        avgRatings.Social = (dayRatingData.reduce((acc, d) => acc + d.social, 0) / dayRatingData.length).toFixed(1);
        avgRatings['Self-Care'] = (dayRatingData.reduce((acc, d) => acc + d.selfCare, 0) / dayRatingData.length).toFixed(1);
    }
    
    // Find Highest/Lowest Mood
    let highestMood = { day: 'N/A', label: 'N/A' };
    let lowestMood = { day: 'N/A', label: 'N/A' };
    if(moodData.length > 0) {
        const sortedMoods = [...moodData].sort((a,b) => b.score - a.score);
        highestMood = sortedMoods[0];
        lowestMood = sortedMoods[sortedMoods.length - 1];
    }

    return {
        totalEntries,
        moodData,
        dayRatingData,
        avgRatings,
        highestMood,
        lowestMood,
        dateRange: `${weekDateIds[0]} to ${weekDateIds[6]}`
    };
}

// ===== NEW D3 Charting Functions =====

function drawWeeklyMoodChart(data, targetSelector) {
    const target = d3.select(targetSelector);
    if (target.empty() || !data || data.length === 0) return;

    const bounds = target.node().getBoundingClientRect();
const margin = { top: 20, right: 30, bottom: 30, left: 60 };    const width = bounds.width - margin.left - margin.right;
    const height = bounds.height - margin.top - margin.bottom;

    const svg = target.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${bounds.width} ${bounds.height}`)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Data for 7 days
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Map scores from -2 (Very Sad) to 2 (Very Happy)
    const yDomain = [-2, 2];
    const yLabels = ["V. Sad", "Sad", "Neutral", "Happy", "V. Happy"];

    const x = d3.scalePoint()
        .domain(days)
        .range([0, width])
        .padding(0.5);

    const y = d3.scaleLinear()
        .domain(yDomain)
        .range([height, 0]);

    // Add Y axis
    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(y).ticks(5).tickFormat((d, i) => yLabels[i]));

    // Add X axis
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    // Create a map for quick lookup
    const dataMap = new Map(data.map(d => [d.day, d.score]));
    // Create data points for all 7 days, with null for missing days
    const lineData = days.map(day => ({
        day: day,
        score: dataMap.has(day) ? dataMap.get(day) : null
    }));

    // Define line and area
    const lineGenerator = d3.line()
        .defined(d => d.score !== null)
        .x(d => x(d.day))
        .y(d => y(d.score))
        .curve(d3.curveMonotoneX);

    const areaGenerator = d3.area()
        .defined(d => d.score !== null)
        .x(d => x(d.day))
        .y0(height)
        .y1(d => y(d.score))
        .curve(d3.curveMonotoneX);

    // Add Area
    svg.append("path")
      .datum(lineData)
      .attr("class", "mood-area")
      .attr("fill", "url(#mood-gradient)") // Reference gradient
      .attr("d", areaGenerator);

    // Add Line
    svg.append("path")
      .datum(lineData)
      .attr("class", "mood-line")
      .attr("d", lineGenerator);

    // Add Dots
    svg.selectAll(".mood-dot")
      .data(data) // Only plot dots for *existing* data
      .enter().append("circle")
      .attr("class", "mood-dot")
      .attr("cx", d => x(d.day))
      .attr("cy", d => y(d.score))
      .attr("r", 4);
    
    // Add Gradient for area
     svg.append("defs").append("linearGradient")
        .attr("id", "mood-gradient")
        .attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%")
        .selectAll("stop")
        .data([
            {offset: "0%", color: isDarkMode ? "#4f46e5" : "#a5b4fc"},
            {offset: "100%", color: isDarkMode ? "#4f46e5" : "#a5b4fc"}
        ])
        .enter().append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color)
        .attr("stop-opacity", (d,i) => i === 0 ? 0.3 : 0);
}

function drawWeeklyActivityRadar(data, targetSelector) {
    const target = d3.select(targetSelector);
    if (target.empty() || !data) return;

    const bounds = target.node().getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
const margin = { top: 60, right: 60, bottom: 60, left: 60 };    const radius = Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom) / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    const svg = target.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const features = Object.keys(data);
    const angleSlice = (Math.PI * 2) / features.length;
    const rScale = d3.scaleLinear().domain([0, 5]).range([0, radius]); // 0 to 5 rating

    const g = svg.append("g").attr("transform", `translate(${centerX},${centerY})`);

    // Draw grid lines
    const gridLevels = [1, 2, 3, 4, 5];
    g.selectAll(".grid-line")
      .data(gridLevels)
      .enter().append("circle")
      .attr("class", "grid-line")
      .attr("r", d => rScale(d))
      .style("fill", "none");

    // Draw axes
    const axes = g.selectAll(".axis")
      .data(features)
      .enter().append("g")
      .attr("class", "axis");

    axes.append("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", (d, i) => rScale(5.5) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y2", (d, i) => rScale(5.5) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("class", "grid-line");

    axes.append("text")
      .attr("class", "axis-label")
      .attr("x", (d, i) => rScale(6) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y", (d, i) => rScale(6) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text(d => d);

    // Draw data area
    const radarLine = d3.lineRadial()
      .radius(d => rScale(d.value))
      .angle((d, i) => i * angleSlice);
      
    const radarData = features.map(f => ({ axis: f, value: data[f] }));
    const radarDataClosed = [...radarData, radarData[0]]; // Close the loop

    g.append("path")
      .datum(radarDataClosed)
      .attr("class", "radar-area")
      .attr("d", radarLine);

    // Draw data points
    g.selectAll(".radar-point")
      .data(radarData)
      .enter().append("circle")
      .attr("class", "radar-point")
      .attr("r", 4)
      .attr("cx", (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("cy", (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2));
}
async function handleChatSend() {
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    inputEl.disabled = true;
    sendBtn.disabled = true;

    const tempUserMessageId = `temp_${Date.now()}`;
    const userMessageData = { text, sender: "user", sentAt: new Date() }; // Use local date for immediate display
    chatMessages.push({ id: tempUserMessageId, ...userMessageData });
    updateChatMessages(chatMessages, true, document.getElementById('chat-alert-box').innerHTML !== '');

    try {
        const chatPath = `artifacts/${cons.appId}/chats/${user.uid}/messages`;
        await addDoc(collection(db, chatPath), { text, sender: "user", sentAt: serverTimestamp() });

        const recentHistory = chatMessages.slice(-11, -1).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));

     const reply = await generateReply({ text, moodScore: todayMood?.score ?? 0, name: profile.displayName, chatHistory: recentHistory });

        // Add bot message to Firestore ONCE
        await addDoc(collection(db, chatPath), { text: reply.text, sender: "bot", sentAt: serverTimestamp() });
        
        // --- NEW: Auto TTS ---
        if (isAutoTTS) {
            speakText(reply.text);
        }
        // ---------------------

        checkAndNotifyBadgeUpdate(); // Check for new badges after sending a message
    } catch (error) {
        console.error("Failed to send message:", error);
        chatMessages = chatMessages.filter(m => m.id !== tempUserMessageId);
        updateChatMessages(chatMessages, false, false);
    } finally {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
    }
}
// ===== NEW Reminder Check Logic =====
function startReminderChecks() {
    if (reminderCheckInterval) clearInterval(reminderCheckInterval); // Clear existing interval

    reminderCheckInterval = setInterval(() => {
        if (!user || reminders.length === 0) return; // Only run if logged in and reminders exist

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        reminders.forEach(async (reminder) => {
            if (reminder.time === currentTime && !reminder.triggeredToday) {
                console.log("Reminder triggered:", reminder);
                renderReminderNotificationModal(reminder);

                // Mark as triggered *locally* for this session to avoid repeats within the minute
                // You might want a more robust Firestore-based 'triggered' flag
                // or logic to handle recurring reminders.
                reminder.triggeredToday = true;

                // Optional: Delete one-time reminder after triggering
                // await handleDeleteReminder(reminder.id);

                 // After a minute, reset the triggered flag so it can trigger again tomorrow
                setTimeout(() => {
                    const reminderInArray = reminders.find(r => r.id === reminder.id);
                    if(reminderInArray) reminderInArray.triggeredToday = false;
                }, 61000); // 61 seconds
            }
        });
    }, 60000); // Check every 60 seconds (1 minute)
}

function stopReminderChecks() {
    if (reminderCheckInterval) clearInterval(reminderCheckInterval);
    reminderCheckInterval = null;
}
// ===== NEW FUNCTION FOR SPEECH-TO-TEXT =====
function handleVoiceInput() {
    if (!SpeechRecognition) {
        alert("Sorry, your browser doesn't support voice input. Try Chrome or Edge.");
        return;
    }

    const micBtn = document.getElementById('voice-input-btn');
    const micIcon = document.getElementById('mic-icon');
    const micListeningIcon = document.getElementById('mic-listening-icon');
    const chatInput = document.getElementById('chat-input');

    if (isListening) {
        recognition.stop();
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Set to English (India)
recognition.interimResults = true; // Show results as you speak
            recognition.continuous = true; // <-- THE FIX
    recognition.onstart = () => {
        isListening = true;
        micIcon.classList.add('hidden');
        micListeningIcon.classList.remove('hidden');
        micBtn.classList.add('bg-red-500', 'text-white');
        micBtn.classList.remove('bg-gray-200', 'dark:bg-gray-700');
        chatInput.placeholder = 'Listening...';
    };

    recognition.onend = () => {
        if (!profile.usedVoiceInput) { // Mark that voice has been used once
            profile.usedVoiceInput = true;
            // Optionally update Firestore here if needed:
            // await updateDoc(doc(db, `artifacts/${cons.appId}/users/${user.uid}`), { usedVoiceInput: true });
            checkAndNotifyBadgeUpdate(); // Check for badge after marking
        }
        isListening = false;
        micIcon.classList.remove('hidden');
        micListeningIcon.classList.add('hidden');
        micBtn.classList.remove('bg-red-500', 'text-white');
        micBtn.classList.add('bg-gray-200', 'dark:bg-gray-700');
        chatInput.placeholder = 'Say anything...';
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            alert('Permission to use the microphone was denied. Please allow it in your browser settings.');
        }
    };

   recognition.onresult = (event) => {
        let final_transcript = '';
        let interim_transcript = '';

        // Iterate through all results received so far in this session
        for (let i = 0; i < event.results.length; ++i) {
            const transcript_piece = event.results[i][0].transcript;
            
            // If the result is final (confirmed), add it to the final transcript
            if (event.results[i].isFinal) {
                final_transcript += transcript_piece + ' '; // Add a space for the next part
            } else {
                // Otherwise, it's an interim (in-progress) result
                interim_transcript += transcript_piece;
            }
        }
        
        // Set the input value to the combination of all final parts and the current interim part
        chatInput.value = final_transcript + interim_transcript;
    };
    // Request permission and start listening
    try {
        recognition.start();
    } catch (e) {
        console.error("Could not start recognition (possibly already active):", e);
    }
}
// ===== END NEW FUNCTION =====


async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    renderAuthCard("", "", true, 'signin'); // Show loading state
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if this is a new user (for profile creation)
        const userDocRef = doc(db, `artifacts/${cons.appId}/users/${user.uid}`);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            // New user, create their profile
            const displayName = titleCase(user.displayName || user.email.split("@")[0]);
            await setDoc(userDocRef, {
                displayName: displayName,
                email: user.email,
                joinedAt: serverTimestamp()
            });
            // Update the auth profile if it's different
            if (user.displayName !== displayName) {
                await updateProfile(user, { displayName });
            }
        }
        // onAuthStateChanged will handle redirecting to the app
    } catch (error) {
        const message = error.code ? error.code.replace('auth/', '').replace(/-/g, ' ') : error.message;
        renderAuthCard(titleCase(message), "", false, 'signin');
    }
}

async function handleForgotPassword() {
    const emailInput = document.querySelector('#auth-form input[name="email"]');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email) {
        renderAuthCard("Please enter your email to reset password.", "", false, 'signin');
        return;
    }

    renderAuthCard("", "Sending reset email...", true, 'signin'); // Show loading

    try {
        await sendPasswordResetEmail(auth, email);
        // Green notice message with spam warning
        renderAuthCard(
            "",
            "Password reset email sent. <span class='text-green-700 dark:text-green-400'>Check your inbox (and spam).</span>",
            false,
            'signin'
        );
    } catch (error) {
        const message = error.code ? error.code.replace('auth/', '').replace(/-/g, ' ') : error.message;
        renderAuthCard(titleCase(message), "", false, 'signin');
    }
}
function startBreathingExercise() {
    if (!profile.usedBreathing) { // Mark that breathing exercise has been used once
        profile.usedBreathing = true;
        // Optionally update Firestore here if needed:
        // await updateDoc(doc(db, `artifacts/${cons.appId}/users/${user.uid}`), { usedBreathing: true });
        checkAndNotifyBadgeUpdate(); // Check for badge after marking
    }
    isBreathingExerciseActive = true;
    breathCycleCount = 0;

    document.getElementById('start-breathing-btn').classList.add('hidden');
    document.getElementById('more-breathing-btn').classList.add('hidden');

    runBreathingCycle();
}

function runBreathingCycle() {
    if (!isBreathingExerciseActive || breathCycleCount >= MAX_BREATH_CYCLES) {
        finishBreathingExercise();
        return;
    }

    const circle = document.getElementById('breathing-circle');
    const text = document.getElementById('breathing-text');
    const instruction = document.getElementById('breathing-instruction');

    // Inhale phase (4 seconds)
    text.textContent = "Breathe In";
    instruction.textContent = "Fill your lungs completely";
    circle.style.transform = 'scale(1)';
    circle.style.opacity = '0.7';
    circle.style.backgroundColor = '#4f46e5';

    setTimeout(() => {
        // Hold phase (2 seconds)
        text.textContent = "Hold";
        instruction.textContent = "Hold your breath for a moment";
        circle.style.opacity = '0.9';

        setTimeout(() => {
            // Exhale phase (6 seconds)
            text.textContent = "Breathe Out";
            instruction.textContent = "Release all the air slowly";
            circle.style.transform = 'scale(0.5)';
            circle.style.opacity = '0.2';
            circle.style.backgroundColor = '#8b5cf6';

            setTimeout(() => {
                breathCycleCount++;
                if (breathCycleCount < MAX_BREATH_CYCLES) {
                    runBreathingCycle();
                } else {
                    finishBreathingExercise();
                }
            }, 6000);
        }, 2000);
    }, 4000);
}

function finishBreathingExercise() {
    isBreathingExerciseActive = false;

    const text = document.getElementById('breathing-text');
    const instruction = document.getElementById('breathing-instruction');

    text.textContent = "Complete!";
    instruction.textContent = "You've completed 5 deep breaths. How do you feel?";

    document.getElementById('more-breathing-btn').classList.remove('hidden');

    // Reset circle
    const circle = document.getElementById('breathing-circle');
    circle.style.transform = 'scale(0.5)';
    circle.style.opacity = '0.2';
}

function closeBreathingModal() {
    isBreathingExerciseActive = false;
    const modal = document.getElementById('breathing-modal');
    if (modal) modal.remove();
}
// ===== 7) Event Listeners & Main App Flow =====
function applyTheme() {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('YouthMind-theme', isDarkMode ? 'dark' : 'light');

    // Update theme icons in header
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (sunIcon && moonIcon) {
        sunIcon.classList.toggle('hidden', isDarkMode);
        moonIcon.classList.toggle('hidden', !isDarkMode);
    }

    if (user) drawInteractiveChart(chartData);
}
function applyMoodTheme(moodLabel = "Neutral") {
    const appBackground = document.getElementById('app-background');
    if (!appBackground) return; // Not on the dashboard screen

    // Use "Neutral" as a fallback if moodLabel is null or undefined
    const label = moodLabel || "Neutral";
    const theme = label.toLowerCase().replace(' ', '-'); // "Very Happy" -> "very-happy"

    appBackground.dataset.moodTheme = theme;
}
function setupEventListeners() {
    appRoot.addEventListener('click', async (e) => {
        const target = e.target; // MOVE THIS LINE UP
// TTS Toggle in Dropdown
        if (target.closest('#tts-toggle-btn')) {
            toggleAutoTTS();
        }

        // Speaker Icon Click
        const ttsBtn = target.closest('.tts-btn');
        if (ttsBtn) {
            const textToSpeak = ttsBtn.dataset.text;
            if (synth.speaking) {
                synth.cancel(); // Click to stop if already talking
                ttsBtn.classList.remove('speaking');
            } else {
                speakText(textToSpeak);
            }
        }
        // ===== NEW Day Rating & Report Listeners =====
        if (target.closest('#start-evening-checkin-btn')) {
            document.getElementById('evening-popup-banner')?.remove();
            renderEveningCheckinModal();
        }
        if (target.closest('#close-evening-popup-btn')) {
            document.getElementById('evening-popup-banner')?.remove();
        }
        if (target.closest('#weekly-report-btn')) {
            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderWeeklyReportModal();
        }      // Start Tour Button in Footer
        if (target.id === 'start-tour-btn') {
            startTour();
        }
// ===== NEW Reminder Listeners =====
      if (target.closest('#add-reminder-btn')) {
            renderAddReminderModal();
        }
// Event listener for clicks within dynamically added modals in featureContainer
    featureContainer.addEventListener('click', (e) => {
        const target = e.target;
// ===== NEW Day Rating & Report Modal Listeners =====
        if (target.id === 'close-day-rating-modal') {
            document.getElementById('day-rating-modal')?.remove();
        }
        if (target.id === 'close-weekly-report-modal') {
            document.getElementById('weekly-report-modal')?.remove();
        }
    
        // Close Add Reminder Modal
        if (target.id === 'close-add-reminder-modal') {
            document.getElementById('add-reminder-modal')?.remove();
        }

        // Close Reminder Notification Modal
        if (target.id === 'close-reminder-notification') {
            const modal = document.getElementById('reminder-notification-modal');
             if (modal) {
                const modalContent = modal.querySelector('.modal-content');
                modalContent.classList.remove('scale-100', 'opacity-100');
                modalContent.classList.add('scale-95', 'opacity-0');
                setTimeout(() => modal.remove(), 300);
                 // Optional: Pause the alarm sound if it's still playing
                const alarmSound = document.getElementById('reminder-alarm-sound');
                if (alarmSound) alarmSound.pause();
             }
        }

        // --- Keep existing listeners for other modals below ---
        // Close about us modal
        if (target.id === 'close-about-modal' || target.closest('#close-about-modal')) {
           // ... existing close logic ...
        }
        // ... etc for profile, movie, events, sleep modals ...
    });

    // Event listener for Add Reminder form submission
    featureContainer.addEventListener('submit', async (e) => {
        if (e.target.id === 'day-rating-form') {
            e.preventDefault();
            const form = e.target;
            const finishBtn = form.querySelector('#day-rating-finish-btn');
            
            if (finishBtn.disabled) return;
            finishBtn.disabled = true;
            finishBtn.innerHTML = 'Saving...';

            await handleEveningCheckinSubmit(form);

            // Close modal after a short delay
            setTimeout(() => {
                document.getElementById('day-rating-modal')?.remove();
            }, 500);
        }
     if (e.target.id === 'add-reminder-form') {
            e.preventDefault();
            const form = e.target;
            const submitBtn = form.querySelector('button[type="submit"]');

            if (submitBtn.disabled) return;
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Saving...';

            try {
                const formData = new FormData(form);
                const type = formData.get('reminderType');
                const customText = formData.get('customText');
                const time = formData.get('reminderTime');
                const frequency = formData.get('reminderFrequency'); // <-- Get frequency
                const customDays = formData.getAll('customDays'); // <-- Get custom days (array)

                // Pass new data to the save function
                const success = await handleAddReminderSave(type, customText, time, frequency, customDays);

                if (success) {
                    document.getElementById('add-reminder-modal')?.remove();
                }
                // Error handling is now inside handleAddReminderSave or caught below

            } catch (error) {
                console.error("Error during reminder form submission:", error.message);
                // Alert is likely already shown if validation failed in handleAddReminderSave
            } finally {
                const currentSubmitBtn = document.querySelector('#add-reminder-form button[type="submit"]');
                if (currentSubmitBtn) {
                     currentSubmitBtn.disabled = false;
                     currentSubmitBtn.innerHTML = 'Set Reminder';
                }
            }
        }
    });
        const deleteReminderBtn = target.closest('.reminder-delete-btn');
        if (deleteReminderBtn) {
            const reminderId = deleteReminderBtn.dataset.reminderId;
            // Add deleting animation (optional)
            const reminderItem = deleteReminderBtn.closest('.reminder-item');
             if(reminderItem) {
                reminderItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                reminderItem.style.opacity = '0';
                reminderItem.style.transform = 'scale(0.95)';
                setTimeout(() => handleDeleteReminder(reminderId), 300);
             } else {
                 handleDeleteReminder(reminderId);
             }
        }
        if (!target) return;
        // Add to your setupEventListeners function
if (target.closest('#delete-all-chats-btn')) {            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';

            // Show confirmation dialog
            if (confirm("This will permanently delete ALL your chat messages. This action cannot be undone. Continue?")) {
                deleteAllChats();
            }
        }
        if (target.closest('#google-signin-btn')) {
            handleGoogleSignIn();
        }
        if (target.closest('#forgot-password-btn')) {
            handleForgotPassword();
        }
if (target.closest('#about-us-btn')) {            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderAboutUsModal();
        }// Close about us modal
        // Add to your setupEventListeners function
        if (target.id === 'cleanup-chats-btn') {
            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';

            // Show confirmation dialog
            if (confirm("This will permanently delete all chat messages older than 15 days. Continue?")) {
                autoDeleteOldChats();
            }
        }

        // Close about us modal
        if (target.id === 'close-about-modal') {
            document.getElementById('about-us-modal').remove();
        }
        if (target.id === 'mode-signin' || target.id === 'mode-signup') {
            const isSignin = target.id === 'mode-signin';
            document.getElementById('mode-signin').classList.toggle('bg-indigo-600', isSignin);
            document.getElementById('mode-signin').classList.toggle('text-white', isSignin);
            document.getElementById('mode-signin').classList.toggle('shadow-sm', isSignin);
            document.getElementById('mode-signin').classList.toggle('bg-gray-100', !isSignin);
            document.getElementById('mode-signin').classList.toggle('text-gray-700', !isSignin);

            document.getElementById('mode-signup').classList.toggle('bg-indigo-600', !isSignin);
            document.getElementById('mode-signup').classList.toggle('text-white', !isSignin);
            document.getElementById('mode-signup').classList.toggle('shadow-sm', !isSignin);
            document.getElementById('mode-signup').classList.toggle('bg-gray-100', isSignin);
            document.getElementById('mode-signup').classList.toggle('text-gray-700', isSignin);

            document.getElementById('name-field-container').classList.toggle('hidden', isSignin);
            document.querySelector('#auth-form button').innerHTML = isSignin ? 'Sign in' : 'Create account';
        }

        // Profile dropdown functionality
        if (target.closest('#profile-btn')) { // Use closest to get the button
            const profileBtn = target.closest('#profile-btn');
            const dropdown = document.getElementById('profile-dropdown');
            const arrow = document.getElementById('profile-arrow');

            // Check if the button is already processing
            if (profileBtn.dataset.isBusy === 'true') {
                return;
            }
            // Set the busy flag
            profileBtn.dataset.isBusy = 'true';

            const isOpen = dropdown.classList.contains('opacity-100');

            if (isOpen) {
                dropdown.classList.remove('opacity-100', 'visible', 'scale-100');
                dropdown.classList.add('opacity-0', 'invisible', 'scale-95');
                arrow.style.transform = 'rotate(0deg)';
            } else {
                dropdown.classList.remove('opacity-0', 'invisible', 'scale-95');
                dropdown.classList.add('opacity-100', 'visible', 'scale-100');
                arrow.style.transform = 'rotate(180deg)';
            }
            setTimeout(() => {
                profileBtn.dataset.isBusy = 'false';
            }, 200);
           
        }

        // Profile modal buttons
        if (target.closest('#profile-view-btn')) {
            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderProfileModal();
        }

        if (target.closest('#movie-player-btn')) {
            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderMoviePlayerModal();
        }
if (target.closest('#breathing-exercise-btn')) {            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderBreathingModal();
        }
if (target.closest('#quiz-btn')) {            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            showQuizPopup();
        }
        // This listener is for the pop-up banner
        if (target.id === 'start-quiz-btn') {
            openQuizModal();
        }
if (target.closest('#events-btn')) {            document.getElementById('profile-dropdown').classList.remove('opacity-100', 'visible', 'scale-100');
            document.getElementById('profile-dropdown').classList.add('opacity-0', 'invisible', 'scale-95');
            document.getElementById('profile-arrow').style.transform = 'rotate(0deg)';
            renderEventsModal();
        }

if (target.closest('#sign-out-btn')) await signOut(auth);
        if (target.id === 'theme-toggle-btn') {
            isDarkMode = !isDarkMode;
            applyTheme();
            // Force re-render to update all elements
            if (user) {
                renderAppContent(false);
                drawInteractiveChart(chartData);
            }
        }

        // ===== New Feeling Wheel Listeners =====
        const mainMoodButton = target.closest('.mood-grid-button');
        const subMoodBtn = target.closest('.sub-mood-btn');
        const editMoodBtn = target.closest('#edit-mood-btn');
        const subMoodClose = target.closest('.sub-mood-close');

        if (mainMoodButton) {
            const moodName = mainMoodButton.dataset.mood;
            const mood = cons.FEELING_WHEEL[moodName];
            const subMoodPopup = document.getElementById('sub-mood-pop-up');

            let subButtonsHTML = `<button class="sub-mood-close" aria-label="Close">&times;</button>`;
            subButtonsHTML += mood.sub.map(subMood =>
                `<button class="sub-mood-btn" data-main-mood="${moodName}" data-sub-mood="${subMood}" style="--slice-bg: ${mood.color}; --slice-text: #ffffff;">
                    ${subMood}
                </button>`
            ).join('');

            subMoodPopup.innerHTML = subButtonsHTML;
            subMoodPopup.classList.add('visible');
        }
if (subMoodBtn) {
            const subMoodPopup = subMoodBtn.closest('#sub-mood-pop-up');

            // Check if a mood is already being saved
            if (subMoodPopup && subMoodPopup.dataset.isBusy === 'true') {
                return;
            }
            // Set the busy flag on the popup container
            if (subMoodPopup) {
                subMoodPopup.dataset.isBusy = 'true';
            }

            const mainMood = subMoodBtn.dataset.mainMood;
            const subMood = subMoodBtn.dataset.subMood;
            
            // Add a saving state *inside* the popup
            if(subMoodPopup) {
                subMoodPopup.innerHTML = `<div class="sub-mood-saving">Saving...</div>`;
            }
            
            // await the async function. No 'finally' is needed
            // because handleMoodPick re-renders the whole app, destroying this popup.
            await handleMoodPick(mainMood, subMood);
        }

        if (subMoodClose) {
            document.getElementById('sub-mood-pop-up').classList.remove('visible');
        }

        if (editMoodBtn) {
            // Simply re-render the mood picker to show the wheel again
            todayMood = { notes: todayMood.notes || [] }; // Keep notes, but clear mood
            const pickerElement = document.getElementById('mood-picker');
            if (pickerElement) {
                pickerElement.outerHTML = renderMoodPicker();
            }
        }
        if (target.closest('#chat-send-btn')) handleChatSend();
        // Handle chat starter button clicks
        const starterBtn = target.closest('.chat-starter-button');
        if (starterBtn) {
            const promptText = starterBtn.textContent || starterBtn.innerText;
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = promptText; // Set input value
                handleChatSend(); // Send the message
                chatInput.focus(); // Focus input after sending
            }
        }

        // --- ADDED FOR SPEECH-TO-TEXT ---
        const voiceBtn = target.closest('#voice-input-btn');
        if (voiceBtn) {
            handleVoiceInput();
        }
        // --- END SPEECH-TO-TEXT ---

  if (target.id === 'add-note-btn') {
            e.preventDefault();
            const addBtn = target.closest('#add-note-btn');
            
            // Check if already disabled
            if (addBtn.disabled) return;
            
            addBtn.disabled = true;
            addBtn.innerHTML = 'Adding...';
            
            try {
                // await the async function
                await handleAddNote();
            } catch (error) {
                console.error("Error adding note:", error);
                // Optionally show an error to the user
            } finally {
                // Re-enable the button
                addBtn.disabled = false;
                addBtn.innerHTML = 'Add Note';
            }
        }
       const deleteBtn = target.closest('.note-delete-btn');
        if (deleteBtn) {
            // Check if already disabled
            if (deleteBtn.disabled) return;
            // Disable button immediately
            deleteBtn.disabled = true; 

            const index = parseInt(deleteBtn.dataset.noteIndex, 10);
            const noteItem = deleteBtn.closest('.note-item');
            if (noteItem) {
                noteItem.classList.add('deleting');
            }
            
            setTimeout(async () => {
                try {
                    await handleDeleteNote(index);
                    // On success, renderNotes() is called by handleDeleteNote,
                    // so the button is removed automatically.
                } catch (error) {
                    console.error("Error deleting note:", error);
                    // On failure, restore the UI
                    if (noteItem) {
                        noteItem.classList.remove('deleting');
                    }
                    deleteBtn.disabled = false;
                }
            }, 300); // Match the animation time
        }
        // ===== NEW Sleep Listeners =====
        if (target.id === 'start-sleep-track-btn') {
            document.getElementById('sleep-popup-banner')?.remove();
            renderSleepTrackingModal(todaySleep);
        }
        if (target.id === 'close-sleep-popup-btn') {
            document.getElementById('sleep-popup-banner')?.remove();
        }
        if (target.id === 'main-sleep-track-btn') {
            renderSleepTrackingModal(todaySleep);
        }
        if (target.id === 'close-sleep-modal-btn') {
            document.getElementById('sleep-modal')?.remove();
        }
       // Music Player controls
        if (target.closest('#play-pause-btn')) {
            const playPauseBtn = target.closest('#play-pause-btn');

            // Check if busy
            if (playPauseBtn.dataset.isBusy === 'true') {
                return;
            }
            // Set busy flag
            playPauseBtn.dataset.isBusy = 'true';

            if (audio.paused) {
                if (audio.src) {
                    audio.play().catch(e => console.error("Play error:", e));
                } else {
                    loadAndPlaySong();
                }
            } else {
                audio.pause();
            }

            // Release the lock after a short delay
            setTimeout(() => {
                playPauseBtn.dataset.isBusy = 'false';
            }, 300); // 300ms debounce
        }
       if (target.closest('#next-btn')) playNextSong();
        if (target.closest('#shuffle-btn')) {
            isShuffled = !isShuffled;
            target.classList.toggle('text-indigo-500', isShuffled);
            target.classList.toggle('text-gray-500', !isShuffled);
            if (isShuffled) {
                shuffledPlaylist = shuffleArray([...getCurrentPlaylist()]);
                currentTrackIndex = 0;
            }
        }

    });

    appRoot.addEventListener('submit', async (e) => {
        if (e.target.id === 'auth-form') {
            e.preventDefault();
            const formData = new FormData(e.target);
            const { email, password, name } = Object.fromEntries(formData.entries());
            const isSignup = !document.getElementById('name-field-container').classList.contains('hidden');
            renderAuthCard("", "", true, isSignup ? 'signup' : 'signin'); // Pass current mode

            try {
                if (isSignup) {
                    // 1. Create user
                    const cred = await createUserWithEmailAndPassword(auth, email, password);
                    const displayName = titleCase(name || email.split("@")[0]);

                    // 2. Send verification email
                    await sendEmailVerification(cred.user);

                    // 3. Update profile and create user doc (add email for reference)
                    await updateProfile(cred.user, { displayName });
                    await setDoc(doc(db, `artifacts/${cons.appId}/users/${cred.user.uid}`), {
                        displayName,
                        email: cred.user.email, // Good to store this
                        joinedAt: serverTimestamp()
                    });

                    // 4. Sign the user out so they must verify
                    await signOut(auth);

                    // 5. Show a success message on the sign-in card
                    renderAuthCard(
                        "", // No error
                        "Account created! Please check your email to verify your account before signing in. (Check spam!)", // Notice
                        false, // Not loading
                        'signin' // Switch to sign-in mode
                    );
                    return; // Stop execution

                } else {
                    // --- SIGN IN LOGIC ---
                    const cred = await signInWithEmailAndPassword(auth, email, password);

                    // Check if the user is verified *before* letting them in
                    if (!cred.user.emailVerified) {
                        await signOut(auth); // Log them out
                        renderAuthCard(
                            "Please verify your email", // Error
                            "You must verify your email before signing in. We sent a link to your inbox. (Check spam!)", // Notice
                            false,
                            'signin'
                        );
                        return; // Stop
                    }
                    // If verified, onAuthStateChanged will now handle the successful login
                }
            } catch (err) {
                const message = err.code ? err.code.replace('auth/', '').replace(/-/g, ' ') : err.message;
                // Pass the current mode to renderAuthCard so it doesn't flip back on error
                renderAuthCard(titleCase(message), "", false, isSignup ? 'signup' : 'signin');
            }
        }
        if (e.target.id === 'sleep-track-form') {
            e.preventDefault();
            const formData = new FormData(e.target);
            const hoursSlept = parseFloat(formData.get('hoursSlept'));
            const timesAwoke = parseInt(formData.get('timesAwoke'), 10);

            if (isNaN(hoursSlept) || isNaN(timesAwoke)) {
                alert("Please enter valid numbers.");
                return;
            }

            // Show loading state on button
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Saving...';

            await handleSleepRecordSave(hoursSlept, timesAwoke);
        }
     // Edit profile form submission
        if (e.target.id === 'edit-profile-form') {
            e.preventDefault();
            const displayName = document.getElementById('edit-display-name').value.trim();

            if (!displayName) {
                alert('Username is required');
                return;
            }
            
            // Get and disable the submit button
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                const userPath = `artifacts/${cons.appId}/users/${user.uid}`;
                await updateDoc(doc(db, userPath), {
                    displayName: titleCase(displayName),
                    updatedAt: serverTimestamp()
                });

                // Update local profile
                profile.displayName = titleCase(displayName);

                // Close edit modal and show profile modal
                document.getElementById('edit-profile-modal').remove();
                renderProfileModal();

                // Update header display name
                const profileBtn = document.getElementById('profile-btn');
                if (profileBtn) {
                    const nameSpan = profileBtn.querySelector('span');
                    if (nameSpan) {
                        nameSpan.textContent = `Hi, ${profile.displayName}`;
                    }
                }

                // Update dropdown display name
                const dropdownName = document.querySelector('#profile-dropdown h3');
                if (dropdownName) {
                    dropdownName.textContent = profile.displayName;
                }

            } catch (error) {
                console.error('Error updating profile:', error);
                alert('Failed to update username. Please try again.');
                
                // Re-enable the button if the save failed
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        }
    });

    appRoot.addEventListener('keydown', (e) => {
        if (e.target.id === 'chat-input' && e.key === 'Enter') {
            e.preventDefault();
            handleChatSend();
        }
        if (e.target.id === 'note-input' && e.key === 'Enter') {
            e.preventDefault();
            handleAddNote();
        }
    });

    audio.addEventListener('play', () => {
        document.getElementById('play-icon')?.classList.add('hidden');
        document.getElementById('pause-icon')?.classList.remove('hidden');
    });
    audio.addEventListener('pause', () => {
        document.getElementById('play-icon')?.classList.remove('hidden');
        document.getElementById('pause-icon')?.classList.add('hidden');
    });
    audio.addEventListener('ended', playNextSong);

    // Close profile dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const profileBtn = document.getElementById('profile-btn');
        const dropdown = document.getElementById('profile-dropdown');
        const arrow = document.getElementById('profile-arrow');

        if (profileBtn && dropdown && arrow &&
            !profileBtn.contains(e.target) &&
            !dropdown.contains(e.target) &&
            dropdown.classList.contains('opacity-100')) {

            dropdown.classList.remove('opacity-100', 'visible', 'scale-100');
            dropdown.classList.add('opacity-0', 'invisible', 'scale-95');
            arrow.style.transform = 'rotate(0deg)';
        }
    });
    // In your featureContainer event listeners, make sure you have this:
    featureContainer.addEventListener('click', (e) => {
        const target = e.target;

        // Close about us modal - FIXED VERSION
        if (target.id === 'close-about-modal' || target.closest('#close-about-modal')) {
            const modal = document.getElementById('about-us-modal');
            if (modal) {
                const modalContent = modal.querySelector('.modal-content');
                modalContent.classList.add('scale-95', 'opacity-0');
                setTimeout(() => modal.remove(), 300);
            }
        }

        // Other event listeners...
    });
    // Add event delegation for feature container (modals)
    featureContainer.addEventListener('click', (e) => {
        const target = e.target;

        // Close profile modal
        if (target.id === 'close-profile-modal') {
            document.getElementById('profile-modal').remove();
        }

        // Close movie modal
        if (target.id === 'close-movie-modal') {
            document.getElementById('movie-player-modal').remove();
        }

        // Close events modal
        if (target.id === 'close-events-modal') {
            document.getElementById('events-modal').remove();
        }

        // Next video button
        if (target.id === 'next-video-btn') {
            const iframe = document.getElementById('movie-iframe');
            const randomVideoId = cons.MOTIVATIONAL_VIDEOS[Math.floor(Math.random() * cons.MOTIVATIONAL_VIDEOS.length)];
            iframe.src = `https://www.youtube.com/embed/${randomVideoId}?enablejsapi=1&origin=${window.location.origin}`;
        }

        // Video category buttons
        if (target.classList.contains('video-category-btn')) {
            const category = target.dataset.category;
            const iframe = document.getElementById('movie-iframe');
            const videos = cons.VIDEO_GENRES[category] || cons.MOTIVATIONAL_VIDEOS;
            const randomVideoId = videos[Math.floor(Math.random() * videos.length)];

            iframe.src = `https://www.youtube.com/embed/${randomVideoId}?enablejsapi=1&origin=${window.location.origin}`;
        }

        // Video thumbnail buttons
        if (target.classList.contains('video-thumbnail-btn')) {
            const videoId = target.dataset.videoId;
            const iframe = document.getElementById('movie-iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
        }
    });
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (user) drawInteractiveChart(chartData);
    }, 150);
});

function main() {
    // Load TTS preference
    isAutoTTS = "false";
    // Initialize theme
    const savedTheme = localStorage.getItem('YouthMind-theme');
    isDarkMode = savedTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDarkMode);

    renderLoadingScreen();
    try {
        app = initializeApp(cons.firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setPersistence(auth, browserLocalPersistence);
    } catch (e) {
        appRoot.innerHTML = `<div class="p-4 text-red-600">Firebase initialization failed. Check console for details.</div>`;
        console.error(e);
        return;
    }

    setupEventListeners();

    onAuthStateChanged(auth, async (u) => {
        if (chatUnsubscribe) chatUnsubscribe();
        if (u) {
            user = u;
            renderAppShell();
            renderAppContent(true);
              setTimeout(renderEveningCheckinBanner(), 20000); 
              setTimeout(showQuizPopup, 4000);

// Show the sleep popup 5 seconds after
setTimeout(showSleepPopup, 5000);



            const userDoc = await getDoc(doc(db, `artifacts/${cons.appId}/users/${u.uid}`));
            profile = userDoc.exists() ? { uid: u.uid, ...userDoc.data() } : { uid: u.uid, displayName: u.displayName || u.email?.split('@')[0] || "Friend" };

            // --- NEW: Site Tour Trigger & Badge Init ---
          // --- UPDATED: Site Tour Trigger (Second Login) & Badge Init ---
          // --- NEW: Site Tour Trigger & Badge Init ---
         // --- UPDATED: Site Tour Trigger (Second Login) & Badge Init ---
            previousBadgeCount = getUserBadges(profile, calendarMap, chatMessages).length; // Initialize badge count

            // Check if the tour has *not* been completed yet
            if (!profile.hasCompletedTour) {
                // Now check if this is the *first* login or a subsequent one
                if (profile.firstLoginOccurred) {
                    // If firstLoginOccurred is true, this is the second (or later) login. Start the tour!
                    setTimeout(startTour, 1500);
                } else {
                    // This is the very first login. Mark it, but don't start the tour yet.
                    console.log("First login detected. Marking profile, tour will start on next login.");
                    try {
                        const userPath = `artifacts/${cons.appId}/users/${user.uid}`;
                        await updateDoc(doc(db, userPath), { firstLoginOccurred: true });
                        profile.firstLoginOccurred = true; // Update local profile too
                    } catch (error) {
                        console.error("Error marking first login occurred:", error);
                    }
                }
            }
            // --- END UPDATED ---
            const chatPath = `artifacts/${cons.appId}/chats/${u.uid}/messages`;
            const q = query(collection(db, chatPath), orderBy("sentAt", "asc"));
          chatUnsubscribe = onSnapshot(q, (snap) => {
                if (snap.empty) {
                    // --- NEW: Add default messages if history is empty ---
                    chatMessages = [
                        { id: 'default-bot', sender: 'bot', text: 'Sometimes all you need is a chat that understands. Welcome in 🙏'  , sentAt: new Date() }
                    ];
                    // --- END NEW ---
                } else {
                    // Original logic: Populate from Firestore
                    chatMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                }

                // Update UI (this part remains the same)
                const chatInput = document.getElementById('chat-input');
                const isTyping = chatInput ? chatInput.disabled : false;
                // Pass false for showAlert initially
                updateChatMessages(chatMessages, isTyping, false);
            });
            await refreshMoodData(u.uid);
            await refreshSleepData(u.uid); // <-- ADD THIS LINE
            await refreshReminders(u.uid); // <-- ADD THIS

            try {
                const ratingDoc = await getDoc(doc(db, `artifacts/${cons.appId}/dayRatings/${user.uid}/days`, dateId()));
                todayDayRating = ratingDoc.exists() ? ratingDoc.data() : null;
            } catch (e) { console.error("Error fetching today's day rating:", e); }
            // --- END NEW ---
            startReminderChecks();        // <-- ADD THIS
            applyMoodTheme(todayMood?.label || "Neutral");
            renderAppContent(false);
            drawInteractiveChart(chartData);
            updateMusicCategoryFromMood();

            // Shuffle playlist on login to prepare for playback
            shuffledPlaylist = shuffleArray([...getCurrentPlaylist()]);
            currentTrackIndex = 0;

        } else {
            user = null;
            applyMoodTheme("Neutral"); // Reset theme to default
            profile = null;
            reminders = []; // Clear reminders
            stopReminderChecks(); // <-- ADD THIS
            renderAuthCard();
        }
    });
}
// In your final app, you'll remove this and use your existing `isDarkMode` variable.






let quizPopupTimeout;
let quizResultTimeout;

// ===== 1. POPUP BANNER LOGIC =====
function showQuizPopup() {
    const popupHTML = `
                <div id="quiz-popup-banner" class="quiz-popup fixed bottom-0 left-0 right-0 sm:bottom-5 sm:left-5 sm:right-auto sm:w-auto sm:max-w-md p-4 sm:rounded-lg shadow-2xl bg-white dark:bg-gray-800 border-t sm:border dark:border-gray-700 flex items-center justify-between pointer-events-auto" z-50>
                    <div>
                        <h4 class="font-semibold text-gray-800 dark:text-gray-200">Quick Check-in?</h4>
                        <p class="text-sm text-gray-600 dark:text-gray-400">Take a moment to see how you're feeling.</p>
                    </div>
                    <button id="start-quiz-btn" class="ml-4 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors flex-shrink-0">Start Quiz</button>
                </div>
            `;
    featureContainer.insertAdjacentHTML('beforeend', popupHTML);

    // document.getElementById('start-quiz-btn').addEventListener('click', openQuizModal);

    quizPopupTimeout = setTimeout(() => {
        const banner = document.getElementById('quiz-popup-banner');
        if (banner) banner.remove();
    }, 15000);
}

// ===== 2. QUIZ MODAL LOGIC =====
async function openQuizModal() {
    clearTimeout(quizPopupTimeout);
    const banner = document.getElementById('quiz-popup-banner');
    if (banner) banner.remove();

    featureContainer.insertAdjacentHTML('beforeend', `
                <div id="quiz-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4 pointer-events-auto">
                    <div class="modal-content w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
                        <div class="p-6 text-center">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Generating your check-in...</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Just a moment!</p>
                            <div class="flex justify-center mt-4">
                                <div class="w-8 h-8 border-4 border-t-transparent border-indigo-500 rounded-full animate-spin"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `)

    try {
        const questions = await generateQuizQuestions();
        renderQuiz(questions);
    } catch (error) {
        console.error("Failed to generate quiz:", error);
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `<div class="p-6 text-center"><h2 class="text-xl font-bold text-red-600 dark:text-red-400">Oops!</h2><p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Could not generate the quiz. Please try again later.</p><button id="close-modal-btn" class="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg">Close</button></div>`;
            document.getElementById('close-modal-btn').addEventListener('click', closeModal);
        }
    }
}

async function generateQuizQuestions() {
    // Ensure we use the correct model
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gem.GEMINI_API_KEY}`;    
    // Simplified prompt that enforces JSON structure via text instructions
    const prompt = `Generate 5 creative, funny, but insightful multiple-choice questions for a student's mental health check-in quiz. 
    
    Output ONLY a valid JSON object with this exact structure:
    {
      "quiz": [
        {
          "question": "Question text here",
          "options": ["Option 1", "Option 2", "Option 3"],
          "scores": [2, 1, 0]
        }
      ]
    }

    Rules:
    - Provide 3 options per question.
    - 'scores' array must match the order of 'options'.
    - Score 2 = Positive/Healthy, 1 = Neutral, 0 = Negative/Unhealthy.
    - Ensure questions are unique and relevant to young adults.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json" // Keep this to ensure JSON output
            // responseSchema removed to prevent 400 errors
        }
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error Details:", errorData);
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const jsonText = result.candidates[0].content.parts[0].text;
        return JSON.parse(jsonText).quiz;

    } catch (error) {
        console.error("Quiz Generation Error:", error);
        throw error; // Re-throw to be caught by the calling function
    }
}

function renderQuiz(questions) {
    const modalContent = document.querySelector('.modal-content');
    if (!modalContent) return;

    const questionsHTML = questions.map((q, index) => `
                <div class="mb-6">
                    <p class="font-semibold text-gray-800 dark:text-gray-200">${index + 1}. ${q.question}</p>
                    <div class="mt-3 space-y-2 custom-radio">
                        ${q.options.map((opt, i) => `
                            <div>
                                <input type="radio" id="q${index}_opt${i}" name="question_${index}" value="${q.scores[i]}" required>
                                <label for="q${index}_opt${i}" class="block w-full p-3 text-sm rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer text-gray-700 dark:text-gray-300">
                                    ${opt}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');

    modalContent.innerHTML = `
                <div class="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Mental State Check-in</h2>
                        <button id="close-modal-btn" class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
                    </div>
                </div>
                <form id="quiz-form" class="p-6 overflow-y-auto">
                    ${questionsHTML}
                    <button type="submit" class="w-full mt-4 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">Submit Answers</button>
                </form>
            `;

    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('quiz-form').addEventListener('submit', handleQuizSubmit);
}

function handleQuizSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    let totalScore = 0;
    for (const value of formData.values()) {
        totalScore += parseInt(value, 10);
    }
    if (!profile.completedQuiz) { // Mark that quiz has been completed once
        profile.completedQuiz = true;
        // Optionally update Firestore here if needed:
        // await updateDoc(doc(db, `artifacts/${cons.appId}/users/${user.uid}`), { completedQuiz: true });
        checkAndNotifyBadgeUpdate(); // Check for badge after marking
    }
    showQuizResults(totalScore);
}

function showQuizResults(score) {
    let title, message, recommendation;

    if (score <= 5) {
        title = "It's Okay to Need Support";
        message = "It seems like things might be a bit heavy right now, and that's completely okay. Reaching out is a sign of strength.";
        recommendation = renderCounselorSection(true); // true for modal version
    } else if (score >= 6 && score <= 8) {
        title = "You're Doing Great!";
        message = "You're navigating things well. Remember to keep taking time for yourself. A little self-care goes a long way!";
        recommendation = `<p class="mt-4 text-sm text-gray-600">Keep up the great work, champ!</p>`;
    } else {
        title = "You're Shining Bright! ✨";
        message = "Amazing! You're rocking it. Keep embracing that positive energy and spreading the good vibes.";
        recommendation = `<p class="mt-4 text-sm text-gray-600">You're a true champion!</p>`;
    }

    const modalContent = document.querySelector('.modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
                <div class="p-6 text-center flex flex-col max-h-[80vh]">
                    <div class="flex-shrink-0">
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${title}</h2>
                        <p class="mt-2 text-gray-700 dark:text-gray-300">Your Score: <span class="font-bold text-indigo-500">${score}/10</span></p>
                        <p class="mt-4 text-gray-600 dark:text-gray-400">${message}</p>
                    </div>
                    
                    <!-- This is the new scrollable container -->
                    <div class="mt-6 flex-grow overflow-y-auto p-1">
                        ${recommendation}
                    </div>

                     <button id="close-modal-btn" class="mt-6 px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-semibold flex-shrink-0">Close</button>
                </div>
            `;
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    quizResultTimeout = setTimeout(closeModal, 60000); // Auto-close after 1 minute
}
function detectStressFromChat() {
    const stressKeywords = ["stressed", "anxious", "overwhelmed", "panic", "nervous", "tense", "worried", "pressure"];
    const lastUserMessage = chatMessages.filter(m => m.sender === 'user').pop();

    if (lastUserMessage) {
        const message = lastUserMessage.text.toLowerCase();
        return stressKeywords.some(keyword => message.includes(keyword));
    }
    return false;
}

function showBreathingSuggestion() {
    const suggestionHTML = `
        <div id="breathing-suggestion" class="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700 max-w-xs pointer-events-auto animate-pulse">
            <div class="flex items-start">
                <div class="flex-shrink-0 text-2xl">🌬️</div>
                <div class="ml-3">
                    <h4 class="font-semibold text-gray-900 dark:text-gray-100">Feeling stressed?</h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Take a moment for deep breathing to calm your mind.</p>
                    <div class="mt-2 flex gap-2">
                        <button id="accept-breathing-suggestion" class="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg">Try It</button>
                        <button id="dismiss-breathing-suggestion" class="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded-lg">Not Now</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove any existing suggestion
    const existingSuggestion = document.getElementById('breathing-suggestion');
    if (existingSuggestion) existingSuggestion.remove();

    // Add new suggestion
    featureContainer.insertAdjacentHTML('beforeend', suggestionHTML);

    // Add event listeners
    document.getElementById('accept-breathing-suggestion').addEventListener('click', () => {
        document.getElementById('breathing-suggestion').remove();
        renderBreathingModal();
    });

    document.getElementById('dismiss-breathing-suggestion').addEventListener('click', () => {
        document.getElementById('breathing-suggestion').remove();
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        const suggestion = document.getElementById('breathing-suggestion');
        if (suggestion) suggestion.remove();
    }, 10000);
}
// Auto-delete functionality removed; manual delete remains via UI.
// You can call showBreathingSuggestion() when stress is detected in chat
function closeModal() {
    clearTimeout(quizResultTimeout);
    const modal = document.getElementById('quiz-modal');
    if (modal) modal.remove();
}
// Manual delete ALL messages function
async function deleteAllChats() {
    if (!user) return;

    try {
        const chatPath = `artifacts/${cons.appId}/chats/${user.uid}/messages`;

        // Query for ALL messages (no date filter)
        const q = query(collection(db, chatPath));

        const querySnapshot = await getDocs(q);
        const deletePromises = [];

        querySnapshot.forEach((doc) => {
            deletePromises.push(deleteDoc(doc.ref));
        });

        await Promise.all(deletePromises);

        if (deletePromises.length > 0) {
            console.log(`Manually deleted ${deletePromises.length} chat messages`);

            // Clear local chat messages array
            chatMessages = [];
            updateChatMessages(chatMessages, false, false);

            // Show notification
            showNotification(`Deleted all ${deletePromises.length} messages`);
        } else {
            showNotification("No messages to delete");
        }
    } catch (error) {
        console.error("Error deleting all chats:", error);
        showNotification("Error deleting messages", true);
    }
}
// Helper function to show notifications
function showNotification(message, isError = false, isBadge = false) { // Add isBadge parameter
    const notification = document.createElement('div');
    // Add conditional class for badges
    const badgeClass = isBadge ? 'badge-notification' : (isError ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200');
    notification.className = `fixed bottom-4 right-4 ${badgeClass} px-4 py-3 rounded-lg shadow-xl text-sm transition-all duration-500 transform translate-y-10 opacity-0 z-[110]`; // Increased z-index

    notification.innerHTML = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.remove('translate-y-10', 'opacity-0');
        notification.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('translate-y-0', 'opacity-100');
        notification.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
function showSleepPopup() {
    const now = new Date();
    const hour = now.getHours();

    // Show between 6 AM (6) and 11 AM (10:59:59)
    if (hour >= 5 && hour < 11) {
        // Check if sleep was already recorded today
        if (!todaySleep) {
            renderSleepPopupBanner();
        }
    }
}

// ===== INITIALIZATION =====
// ===== NEW Smart Popup Logic =====

// ===== INITIALIZATION =====
// Run the main application one time
main();

// Call smart popups *after* main() has run and data (like todayDayRating) is fetched
// We'll call this at the end of onAuthStateChanged instead


