function byId(id) {
  return document.getElementById(id);
}

async function postGenerate(photoBlob) {
  const formData = new FormData();
  formData.append("photo", photoBlob, "photo.png");

  const response = await fetch("/api/selfie/generate", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Could not generate image");
  }

  return response.json();
}

async function fetchResult(resultId) {
  const response = await fetch(`/api/selfie/result/${resultId}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Result not available");
  }
  return response.json();
}

  function renderResult(payload) {
  const resultPanel = byId("result-panel") || byId("share-result-panel");
  const resultImage = byId("result-image");
  const downloadBtn = byId("download-btn");
  const shareLink = byId("share-link");

  if (resultPanel) {
    resultPanel.classList.remove("hidden");
  }
  if (resultImage) {
    resultImage.src = payload.image_url;
  }
  if (downloadBtn) {
    downloadBtn.href = payload.download_url;
  }
  if (shareLink) {
    shareLink.value = payload.share_url;
  }
}

function initGeneratePage() {
  const body = document.body;
  const createContent = byId("create-content");
  const progressPanel = byId("progress-panel");
  const uploadInput = byId("photo-upload");
  const startCameraBtn = byId("start-camera");
  const cameraPanel = byId("camera-panel");
  const cameraVideo = byId("camera-video");
  const captureCanvas = byId("capture-canvas");
  const captureBtn = byId("capture-btn");
  const retakeBtn = byId("retake-btn");
  const generateBtn = byId("generate-btn");
  const preview = byId("photo-preview");
  const statusText = byId("status-text");
  const errorText = byId("error-text");
  const copyLinkBtn = byId("copy-link");

  let stream = null;
  let selectedBlob = null;
  let cameraReady = false;

  function setError(message) {
    if (errorText) {
      errorText.textContent = message || "";
    }
  }

  function setStatus(message) {
    if (statusText) {
      statusText.textContent = message || "";
    }
  }

  function setGeneratingState(isGenerating) {
    if (createContent) {
      createContent.classList.toggle("hidden", isGenerating);
    }
    if (progressPanel) {
      progressPanel.classList.toggle("hidden", !isGenerating);
    }
  }

  function setSelected(blob, previewUrl) {
    selectedBlob = blob;
    generateBtn.disabled = !selectedBlob;
    preview.src = previewUrl;
    preview.classList.add("ready");
    setError("");
  }

  async function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraReady = false;
    cameraPanel.classList.add("hidden");
    cameraVideo.classList.remove("hidden");
    captureBtn.classList.remove("hidden");
    retakeBtn.classList.add("hidden");
    retakeBtn.disabled = true;
  }

  function resetPreviewSelection() {
    selectedBlob = null;
    preview.classList.remove("ready");
    preview.src = "";
    generateBtn.disabled = true;
  }

  function getNormalizedCaptureCanvas(sourceVideo, targetCanvas) {
    const sourceW = sourceVideo.videoWidth;
    const sourceH = sourceVideo.videoHeight;
    const minDimension = Math.min(sourceW, sourceH);
    const scale = minDimension < 512 ? 512 / minDimension : 1;
    const targetW = Math.round(sourceW * scale);
    const targetH = Math.round(sourceH * scale);

    targetCanvas.width = targetW;
    targetCanvas.height = targetH;

    const ctx = targetCanvas.getContext("2d");
    ctx.drawImage(sourceVideo, 0, 0, targetW, targetH);
    return targetCanvas;
  }

  async function startCameraSession() {
    setError("");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      cameraPanel.classList.remove("hidden");
      cameraVideo.classList.remove("hidden");
      captureBtn.classList.remove("hidden");
      retakeBtn.classList.add("hidden");
      retakeBtn.disabled = true;
      cameraReady = true;
    } catch (err) {
      setError("Camera access failed. Please upload a photo instead.");
    }
  }

  uploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    stopCamera();
    retakeBtn.classList.add("hidden");
    retakeBtn.disabled = true;
    setSelected(file, URL.createObjectURL(file));
  });

  startCameraBtn.addEventListener("click", async () => {
    await startCameraSession();
  });

  captureBtn.addEventListener("click", () => {
    if (!cameraReady || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      setError("Camera is not ready yet.");
      return;
    }
    const normalizedCanvas = getNormalizedCaptureCanvas(cameraVideo, captureCanvas);
    normalizedCanvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not capture photo.");
        return;
      }

      setSelected(blob, URL.createObjectURL(blob));
      cameraVideo.classList.add("hidden");
      captureBtn.classList.add("hidden");
      retakeBtn.classList.remove("hidden");
      retakeBtn.disabled = false;
    }, "image/png");
  });

  retakeBtn.addEventListener("click", async () => {
    resetPreviewSelection();
    if (!stream) {
      await startCameraSession();
      return;
    }
    cameraVideo.classList.remove("hidden");
    captureBtn.classList.remove("hidden");
    retakeBtn.classList.add("hidden");
    retakeBtn.disabled = true;
  });

  generateBtn.addEventListener("click", async () => {
    if (!selectedBlob) {
      return;
    }

    generateBtn.disabled = true;
    setGeneratingState(true);
    preview.classList.remove("ready");
    preview.src = "";
    setStatus("Building your FLAMES selfie. This usually takes around 30 seconds.");
    setError("");

    try {
      const payload = await postGenerate(selectedBlob);
      renderResult(payload);
      setStatus("Done. Your image is ready to download and share.");
      body.classList.add("result-live");
      stopCamera();
    } catch (err) {
      setError(err.message || "We could not generate that image. Please try again.");
      setStatus("");
      setGeneratingState(false);
    } finally {
      generateBtn.disabled = !selectedBlob;
    }
  });

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", async () => {
      const linkInput = byId("share-link");
      if (!linkInput || !linkInput.value) {
        return;
      }
      try {
        await navigator.clipboard.writeText(linkInput.value);
        copyLinkBtn.textContent = "Copied";
        setTimeout(() => {
          copyLinkBtn.textContent = "Copy Share Link";
        }, 1200);
      } catch (err) {
        setError("Could not copy the link automatically. You can copy it manually.");
      }
    });
  }
}

async function initSharePage(resultId) {
  const errorText = byId("error-text");
  try {
    const payload = await fetchResult(resultId);
    renderResult(payload);
  } catch (err) {
    if (errorText) {
      errorText.textContent = err.message || "This link is unavailable right now.";
    }
  }
}

function initApp() {
  const body = document.body;
  const page = body.dataset.page;

  if (page === "share") {
    initSharePage(body.dataset.resultId);
    return;
  }

  initGeneratePage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
