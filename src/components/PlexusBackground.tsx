import { useEffect, useRef } from 'react';

interface Node {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

const createNodes = (count: number, width: number, height: number): Node[] =>
    Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: Math.random() * 1.2 + 0.8,
    }));

const PlexusBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let nodes: Node[] = [];
        let pulse = 0;
        let lastTime = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const baseCount = Math.floor((canvas.width + canvas.height) / 18);
            nodes = createNodes(Math.min(140, Math.max(60, baseCount)), canvas.width, canvas.height);
        };

        const update = (delta: number) => {
            const width = canvas.width;
            const height = canvas.height;
            for (const node of nodes) {
                node.x += node.vx * delta * 0.06;
                node.y += node.vy * delta * 0.06;

                if (node.x <= 0 || node.x >= width) node.vx *= -1;
                if (node.y <= 0 || node.y >= height) node.vy *= -1;
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const maxDistance = Math.min(180, canvas.width / 6);
            for (let i = 0; i < nodes.length; i++) {
                const nodeA = nodes[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const nodeB = nodes[j];
                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const distance = Math.hypot(dx, dy);
                    if (distance < maxDistance) {
                        const alpha = (1 - distance / maxDistance) * 0.3;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                        ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(nodeA.x, nodeA.y);
                        ctx.lineTo(nodeB.x, nodeB.y);
                        ctx.stroke();
                    }
                }
            }

            pulse += 0.005;
            for (const node of nodes) {
                const pulseRadius = node.radius + Math.sin(pulse + node.x * 0.01) * 0.3;
                ctx.beginPath();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            const gradient = ctx.createRadialGradient(
                canvas.width * 0.5,
                canvas.height * 0.5,
                0,
                canvas.width * 0.5,
                canvas.height * 0.5,
                Math.max(canvas.width, canvas.height),
            );
            gradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        const loop = (time: number) => {
            const delta = time - lastTime;
            lastTime = time;
            update(delta || 16);
            draw();
            animationId = requestAnimationFrame(loop);
        };

        resize();
        lastTime = performance.now();
        animationId = requestAnimationFrame(loop);
        window.addEventListener('resize', resize);

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 -z-10 h-full w-full" aria-hidden="true" />;
};

export default PlexusBackground;
