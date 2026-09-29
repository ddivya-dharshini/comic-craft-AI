// ============================================
// ComicCraft - Main Application Logic
// ============================================

// Model configuration
//const TEXT_MODEL = "gemini-3.8-flash"; // Fast text model
const TEXT_MODEL = [
    "gemini-3.8-flash",
    "gemini-2.5-flash"
];
const IMAGE_MODEL = "gemini-3.1-flash-image"; // Image generation model

// DOM Elements
const apiSection = document.getElementById('apiSection');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiStatus = document.getElementById('apiStatus');
const storyPrompt = document.getElementById('storyPrompt');
const artStyle = document.getElementById('artStyle');
const sceneCount = document.getElementById('sceneCount');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const output = document.getElementById('output');
const storyTitle = document.getElementById('storyTitle');
const comicPanels = document.getElementById('comicPanels');

// ============================================
// API Key Management
// ============================================

// Check for saved API key on load
window.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
        apiStatus.textContent = '✅ API key loaded from storage';
        apiStatus.className = 'api-status success';
    }
});

// Save API key to localStorage
saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        apiStatus.textContent = '✅ API key saved successfully!';
        apiStatus.className = 'api-status success';
    } else {
        apiStatus.textContent = '❌ Please enter a valid API key';
        apiStatus.className = 'api-status error';
    }
});

// ============================================
// Helper: Call Gemini Text API
// ============================================

async function callGeminiText(apiKey, prompt) {

    let lastError = null;

    for (const model of TEXT_MODEL ) {

        const url =
            `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

        for (let attempt = 1; attempt <= 3; attempt++) {

            try {

                console.log(
                    `Gemini request: ${model}, attempt ${attempt}`
                );

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.9,
                            maxOutputTokens: 2048
                        }
                    })
                });

                const data = await response.json();

                if (response.ok) {

                    const text =
                        data.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (!text) {
                        throw new Error(
                            'Gemini returned an empty response.'
                        );
                    }

                    return text;
                }

                lastError = new Error(
                    data.error?.message ||
                    `Gemini API error: ${response.status}`
                );

                console.warn(
                    `${model} attempt ${attempt} failed:`,
                    lastError.message
                );

                // Retry only temporary errors
                if (
                    response.status === 429 ||
                    response.status === 500 ||
                    response.status === 502 ||
                    response.status === 503 ||
                    response.status === 504
                ) {

                    if (attempt < 3) {

                        const delay =
                            Math.pow(2, attempt) * 1000;

                        console.log(
                            `Retrying in ${delay / 1000}s...`
                        );

                        await new Promise(resolve =>
                            setTimeout(resolve, delay)
                        );

                        continue;
                    }

                    // Try next model
                    break;
                }

                // Don't retry permanent errors
                throw lastError;

            } catch (error) {

                lastError = error;

                console.error(
                    `Gemini ${model} error:`,
                    error
                );

                if (attempt < 3) {

                    const delay =
                        Math.pow(2, attempt) * 1000;

                    await new Promise(resolve =>
                        setTimeout(resolve, delay)
                    );

                    continue;
                }
            }
        }
    }

    throw new Error(
        lastError?.message ||
        'All Gemini text models are currently unavailable.'
    );
}

// ============================================
// Helper: Call Gemini Image Generation API
// ============================================

/*async function callGeminiImage(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;
   
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                responseModalities: ["TEXT","IMAGE"]
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Image API error: ${response.status}`);
    }

    const data = await response.json();
   
    // Find the image part in the response
    const parts = data.candidates[0].content.parts;
    for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
            return {
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType
            };
        }
    }
   
    throw new Error('No image was generated in the response');
}*/

async function callGeminiImage(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            model: "gemini-3.1-flash-image",
            input: prompt,
            response_format: {
                type: "image",
                aspect_ratio: "1:1",
                image_size: "1K"
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Gemini image API error:", data);

        const message =
            data.error?.message ||
            `Image API error: ${response.status}`;

        throw new Error(message);
    }

    // Current Interactions API response
    if (data.output_image?.data) {
        return {
            data: data.output_image.data,
            mimeType: data.output_image.mime_type || "image/png"
        };
    }

    // Fallback: inspect interaction steps
    if (Array.isArray(data.steps)) {
        for (const step of data.steps) {
            if (!Array.isArray(step.content)) continue;

            for (const content of step.content) {
                if (
                    content.type === "image" &&
                    content.data
                ) {
                    return {
                        data: content.data,
                        mimeType: content.mime_type || "image/png"
                    };
                }
            }
        }
    }

    throw new Error("No image was generated in the response");
}

// ============================================
// Parse Story JSON from Gemini Response
// ============================================

function parseStoryResponse(text, expectedScenes) {
    // Try to extract JSON from the response
    let jsonStr = text;
   
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    }
   
    // Try to find JSON object
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
   
    try {
        const parsed = JSON.parse(jsonStr);
       
        // Validate structure
        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
            throw new Error('Invalid story structure: missing scenes array');
        }
       
        return {
            title: parsed.title || 'Untitled Comic',
            scenes: parsed.scenes.slice(0, expectedScenes)
        };
    } catch (e) {
        console.error('Failed to parse story JSON:', e);
        console.error('Raw text:', text);
        throw new Error('Failed to parse story response. Please try again.');
    }
}

