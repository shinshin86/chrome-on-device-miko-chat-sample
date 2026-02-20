"use strict";

/**
 * TTSController
 * chrome.tts API による読み上げ + word イベントベースの口パク駆動
 */
const TTSController = (() => {
  let enabled = true;
  let closeTimer = null;
  let speaking = false;

  return {
    /** 初期化: 日本語音声の確認 */
    init() {
      if (typeof chrome === "undefined" || !chrome.tts) {
        enabled = false;
        return;
      }
      // 日本語音声が利用可能か確認（ログのみ）
      chrome.tts.getVoices((voices) => {
        const jaVoice = voices.find((v) => v.lang && v.lang.startsWith("ja"));
        if (!jaVoice) {
          console.warn("TTSController: 日本語音声が見つかりません。デフォルト音声を使用します。");
        }
      });
    },

    /**
     * テキストを読み上げ、word イベントで口パクコールバックを呼ぶ
     * @param {string} text - 読み上げるテキスト
     * @param {(isOpen: boolean) => void} onMouthChange - 口の開閉コールバック
     */
    speak(text, onMouthChange) {
      if (!enabled || !chrome.tts) return;

      // 前の読み上げを停止
      this.stop();

      speaking = true;

      chrome.tts.speak(text, {
        lang: "ja-JP",
        enqueue: false,
        onEvent: (event) => {
          if (event.type === "word") {
            onMouthChange(true);
            clearTimeout(closeTimer);
            closeTimer = setTimeout(() => onMouthChange(false), 150);
          }
          if (event.type === "end" || event.type === "interrupted" || event.type === "cancelled") {
            clearTimeout(closeTimer);
            onMouthChange(false);
            speaking = false;
          }
          if (event.type === "error") {
            clearTimeout(closeTimer);
            onMouthChange(false);
            speaking = false;
            console.warn("TTSController: TTS エラー:", event.errorMessage);
          }
        },
      });
    },

    /** 読み上げを即時停止 */
    stop() {
      if (chrome.tts) {
        chrome.tts.stop();
      }
      clearTimeout(closeTimer);
      speaking = false;
    },

    /** 有効/無効を切り替え。戻り値は新しい enabled 状態 */
    toggle() {
      enabled = !enabled;
      if (!enabled) {
        this.stop();
      }
      return enabled;
    },

    /** 現在の有効状態を返す */
    isEnabled() {
      return enabled;
    },

    /** 読み上げ中かどうか */
    isSpeaking() {
      return speaking;
    },
  };
})();
