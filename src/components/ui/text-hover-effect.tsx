interface TextHoverEffectProps {
    text: string;
}

export const TextHoverEffect = ({ text }: TextHoverEffectProps) => (
    <div className="group relative flex select-none gap-4 text-4xl font-semibold uppercase tracking-[0.6em] text-neutral-500 sm:text-5xl md:text-6xl">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-sky-500/15 via-purple-500/15 to-pink-500/15 opacity-0 blur-3xl transition duration-700 group-hover:opacity-100" />
        {Array.from(text).map((char, index) => (
            <span
                // eslint-disable-next-line react/no-array-index-key
                key={`${char}-${index}`}
                className="relative transition duration-300 group-hover:-translate-y-1 group-hover:text-neutral-100 group-hover:drop-shadow-[0_4px_16px_rgba(255,255,255,0.45)]"
            >
                {char}
            </span>
        ))}
    </div>
);
