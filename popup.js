"use strict";

/* ======================================================================
   定数
   ====================================================================== */
const MAX_MESSAGES = 40;          // 保存する最大メッセージ数
const MAX_INPUT_LENGTH = 4000;    // 入力文字数上限
const CONTEXT_RESTORE_COUNT = 20; // セッション再生成時に復元する直近メッセージ数
const AVAILABILITY_POLL_MS = 3000; // モデル準備ポーリング間隔（ミリ秒）
const AVAILABILITY_POLL_MAX = 40;  // ポーリング最大回数
const STORAGE_KEY = "chat_messages";
const MODEL_IO_OPTIONS = Object.freeze({
  expectedInputs: [{ type: "text", languages: ["ja"] }],
  expectedOutputs: [{ type: "text", languages: ["ja"] }],
});

/* ======================================================================
   DOM参照
   ====================================================================== */
const $status = document.getElementById("status");
const $messages = document.getElementById("messages");
const $chatContainer = document.getElementById("chat-container");
const $input = document.getElementById("user-input");
const $sendBtn = document.getElementById("send-btn");
const $resetBtn = document.getElementById("reset-btn");
const $errorToast = document.getElementById("error-toast");
const $charCount = document.getElementById("char-count");
const $ttsToggle = document.getElementById("tts-toggle");

/* ======================================================================
   アプリケーション状態
   ====================================================================== */
let session = null;       // LanguageModel セッション
let messages = [];        // { role, content, ts }[]
let isSending = false;    // 送信中フラグ
let pollTimer = null;     // ポーリングタイマーID
let pollCount = 0;        // ポーリング実行回数
let isCreatingSession = false; // セッション作成中フラグ

/* ======================================================================
   初期化
   ====================================================================== */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  attachEventListeners();
  AvatarController.init(document.getElementById("avatar-sprites"));
  TTSController.init();
  $ttsToggle.addEventListener("click", handleTTSToggle);
  await restoreMessages();
  renderAllMessages();
  await checkAvailabilityAndSetup();
}

/* ======================================================================
   イベントリスナー登録
   ====================================================================== */
function attachEventListeners() {
  // 送信ボタン
  $sendBtn.addEventListener("click", handleSend);

  // テキストエリア: Enter送信 / Shift+Enter改行 / 文字数カウント
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  $input.addEventListener("input", updateCharCount);

  // リセットボタン
  $resetBtn.addEventListener("click", handleReset);
}

/* ======================================================================
   Prompt API Availability チェック
   ====================================================================== */
async function checkAvailabilityAndSetup() {
  // API 自体が存在しない場合
  if (typeof LanguageModel === "undefined") {
    setStatus("error", "Prompt API 非対応: Chrome 138+ かつ Built-in AI フラグが必要です");
    disableChat();
    return;
  }

  let availability;
  try {
    availability = await LanguageModel.availability(MODEL_IO_OPTIONS);
  } catch (err) {
    setStatus("error", "Availability チェック失敗: " + err.message);
    disableChat();
    return;
  }

  switch (availability) {
    case "available":
      await onAvailable();
      break;
    case "downloadable":
      setStatus("warn", "モデルをダウンロード可能です。初回準備を開始します…");
      disableChat();
      startAvailabilityPolling();
      await tryStartDownload();
      break;
    case "downloading":
      setStatus("warn", "モデルをダウンロード中です。しばらくお待ちください…");
      disableChat();
      startAvailabilityPolling();
      await tryStartDownload();
      break;
    default:
      // "unavailable" またはその他
      setStatus("error", "Built-in AI が利用できません。Chrome のバージョンとフラグ設定を確認してください。");
      disableChat();
      break;
  }
}

/** availability が available になったときの処理 */
async function onAvailable() {
  stopAvailabilityPolling();
  setStatus("ok", "利用可能（オンデバイス）");
  enableChat();
  if (!session) {
    await createSession(false);
  }
}

/* ======================================================================
   Availability ポーリング（downloadable / downloading 用）
   ====================================================================== */
