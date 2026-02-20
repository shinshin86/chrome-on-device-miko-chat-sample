# Chrome on device Miko chat sample — Chrome Extension

A Chrome extension that provides a fully on-device chat experience using the [Prompt API (Built-in AI / Gemini Nano)](https://developer.chrome.com/docs/ai/built-in). No external servers, no API keys — everything runs locally in your browser.

> **[日本語版 README はこちら](./README_ja.md)**

## Disclaimer

- This repository is a **local sample implementation** for learning and experimentation.
- It is **not intended for production use** or Chrome Web Store release as-is.
- Security hardening (for example, prompt-injection resistance and strict input/output controls) is intentionally limited to keep the sample simple.
- Do not store sensitive or personal data in chat history when testing.
- The character used in this project ("Miko") is used under the official guidelines (commercial use allowed, free to use, credit optional). For the latest terms, check: https://miko.aituberonair.com

## Features

- On-device inference via Chrome's Built-in AI (Gemini Nano)
- Persistent chat history across popup open/close (via `chrome.storage.local`)
- Context restoration — when a session is recreated, recent conversation history is injected into the system prompt so the AI retains context
- Automatic model availability detection with status indicators
- Auto-polling when the model is being downloaded
- Input validation (4,000-character limit) and duplicate-send prevention
- Accessible UI with `aria-label`, keyboard support (Enter to send, Shift+Enter for newline)
- Safe DOM handling (`textContent` only — no `innerHTML` with user input)
- Manifest V3, minimal permissions (`storage`, `tts`), no external network calls

## Prerequisites

| Requirement | Details |
|---|---|
| Chrome version | **138 or later** (Dev or Canary channel recommended) |
| OS | Windows, macOS, or Linux with sufficient disk space and RAM |

### Enable Built-in AI Flags

1. Open `chrome://flags` and enable the following:

   | Flag | Value |
   |---|---|
   | `#optimization-guide-on-device-model` | **Enabled BypassPerfRequirement** |
   | `#prompt-api-for-gemini-nano` | **Enabled** |

2. Restart Chrome after changing the flags.

   > Initial model preparation may take several minutes depending on your network speed. The extension will automatically detect when the model becomes available.

## Installation

1. Clone or download this repository:

   ```bash
   git clone https://github.com/shinshin86/chrome-on-device-miko-chat-sample.git
   ```

2. Open `chrome://extensions` in Chrome.

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the project folder (the directory containing `manifest.json`).

5. The extension icon will appear in your toolbar.

## Usage

1. Click the extension icon in the toolbar to open the chat popup.
2. Check the status indicator in the header:
   - **Green** — "Available (on-device)": Ready to use
   - **Yellow** — "Downloading...": The model is being downloaded; please wait
   - **Red** — Error: See the message for details and required actions
3. Type your message in the text area and press **Enter** to send (or **Shift+Enter** for a newline).
4. The AI response will appear in the chat area.
5. Conversation history persists even if you close and reopen the popup.
6. Click **Reset** to clear all history and start a new conversation.

## File Structure

```
.
├── manifest.json   # Extension manifest (Manifest V3)
├── popup.html      # Popup UI markup
├── popup.css       # Popup styles
├── popup.js        # Application logic (session management, chat, storage)
├── README.md       # This file
└── README_ja.md    # Japanese README
```

## Technical Details

### Conversation Context Restoration

When the popup is reopened, a new `LanguageModel` session is created. To maintain conversational context, the extension injects the last 20 messages into the system prompt in `User:` / `Assistant:` format. This allows the AI to continue the conversation naturally even after a session reset.

### Storage Limits

- Maximum **40 messages** are stored. Older messages are automatically pruned.
- Input is limited to **4,000 characters** per message.

### Model Availability Polling

When the model status is `downloadable` or `downloading`, the extension polls `LanguageModel.availability()` every 3 seconds (up to 40 attempts) and automatically enables the chat once the model becomes available.

## Troubleshooting

| Problem | Solution |
|---|---|
| Status shows "Prompt API not supported" | Ensure you are using Chrome 138+ and the required flags are enabled |
| Status shows "Downloading..." but never completes | Restart Chrome, wait a few minutes, and try again |
| Status shows timeout after polling | Restart Chrome and try again |
| AI responses seem to lack context | This can happen after a session reset; the extension restores up to 20 recent messages as context |

## License

- Code: MIT (see `LICENSE`)
- Character asset usage: https://miko.aituberonair.com

