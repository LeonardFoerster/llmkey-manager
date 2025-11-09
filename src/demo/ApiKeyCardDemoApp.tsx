import { KeyIcon } from "@heroicons/react/24/outline";
import ApiKeyCard from "../components/ApiKeyCard";

const ApiKeyCardDemoApp = () => {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.38),transparent_55%),radial-gradient(circle_at_80%_0,rgba(236,72,153,0.35),transparent_60%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.3),transparent_45%)]">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_40%)]" />
      <div className="absolute top-1/4 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/30 blur-[150px]" />
      <div className="absolute bottom-12 right-1/4 h-64 w-64 rounded-full bg-fuchsia-500/30 blur-[140px]" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10 px-6 text-center text-white">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">Liquid Glass Preview</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">KeyFlow AI — API Key Manager</h1>
          <p className="text-base text-white/70">
            Tailwind-powered frosted glass component inspired by Apple’s Liquid Glass aesthetic. Copy-to-clipboard behavior included.
          </p>
        </div>

        <ApiKeyCard
          serviceName="OpenAI"
          apiKey="sk-OpNAI-LiquidGlass-1234"
          icon={<KeyIcon className="h-7 w-7 text-white" />}
          onEdit={() => window.alert("Open edit modal")}
        />

        <p className="text-xs text-white/50">The vibrant background highlights the translucency and blur layers.</p>
      </div>
    </div>
  );
};

export default ApiKeyCardDemoApp;
