export const DAY_RATING_QUESTIONS = [
    { id: 'overall', text: 'First, how was your day overall?', emojis: ['😭', '😕', '😐', '🙂', '😄'] },
    { id: 'productivity', text: 'How productive did you feel?', emojis: ['Not at all', 'A little', 'Okay', 'Productive', 'Very Productive'] },
    { id: 'social', text: 'How were your social interactions?', emojis: ['Drained', 'Not great', 'Neutral', 'Good', 'Energized'] },
    { id: 'selfCare', text: 'Did you make time for self-care?', emojis: ['No time', 'Briefly', 'Some', 'Yes', 'Absolutely'] }
];
// Note: We'll add a 'Finish' step inside the modal logic
export const TOUR_STEPS = [
    { selector: '#mood-picker', title: 'Track Your Mood', text: 'Select your main feeling here, then pick a more specific sub-mood. Your choice sets the app\'s background vibe!' },
    { selector: '#notes-section', title: 'Daily Notes', text: 'Jot down quick thoughts or reflections about your day here.' },
    { selector: '#chat-box', title: 'AI Chat Buddy', text: 'Chat with YouthMind! It listens, offers support, and adapts to your mood. You can type or use voice input.' },
    { selector: '#sleep-tracker', title: 'Sleep Tracking', text: 'Log your sleep hours and wake-ups. Get a sleep score and see trends on the chart.' },
    { selector: '#music-player', title: 'Mood Music', text: 'Listen to music playlists curated based on your current mood.' },
    { selector: '#main-content > div:nth-child(5)', title: 'Activities & Counselors', text: 'Explore motivational movies, breathing exercises, events, or connect directly with professional counselors.' },
    { selector: '#profile-btn', title: 'Your Profile', text: 'Access your profile here to view stats, earned badges, and other options like the site tour.' },
];
export const FEELING_WHEEL = {
    // Maps to "Very Happy" score
    "Happy": { score: 2, emoji: "✨", color: "#8b5cf6", sub: ["Joyful", "Proud", "Optimistic", "Peaceful"] },
    // Maps to "Happy" score
    "Surprise": { score: 1, emoji: "🎉", color: "#22c55e", sub: ["Excited", "Amazed", "Startled", "Confused"] },
    // Maps to "Neutral" score
    "Disgust": { score: 0, emoji: "😑", color: "#eab308", sub: ["Disappointed", "Awful", "Disapproval", "Avoidance"] },
    // Maps to "Sad" score
    "Anger": { score: -1, emoji: "😠", color: "#f97316", sub: ["Distant", "Threatened", "Hurt", "Mad"] },
    // Maps to "Sad" score
    "Fear": { score: -1, emoji: "😨", color: "#f97316", sub: ["Scared", "Anxious", "Rejected", "Insecure"] },
    // Maps to "Very Sad" score
    "Sad": { score: -2, emoji: "😢", color: "#ef4444", sub: ["Guilty", "Despair", "Lonely", "Bored"] }
};

export const MUSIC_TRACK_ASSIGNMENTS = {
    "Very Sad": {
        start: 1,
        end: 2,
        description: "Tracks 1-20 for very sad moods"
    },
    "Sad": {
        start: 3,
        end: 4,
        description: "Tracks 21-40 for sad moods"
    },
    "Neutral": {
        start: 5,
        end: 6,
        description: "Tracks 41-60 for neutral moods"
    },
    "Happy": {
        start: 7,
        end: 8,
        description: "Tracks 61-80 for happy moods"
    },
    "Very Happy": {
        start: 9,
        end: 10,
        description: "Tracks 81-100 for very happy moods"
    }
};
export const firebaseConfig = {
  apiKey: "AIzaSyAXO4YyCuemOzN79fLjvMaFilU7rYmP8d8",
  authDomain: "mypocketdost.firebaseapp.com",
  projectId: "mypocketdost",
  storageBucket: "mypocketdost.firebasestorage.app",
  messagingSenderId: "965449653178",
  appId: "1:965449653178:web:82ca6afa48f83748ba1b83",
  measurementId: "G-4V5Q7B1XWC"
};

export const appId = "default-app-id";



// User's Firebase Configuration


// ===== 2) Helpers & Constants =====
export const MOODS = [
    { score: -2, label: "Very Sad", emoji: "🥀", color: "#ef4444" },
    { score: -1, label: "Sad", emoji: "🌧️", color: "#f97316" },
    { score: 0, label: "Neutral", emoji: "🌤️", color: "#eab308" },
    { score: 1, label: "Happy", emoji: "🌈", color: "#22c55e" },
    { score: 2, label: "Very Happy", emoji: "✨", color: "#8b5cf6" },
];

const COUNSELORS = [
    { name: "Ms. Dhriti", degree: "M.Sc Clinical Psychology", experience: "Expressive Art Therapy (UNESCO) 2+ Years", whatsapp: "918287502696" },
    { name: "Ms. Saravanan A", degree: "PsychoTherapist M.Sc Councelling- University of Madras", experience: "1+ Years", whatsapp: "919445733431" },
    { name: "Ms. Aanya Singhania", degree: "M.Sc Councelling Psychology-IIPR BANGALORE", experience: "1+ Years", whatsapp: "919330259556" },
 { name: "Mr. Ashish Tomar", degree: "Masters in Psychology", experience: "6 Months", whatsapp: "919548890016" },
 { name: "Yet to come", degree: "--", experience: "--", whatsapp: "91--" },
  { name: "Yet to come", degree: "--", experience: "--", whatsapp: "91--" },

];

