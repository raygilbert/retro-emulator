import React, { useState, useRef, useEffect } from 'react';
import { EMULATORS, COLOR_THEMES } from './emulators';
import {
  normalizeAsciiLines,
  normalizeAsciiText,
  containsBoxChars,
  stripCodeFences,
  stripFenceLines,
} from './formatters';
import { KEYBOARD_LAYOUT, KEY_LABELS, WIDE_KEYS } from './keyboard';
import './retro-emulator.css';

const API_BASE_URL =
  (typeof window !== 'undefined' && window.__EMULATOR_API_BASE_URL__) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMULATOR_API_BASE_URL) ||
  'https://api.anthropic.com';

const sanitizeHistory = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object' && typeof item.content === 'string')
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type : 'system',
      content: item.content,
    }));
};
const API_MODEL = 'claude-sonnet-4-20250514';
const API_VERSION = '2023-06-01';
const API_MAX_TOKENS = 1000;
export const STORAGE_KEY = 'retro-emulator.settings.v1';

const loadStoredState = () => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    return {};
  }
};

const saveStoredState = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    return;
  }
};

// COMMANDS AND HELP TEXT
// ============================================================================

const parseCommandLine = (input) => {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ' ' || char === '\t') {
      if (current.length) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length) {
    tokens.push(current);
  }

  return tokens;
};

