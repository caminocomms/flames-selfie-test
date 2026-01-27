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
    if (persona.prompt) {
        formData.append("prompt", persona.prompt);
    }

    logToServer({
        event: 'fal_request_started',
        persona: persona?.name,
        character: persona?.characterId,
        prompt: persona?.prompt
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
    const quizForm = document.getElementById('quiz-form');
    const quizStage = document.getElementById('quiz-stage');
    if (!quizForm || !quizStage) {
        return;
    }

    // Note: reverse === true when a “strongly disagree” response is interpreted as an AI-positive stance.
    const quizData = {
        1: {
            question: "I believe AI will replace most human jobs in pharma marketing and communications (sooner rather than later).",
            explainer: "A February 2025 Pew Research Center survey found 52% of U.S. workers feel worried about future AI use in the workplace and 32% think it will reduce job opportunities (<a href='https://www.pewresearch.org/social-trends/2025/02/25/u-s-workers-are-more-worried-than-hopeful-about-future-ai-use-in-the-workplace/' target='_blank'>Pew Research Center, 2025</a>).",
            reverse: true
        },
        2: {
            question: "I believe AI in pharma is overhyped “snake oil” with little real payoff.",
            explainer: "The AI Snake Oil blog argues that much of today’s AI hype is overstated and better viewed as ‘normal technology’ (<a href='https://www.aisnakeoil.com/p/ai-as-normal-technology' target='_blank'>AI Snake Oil, 2024</a>).",
            reverse: true
        },
        3: {
            question: "I believe by 2027, AI will be running the show – it’ll outperform humans at almost every task in pharma.",
            explainer: "The speculative “AI 2027” scenario predicts super-human systems eclipsing people across pharma tasks within two years (<a href='https://ai-2027.com/' target='_blank'>AI-2027, 2025</a>).",
            reverse: false
        },
        4: {
            question: "I believe I can trust generative AI (e.g., ChatGPT) to produce accurate and reliable medical content.",
            explainer: "Elsevier’s 2024 ‘Attitudes toward AI’ study shows 95% of researchers and 93% of clinicians expect AI will also spread medical misinformation (<a href='https://www.elsevier.com/insights/attitudes-toward-ai' target='_blank'>Elsevier, 2024</a>).",
            reverse: false
        },
        5: {
            question: "I believe AI will improve the quality of content in pharma communications.",
            explainer: "A 2024 Wolters Kluwer survey reports 81 % of physicians say generative AI improves care-team interactions and 68 % say it saves them time searching literature (<a href='https://assets.contenthub.wolterskluwer.com/api/public/content/2231207-gen-ai-infographic-pdf' target='_blank'>Wolters Kluwer, 2024</a>).",
            reverse: false
        },
        6: {
            question: "I believe we should be very cautious with AI in pharma marketing – better to hold off until all the compliance and privacy risks are addressed.",
            explainer: "An April 2024 Fierce Pharma analysis found two-thirds of the world’s 20 largest pharmas have banned ChatGPT internally over data-security fears (<a href='https://www.fiercepharma.com/marketing/two-thirds-top-20-pharmas-have-banned-chatgpt-and-many-life-sci-call-ai-overrated-survey' target='_blank'>Fierce Pharma, 2024</a>).",
            reverse: true
        },
        7: {
            question: "I believe generative AI can create content — text, images, even videos — that’s as engaging as if a human made it.",
            explainer: "Pfizer’s in-house “Charlie” platform is already generating marketing content for hundreds of brand teams (<a href='https://digiday.com/marketing/with-charlie-pfizer-is-building-a-new-generative-ai-platform-for-pharma-marketing/' target='_blank'>Digiday, 2024</a>).",
            reverse: false
        },
        8: {
            question: "I believe if you don’t embrace AI tools now, you’ll be left behind in the pharma industry.",
            explainer: "McKinsey’s Q4 2024 survey found 85% of U.S. healthcare leaders were already piloting or deploying generative AI (<a href='https://www.mckinsey.com/industries/healthcare/our-insights/generative-ai-in-healthcare-current-trends-and-future-outlook' target='_blank'>McKinsey, 2025</a>).",
            reverse: false
        },
        9: {
            question: "I believe relying on AI too much will erode our own skills in critical thinking and judgement.",
            explainer: "Experts warn that heavy AI reliance encourages “cognitive off-loading” and may dull human creativity (<a href='https://www.theguardian.com/technology/2025/apr/19/dont-ask-what-ai-can-do-for-us-ask-what-it-is-doing-to-us-are-chatgpt-and-co-harming-human-intelligence' target='_blank'>The Guardian, 2025</a>).",
            reverse: true
        },
        10: {
            question: "I’d trust an AI algorithm to guide important decisions in a pharma marketing campaign.",
            explainer: "ZoomRx’s 2024 life-science survey found 81% predicted generative AI would boost campaign effectiveness, though 91% still feared data-security risks (<a href='https://www.zoomrx.com/reports/FERMA_State_of_AI_Report_April_2024.pdf' target='_blank'>ZoomRx, 2024</a>).",
            reverse: false
        }
    };

    const totalQuestions = 10;
    const answers = {};
    let currentQuestion = 1;

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
            prompt: 'Turn the guest into a comic stylised version of M.A.C.-Bot, using the supplied reference character.',
            image: '/static/characters/mac.png',
            shareImage: '/static/sharegraphics/aip_im_mac.png'
        },
        'nova': {
            name: 'Nova',
            mindsetType: 'observer',
            code: 'NOVA',
            explanation: 'Your pharma AI mindset is observer. Like Nova, you combine curiosity about AI\'s potential with healthy scepticism. You prefer observation and analysis before commitment, balancing optimism with realistic assessment.',
            characterId: 'nova',
            prompt: 'Turn the guest into a comic stylised version of Nova, using the supplied reference character.',
            image: '/static/characters/nova.png',
            shareImage: '/static/sharegraphics/aip_im_nova.png'
        },
        'groc': {
            name: 'Groc',
            mindsetType: 'realist',
            code: 'GROC',
            explanation: 'Your pharma AI mindset is realist. Like Groc, you balance optimism about AI\'s future with practical implementation concerns. You recognise potential while prioritising preparation and risk management.',
            characterId: 'groc',
            prompt: 'Turn the guest into a comic stylised version of Groc, using the supplied reference character.',
            image: '/static/characters/groc.png',
            shareImage: '/static/sharegraphics/aip_im_groc.png'
        },
        'jetpackjim': {
            name: 'Jetpack Jim',
            mindsetType: 'enthusiast',
            code: 'JETPACKJIM',
            explanation: 'Your pharma AI mindset is enthusiast. Like Jetpack Jim, you are enthusiastic about AI\'s transformational potential in pharma. You favor quick adoption for competitive advantage while maintaining professional and ethical standards.',
            characterId: 'jim',
            prompt: 'Turn the guest into a comic stylised version of Jetpack Jim, using the supplied reference character.',
            image: '/static/characters/jim.png',
            shareImage: '/static/sharegraphics/aip_im_jim.png'
        },
        'vega': {
            name: 'Vega Callisto',
            mindsetType: 'optimist',
            code: 'VEGA',
            explanation: 'Your pharma AI mindset is optimist. Like Vega Callisto, you are highly optimistic about AI\'s revolutionary potential. You view AI as fundamentally transforming pharmaceutical operations, from R&D to patient care.',
            characterId: 'vega',
            prompt: 'Turn the guest into a comic stylised version of Vega Callisto, using the supplied reference character.',
            image: '/static/characters/vega.png',
            shareImage: '/static/sharegraphics/aip_im_vega.png'
        },
        'dangerousdan': {
            name: 'Dangerous Dan',
            mindsetType: 'progressive',
            code: 'DANGEROUSDAN',
            explanation: 'Your pharma AI mindset is progressive. Like Dangerous Dan, you fully embrace AI as revolutionary for pharmaceuticals. You view AI adoption as essential for competitive advantage and readily embrace cutting-edge technologies.',
            characterId: 'dan',
            prompt: 'Turn the guest into a comic stylised version of Dangerous Dan, using the supplied reference character.',
            image: '/static/characters/dan.png',
            shareImage: '/static/sharegraphics/aip_im_dan.png'
        }
    };

    function getPersonaFromScore(score) {
        if (score <= 16) return personas.macbot;
        if (score <= 33) return personas.nova;
        if (score <= 50) return personas.groc;
        if (score <= 65) return personas.jetpackjim;
        if (score <= 80) return personas.vega;
        return personas.dangerousdan;
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
                console.error('Failed to copy text: ', err);
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
                console.error('Failed to copy text: ', err);
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
            console.error('Download failed:', error);
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

    // Function to POST quiz results to Xano
    async function postQuizResults(answersPayload, score, persona) {
        const payload = {
            created_at: new Date().toISOString(),
            persona_type: persona.name,
            score: score,
            q1_answer: answersPayload[1] || 0,
            q2_answer: answersPayload[2] || 0,
            q3_answer: answersPayload[3] || 0,
            q4_answer: answersPayload[4] || 0,
            q5_answer: answersPayload[5] || 0,
            q6_answer: answersPayload[6] || 0,
            q7_answer: answersPayload[7] || 0,
            q8_answer: answersPayload[8] || 0,
            q9_answer: answersPayload[9] || 0,
            q10_answer: answersPayload[10] || 0,
            user_agent: navigator.userAgent,
            browser_language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            referrer_url: document.referrer || window.location.href,
            device_type: getDeviceType()
        };

        try {
            const response = await fetch('https://xzqt-mxe3-bdgf.p7.xano.io/api:lLmtpgpS/quiz_result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('Failed to submit quiz results:', response.status, response.statusText);
            } else {
                console.log('Quiz results submitted successfully');
            }
        } catch (error) {
            console.error('Error submitting quiz results:', error);
        }
    }

    function renderQuestion(questionNum, direction = 'forward') {
        renderPartial('question-template', 'quiz-stage');
        const page = quizStage.querySelector('.question-page');
        if (!page) {
            return;
        }

        currentQuestion = questionNum;
        page.setAttribute('data-question', questionNum);

        if (direction === 'forward') {
            page.style.animation = 'slideInRight 0.4s ease-out';
        } else {
            page.style.animation = 'slideInLeft 0.4s ease-out';
        }

        const questionData = quizData[questionNum];
        const questionTitle = page.querySelector('h2');
        const explainerText = page.querySelector('.explainer');
        const progressText = page.querySelector('.progress-text');
        const progressBar = page.querySelector('.progress-bar');
        const prevBtn = page.querySelector('.prev-btn');
        const nextBtn = page.querySelector('.next-btn');
        const submitBtn = page.querySelector('.submit-btn');

        if (questionTitle) questionTitle.textContent = questionData.question;
        if (explainerText) explainerText.innerHTML = questionData.explainer;
        if (progressText) progressText.textContent = `${questionNum} / ${totalQuestions}`;
        if (progressBar) progressBar.style.width = `${(questionNum / totalQuestions) * 100}%`;

        if (prevBtn) prevBtn.disabled = questionNum === 1;

        if (questionNum === totalQuestions) {
            if (nextBtn) nextBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'inline-block';
        } else {
            if (nextBtn) nextBtn.style.display = 'inline-block';
            if (submitBtn) submitBtn.style.display = 'none';
        }

        const inputs = page.querySelectorAll('input[type="radio"]');
        inputs.forEach((input) => {
            input.name = `q${questionNum}`;
            input.checked = answers[questionNum] !== undefined && parseInt(input.value) === answers[questionNum];
        });

        updateNavState();
    }

    function renderWelcome() {
        renderPartial('welcome-template', 'quiz-stage');
    }

    function renderLoading() {
        renderPartial('loading-template', 'quiz-stage');
    }

    function renderResults(score, persona, imageOverride) {
        renderPartial('results-template', 'quiz-stage');

        console.log('[AIP Quiz] Results', {
            score,
            persona: persona?.name,
            mindset: persona?.mindsetType,
            prompt: persona?.prompt,
            imageOverride: Boolean(imageOverride)
        });
        logToServer({
            event: 'results_rendered',
            score,
            persona: persona?.name,
            mindset: persona?.mindsetType,
            prompt: persona?.prompt,
            imageOverride: Boolean(imageOverride)
        });

        // Update persona content
        document.getElementById('persona-image').src = imageOverride || persona.image;
        document.getElementById('persona-image').alt = `${persona.name} - AI Adventure Profile`;
        document.getElementById('share-preview-image').src = persona.shareImage;
        document.getElementById('share-preview-image').alt = `${persona.name} share image`;
        document.getElementById('persona-title').textContent = `You're an AI ${persona.mindsetType}!`;
        document.getElementById('persona-explanation').innerHTML = `${persona.explanation}`;
        document.getElementById('discount-code').textContent = persona.code;
        window.aipQuizResult = {
            prompt: persona.prompt,
            character: persona.characterId
        };

        // Position spectrum indicator based on score
        const spectrumPosition = score; // 0-100
        document.getElementById('spectrum-indicator').style.left = `${spectrumPosition}%`;

        // Add LinkedIn sharing functionality
        document.getElementById('share-linkedin').onclick = () => shareOnLinkedIn(persona);

        // Add download image functionality
        document.getElementById('download-image').onclick = () => downloadPersonaImage(persona);

        // Setup share textarea with copy functionality
        setupShareTextarea(persona);

        // Setup discount code copy functionality
        setupDiscountCodeCopy();

        setTimeout(() => {
            createConfetti();
        }, 200);
    }

    function updateNavState() {
        const currentPage = quizStage.querySelector('.question-page');
        if (!currentPage) {
            return;
        }
        const nextBtn = currentPage.querySelector('.next-btn');
        const submitBtn = currentPage.querySelector('.submit-btn');
        const hasAnswer = answers[currentQuestion] !== undefined;

        if (currentQuestion === totalQuestions) {
            if (submitBtn) submitBtn.disabled = !hasAnswer;
        } else {
            if (nextBtn) nextBtn.disabled = !hasAnswer;
        }
    }

    function showResults(score, persona, skipLoading = false) {
        if (skipLoading) {
            renderResults(score, persona);
            return;
        }

        console.log('[AIP Quiz] Preparing results', {
            score,
            persona: persona?.name,
            prompt: persona?.prompt
        });
        logToServer({
            event: 'results_preparing',
            score,
            persona: persona?.name,
            prompt: persona?.prompt
        });

        setState('photo', { score, persona });
    }

    function renderPhotoStep(score, persona) {
        renderPartial('photo-template', 'quiz-stage');
        setupPhotoCaptureStep(score, persona);
    }

    function transitionToResults(score, persona, imageOverride) {
        renderLoading();
        setTimeout(() => {
            renderResults(score, persona, imageOverride);
        }, 3000);
    }

    function setState(nextState, payload = {}) {
        if (nextState === 'welcome') {
            renderWelcome();
            return;
        }

        if (nextState === 'question') {
            renderQuestion(payload.question || currentQuestion, payload.direction || 'forward');
            return;
        }

        if (nextState === 'loading') {
            renderLoading();
            return;
        }

        if (nextState === 'photo') {
            renderPhotoStep(payload.score, payload.persona);
            return;
        }

        if (nextState === 'results') {
            renderResults(payload.score, payload.persona, payload.imageOverride);
        }
    }

    function handleStageClick(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.id === 'start-quiz-btn') {
            currentQuestion = 1;
            setState('question', { question: currentQuestion, direction: 'forward' });
            return;
        }

        if (target.classList.contains('prev-btn')) {
            if (currentQuestion > 1) {
                currentQuestion -= 1;
                setState('question', { question: currentQuestion, direction: 'backward' });
            }
            return;
        }

        if (target.classList.contains('next-btn')) {
            if (currentQuestion < totalQuestions) {
                currentQuestion += 1;
                setState('question', { question: currentQuestion, direction: 'forward' });
            }
        }
    }

    function handleStageChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        if (target.type !== 'radio') {
            return;
        }
        answers[currentQuestion] = parseInt(target.value);
        updateNavState();
    }

    function setupPhotoCaptureStep(score, persona) {
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
                console.error("Error accessing the camera, err");
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
                renderResults(score, persona, result.image_url);
            } catch (err) {
                console.error("Error generating image", err);
                alert("Error generating image: " + err.message);
                setState('photo', { score, persona });
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
                renderResults(score, persona, result.image_url);
            } catch (err) {
                console.error("Error generating image", err);
                alert("Error generating image: " + err.message);
                setState('photo', { score, persona });
            }
        });

        skipPhotoBtn.addEventListener('click', () => {
            logToServer({ event: 'photo_skipped' });
            stopCamera();
            transitionToResults(score, persona);
        });
    }

    // Form submission
    quizForm.addEventListener('submit', function (event) {
        event.preventDefault();
        let total = 0;

        for (let i = 1; i <= totalQuestions; i++) {
            let value = answers[i] ?? 0;

            // Reverse score for questions marked as reverse
            if (quizData[i] && quizData[i].reverse) {
                value = 4 - value; // Convert 0->4, 1->3, 2->2, 3->1, 4->0
            }
            total += value;
        }
        const score = Math.round((total / (totalQuestions * 4)) * 100);
        const persona = getPersonaFromScore(score);

        // POST results to Xano endpoint
        postQuizResults(answers, score, persona);

        showResults(score, persona);
    });

    quizStage.addEventListener('click', handleStageClick);
    quizStage.addEventListener('change', handleStageChange);

    // Check for URL parameters to skip to results
    const urlParams = new URLSearchParams(window.location.search);
    const scoreParam = urlParams.get('score');

    if (scoreParam !== null) {
        const score = parseInt(scoreParam);
        if (score >= 0 && score <= 100) {
            const persona = getPersonaFromScore(score);
            showResults(score, persona, true);
            return;
        }
    }

    setState('welcome');
}

function initApp() {
    initQuiz();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