function startAvailabilityPolling() {
  pollCount = 0;
  stopAvailabilityPolling();
  pollTimer = setInterval(async () => {
    pollCount++;
    if (pollCount >= AVAILABILITY_POLL_MAX) {
      stopAvailabilityPolling();
      setStatus("error", "モデル準備がタイムアウトしました。ブラウザを再起動して再試行してください。");
      return;
    }

    try {
      const avail = await LanguageModel.availability(MODEL_IO_OPTIONS);
      if (avail === "available") {
        await onAvailable();
      } else if (avail === "downloadable") {
        setStatus("warn", `モデル準備中… (${pollCount}/${AVAILABILITY_POLL_MAX})`);
        await tryStartDownload();
      } else if (avail === "downloading") {
        setStatus("warn", `モデルをダウンロード中… (${pollCount}/${AVAILABILITY_POLL_MAX})`);
        await tryStartDownload();
      }
    } catch {
      // チェック失敗は無視して次回リトライ
    }
  }, AVAILABILITY_POLL_MS);
}

function stopAvailabilityPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ======================================================================
   セッション管理
   ====================================================================== */

/** セッション新規作成（文脈復元あり） */
async function createSession(withDownloadMonitor = false) {
  if (isCreatingSession) return;
  isCreatingSession = true;
  try {
    const systemPrompt = buildSystemPrompt();
    const options = {
      ...MODEL_IO_OPTIONS,
      systemPrompt: systemPrompt,
    };
    if (withDownloadMonitor) {
      options.monitor = (m) => {
        m.addEventListener("downloadprogress", (e) => {
          const percent = Math.round((e.loaded || 0) * 100);
          setStatus("warn", `モデルをダウンロード中… ${percent}%`);
        });
      };
    }
    session = await LanguageModel.create(options);
  } catch (err) {
    showError("セッション作成に失敗しました: " + err.message);
    session = null;
  } finally {
    isCreatingSession = false;
  }
}

/** downloadable/downloading 時にダウンロードを開始する */
async function tryStartDownload() {
  if (session || isCreatingSession) return;
  await createSession(true);
  if (session) {
    await onAvailable();
  }
}

/**
 * 直近の会話履歴からシステムプロンプト用のコンテキストを構築する。
 * セッション再作成時にこれまでの文脈を復元するために使う。
 */
function buildSystemPrompt() {
  const base = "あなたは親切で知識豊富なAIアシスタントです。ユーザーの質問に丁寧に日本語で回答してください。";

  if (messages.length === 0) {
    return base;
  }

  // 直近 N 件を取得
  const recent = messages.slice(-CONTEXT_RESTORE_COUNT);
  const history = recent
    .map((m) => (m.role === "user" ? "User" : "Assistant") + ": " + m.content)
    .join("\n");

  return base + "\n\n以下はこれまでの会話履歴です。この文脈を踏まえて回答してください:\n" + history;
}

/* ======================================================================
   メッセージ送信
   ====================================================================== */
async function handleSend() {
  if (isSending) return;

  const text = $input.value.trim();
  if (!text) return;

  // 文字数チェック
  if (text.length > MAX_INPUT_LENGTH) {
    showError(`入力は ${MAX_INPUT_LENGTH} 文字以内にしてください（現在 ${text.length} 文字）`);
    return;
  }

  // セッションが無い場合は再作成を試みる
  if (!session) {
    try {
      await createSession();
    } catch {
      showError("セッションが無効です。リセットしてください。");
      return;
    }
    if (!session) {
      showError("セッションの作成に失敗しました。リセットしてください。");
      return;
    }
  }

  // 前の読み上げを停止
  TTSController.stop();
  AvatarController.setMouthOpen(false);

  // UI状態変更
  isSending = true;
  $sendBtn.disabled = true;
  $input.value = "";
  updateCharCount();
  hideError();

  // ユーザーメッセージを追加
  addMessage("user", text);

  try {
    const reply = await session.prompt(text);
    addMessage("assistant", reply);
    // TTS読み上げ（非同期）
    if (TTSController.isEnabled()) {
      TTSController.speak(reply, (isOpen) => AvatarController.setMouthOpen(isOpen));
    }
  } catch (err) {
    showError("応答エラー: " + err.message);
    // セッションが壊れた可能性があるのでリセット
    session = null;
  } finally {
    isSending = false;
    $sendBtn.disabled = false;
    $input.focus();
  }
}

