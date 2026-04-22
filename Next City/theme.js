// Theme toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const icon = themeToggle.querySelector('i');

    // Check for saved theme preference or default to dark mode
    const currentTheme = localStorage.getItem('theme') || 'dark';
    if (currentTheme === 'light') {
        body.classList.add('light-mode');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }

    // Toggle theme on button click
    themeToggle.addEventListener('click', function(e) {
        e.preventDefault();

        if (body.classList.contains('light-mode')) {
            // Switch to dark mode
            body.classList.remove('light-mode');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            localStorage.setItem('theme', 'dark');
        } else {
            // Switch to light mode
            body.classList.add('light-mode');
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            localStorage.setItem('theme', 'light');
        }
    });

    // Chatbot functionality
    const fab = document.getElementById('chatbot-toggle');
    const chatWindow = document.getElementById('chatbot-window');
    const messages = document.getElementById('chatbot-messages');
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    const suggestions = document.getElementById('chatbot-suggestions');
    const minimizeBtn = document.getElementById('chatbot-minimize');

    let isOpen = false;

    // Toggle chat window
    fab.addEventListener('click', function() {
        isOpen = !isOpen;
        if (isOpen) {
            chatWindow.classList.add('active');
            fab.classList.add('open');
            input.focus();
        } else {
            chatWindow.classList.remove('active');
            fab.classList.remove('open');
        }
    });

    // Minimize chat
    minimizeBtn.addEventListener('click', function() {
        isOpen = false;
        chatWindow.classList.remove('active');
        fab.classList.remove('open');
    });

    // API Key Panel Logic
    const settingsBtn = document.getElementById('chatbot-settings-btn');
    const apiPanel = document.getElementById('chatbot-api-panel');
    const apiInput = document.getElementById('chatbot-api-input');
    const apiSaveBtn = document.getElementById('chatbot-api-save');

    // Load saved API key
    const savedKey = localStorage.getItem('chatgpt_api_key');
    if (savedKey) {
        apiInput.value = savedKey;
    }

    settingsBtn.addEventListener('click', function() {
        apiPanel.classList.toggle('hidden');
    });

    apiSaveBtn.addEventListener('click', function() {
        const key = apiInput.value.trim();
        if (key) {
            localStorage.setItem('chatgpt_api_key', key);
            apiSaveBtn.textContent = 'Saved!';
            setTimeout(() => {
                apiSaveBtn.textContent = 'Save';
                apiPanel.classList.add('hidden');
            }, 1000);
        } else {
            localStorage.removeItem('chatgpt_api_key');
            apiPanel.classList.add('hidden');
        }
    });

    // Send message
    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        input.value = '';

        // Hide suggestions after first message
        suggestions.classList.add('hidden');

        // Show typing indicator
        showTyping();

        // Get response asynchronously
        const response = await getBotResponse(text);
        hideTyping();
        addMessage(response, 'bot');
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Suggestion chips
    suggestions.addEventListener('click', function(e) {
        if (e.target.classList.contains('sc-suggestion-chip')) {
            input.value = e.target.textContent;
            sendMessage();
        }
    });

    function addMessage(text, sender) {
        const msgWrap = document.createElement('div');
        msgWrap.className = `sc-msg-wrap sc-msg-${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'sc-msg-avatar';
        avatar.innerHTML = sender === 'bot' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';

        const bubble = document.createElement('div');
        bubble.className = 'sc-bubble';
        bubble.innerHTML = text;

        msgWrap.appendChild(avatar);
        msgWrap.appendChild(bubble);
        messages.appendChild(msgWrap);

        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
        const typingWrap = document.createElement('div');
        typingWrap.className = 'sc-msg-wrap sc-msg-bot';
        typingWrap.id = 'typing-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'sc-msg-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';

        const bubble = document.createElement('div');
        bubble.className = 'sc-typing-bubble';
        bubble.innerHTML = '<span></span><span></span><span></span>';

        typingWrap.appendChild(avatar);
        typingWrap.appendChild(bubble);
        messages.appendChild(typingWrap);
        messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }

    async function getBotResponse(message) {
        const apiKey = localStorage.getItem('chatgpt_api_key');
        
        // Try getting user's GPS for actual 'nearest' queries, but default to Karshi Presidential School
        let locationContext = "User is located at: Presidential School, Karshi, Qashqadaryo Region, Uzbekistan.";
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
                });
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                locationContext = `User's exact real-time GPS coordinates: Latitude ${lat}, Longitude ${lon}. Use these exact coordinates to find real geographical places near them when asked for 'nearest'.`;
            } catch (err) {
                console.log("GPS not available or denied.");
            }
        }
        
        if (apiKey) {
            try {
                const systemPrompt = `You are a Smart City AI assistant. You help users with urban knowledge and finding nearby places. ${locationContext} If the user asks for 'nearest' places, use their coordinates to give a precise, factual geographical answer. IMPORTANT: Whenever you suggest a location, ALWAYS provide a clickable Google Maps link in Markdown format, for example: [View on Google Maps](https://www.google.com/maps/search/?api=1&query=Stadium+Name).`;
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini", // fallback to 3.5-turbo if needed, but 4o-mini is standard and fast
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: message }
                        ]
                    })
                });

                if (!response.ok) {
                    throw new Error('API error: ' + response.statusText);
                }

                const data = await response.json();
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    let text = data.choices[0].message.content;
                    return text.replace(/\n/g, '<br>');
                } else {
                    return "Sorry, I couldn't understand the response from the server.";
                }
            } catch (error) {
                console.error("ChatGPT API Error:", error);
                return "There was an error communicating with the AI. Please verify your API key in the settings.";
            }
        }

        // Fallback Mock Logic if no API Key
        const msg = message.toLowerCase();

        // Dynamically find nearest anything via Google Maps search directly
        const nearestMatch = msg.match(/nearest (.+?)(?: to me)?(?: please)? \s*$/i) || msg.match(/nearest (.+)/i);
        if (nearestMatch) {
            let place = nearestMatch[1].replace('to me', '').trim();
            // Capitalize first letter
            let displayPlace = place.charAt(0).toUpperCase() + place.slice(1);
            return `I can help you find that! Based on your location, I've opened a search for the nearest <strong>${displayPlace}</strong> on Google Maps:<br><br><a href='https://www.google.com/maps/search/${encodeURIComponent(place)}/' target='_blank' style='color:var(--primary-color); text-decoration:none;'>📍 Find Nearest ${displayPlace}</a><br><br><small>(Note: Add your ChatGPT API Key in the settings for real-time text intelligence.)</small>`;
        }

        if (msg.includes('what is') && msg.includes('smart city')) {
            return "A Smart City uses technology and data to improve residents' quality of life. It integrates AI, IoT sensors, and digital networks to optimize city operations, reduce environmental impact, and enhance services like transportation, healthcare, and public safety.";
        }

        if (msg.includes('benefit') || msg.includes('advantages')) {
            return "Smart cities offer numerous benefits: improved efficiency, reduced costs, better environmental sustainability, enhanced public safety, optimized transportation, and higher quality of life for residents through data-driven decision making.";
        }

        if (msg.includes('example') || msg.includes('cities')) {
            return "Leading smart cities include Singapore (excellent urban planning), Dubai (innovative infrastructure), London (advanced transportation), Seoul (digital governance), and Beijing (massive IoT deployment). Uzbekistan is developing Tashkent as a smart city.";
        }

        if (msg.includes('uzbekistan') || msg.includes('tashkent')) {
            return "Uzbekistan is rapidly implementing smart city technologies under its Digital Uzbekistan-2030 strategy. Tashkent is being developed as a major smart city with focus on AI, sustainable infrastructure, and digital services.";
        }

        if (msg.includes('ai') || msg.includes('artificial intelligence')) {
            return "AI is central to smart cities, enabling predictive analytics, autonomous systems, personalized services, and efficient resource management. By 2026, AI will power most smart city operations worldwide.";
        }

        if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
            return "Hello! I'm here to help you learn about smart cities or find places nearby. What would you like to know? (Set your ChatGPT API Key via the cog icon to activate my full AI brain!)";
        }

        if (msg.includes('thank') || msg.includes('thanks')) {
            return "You're welcome! Feel free to ask me anything else.";
        }

        return "That's an interesting question! I am equipped to answer questions about Smart Cities and finding nearest locations. For full AI capabilities, please enter your ChatGPT API key in the settings menu.";
    }
});