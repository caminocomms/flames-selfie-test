function byId(id) {
  return document.getElementById(id);
}

function uuidv4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function postGenerate(photoBlob) {
  const formData = new FormData();
  formData.append("photo", photoBlob, "photo.png");
  formData.append("client_request_id", uuidv4());

  const response = await fetch("/api/selfie/generate", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let detail = "";
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.json().catch(() => ({}));
      detail = body.detail || "";
    } else {
      // Drain response body to avoid leaking a stream (some browsers can warn).
      await response.text().catch(() => "");
    }

    if (response.status === 413) {
      throw new Error("That photo is too large to upload. Please choose a smaller image (max 10MB).");
    }
    if (response.status === 429) {
      throw new Error(detail || "Rate limit exceeded. Please try again in a minute.");
    }
    if (response.status === 403) {
      throw new Error(detail || "Request blocked. Please refresh and try again.");
    }
    if (response.status >= 500) {
      throw new Error("Server error while generating your image. Please try again.");
    }

    throw new Error(detail || `Could not generate image (HTTP ${response.status}).`);
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

async function pollUntilDone(resultId, onUpdate) {
  while (true) {
    const payload = await fetchResult(resultId);
    if (onUpdate) {
      onUpdate(payload);
    }
    if (payload.status === "ready" || payload.status === "failed" || payload.status === "expired") {
      return payload;
    }
    const waitSeconds = Number(payload.retry_after_seconds || 2);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, waitSeconds) * 1000));
  }
}

function initGeneratePage() {
  const body = document.body;
  const createContent = byId("create-content");
  const progressPanel = byId("progress-panel");
  const photoPlaceholder = byId("photo-placeholder");
  const cameraActions = byId("camera-actions");
  const uploadInput = byId("photo-upload");
  const startCameraBtn = byId("start-camera");
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
  const pendingKey = "pending_result_id";

  function showCameraActions(show) {
    if (cameraActions) {
      cameraActions.classList.toggle("hidden", !show);
    }
  }

  function showPlaceholder(show) {
    if (photoPlaceholder) {
      photoPlaceholder.classList.toggle("hidden", !show);
    }
    if (preview) {
      preview.classList.toggle("hidden", show);
    }
  }

  function showCameraVideo(show) {
    if (cameraVideo) {
      cameraVideo.classList.toggle("hidden", !show);
    }
  }

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
    showPlaceholder(false);
    showCameraVideo(false);
    showCameraActions(true);
    if (captureBtn) {
      captureBtn.classList.add("hidden");
    }
    if (retakeBtn) {
      retakeBtn.classList.remove("hidden");
      retakeBtn.disabled = false;
    }
    preview.onload = () => {
      preview.classList.add("ready");
    };
    preview.src = previewUrl;
    setError("");
  }

  async function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraReady = false;
    showCameraVideo(false);
    showCameraActions(false);
    if (captureBtn) {
      captureBtn.classList.remove("hidden");
    }
    if (retakeBtn) {
      retakeBtn.classList.add("hidden");
      retakeBtn.disabled = true;
    }
  }

  function resetPreviewSelection() {
    selectedBlob = null;
    if (preview) {
      preview.classList.remove("ready");
      preview.onload = null;
      preview.src = "";
    }
    showPlaceholder(true);
    showCameraVideo(false);
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
      showPlaceholder(false);
      showCameraVideo(true);
      showCameraActions(true);
      if (captureBtn) {
        captureBtn.classList.remove("hidden");
      }
      if (retakeBtn) {
        retakeBtn.classList.add("hidden");
        retakeBtn.disabled = true;
      }
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
    showCameraActions(false);
    if (retakeBtn) {
      retakeBtn.classList.add("hidden");
      retakeBtn.disabled = true;
    }
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
    }, "image/png");
  });

  retakeBtn.addEventListener("click", async () => {
    resetPreviewSelection();
    if (!stream) {
      await startCameraSession();
      return;
    }
    showPlaceholder(false);
    showCameraVideo(true);
    showCameraActions(true);
    if (captureBtn) {
      captureBtn.classList.remove("hidden");
    }
    retakeBtn.classList.add("hidden");
    retakeBtn.disabled = true;
  });

  generateBtn.addEventListener("click", async () => {
    if (!selectedBlob) {
      return;
    }
    const uploadBlob = selectedBlob;

    generateBtn.disabled = true;
    setGeneratingState(true);
    setStatus("Building your FLAMES selfie. This usually takes around 30 seconds.");
    setError("");

    try {
      const payload = await postGenerate(uploadBlob);
      localStorage.setItem(pendingKey, payload.result_id);
      const finalPayload = await pollUntilDone(payload.result_id);
      localStorage.removeItem(pendingKey);

      if (finalPayload.status === "ready") {
        renderResult(finalPayload);
        setStatus("Done. Your image is ready to download and share.");
        body.classList.add("result-live");
        stopCamera();
        return;
      }

      if (finalPayload.status === "expired") {
        setError("This link has expired. Please generate a new image.");
      } else {
        setError(finalPayload.error_message || "We could not generate that image. Please try again.");
      }
      setStatus("");
      setGeneratingState(false);
    } catch (err) {
      setError(err.message || "We could not generate that image. Please try again.");
      setStatus("");
      setGeneratingState(false);
      localStorage.removeItem(pendingKey);
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

  const pendingResultId = localStorage.getItem(pendingKey);
  if (pendingResultId) {
    setGeneratingState(true);
    setStatus("Resuming your FLAMES selfie. Please wait.");
    pollUntilDone(pendingResultId)
      .then((finalPayload) => {
        if (finalPayload.status === "ready") {
          renderResult(finalPayload);
          body.classList.add("result-live");
          setStatus("Done. Your image is ready to download and share.");
          return;
        }
        if (finalPayload.status === "expired") {
          setError("This link has expired. Please generate a new image.");
        } else {
          setError(finalPayload.error_message || "We could not generate that image. Please try again.");
        }
        setStatus("");
        setGeneratingState(false);
      })
      .finally(() => {
        localStorage.removeItem(pendingKey);
      });
  }
}

async function initSharePage(resultId) {
  const errorText = byId("error-text");
  const progressPanel = byId("share-progress");
  try {
    if (progressPanel) {
      progressPanel.classList.remove("hidden");
    }
    const finalPayload = await pollUntilDone(resultId);
    if (finalPayload.status === "ready") {
      if (progressPanel) {
        progressPanel.classList.add("hidden");
      }
      renderResult(finalPayload);
      return;
    }
    if (errorText) {
      errorText.textContent = finalPayload.error_message || "This link is unavailable right now.";
    }
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