// ===== VIDEO GENRE LINKS SECTION =====
// Add your video links here for each genre
export const VIDEO_GENRES = {
    bollywood: [
        '9cFSILnHvoU', // Replace with actual Bollywood motivational video IDs
        'hXMjKVKO18g',
        '0zFoHrvbRu4'
    ],
    hollywood: [
        'GYvONHG9a14', // Replace with actual Hollywood motivational video IDs
        'TJPFYs_88-g',
        'ioeoCbDiMvE'
    ],
    sports: [
        'U7ZOFL68B8c', // Replace with actual sports motivational video IDs
        'lF9_UnA0ts0',
        'IqCwPU14U3A'
    ],
    random: [
        'U7ZOFL68B8c', // Replace with actual sports motivational video IDs
        'lF9_UnA0ts0',
        'IqCwPU14U3A',
        'GYvONHG9a14', // Replace with actual Hollywood motivational video IDs
        'TJPFYs_88-g',
        'ioeoCbDiMvE',
        'GwzN5YknM3U',
        '9cFSILnHvoU', // Replace with actual Bollywood motivational video IDs
        'hXMjKVKO18g',
        '0zFoHrvbRu4', // Replace with actual random motivational video IDs
        //'cPa_K_s2g24',
        //'z9bZufPH12A',
        //'Z21sEOF_2oI',
        //'5MgBikgcWnY'
    ]
};

export const MOTIVATIONAL_VIDEOS = [//'dQw4w9WgXcQ', '3sK3wJAxGfs', 'mgmVOuLgFB0', 'I22gsk_Gj84', 'ZXsQAXx_ao0', 'g-jwWYX7Jlo', '6P2nPI6CTlc', 'ZXsQAXx_ao0', 'unxxS3ddI1c', 'k9zTr2MAi0g', 'GwzN5YknM3U', 'cPa_K_s2g24', 'z9bZufPH12A', 'Z21sEOF_2oI', '5MgBikgcWnY'
    // 'U7ZOFL68B8c', // Replace with actual sports motivational video IDs
    'lF9_UnA0ts0',
    'IqCwPU14U3A',
    'GYvONHG9a14', // Replace with actual Hollywood motivational video IDs
    'TJPFYs_88-g',
    'ioeoCbDiMvE',
    'GwzN5YknM3U',
    '9cFSILnHvoU', // Replace with actual Bollywood motivational video IDs
    'hXMjKVKO18g',
    '0zFoHrvbRu4',];

// ===== EVENTS DATA SECTION =====
// Add your events here
export const EVENTS_DATA = [
    {
        id: 1,
        title: "Mindfulness Meditation Session",
        date: "2024-01-15",
        time: "10:00 AM",
        description: "Join us for a guided meditation session to start your day with peace and clarity.",
        type: "wellness",
        location: "Online Zoom Meeting"
    },
    {
        id: 2,
        title: "Mental Health Awareness Workshop",
        date: "2024-01-20",
        time: "2:00 PM",
        description: "Learn about mental health, coping strategies, and how to support others.",
        type: "education",
        location: "Community Center"
    },
    {
        id: 3,
        title: "Stress Management Techniques",
        date: "2024-01-25",
        time: "6:00 PM",
        description: "Practical workshop on managing stress and building resilience.",
        type: "workshop",
        location: "Online"
    },
    {
        id: 4,
        title: "Peer Support Group Meeting",
        date: "2024-01-30",
        time: "7:00 PM",
        description: "Safe space to share experiences and connect with others on similar journeys.",
        type: "support",
        location: "Youth Center"
    }
];

export const GREETINGS = (name) => {
    const lines = [
        `Hello ${name}, ready to make today amazing? ✨`,
        `Welcome back, ${name}! What's on your mind today?`,
        `Hey ${name}, let's check in and see how you're doing.`,
        `Glad to see you, ${name}! Remember, every day is a fresh start.`,
        `Hi ${name}! Wanna share something? I'm all ears. 🎧`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
};
 export const frequencyOptions = {
        'Water': [
            { value: 'Every 30 Mins', text: 'Every 30 Minutes' },
            { value: 'Every Hour', text: 'Every Hour' },
            { value: 'Every 2 Hours', text: 'Every 2 Hours' },
        ],
        'Exercise': [
            { value: 'Daily', text: 'Daily' },
            { value: 'Weekdays', text: 'Weekdays (Mon-Fri)' },
            { value: 'Weekends', text: 'Weekends (Sat-Sun)' },
            { value: 'Custom Days', text: 'Custom Days' },
        ],
        'Sleep': [
            { value: 'Daily', text: 'Daily (Every Night)' },
            { value: 'Weekdays', text: 'Weekdays (Mon-Fri)' },
            { value: 'Custom Days', text: 'Custom Days' },
        ],
        'Custom': [
            { value: 'Once', text: 'Once (Today Only)' },
            { value: 'Daily', text: 'Daily' },
            { value: 'Custom Days', text: 'Custom Days' },
        ],
    };
