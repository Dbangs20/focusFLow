"use client";

import {
  InputHTMLAttributes,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type GhostInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  suggestionEndpoint?: string;
  debounceMs?: number;
  minLength?: number;
  containerClassName?: string;
};

export default function GhostInput({
  value,
  onChange,
  onKeyDown,
  suggestionEndpoint = "/api/suggest-task",
  debounceMs = 700,
  minLength = 3,
  containerClassName = "",
  className = "",
  ...rest
}: GhostInputProps) {
  const [suggestion, setSuggestion] = useState("");
  const cacheRef = useRef(new Map<string, string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestValueRef = useRef(value);

  const queueSuggestion = useCallback(
    (nextRawValue: string) => {
      latestValueRef.current = nextRawValue;
      const text = nextRawValue.trim();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (text.length < minLength) {
        setSuggestion("");
        return;
      }

      const cached = cacheRef.current.get(text);
      if (cached) {
        setSuggestion(cached);
        return;
      }

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const res = await fetch(suggestionEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });

          if (!res.ok) {
            setSuggestion("");
            return;
          }

          const data = (await res.json()) as { suggestion?: string };
          const nextSuggestion = (data.suggestion || "").trim();
          cacheRef.current.set(text, nextSuggestion);

          if (latestValueRef.current.trim() === text) {
            setSuggestion(nextSuggestion);
          }
        } catch (error) {
          if ((error as Error).name !== "AbortError") {
            console.error("Suggestion error:", error);
            setSuggestion("");
          }
        }
      }, debounceMs);
    },
    [debounceMs, minLength, suggestionEndpoint],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab" && suggestion) {
        event.preventDefault();
        onChange(suggestion);
        setSuggestion("");
      }

      onKeyDown?.(event);
    },
    [onChange, onKeyDown, suggestion],
  );

  const showGhost =
    value.length > 0 &&
    suggestion.length > value.length &&
    suggestion.toLowerCase().startsWith(value.toLowerCase());

  return (
    <div className={`relative ${containerClassName}`.trim()}>
      {showGhost && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-sm">
          <span className="invisible">{value}</span>
          <span style={{ color: "var(--text-secondary)" }}>{suggestion.slice(value.length)}</span>
        </div>
      )}
      <input
        {...rest}
        spellCheck
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          queueSuggestion(nextValue);
        }}
        onKeyDown={handleKeyDown}
        className={className}
      />
    </div>
  );
}
