import { useEffect, useId, useRef, useState } from "react";
import { fetchAddressSuggestions, type AddressSuggestion } from "../orders/api";

type StreetAddressInputProps = {
  value: string;
  onChange: (street: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  className: string;
};

// The street field at checkout, with address suggestions underneath as the shopper types.
export function StreetAddressInput({ value, onChange, onPick, className }: StreetAddressInputProps) {
  const id = useId();
  const listId = `${id}-suggestions`;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const picked = useRef<string | null>(null);
  const typed = useRef(false);

  useEffect(() => {
    // Only look up what the shopper typed, not a saved address or a suggestion they just picked.
    if (!typed.current || value === picked.current || value.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchAddressSuggestions(value.trim(), controller.signal).then((found) => {
        if (controller.signal.aborted) return;
        setSuggestions(found);
        setActiveIndex(-1);
        setOpen(found.length > 0);
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (suggestion: AddressSuggestion) => {
    picked.current = suggestion.street;
    setOpen(false);
    setSuggestions([]);
    onPick(suggestion);
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        required
        autoComplete="street-address"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={(event) => {
          typed.current = true;
          onChange(event.target.value);
        }}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={(event) => {
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            pick(suggestions[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={className}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Address suggestions"
        hidden={!showList}
        className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
      >
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
            className={`cursor-pointer px-4 py-2.5 text-sm font-normal text-ink ${index === activeIndex ? "bg-accent-soft" : ""}`}
          >
            {suggestion.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