// ============================================
// Build Image Prompt for a Scene
// ============================================

function buildImagePrompt(sceneDescription, style, characterDescription) {
    let prompt = `Create a single comic panel illustration in ${style}. `;
    prompt += `Scene: ${sceneDescription}. `;
   
    if (characterDescription) {
        prompt += `Main character: ${characterDescription}. `;
    }
   
    prompt += `The image should be a single, self-contained comic panel with clear visual storytelling. `;
    prompt += `No text or speech bubbles in the image. `;
   
    return prompt;
}

// ============================================
// Main Generation Flow
// ============================================

generateBtn.addEventListener('click', async () => {
    // Validate inputs
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert('Please enter your Gemini API key first!');
        return;
    }
   
    const prompt = storyPrompt.value.trim();
    if (!prompt) {
        alert('Please describe your comic story idea!');
        return;
    }
   
    const style = artStyle.value;
    const numScenes = parseInt(sceneCount.value);
   
    // Show loading state
    generateBtn.disabled = true;
    output.classList.add('hidden');
    loading.classList.remove('hidden');
    loadingText.textContent = 'Creating your story...';
   
    try {
        // Step 1: Generate the story structure
        const storyPromptText = `You are a comic book writer. Create a short comic story based on this idea: "${prompt}".
       
The story should have exactly ${numScenes} scenes. For each scene, provide:
1. A title for the scene
2. A detailed visual description of what happens in the panel (describe the scene, characters, actions, and setting in detail for an illustrator)
3. A brief narrative caption text

Also provide:
- A catchy title for the comic
- A brief description of the main character(s) for visual consistency

Return your response as valid JSON in this exact format:
{
    "title": "Comic Title Here",
    "mainCharacterDescription": "Detailed visual description of the main character(s) for consistent illustration",
    "scenes": [
        {
            "title": "Scene 1 Title",
            "visualDescription": "Detailed description for the illustrator",
            "caption": "Narrative text for this panel"
        }
    ]
}

Only return the JSON, no other text.`;

        const storyText = await callGeminiText(apiKey, storyPromptText);
        const story = parseStoryResponse(storyText, numScenes);
       
        // Step 2: Generate images for each scene
        loadingText.textContent = 'Drawing comic panels... (this may take a moment)';
       
        const panels = [];
        for (let i = 0; i < story.scenes.length; i++) {
            const scene = story.scenes[i];
           
            loadingText.textContent = `Drawing panel ${i + 1} of ${story.scenes.length}...`;
           
            const imagePrompt = buildImagePrompt(
                scene.visualDescription,
                style,
                story.mainCharacterDescription
            );
           
            try {
                const imageData = await callGeminiImage(apiKey, imagePrompt);
                panels.push({
                    ...scene,
                    imageData: imageData
                });
            } catch (imgError) {
                console.error(`Failed to generate image for scene ${i + 1}:`, imgError);
                panels.push({
                    ...scene,
                    imageData: null,
                    error: imgError.message
                });
            }
           
            // Small delay between image requests
            if (i < story.scenes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
       
        // Step 3: Display the results
        displayComic(story.title, panels);
       
    } catch (error) {
        console.error('Generation error:', error);
        alert('Error generating comic: ' + error.message);
    } finally {
        loading.classList.add('hidden');
        generateBtn.disabled = false;
    }
});

// ============================================
// Display the Generated Comic
// ============================================

function displayComic(title, panels) {
    storyTitle.textContent = title;
    comicPanels.innerHTML = '';
   
    panels.forEach((panel, index) => {
        const panelDiv = document.createElement('div');
        panelDiv.className = 'comic-panel';
       
        // Image section
        const imageDiv = document.createElement('div');
        imageDiv.className = 'panel-image';
       
        if (panel.imageData) {
            const img = document.createElement('img');
            img.src = `data:${panel.imageData.mimeType};base64,${panel.imageData.data}`;
            img.alt = panel.title || `Scene ${index + 1}`;
            imageDiv.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'image-placeholder';
            placeholder.textContent = panel.error || 'Image generation failed';
            imageDiv.appendChild(placeholder);
        }
       
        // Text section
        const textDiv = document.createElement('div');
        textDiv.className = 'panel-text';
       
        const h3 = document.createElement('h3');
        h3.textContent = panel.title || `Scene ${index + 1}`;
       
        const p = document.createElement('p');
        p.textContent = panel.caption || '';
       
        textDiv.appendChild(h3);
        textDiv.appendChild(p);
       
        panelDiv.appendChild(imageDiv);
        panelDiv.appendChild(textDiv);
       
        comicPanels.appendChild(panelDiv);
       
        // Animate panels in sequence
        setTimeout(() => {
            panelDiv.style.opacity = '1';
        }, index * 200);
    });
   
    output.classList.remove('hidden');
}