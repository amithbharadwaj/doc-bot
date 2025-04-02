
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendQuery();
    }
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
async function sendQuery() {
    const queryInput = document.getElementById('query');
    const query = queryInput.value.trim();
    const mode = document.getElementById('mode').value;
    const chatBox = document.getElementById('chatBox');
    const sendButton = document.getElementById('sendButton');

    if (!query) return;

    // Add user message
    chatBox.innerHTML += `
    <div class='message user'>
        ${query}
        <span class='message-time'>${getCurrentTime()}</span>
    </div>
    `;

    queryInput.value = '';
    sendButton.disabled = true;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    chatBox.innerHTML += `
    <div class='message bot' id="${typingId}">
        <div class='typing-indicator'>
            <div class='typing-dot'></div>
            <div class='typing-dot'></div>
            <div class='typing-dot'></div>
        </div>
    </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        let response;
        if (mode === "search") {
            response = await fetch(`/search?query=${encodeURIComponent(query)}&top_k=1`);
            const data = await response.json();
            const textResponse = data.results?.[0]?.text || "I couldn't find any information on that topic.";

            document.getElementById(typingId).outerHTML = `
    <div class='message bot'>
        ${textResponse}
        <span class='message-time'>${getCurrentTime()}</span>
    </div>
    `;
        }
        else if (mode === "image") {
            // First show prompt generation in progress
            document.getElementById(typingId).outerHTML = `
                <div class='message bot' id="${typingId}">
                    <div class='processing-message'>
                        <div class='spinner'></div>
                        Generating image prompt...
                    </div>
                    <span class='message-time'>${getCurrentTime()}</span>
                </div>
            `;
            chatBox.scrollTop = chatBox.scrollHeight;

            // Call our new image generation endpoint
            response = await fetch(`/generateImage?query=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Display the generated image with all metadata
            let responseHTML = `
    <div class='message bot'>
        <div class='image-prompt-info'>
            <strong>Generated from:</strong> "${query}"
            <div class='positive-prompt'>${data.full_response.data.projectGenerationModel[0].projectMedias[0].text}</div>
        </div>
        <div class='image-result'>
            <img src="${data.image_url}" alt="Generated image" onerror="this.onerror=null;this.src='fallback-image.jpg';">
                <div class='image-meta'>
                    <div class='meta-item'><strong>Style:</strong> ${data.full_response.data.projectGenerationModel[0].projectMedias[0].style}</div>
                    <div class='meta-item'><strong>Camera:</strong> ${data.full_response.data.projectGenerationModel[0].projectMedias[0].camera}</div>
                    <div class='meta-item'><strong>Atmosphere:</strong> ${data.full_response.data.projectGenerationModel[0].projectMedias[0].atmosphere}</div>
                </div>
        </div>
        <span class='message-time'>${getCurrentTime()}</span>
    </div>
    `;

            document.getElementById(typingId).outerHTML = responseHTML;
        }
    } catch (error) {
        document.getElementById(typingId).outerHTML = `
            <div class='message bot error'>
                <div class='error-title'>${mode === "image" ? "Image Generation" : "Search"} Failed</div>
                <div class='error-detail'>${error.message}</div>
                <span class='message-time'>${getCurrentTime()}</span>
            </div>
        `;
        console.error('Error:', error);
    } finally {
        sendButton.disabled = false;
        queryInput.focus();
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Helper function to format time
function getCurrentTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
document.getElementById('query').addEventListener('keypress', handleKeyPress);
document.getElementById('query').focus();