const buildHelpText = (commands, themes) => {
  const lines = commands.map((cmd) => `  ${cmd.usage.padEnd(13)} - ${cmd.description}`);
  const themeLineIndex = commands.findIndex((cmd) => cmd.id === '/theme');
  if (themeLineIndex !== -1) {
    lines[themeLineIndex] = `  /theme [name] - Color theme (${themes})`;
  }

  return `
AVAILABLE COMMANDS:
${lines.join('\n')}
`;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RetroEmulator() {
  const storedStateRef = useRef(null);
  if (storedStateRef.current === null) {
    storedStateRef.current = loadStoredState();
  }
  const initialStored = storedStateRef.current || {};

  const [currentEmulator, setCurrentEmulator] = useState(() => {
    const stored = initialStored?.currentEmulator;
    return stored && EMULATORS[stored] ? stored : 'vt100';
  });
  const [colorTheme, setColorTheme] = useState(() => {
    const stored = initialStored?.colorTheme;
    return stored && (stored === 'default' || COLOR_THEMES[stored]) ? stored : 'default';
  });
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(() => sanitizeHistory(initialStored?.history));
  const [isLoading, setIsLoading] = useState(false);
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [isBooted, setIsBooted] = useState(() => {
    return false;
  });
  const [showKeyboard, setShowKeyboard] = useState(() => {
    return typeof initialStored?.showKeyboard === 'boolean' ? initialStored.showKeyboard : true;
  });
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const emu = EMULATORS[currentEmulator] || EMULATORS.vt100;
  const theme = COLOR_THEMES[colorTheme] || COLOR_THEMES.default;
  const colors = theme || emu.colors;
  const restoredRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (mountedRef.current) {
      setIsLoading(false);
    }
  }, [currentEmulator]);

  useEffect(() => {
    saveStoredState({ currentEmulator, colorTheme, showKeyboard });
  }, [currentEmulator, colorTheme, showKeyboard]);

  // Boot sequence effect
  useEffect(() => {
    if (restoredRef.current) {
      restoredRef.current = false;
      setIsBooted(true);
      return;
    }

    setIsBooted(false);
    setHistory([]);
    setInput('');
    
    const bootLines = normalizeAsciiLines(
      EMULATORS[currentEmulator].bootSequence,
      EMULATORS[currentEmulator].columns
    );
    let currentLine = 0;
    
    const bootInterval = setInterval(() => {
      if (currentLine < bootLines.length) {
        setHistory(prev => [...prev, { type: 'system', content: bootLines[currentLine] || '' }]);
        currentLine++;
      } else {
        clearInterval(bootInterval);
        setIsBooted(true);
      }
    }, 80);

    return () => clearInterval(bootInterval);
  }, [currentEmulator]);

  // Scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input when booted
  useEffect(() => {
    if (isBooted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isBooted]);

  // Keyboard tracking
  useEffect(() => {
    const handleKeyDown = (e) => setPressedKeys(prev => new Set([...prev, e.code]));
    const handleKeyUp = (e) => {
      setPressedKeys(prev => {
        const next = new Set(prev);
        next.delete(e.code);
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const addToHistory = (type, content) => {
    setHistory(prev => [...prev, { type, content }]);
  };

  const handleCommand = (cmd) => {
    const parts = parseCommandLine(cmd);
    const command = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const arg = args[0] ? args[0].toLowerCase() : undefined;
    const themes = Object.keys(COLOR_THEMES).join('/');
    const commands = [
      {
        id: '/help',
        usage: '/help',
        description: 'Show this help',
        handler: () => addToHistory('system', buildHelpText(commands, themes)),
      },
      {
        id: '/clear',
        usage: '/clear',
        description: 'Clear screen',
        handler: () => setHistory([]),
      },
      {
        id: '/emu',
        usage: '/emu [name]',
        description: 'Switch emulator (use /list to see all)',
        handler: () => {
          if (arg && EMULATORS[arg]) {
            setCurrentEmulator(arg);
          } else {
            addToHistory('error', `Unknown emulator. Available: ${Object.keys(EMULATORS).join(', ')}`);
          }
        },
      },
      {
        id: '/theme',
        usage: '/theme [name]',
        description: 'Color theme',
        handler: () => {
          if (arg && (arg === 'default' || COLOR_THEMES[arg])) {
            setColorTheme(arg);
            addToHistory('system', `Theme changed to: ${arg.toUpperCase()}`);
          } else {
            addToHistory('error', `Unknown theme. Available: default, ${Object.keys(COLOR_THEMES).filter(t => t !== 'default').join(', ')}`);
          }
        },
      },
      {
        id: '/list',
        usage: '/list',
        description: 'List all emulators',
        handler: () => {
          const sortedEmus = Object.values(EMULATORS).sort((a, b) => a.year - b.year);
          const list = sortedEmus.map(e =>
            `  ${e.id.padEnd(12)} ${e.name.padEnd(20)} ${e.year}`
          ).join('\n');
          addToHistory('system', `\nAVAILABLE EMULATORS (${sortedEmus.length} total):\n${'─'.repeat(44)}\n${list}\n${'─'.repeat(44)}\nUse: /emu [name]\n`);
        },
      },
      {
        id: '/about',
        usage: '/about',
        description: 'About current emulator',
        handler: () => addToHistory('system', `\n${emu.name} (${emu.year})\n${emu.description}\n`),
      },
      {
        id: '/keyboard',
        usage: '/keyboard',
        description: 'Toggle keyboard display',
        handler: () => {
          const newState = !showKeyboard;
          setShowKeyboard(newState);
          addToHistory('system', `\nKeyboard display ${newState ? 'ON' : 'OFF'}\n`);
        },
      },
    ];

    const match = commands.find((item) => item.id === command);
    if (!match) return false;
    match.handler({ arg, args, command });
    return true;
  };

  const sendMessage = async (message) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = controller;

    setIsLoading(true);
    
    const loadingText = emu.uppercase ? 'PROCESSING...' : 'Processing...';
    addToHistory('system', `\n${loadingText}\n`);

    try {
      const activeEmu = emu;
      if (API_BASE_URL.includes('api.anthropic.com')) {
        throw new Error('Direct API access is disabled. Use the local proxy.');
      }

      const response = await fetch(`${API_BASE_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": API_VERSION,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: API_MODEL,
          max_tokens: API_MAX_TOKENS,
          system: `You are Claude, responding through a ${activeEmu.name} computer from ${activeEmu.year}. 
Keep responses concise and authentic to the era. 
${activeEmu.systemPromptAddition}
Do NOT use markdown or code fences. Do NOT draw boxes or ASCII frames yourself; reply as plain text only.
Use ${activeEmu.uppercase ? 'CAPS' : 'spacing'} for emphasis.
Be helpful while maintaining the retro aesthetic.`,
          messages: [{ role: "user", content: message }],
        })
      });

      const rawText = await response.text();
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const apiMessage = data?.error?.message || data?.message;
        const detail = apiMessage || rawText || `HTTP ${response.status}`;
        const statusHint = response.status === 401 || response.status === 403
          ? 'Check your API key and permissions.'
          : response.status === 429
            ? 'Rate limit exceeded. Try again shortly.'
            : '';
        const message = statusHint ? `${detail} ${statusHint}` : detail;
        throw new Error(message);
      }

      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }

      let reply = "ERROR: NO RESPONSE";
      if (Array.isArray(data?.content)) {
        const textChunks = data.content
          .map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .filter(Boolean);
        if (textChunks.length) {
          reply = textChunks.join('\n');
        }
      } else if (typeof data?.content === 'string') {
        reply = data.content;
      } else if (typeof data?.text === 'string') {
        reply = data.text;
      } else if (typeof rawText === 'string' && rawText.length) {
        reply = rawText;
      }

      if (reply === "ERROR: NO RESPONSE" || !reply.trim()) {
        addToHistory('error', `\nERROR: Empty response.\n${rawText || 'No response body'}\n`);
        return;
      }

      const cleanedReply = stripFenceLines(stripCodeFences(reply));
      const styledReply = activeEmu.responseStyle(cleanedReply);
      const formattedReply = normalizeAsciiText(styledReply, activeEmu.columns);
      addToHistory('response', formattedReply);
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      if (mountedRef.current && requestIdRef.current === requestId) {
        addToHistory('error', `\nERROR: ${error.message}\n`);
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    
    let userInput = input.trim();
    const displayInput = emu.uppercase ? userInput.toUpperCase() : userInput;
    
    addToHistory('user', `${emu.prompt}${displayInput}`);
    setInput('');

    if (userInput.startsWith('/')) {
      if (!handleCommand(userInput)) {
        addToHistory('error', 'Unknown command. Type /help for available commands.');
      }
    } else {
      sendMessage(userInput);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div 
      className="retro-emulator"
      style={{
        backgroundColor: colors.bg,
        background: colors.gradient || colors.bg,
        fontFamily: emu.fontFamily,
      }}
    >
      {/* Header bar showing current emulator */}
      <div className="retro-header" style={{
        backgroundColor: colors.border || colors.primary,
        color: colors.bg,
        fontFamily: 'system-ui, sans-serif',
      }}>
        <span>{emu.name} ({emu.year})</span>
        <span style={{ opacity: 0.8 }}>
          /emu to switch • /keyboard to {showKeyboard ? 'hide' : 'show'} • /help
        </span>
      </div>

      {/* Terminal output */}
      <div
        ref={terminalRef}
        onClick={() => inputRef.current?.focus()}
        className="retro-terminal"
        style={{
          color: colors.primary,
          fontSize: `${emu.fontSize}px`,
          border: `2px solid ${colors.border || colors.primary}`,
          backgroundColor: theme ? colors.bg : emu.colors.bg,
        }}
      >
        {history.map((item, index) => (
          <div
            className="retro-output-line"
            key={index}
            style={{
              color: item.type === 'error' ? '#ff6666' : 
                     item.type === 'user' ? (colors.dim) : 
                     colors.primary,
            }}
          >
            {emu.uppercase && item.type !== 'response' ? (item.content || '').toUpperCase() : (item.content || '')}
          </div>
        ))}
        
        {isLoading && (
          <div className="retro-loading" style={{ color: colors.dim }}>
            {emu.uppercase ? '█' : '▓'}
          </div>
        )}
        
        {/* Cursor when ready */}
        {isBooted && !isLoading && (
          <span className="retro-cursor">
            {emu.prompt}█
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="retro-input-bar" style={{
        backgroundColor: theme ? '#111' : emu.colors.bg,
        border: `2px solid ${colors.border || colors.primary}`,
      }}>
        <span className="retro-input-label" style={{ 
          color: colors.primary, 
          fontFamily: emu.fontFamily,
          fontSize: `${emu.fontSize + 2}px`,
        }}>{emu.prompt.trim() || '>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(emu.uppercase ? e.target.value.toUpperCase() : e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || !isBooted}
          placeholder={isBooted ? "" : "BOOTING..."}
          className="retro-input"
          style={{
            backgroundColor: emu.lightMode ? '#ffffff' : '#000',
            border: `1px solid ${colors.dim}`,
            color: colors.primary,
            fontFamily: emu.fontFamily,
            fontSize: `${emu.fontSize}px`,
            caretColor: colors.primary,
            textTransform: emu.uppercase ? 'uppercase' : 'none',
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !input.trim() || !isBooted}
          className="retro-button"
          style={{
            backgroundColor: colors.primary,
            color: emu.lightMode ? '#ffffff' : colors.bg,
            fontFamily: emu.fontFamily,
          }}
        >
          {emu.uppercase ? 'RUN' : 'Send'}
        </button>
      </div>

      {/* Visual Keyboard */}
      {showKeyboard && (
      <div className="retro-keyboard" style={{
        backgroundColor: theme ? '#111' : emu.colors.bg,
        border: `1px solid ${colors.dim}`,
      }}>
        <div className="retro-keyboard-title" style={{ 
          color: colors.dim,
        }}>
          KEYBOARD
        </div>
        {KEYBOARD_LAYOUT.map((row, rowIndex) => (
          <div key={rowIndex} className="retro-keyboard-row">
            {row.map(keyCode => {
              const isPressed = pressedKeys.has(keyCode);
              const label = KEY_LABELS[keyCode] || keyCode.replace('Key', '');
              const isWide = WIDE_KEYS.has(keyCode);
              const isSpace = keyCode === 'Space';
              
              return (
                <div
                  key={keyCode}
                  className="retro-key"
                  style={{
                    width: isSpace
                      ? 'var(--retro-key-space-width)'
                      : isWide
                        ? 'var(--retro-key-wide-width)'
                        : 'var(--retro-key-width)',
                    backgroundColor: isPressed ? colors.primary : (emu.lightMode ? '#ddd' : '#222'),
                    color: isPressed ? (emu.lightMode ? '#ffffff' : colors.bg) : colors.dim,
                    border: `1px solid ${isPressed ? colors.primary : (emu.lightMode ? '#999' : '#444')}`,
                    fontSize: isWide ? '9px' : '12px',
                    fontWeight: isPressed ? 'bold' : 'normal',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      )}

      <style>{`
        .retro-input::placeholder {
          color: ${colors.dim};
          opacity: 0.6;
        }
        
        .retro-input:focus {
          outline: none;
        }
        
        .retro-button:hover:not(:disabled) {
          filter: brightness(1.2);
        }
        
        .retro-terminal::-webkit-scrollbar {
          width: 10px;
        }
        
        .retro-terminal::-webkit-scrollbar-track {
          background: ${colors.bg};
        }
        
        .retro-terminal::-webkit-scrollbar-thumb {
          background: ${colors.dim};
        }
        
        .retro-terminal ::selection {
          background: ${colors.primary};
          color: ${colors.bg};
        }
      `}</style>
    </div>
  );
}
