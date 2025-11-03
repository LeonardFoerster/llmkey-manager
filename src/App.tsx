import { useCallback, useEffect, useState } from "react";

const THEMES = ["light", "dark", "cupcake"] as const;
type Theme = (typeof THEMES)[number];

const DEFAULT_THEME: Theme = "light";

const getInitialTheme = (): Theme => {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  const current = document.documentElement.getAttribute("data-theme");
  return (THEMES.find((theme) => theme === current) ?? DEFAULT_THEME) as Theme;
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleThemeCycle = useCallback(() => {
    setTheme((previous) => {
      const currentIndex = THEMES.indexOf(previous);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      return THEMES[nextIndex];
    });
  }, []);

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-8">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body space-y-4">
          <div>
            <h2 className="card-title text-primary">LLM Key Manager</h2>
            <p className="text-base-content/70">
              Verwalte deine API-Schlüssel sicher und teste ihre Gültigkeit.
            </p>
          </div>

          <div className="card-actions justify-end">
            <button className="btn" onClick={handleThemeCycle}>
              Theme wechseln ({theme})
            </button>
            <button className="btn btn-primary">Zur App</button>
          </div>
        </div>
      </div>
    </div>
  );
}
