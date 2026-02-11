const WORKSHOP_API_URL = "https://xzqt-mxe3-bdgf.p7.xano.io/api:QpHvEgrd/workshop";
const RSVP_LOOKUP_URL = "https://xzqt-mxe3-bdgf.p7.xano.io/api:QpHvEgrd/rspv/lookup";
const CHARACTERS_DIR = "/static/characters-2.0"
const SHARE_DIR = "/static/sharegraphics"
const LINKEDIN_URL = "https://www.linkedin.com/feed/?shareActive=true&text=I%20just%20discovered%20my%20pharma%20AI%20mindset%E2%80%A6"

const PROMPT = `Transform the person from the webcam or uploaded photo into a fully illustrated comic-book character based on the supplied reference character.

IDENTITY & FACE
- Preserve ONLY the guest's facial identity: facial structure, expression, skin tone, and hairstyle.
- Re-illustrate the guest's face in the same comic-book art style as the reference character.
- Do NOT reuse, paste, or overlay the photo face. The face must be fully redrawn.

BODY, OUTFIT & STYLE
- Use the reference character as the complete source for body shape, outfit, pose, proportions, line work, and colour palette.
- Ignore the reference character's face and hair entirely.
- Ignore the guest's real clothing, background, lighting, and camera artifacts.

STYLE CONSISTENCY
- The entire character (face and body) must be a single cohesive illustration.
- No photo realism, no mixed media, no compositing, no visible seams.
- Match the reference character's comic style, outlines, shading method, and rendering quality.

BACKGROUND & OUTPUT
- Output a transparent background exactly like the reference PNG.
- No background elements, no shadows, no environment.

HARD CONSTRAINTS (do not violate)
- Do not cut and paste the guest's head.
- Do not retain the guest's real outfit.
- Do not introduce logos, text, or typography.
- Do not include photographic textures or lighting.
`;

function renderPartial(templateId, mountId) {
    const template = document.getElementById(templateId);
    const mount = document.getElementById(mountId);

    if (!template || !mount) {
        return;
    }

    mount.innerHTML = '';
    if (template.content) {
        mount.appendChild(template.content.cloneNode(true));
    } else {
        mount.innerHTML = template.innerHTML;
    }
}

function submitPhotoToFal(fileBlob, persona) {
    const formData = new FormData();
    formData.append("photo", fileBlob, "photo.png");
    formData.append("character", persona.characterId || "groc");
    formData.append("prompt", PROMPT);

    logToServer({
        event: 'fal_request_started',
        persona: persona?.name,
        character: persona?.characterId,
        prompt: PROMPT
    });

    return fetch("/api/generate", {
        method: "POST",
        body: formData
    })
        .then(async (response) => {
            if (!response.ok) {
                const errorText = await response.text();
                logToServer({
                    event: 'fal_request_failed',
                    status: response.status,
                    detail: errorText
                });
                throw new Error(errorText || "Request failed");
            }
            return response.json();
        })
        .then((result) => {
            logToServer({
                event: 'fal_request_succeeded',
                imageUrl: result?.image_url
            });
            return result;
        });
}

