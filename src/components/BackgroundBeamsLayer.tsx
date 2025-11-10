import { BackgroundBeams } from "@/components/ui/background-beams";

const BackgroundBeamsLayer = () => (
    <div className="pointer-events-none fixed inset-0 -z-5 overflow-hidden">
        <BackgroundBeams className="opacity-70" />
    </div>
);

export default BackgroundBeamsLayer;
