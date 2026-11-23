import { useEffect, useId, useRef, useState } from "react";
import { fetchAddressSuggestions, type AddressSuggestion } from "../orders/api";

type StreetAddressInputProps = {
  value: string;
  onChange: (street: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  className: string;
  maxLength?: number;
};

type Status = "idle" | "searching" | "done" | "unavailable";

// The street field at checkout. Like a search box, it opens a list of addresses when clicked and
// updates it as the shopper types: their own past addresses first, then matches from the map.
export function StreetAddressInput({ value, onChange, onPick, className, maxLength }: StreetAddressInputProps) {
  const id = useId();
  const listId = `${id}-suggestions`;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Bumped when the field is clicked or typed in, so the list is looked up again.
  const [lookup, setLookup] = useState(0);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (lookup === 0 || value === picked.current) return;
    const controller = new AbortController();
    setStatus("searching");
    const timer = window.setTimeout(() => {
      void fetchAddressSuggestions(value.trim(), controller.signal).then((found) => {
        if (controller.signal.aborted) return;
        setSuggestions(found.suggestions);
        setActiveIndex(-1);
        setStatus(found.unavailable ? "unavailable" : "done");
      });
    }, value.trim().length < 3 ? 0 : 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, lookup]);

  const pick = (suggestion: AddressSuggestion) => {
    picked.current = suggestion.street;
    setOpen(false);
    setSuggestions([]);
    setStatus("idle");
    onPick(suggestion);
  };

  const typedEnough = value.trim().length >= 3;
  const message =
    status === "searching" && suggestions.length === 0 && typedEnough ? "Searching…"
    : status === "unavailable" && typedEnough ? "Address search is busy right now. Type the full address and fill in city, state and ZIP."
    : status === "done" && suggestions.length === 0 && typedEnough ? "No matching addresses yet. Keep typing, or enter it by hand."
    : "";
  const showList = open && suggestions.length > 0;
  const showPanel = open && (showList || message !== "");

  return (
    <div className="relative">
      <input
        id={id}
        required
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        placeholder="Start typing your address"
        maxLength={maxLength}
        value={value}
        onChange={(event) => {
          picked.current = null;
          setOpen(true);
          setLookup((count) => count + 1);
          onChange(event.target.value);
        }}
        onBlur={() => setOpen(false)}
        onFocus={() => {
          setOpen(true);
          if (status === "idle") setLookup((count) => count + 1);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            setOpen(true);
            return;
          }
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === "Enter") {
            // Like a search box, Enter takes the highlighted suggestion, or the first one.
            event.preventDefault();
            pick(suggestions[Math.max(activeIndex, 0)]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={className}
      />
      <div
        hidden={!showPanel}
        className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
      >
        <ul id={listId} role="listbox" aria-label="Address suggestions" hidden={!showList}>
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Keep focus in the field so the list doesn't close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-normal text-ink ${index === activeIndex ? "bg-accent-soft" : ""}`}
            >
              <span aria-hidden="true">📍</span>
              {suggestion.label}
            </li>
          ))}
        </ul>
        {message && <p role="status" className="px-4 py-2.5 text-sm font-normal text-muted">{message}</p>}
      </div>
    </div>
  );
}
