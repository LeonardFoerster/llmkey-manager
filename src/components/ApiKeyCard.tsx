import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardDocumentIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

export interface ApiKeyCardProps {
  serviceName: string;
  apiKey: string;
  icon: ReactNode;
  onEdit?: () => void;
}

const maskApiKey = (value: string) => {
  if (!value) return "••••••••••";
  if (value.length <= 8) {
    const [first, ...rest] = value;
    return `${first ?? ""}${"•".repeat(Math.max(0, rest.length))}`;
  }

  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  const hidden = Math.max(0, value.length - 8);
  return `${prefix}${"•".repeat(hidden)}${suffix}`;
};

const ApiKeyCard = ({ serviceName, apiKey, icon, onEdit }: ApiKeyCardProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maskedKey = maskApiKey(apiKey);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(apiKey);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = apiKey;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      console.error("Unable to copy API key:", error);
    }
  };

  const handleEdit = () => {
    onEdit?.();
  };

  return (
    <div className="relative w-full max-w-lg">
      <div
        className="pointer-events-none absolute inset-0 rounded-[28px] bg-[conic-gradient(at_50%_50%,rgba(56,189,248,0.35),rgba(167,139,250,0.35),rgba(244,114,182,0.35),rgba(56,189,248,0.35))] opacity-70 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative overflow-hidden rounded-[28px] border border-white/20 bg-white/15 p-6 text-white shadow-[0_35px_120px_rgba(15,23,42,0.65)] backdrop-blur-3xl">
        <div
          className="pointer-events-none absolute inset-[1px] rounded-[26px] border border-white/40 opacity-40"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-white shadow-[0_10px_30px_rgba(56,189,248,0.35)] backdrop-blur-2xl">
                {icon}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-white/60">Provider</p>
                <p className="text-2xl font-semibold tracking-tight text-white">{serviceName}</p>
                <p className="text-sm text-white/60">Encrypted &amp; securely stored</p>
              </div>
            </div>

            <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-200">
              Active
            </span>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/5 p-4 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.5em] text-white/60">API KEY</p>
                <p className="font-mono text-xl text-white">{maskedKey}</p>
              </div>
              <div className="text-right text-xs text-white/60">
                <p>Last used</p>
                <p className="font-semibold text-white">2 mins ago</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <ClipboardDocumentIcon className="h-5 w-5 text-cyan-200 transition group-hover:scale-105 group-hover:text-white" />
              {copied ? "Copied!" : "Copy"}
            </button>

            <button
              type="button"
              onClick={handleEdit}
              className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <PencilSquareIcon className="h-5 w-5 text-purple-200 transition group-hover:scale-105 group-hover:text-white" />
              Edit
            </button>
          </div>

          <div className="flex flex-wrap gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70 backdrop-blur-2xl">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Daily Spend</p>
              <p className="text-lg font-semibold text-white">$12.48</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Calls Today</p>
              <p className="text-lg font-semibold text-white">148</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Model</p>
              <p className="text-lg font-semibold text-white/90">gpt-4o</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyCard;