/* ======================================================================
   メッセージ管理
   ====================================================================== */

/** メッセージを追加し、保存・描画する */
function addMessage(role, content) {
  const msg = { role, content, ts: Date.now() };
  messages.push(msg);

  // 上限超過時は古いものを削除
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(-MAX_MESSAGES);
  }

  renderMessage(msg);
  scrollToBottom();
  saveMessages();
}

/* ======================================================================
   描画
   ====================================================================== */

/** 全メッセージを描画（初期復元時） */
function renderAllMessages() {
  $messages.textContent = ""; // 安全にクリア
  for (const msg of messages) {
    renderMessage(msg);
  }
  scrollToBottom();
}

/** 単一メッセージを描画して末尾に追加 */
function renderMessage(msg) {
  const bubble = document.createElement("div");
  bubble.className = "message " + msg.role;

  // 役割ラベル
  const roleLabel = document.createElement("span");
  roleLabel.className = "message-role";
  roleLabel.textContent = msg.role === "user" ? "You" : "AI";
  bubble.appendChild(roleLabel);

  // 本文（textContent で XSS を防止）
  const body = document.createElement("span");
  body.textContent = msg.content;
  bubble.appendChild(body);

  // タイムスタンプ
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(msg.ts);
  bubble.appendChild(time);

  $messages.appendChild(bubble);
}

/** タイムスタンプをフォーマット */
function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}

/** チャットを最下部にスクロール */
function scrollToBottom() {
  requestAnimationFrame(() => {
    $chatContainer.scrollTop = $chatContainer.scrollHeight;
  });
}

/* ======================================================================
   文字数カウント
   ====================================================================== */
function updateCharCount() {
  const len = $input.value.length;
  if (len === 0) {
    $charCount.textContent = "";
    $charCount.classList.remove("over");
    return;
  }
  $charCount.textContent = len + " / " + MAX_INPUT_LENGTH;
  if (len > MAX_INPUT_LENGTH) {
    $charCount.classList.add("over");
  } else {
    $charCount.classList.remove("over");
  }
}

/* ======================================================================
   リセット
   ====================================================================== */
/** TTS有効/無効を切り替え */
function handleTTSToggle() {
  const nowEnabled = TTSController.toggle();
  $ttsToggle.textContent = nowEnabled ? "\u{1F50A}" : "\u{1F507}";
  $ttsToggle.classList.toggle("muted", !nowEnabled);
  if (!nowEnabled) {
    AvatarController.setMouthOpen(false);
  }
}

async function handleReset() {
  // TTS停止
  TTSController.stop();
  AvatarController.setMouthOpen(false);

  // セッション破棄
  if (session) {
    try {
      session.destroy();
    } catch {
      // 破棄失敗は無視
    }
    session = null;
  }

  // 履歴クリア
  messages = [];
  await saveMessages();
  renderAllMessages();
  hideError();

  // セッション再作成
  await createSession();
  $input.focus();
}

/* ======================================================================
   ストレージ（chrome.storage.local）
   ====================================================================== */

/** 履歴を保存 */
function saveMessages() {
  return chrome.storage.local.set({ [STORAGE_KEY]: messages });
}

/** 履歴を復元 */
async function restoreMessages() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (Array.isArray(data[STORAGE_KEY])) {
      messages = data[STORAGE_KEY].slice(-MAX_MESSAGES);
    }
  } catch {
    messages = [];
  }
}

/* ======================================================================
   ステータス表示
   ====================================================================== */
function setStatus(level, text) {
  $status.textContent = text;
  $status.className = level; // "ok" | "warn" | "error"
}

/* ======================================================================
   エラー表示（トースト風）
   ====================================================================== */
function showError(text) {
  $errorToast.textContent = text;
  $errorToast.hidden = false;
  // 8秒後に自動で消す
  setTimeout(hideError, 8000);
}

function hideError() {
  $errorToast.hidden = true;
}

/* ======================================================================
   チャットUI 有効化 / 無効化
   ====================================================================== */
function enableChat() {
  $input.disabled = false;
  $sendBtn.disabled = false;
  $input.focus();
}

function disableChat() {
  $input.disabled = true;
  $sendBtn.disabled = true;
}
