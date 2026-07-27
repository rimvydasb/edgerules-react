import { createContext, useContext, useEffect, useState } from 'react';

// Types are derived from the EdgeRules DSL rather than repeated on every row. Hovering a name
// reveals its type; holding Alt reveals all of them at once (Resolved Decision #9). This context
// is a private implementation detail of the Alt-held feature — `BoxedEditorUiContext` mounts the
// provider below via `useAltHeldState`, everything else reads it through `useAltHeld`.
export const AltHeldContext = createContext(false);

/** Whether Alt is currently held anywhere on the page. */
export function useAltHeld(): boolean {
  return useContext(AltHeldContext);
}

/** Global Alt-key listener feeding `BoxedEditorUiContext`'s `AltHeldContext.Provider`. */
export function useAltHeldState(): boolean {
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') setAltHeld(true);
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') setAltHeld(false);
    };
    const handleBlur = (): void => setAltHeld(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  return altHeld;
}
