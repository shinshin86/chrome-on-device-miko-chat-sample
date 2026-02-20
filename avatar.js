"use strict";

/**
 * AvatarController
 * 4枚のPNGスプライトでアバター表示 + まばたき + 口パク状態管理
 */
const AvatarController = (() => {
  const IMAGE_KEYS = [
    "mouth_close_eyes_open",
    "mouth_close_eyes_close",
    "mouth_open_eyes_open",
    "mouth_open_eyes_close",
  ];

  let container = null;
  let sprites = {};       // { key: HTMLImageElement }
  let mouthOpen = false;
  let isBlinking = false;
  let blinkTimeout = null;
  let openTimeout = null;
  let useFallback = false;
  let fallbackSvg = null;

  /** まばたきスケジュール */
  function scheduleBlink() {
    const interval = 2000 + Math.random() * 4000;
    blinkTimeout = setTimeout(() => {
      isBlinking = true;
      updateSprite();
      openTimeout = setTimeout(() => {
        isBlinking = false;
        updateSprite();
        scheduleBlink();
      }, 100 + Math.random() * 100);
    }, interval);
  }

  /** 現在の状態に応じたキーを返す */
  function currentKey() {
    const mouth = mouthOpen ? "open" : "close";
    const eyes = isBlinking ? "close" : "open";
    return `mouth_${mouth}_eyes_${eyes}`;
  }

  /** 表示スプライトを切り替え */
  function updateSprite() {
    if (useFallback) {
      updateFallbackSvg();
      return;
    }
    const key = currentKey();
    for (const k of IMAGE_KEYS) {
      sprites[k].style.visibility = k === key ? "visible" : "hidden";
    }
  }

  /** SVGフォールバックを更新 */
  function updateFallbackSvg() {
    if (!fallbackSvg) return;
    const mouthEllipse = fallbackSvg.querySelector("#fb-mouth");
    const leftEyeOpen = fallbackSvg.querySelector("#fb-left-eye-open");
    const leftEyeClosed = fallbackSvg.querySelector("#fb-left-eye-closed");
    const rightEyeOpen = fallbackSvg.querySelector("#fb-right-eye-open");
    const rightEyeClosed = fallbackSvg.querySelector("#fb-right-eye-closed");

    // 口の状態
    const mh = mouthOpen ? 14 : 2;
    mouthEllipse.setAttribute("ry", String(Math.max(mh / 2, 1)));
    mouthEllipse.setAttribute("rx", mouthOpen ? "15" : "12");
    mouthEllipse.setAttribute("cy", String(130));
    mouthEllipse.setAttribute("fill", mouthOpen ? "#C62828" : "#333");

    // 目の状態
    leftEyeOpen.style.display = isBlinking ? "none" : "";
    leftEyeClosed.style.display = isBlinking ? "" : "none";
    rightEyeOpen.style.display = isBlinking ? "none" : "";
    rightEyeClosed.style.display = isBlinking ? "" : "none";
  }

  /** フォールバックSVGを生成 */
  function createFallbackSvg() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "200");
    svg.setAttribute("height", "200");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    // 顔
    const face = document.createElementNS(NS, "circle");
    face.setAttribute("cx", "100"); face.setAttribute("cy", "100");
    face.setAttribute("r", "80"); face.setAttribute("fill", "#FFE0B2");
    face.setAttribute("stroke", "#E0A060"); face.setAttribute("stroke-width", "2");
    svg.appendChild(face);

    // 左目（開）
    const le = document.createElementNS(NS, "circle");
    le.id = "fb-left-eye-open";
    le.setAttribute("cx", "70"); le.setAttribute("cy", "85");
    le.setAttribute("r", "8"); le.setAttribute("fill", "#333");
    svg.appendChild(le);

    // 左目（閉）
    const lec = document.createElementNS(NS, "line");
    lec.id = "fb-left-eye-closed";
    lec.setAttribute("x1", "58"); lec.setAttribute("y1", "85");
    lec.setAttribute("x2", "82"); lec.setAttribute("y2", "85");
    lec.setAttribute("stroke", "#333"); lec.setAttribute("stroke-width", "2");
    lec.setAttribute("stroke-linecap", "round");
    lec.style.display = "none";
    svg.appendChild(lec);

    // 右目（開）
    const re = document.createElementNS(NS, "circle");
    re.id = "fb-right-eye-open";
    re.setAttribute("cx", "130"); re.setAttribute("cy", "85");
    re.setAttribute("r", "8"); re.setAttribute("fill", "#333");
    svg.appendChild(re);

    // 右目（閉）
    const rec = document.createElementNS(NS, "line");
    rec.id = "fb-right-eye-closed";
    rec.setAttribute("x1", "118"); rec.setAttribute("y1", "85");
    rec.setAttribute("x2", "142"); rec.setAttribute("y2", "85");
    rec.setAttribute("stroke", "#333"); rec.setAttribute("stroke-width", "2");
    rec.setAttribute("stroke-linecap", "round");
    rec.style.display = "none";
    svg.appendChild(rec);

    // 口
    const mouth = document.createElementNS(NS, "ellipse");
    mouth.id = "fb-mouth";
    mouth.setAttribute("cx", "100"); mouth.setAttribute("cy", "130");
    mouth.setAttribute("rx", "12"); mouth.setAttribute("ry", "1");
    mouth.setAttribute("fill", "#333"); mouth.setAttribute("stroke", "#333");
    mouth.setAttribute("stroke-width", "1");
    svg.appendChild(mouth);

    return svg;
  }

  return {
    /** コンテナ要素にスプライトを生成し、まばたきを開始 */
    init(containerEl) {
      container = containerEl;
      let loadErrors = 0;

      for (const key of IMAGE_KEYS) {
        const img = new Image();
        img.src = "assets/" + key + ".png";
        img.alt = "Avatar";
        img.className = "avatar-sprite";
        img.style.visibility = key === "mouth_close_eyes_open" ? "visible" : "hidden";
        img.addEventListener("error", () => {
          loadErrors++;
          if (loadErrors >= IMAGE_KEYS.length && !useFallback) {
            useFallback = true;
            container.textContent = "";
            fallbackSvg = createFallbackSvg();
            container.appendChild(fallbackSvg);
          }
        });
        sprites[key] = img;
        container.appendChild(img);
      }

      scheduleBlink();
    },

    /** 口の開閉状態をセット（tts.js から呼ばれる） */
    setMouthOpen(open) {
      mouthOpen = open;
      updateSprite();
    },

    /** クリーンアップ */
    destroy() {
      clearTimeout(blinkTimeout);
      clearTimeout(openTimeout);
      if (container) container.textContent = "";
      sprites = {};
      mouthOpen = false;
      isBlinking = false;
      useFallback = false;
      fallbackSvg = null;
    },
  };
})();