function logToServer(payload) {
    try {
        fetch('/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).catch(() => null);
    } catch (err) {
        // best-effort logging only
    }
}

function initQuiz() {
    const workshopForm = document.getElementById('workshop-form');
    const workshopStage = document.getElementById('workshop-stage');
    if (!workshopForm || !workshopStage) {
        return; ƒ
    }

    let workshops = [];
    let selectedWorkshopId = null;
    let attendeeName = null;
    let attendeeId = null;
    const trimmedImageCache = new Map();

    // Confetti generation
    function createConfetti() {
        const resultsPage = document.getElementById('results-page');
        if (!resultsPage) {
            return;
        }
        const confettiCount = 60;
        const centerX = resultsPage.offsetWidth / 2;
        const centerY = resultsPage.offsetHeight * 0.25; // Move up to 25% from top instead of center

        const shapes = ['', 'rectangle', 'square', 'triangle'];

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            confetti.className = `confetti ${shape}`;

            // Start from center
            confetti.style.left = centerX + 'px';
            confetti.style.top = centerY + 'px';

            // Random burst direction and distance
            const angle = (Math.random() * 360) * (Math.PI / 180);
            const velocity = Math.random() * 200 + 100; // Distance from center
            const finalX = centerX + (Math.cos(angle) * velocity);
            const finalY = centerY + (Math.sin(angle) * velocity);

            // Random rotation
            const rotation = Math.random() * 720 - 360;

            // Set animation
            confetti.style.animation = `confetti-burst ${Math.random() * 0.5 + 1.5}s ease-out forwards`;
            confetti.style.transform = `translate(${finalX - centerX}px, ${finalY - centerY}px) rotate(${rotation}deg)`;

            resultsPage.appendChild(confetti);

            // Remove confetti after animation
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 2500);
        }
    }

    // Persona data
    const personas = {
        'macbot': {
            name: 'M.A.C.-Bot',
            mindsetType: 'skeptic',
            code: 'MACBOT',
            explanation: 'Your pharma AI mindset is skeptic. Like M.A.C.-Bot, you favour thoughtful, evidence-based approaches to AI adoption. You prioritise understanding fundamentals and proven results over chasing trends.',
            characterId: 'mac',
            image: `${CHARACTERS_DIR}/AIP_MAC.png`,
            shareImage: `${SHARE_DIR}/aip_im_mac.png`
        },
        'nova': {
            name: 'Nova',
            mindsetType: 'observer',
            code: 'NOVA',
            explanation: 'Your pharma AI mindset is observer. Like Nova, you combine curiosity about AI\'s potential with healthy scepticism. You prefer observation and analysis before commitment, balancing optimism with realistic assessment.',
            characterId: 'nova',
            image: `${CHARACTERS_DIR}/AIP_Nova.png`,
            shareImage: `${SHARE_DIR}/aip_im_nova.png`
        },
        'groc': {
            name: 'Groc',
            mindsetType: 'realist',
            code: 'GROC',
            explanation: 'Your pharma AI mindset is realist. Like Groc, you balance optimism about AI\'s future with practical implementation concerns. You recognise potential while prioritising preparation and risk management.',
            characterId: 'groc',
            image: `${CHARACTERS_DIR}/AIP_Groc.png`,
            shareImage: `${SHARE_DIR}/aip_im_groc.png`
        },
        'jetpackjim': {
            name: 'Jetpack Jim',
            mindsetType: 'enthusiast',
            code: 'JETPACKJIM',
            explanation: 'Your pharma AI mindset is enthusiast. Like Jetpack Jim, you are enthusiastic about AI\'s transformational potential in pharma. You favor quick adoption for competitive advantage while maintaining professional and ethical standards.',
            characterId: 'jim',
            image: `${CHARACTERS_DIR}/AIP_Jim.png`,
            shareImage: `${SHARE_DIR}/aip_im_jim.png`
        },
        'vega': {
            name: 'Vega Callisto',
            mindsetType: 'optimist',
            code: 'VEGA',
            explanation: 'Your pharma AI mindset is optimist. Like Vega Callisto, you are highly optimistic about AI\'s revolutionary potential. You view AI as fundamentally transforming pharmaceutical operations, from R&D to patient care.',
            characterId: 'vega',
            image: `${CHARACTERS_DIR}/AIP_Vega.png`,
            shareImage: `${SHARE_DIR}/aip_im_vega.png`
        },
        'dangerousdan': {
            name: 'Dangerous Dan',
            mindsetType: 'progressive',
            code: 'DANGEROUSDAN',
            explanation: 'Your pharma AI mindset is progressive. Like Dangerous Dan, you fully embrace AI as revolutionary for pharmaceuticals. You view AI adoption as essential for competitive advantage and readily embrace cutting-edge technologies.',
            characterId: 'dan',
            image: `${CHARACTERS_DIR}/AIP_Dan.png`,
            shareImage: `${SHARE_DIR}/aip_im_dan.png`
        }
    };

    function getRandomPersonas(count = 1) {
        const pool = Object.values(personas);
        if (pool.length < count) {
            return [];
        }
        
        // Using Fisher–Yates shuffle algo
        // Premise: 
        // - Walk from the end of the array and swap each element (i) with a randomly chosen element before it
        // - Effectively we perform a random sort, then slice up to the number of elements to get random personas
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }

    function getPersonaSet() {
        const [persona, alt1, alt2] = getRandomPersonas(3);
        if (!persona || !alt1 || !alt2) {
            return null;
        }
        return { persona, alt1, alt2 };
    }

    function requestCompositeImage(centerUrl, leftPath, rightPath) {
        return fetch('/api/composite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                center_url: centerUrl,
                left_path: leftPath,
                right_path: rightPath
            })
        })
            .then(async (response) => {
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Composite failed');
                }
                return response.json();
            })
            .then((data) => data?.image_data || null);
    }

    async function trimImageToAlpha(imageUrl) {
        if (!imageUrl) {
            return imageUrl;
        }

        if (trimmedImageCache.has(imageUrl)) {
            return trimmedImageCache.get(imageUrl);
        }

        const trimmedPromise = new Promise((resolve) => {
            const image = new Image();

            image.onload = () => {
                try {
                    const width = image.naturalWidth;
                    const height = image.naturalHeight;
                    if (!width || !height) {
                        resolve(imageUrl);
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                        resolve(imageUrl);
                        return;
                    }

                    context.drawImage(image, 0, 0);
                    const { data } = context.getImageData(0, 0, width, height);

                    let minX = width;
                    let minY = height;
                    let maxX = -1;
                    let maxY = -1;

                    for (let y = 0; y < height; y += 1) {
                        for (let x = 0; x < width; x += 1) {
                            const alpha = data[(y * width + x) * 4 + 3];
                            if (alpha !== 0) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }

                    if (maxX < minX || maxY < minY) {
                        resolve(imageUrl);
                        return;
                    }

                    if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
                        resolve(imageUrl);
                        return;
                    }

                    const croppedWidth = maxX - minX + 1;
                    const croppedHeight = maxY - minY + 1;
                    const croppedCanvas = document.createElement('canvas');
                    croppedCanvas.width = croppedWidth;
                    croppedCanvas.height = croppedHeight;
                    const croppedContext = croppedCanvas.getContext('2d');
                    if (!croppedContext) {
                        resolve(imageUrl);
                        return;
                    }

                    croppedContext.drawImage(
                        canvas,
                        minX,
                        minY,
                        croppedWidth,
                        croppedHeight,
                        0,
                        0,
                        croppedWidth,
                        croppedHeight
                    );
                    resolve(croppedCanvas.toDataURL('image/png'));
                } catch (error) {
                    logToServer({ event: 'alpha_trim_failed', detail: error?.message || String(error) });
                    resolve(imageUrl);
                }
            };

            image.onerror = () => resolve(imageUrl);
            image.src = imageUrl;
        });

        trimmedImageCache.set(imageUrl, trimmedPromise);
        return trimmedPromise;
    }

    function wireCompositeDownload(button, dataUrl) {
        if (!button) {
            return;
        }
        button.disabled = !dataUrl;
        if (!dataUrl) {
            return;
        }
        button.onclick = () => {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'aip-adventure-crew.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }


    function shareOnLinkedIn(persona) {
        const linkedInUrl = `https://www.linkedin.com/feed/?shareActive=true&text=I%20just%20discovered%20my%20pharma%20AI%20mindset%E2%80%A6`;
        window.open(linkedInUrl, '_blank');
    }

    function setupShareTextarea(persona) {
        const textarea = document.getElementById('share-textarea');
        const copyButton = document.getElementById('copy-text');
        const quizUrl = window.location.href;
        const message = `I just discovered my pharma AI mindset – I'm an AI ${persona.mindsetType}!

Think you're more cautious or more progressive than me? Take the quiz and compare your mindset 👇

Discover your pharma AI mindset and get an exclusive discount for Adventures In Pharma (30th April, London): ${quizUrl}
`;

        // Set the textarea value with a small delay to ensure it's ready
        setTimeout(() => {
            textarea.value = message;
        }, 100);

        // Copy function for both textarea and button
        const copyToClipboard = async () => {
            try {
                await navigator.clipboard.writeText(textarea.value);

                // Visual feedback on button
                const originalText = copyButton.textContent;
                copyButton.textContent = 'Copied!';
                copyButton.style.background = 'var(--aip-burnt-orange)';
                copyButton.style.color = 'var(--aip-white)';

                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.style.background = 'var(--aip-mustard)';
                    copyButton.style.color = 'var(--aip-navy-blue)';
                }, 1500);

            } catch (err) {
                logToServer({ event: 'clipboard_copy_failed', detail: err?.message || String(err) });
                // Fallback: select all text
                textarea.select();
            }
        };

        // Add click-to-copy functionality to both elements
        textarea.addEventListener('click', copyToClipboard);
        copyButton.addEventListener('click', copyToClipboard);
    }

    function setupDiscountCodeCopy() {
        const discountCodeElement = document.getElementById('discount-code');
        if (!discountCodeElement) {
            return;
        }

        discountCodeElement.addEventListener('click', async function () {
            const originalText = this.textContent;

            try {
                await navigator.clipboard.writeText(originalText);

                this.style.transition = 'opacity 0.2s ease';
                this.style.opacity = '0';

                setTimeout(() => {
                    this.textContent = 'Copied!';
                    this.style.opacity = '1';
                }, 200);

                setTimeout(() => {
                    this.style.opacity = '0';
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.opacity = '1';
                    }, 200);
                }, 2000);

            } catch (err) {
                logToServer({ event: 'clipboard_copy_failed', detail: err?.message || String(err) });
                const textArea = document.createElement('textarea');
                textArea.value = originalText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                this.style.transition = 'opacity 0.2s ease';
                this.style.opacity = '0';

                setTimeout(() => {
                    this.textContent = 'Copied!';
                    this.style.opacity = '1';
                }, 200);

                setTimeout(() => {
                    this.style.opacity = '0';
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.opacity = '1';
                    }, 200);
                }, 2000);
            }
        });
    }

    async function downloadPersonaImage(persona) {
        try {
            // Fetch the image as blob to force download
            const response = await fetch(persona.shareImage);
            const blob = await response.blob();

            // Create object URL from blob
            const url = window.URL.createObjectURL(blob);

            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = `${persona.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-mindset.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up object URL
            window.URL.revokeObjectURL(url);
        } catch (error) {
            logToServer({ event: 'download_failed', detail: error?.message || String(error) });
            // Fallback to direct link
            const link = document.createElement('a');
            link.href = persona.shareImage;
            link.download = `${persona.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-mindset.png`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Function to detect device type
    function getDeviceType() {
        const userAgent = navigator.userAgent.toLowerCase();
        if (/tablet|ipad|playbook|silk/.test(userAgent)) {
            return 'tablet';
        }
        if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/.test(userAgent)) {
            return 'mobile';
        }
        return 'desktop';
    }

    // Function to POST workshop selection to Xano
    async function postWorkshopSelection(workshop) {
        if (!attendeeId) {
            logToServer({ event: 'workshop_update_missing_attendee_id' });
            return;
        }
        const payload = {
            workshop_id: workshop.id
        };

        try {
            const response = await fetch(`https://xzqt-mxe3-bdgf.p7.xano.io/api:QpHvEgrd/user_reg/${attendeeId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                logToServer({
                    event: 'workshop_update_failed',
                    status: response.status,
                    statusText: response.statusText
                });
            } else {
                console.log('Workshop selection updated successfully');
            }
        } catch (error) {
            logToServer({ event: 'workshop_update_error', detail: error?.message || String(error) });
        }
    }

    async function loadWorkshops() {
        try {
            const response = await fetch(WORKSHOP_API_URL, {
                method: 'GET'
            });
            if (!response.ok) {
                logToServer({
                    event: 'workshops_load_failed',
                    status: response.status,
                    statusText: response.statusText
                });
                return;
            }
            const data = await response.json();
            if (!Array.isArray(data)) {
                return;
            }
            workshops = data
                .filter((item) => item && (item.id !== undefined || item.workshop_id !== undefined))
                .map((item) => {
                    const rawId = item.id ?? item.workshop_id;
                    const workshopId = typeof rawId === 'number' ? rawId : parseInt(rawId, 10);
                    if (!Number.isFinite(workshopId)) {
                        return null;
                    }
                    return {
                        id: workshopId,
                        title: item.title || item.label || 'Workshop',
                        description: item.description || '',
                        order: item.order
                    };
                }).sort((a, b) => a.order - b.order)
                .filter(Boolean)
            
        } catch (error) {
            logToServer({
                event: "get_workshops_failed",
                err: error?.message || String(error)
            });
        }
    }

    async function lookupAttendee(token) {
        if (!token) {
            return null;
        }
        try {
            const response = await fetch(RSVP_LOOKUP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });
            if (!response.ok) {
                logToServer({
                    event: 'attendee_lookup_failed',
                    status: response.status,
                    statusText: response.statusText
                });
                return null;
            }
            return await response.json();
        } catch (error) {
            logToServer({ event: 'attendee_lookup_error', detail: error?.message || String(error) });
            return null;
        }
    }

    function getWorkshopById(id) {
        return workshops.find((workshop) => workshop.id === id);
    }

    function renderWorkshop() {
        renderPartial('workshop-template', 'workshop-stage');
        const greeting = workshopStage.querySelector('#workshop-greeting');
        if (greeting) {
            greeting.textContent = attendeeName ? `Welcome, ${attendeeName}` : 'Welcome';
        }
        const optionsContainer = workshopStage.querySelector('#workshop-options');
        const submitBtn = workshopStage.querySelector('.submit-btn');

        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            workshops.forEach((workshop, index) => {
                const optionId = `workshop-${index}`;
                const label = document.createElement('label');
                label.className = 'workshop-option';

                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'workshop';
                input.value = String(workshop.id);
                input.id = optionId;
                input.checked = selectedWorkshopId === workshop.id;

                const text = document.createElement('span');
                text.textContent = workshop.title;

                label.appendChild(input);
                label.appendChild(text);

                if (workshop.description) {
                    const description = document.createElement('span');
                    description.className = 'workshop-description';
                    description.textContent = workshop.description;
                    label.appendChild(description);
                }
                optionsContainer.appendChild(label);
            });
        }

        if (submitBtn) {
            submitBtn.disabled = !selectedWorkshopId;
        }
    }

    function renderLoading() {
        renderPartial('loading-template', 'workshop-stage');
    }

    function renderResults(persona, imageOverride, alternates = {}) {
        renderPartial('results-template', 'workshop-stage');

        logToServer({
            event: 'render_persona_result',
            persona: persona?.name,
            mindset: persona?.mindsetType,
            prompt: PROMPT,
            imageOverride: Boolean(imageOverride)
        });

        // Update persona image
        const personaImage = document.getElementById('persona-image');
        if (personaImage) {
            const sourceImage = imageOverride || persona.image;
            personaImage.src = sourceImage;
            personaImage.alt = `${persona.name} - AI Adventure Profile`;
            personaImage.classList.toggle('persona-image--generated', Boolean(imageOverride));
            personaImage.dataset.sourceImage = sourceImage;

            if (!imageOverride) {
                trimImageToAlpha(sourceImage).then((trimmedSource) => {
                    const currentPersonaImage = document.getElementById('persona-image');
                    if (!currentPersonaImage) {
                        return;
                    }
                    if (currentPersonaImage.dataset.sourceImage !== sourceImage) {
                        return;
                    }
                    if (currentPersonaImage.classList.contains('persona-image--generated')) {
                        return;
                    }
                    currentPersonaImage.src = trimmedSource;
                });
            }
        }

        const greeting = document.getElementById('results-greeting');
        if (greeting) {
            greeting.textContent = attendeeName ? `Welcome, ${attendeeName}!` : 'Welcome!';
        }

        const confirmation = document.getElementById('results-confirmation');
        if (confirmation) {
            const workshop = getWorkshopById(selectedWorkshopId);
            confirmation.textContent = workshop
                ? `You're confirmed for ${workshop.title}.`
                : "You're confirmed for your workshop.";
        }

        const details = document.getElementById('results-details');
        if (details) {
            details.textContent = "We've saved your spot and will see you there.";
        }

        window.aipQuizResult = {
            prompt: PROMPT,
            character: persona.characterId
        };

        setTimeout(() => {
            createConfetti();
        }, 200);

        const compositeImage = document.getElementById('composite-image');
        const compositeButton = document.getElementById('download-composite');
        const leftPersona = alternates?.left;
        const rightPersona = alternates?.right;
        if (compositeImage && leftPersona && rightPersona) {
            const centerUrl = imageOverride || persona.image;
            requestCompositeImage(centerUrl, leftPersona.image, rightPersona.image)
                .then((dataUrl) => {
                    if (!dataUrl) {
                        wireCompositeDownload(compositeButton, null);
                        return;
                    }
                    compositeImage.src = dataUrl;
                    compositeImage.alt = `${persona.name} with ${leftPersona.name} and ${rightPersona.name}`;
                    wireCompositeDownload(compositeButton, dataUrl);
                })
                .catch((err) => {
                    logToServer({ event: 'composite_failed', detail: err?.message || String(err) });
                    wireCompositeDownload(compositeButton, null);
                });
        } else {
            wireCompositeDownload(compositeButton, null);
        }
    }

    function showResults(persona, alternates, skipLoading = false) {
        if (skipLoading) {
            renderResults(persona, null, alternates);
            return;
        }

        logToServer({
            event: 'prepare_persona_prompt',
            persona: persona?.name,
            prompt: PROMPT
        });

        setState('photo', { persona, alternates });
    }

    function renderPhotoStep(persona, alternates) {
        renderPartial('photo-template', 'workshop-stage');
        setupPhotoCaptureStep(persona, alternates);
    }

    function transitionToResults(persona, imageOverride, alternates) {
        renderLoading();
        setTimeout(() => {
            renderResults(persona, imageOverride, alternates);
        }, 3000);
    }

    function setState(nextState, payload = {}) {
        if (nextState === 'workshop') {
            renderWorkshop();
            return;
        }

        if (nextState === 'loading') {
            renderLoading();
            return;
        }

        if (nextState === 'photo') {
            renderPhotoStep(payload.persona, payload.alternates);
            return;
        }

        if (nextState === 'results') {
            renderResults(payload.persona, payload.imageOverride, payload.alternates);
        }
    }

    function handleStageChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        if (target.name !== 'workshop') {
            return;
        }
        const nextId = parseInt(target.value, 10);
        selectedWorkshopId = Number.isFinite(nextId) ? nextId : null;
        const submitBtn = workshopStage.querySelector('.submit-btn');
        if (submitBtn) {
            submitBtn.disabled = !selectedWorkshopId;
        }
    }

    function setupPhotoCaptureStep(persona, alternates) {
        const uploadInput = document.getElementById('photo-upload');
        const startCameraBtn = document.getElementById('start-camera');
        const skipPhotoBtn = document.getElementById('skip-photo');
        const cameraPanel = document.getElementById('camera-panel');
        const captureButton = document.getElementById('captureButton');
        const retakeButton = document.getElementById('retakeButton');
        const usePhotoButton = document.getElementById('usePhotoButton');
        const previewImage = document.getElementById('capture-preview');
        const canvas = document.getElementById('canvas');
        const video = document.getElementById('video');

        if (!uploadInput || !startCameraBtn || !skipPhotoBtn || !cameraPanel || !captureButton || !retakeButton || !usePhotoButton || !previewImage || !canvas || !video) {
            return;
        }

        cameraPanel.style.display = 'none';
        let stream = null;
        let capturedBlob = null;

        const stopCamera = () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            cameraPanel.style.display = 'none';
        };

        const resetCaptureUi = () => {
            capturedBlob = null;
            previewImage.src = '';
            previewImage.style.display = 'none';
            video.style.display = 'block';
            captureButton.style.display = 'inline-block';
            retakeButton.style.display = 'none';
            usePhotoButton.style.display = 'none';
        };

        startCameraBtn.addEventListener('click', async () => {
            try {
                logToServer({ event: 'photo_camera_start' });
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment'
                    }
                });
                video.srcObject = stream;
                await video.play();
                cameraPanel.style.display = 'block';
                resetCaptureUi();
            } catch (err) {
                logToServer({ event: 'camera_access_error', detail: err?.message || String(err) });
                alert("Error accessing the camera: " + err.message);
            }
        });

        captureButton.addEventListener('click', async () => {
            if (video.readyState < 2 || video.videoWidth === 0) {
                alert("Camera not ready yet. Please wait a moment and try again.");
                return;
            }

            logToServer({ event: 'photo_capture_clicked' });
            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert("Failed to capture image.");
                    return;
                }
                capturedBlob = blob;
                previewImage.src = canvas.toDataURL("image/png");
                previewImage.style.display = 'block';
                video.style.display = 'none';
                captureButton.style.display = 'none';
                retakeButton.style.display = 'inline-block';
                usePhotoButton.style.display = 'inline-block';
                logToServer({ event: 'photo_capture_ready' });
            }, "image/png");
        });

        retakeButton.addEventListener('click', () => {
            logToServer({ event: 'photo_retake' });
            resetCaptureUi();
        });

        usePhotoButton.addEventListener('click', async () => {
            if (!capturedBlob) {
                return;
            }
            logToServer({ event: 'photo_use_clicked' });
            try {
                stopCamera();
                renderLoading();
                const result = await submitPhotoToFal(capturedBlob, persona);
                renderResults(persona, result.image_url, alternates);
            } catch (err) {
                logToServer({
                    event: "image_generation_error",
                    err: err.message
                })
                setState('photo', { persona, alternates });
            }
        });

        uploadInput.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            logToServer({
                event: 'photo_upload_selected',
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });
            try {
                stopCamera();
                renderLoading();
                const result = await submitPhotoToFal(file, persona);
                renderResults(persona, result.image_url, alternates);
            } catch (err) {
                logToServer({ event: 'image_generation_error', detail: err?.message || String(err) });
                alert("Error generating image: " + err.message);
                setState('photo', { persona, alternates });
            }
        });

        skipPhotoBtn.addEventListener('click', () => {
            logToServer({ event: 'photo_skipped' });
            stopCamera();
            const personaSet = getPersonaSet();
            if (!personaSet) {
                return;
            }
            transitionToResults(personaSet.persona, null, { left: personaSet.alt1, right: personaSet.alt2 });
        });
    }

    // Form submission
    workshopForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const workshop = getWorkshopById(selectedWorkshopId);
        if (!workshop) {
            return;
        }
        const personaSet = getPersonaSet();
        if (!personaSet) {
            return;
        }

        postWorkshopSelection(workshop);
        showResults(personaSet.persona, { left: personaSet.alt1, right: personaSet.alt2 });
    });

    workshopStage.addEventListener('change', handleStageChange);

    setState('workshop');
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    Promise.all([loadWorkshops(), lookupAttendee(token)])
        .then(([, attendee]) => {
            if (attendee) {
                if (attendee.name) {
                    attendeeName = attendee.name;
                }
                if (attendee.id) {
                    attendeeId = attendee.id;
                }
            }
        })
        .finally(() => {
            renderWorkshop();
        });
}

function initApp() {
    initQuiz();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
